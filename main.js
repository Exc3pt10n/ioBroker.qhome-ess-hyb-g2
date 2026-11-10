"use strict";

const utils = require("@iobroker/adapter-core");
const axios = require("axios");
const { STATES, computeValues } = require("./lib/ess");
const { CounterEngine, PERIODS, QUANTITIES, counterObjects } = require("./lib/counters");

/** Zählerstände spätestens alle x ms in die Datenpunkte schreiben */
const COUNTER_FLUSH_MS = 10 * 1000;

class QHomeEssHybG2 extends utils.Adapter {
  /**
   * @param {Partial<utils.AdapterOptions>} [options]
   */
  constructor(options = {}) {
    super({
      ...options,
      name: "qhome-ess-hyb-g2",
    });

    this.pollTimer = null;
    this.stopped = false;
    this.lastPollFailed = false;
    this.counters = new CounterEngine();
    this.lastFlush = 0;

    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }

  async onReady() {
    await this.setStateAsync("info.connection", false, true);

    const hostname = (this.config.hostname || "").toString().trim();
    const batCapacity = parseFloat(String(this.config.batCapacity));
    const interval = parseFloat(String(this.config.uptIntervall));

    if (!hostname || !(batCapacity > 0) || !(interval > 0)) {
      this.log.error(
        `Konfiguration ungültig (hostname: "${hostname}", batCapacity: ${this.config.batCapacity}, uptIntervall: ${this.config.uptIntervall}). Adapter wird nicht gestartet.`
      );
      return;
    }

    this.hostname = hostname;
    this.batCapacity = batCapacity;
    this.intervalMs = Math.max(1, interval) * 1000;
    this.url = `http://${hostname}/R3EMSAPP_REAL.ems?file=ESSRealtimeStatus.json`;

    await this.createStates();
    await this.createCounterObjects();
    await this.restoreCounters();
    await this.poll();
  }

  async createStates() {
    for (const [id, def] of Object.entries(STATES)) {
      const common = {
        name: def.name,
        type: def.type || "number",
        role: def.role || "value",
        unit: def.unit || "",
        read: true,
        write: false,
      };
      if (def.states) common.states = def.states;

      await this.extendObjectAsync(id, {
        type: "state",
        common,
        native: {},
      });
    }
  }

  async createCounterObjects() {
    await this.extendObjectAsync("counters", {
      type: "folder",
      common: { name: "Energiezähler" },
      native: {},
    });
    for (const [id, def] of Object.entries(counterObjects())) {
      const common =
        def.type === "state"
          ? { type: "number", read: true, write: false, unit: "", ...def.common }
          : def.common;
      await this.extendObjectAsync(`counters.${id}`, {
        type: def.type,
        common,
        native: {},
      });
    }
  }

  /** Letzten Zählerstand nach einem Neustart wieder einlesen */
  async restoreCounters() {
    const prefix = `${this.namespace}.counters.`;
    const states = (await this.getStatesAsync("counters.*")) || {};
    const val = (id) => {
      const st = states[prefix + id];
      return st ? st.val : undefined;
    };
    for (const [period, def] of Object.entries(PERIODS)) {
      const values = {};
      const previous = {};
      for (const q of Object.keys(QUANTITIES)) {
        values[q] = Number(val(`${period}.${q}`));
        if (def.prevName) previous[q] = Number(val(`${period}.previous.${q}`));
      }
      this.counters.restore(period, val(`${period}.periodKey`), values, def.prevName ? previous : undefined);
    }
  }

  /** Zählerstände in die Datenpunkte schreiben */
  async flushCounters() {
    this.lastFlush = Date.now();
    for (const [id, val] of Object.entries(this.counters.snapshot())) {
      await this.setStateChangedAsync(`counters.${id}`, val, true);
    }
  }

  /**
   * Vorzeitraum-Werte nach einem Zeitraumwechsel schreiben.
   * Immer schreiben (auch bei gleichem Wert), damit ein History-Adapter
   * jeden abgeschlossenen Zeitraum aufzeichnet. Zeitstempel ist das Ende
   * des Vorzeitraums, damit der Wert im Diagramm beim richtigen Tag steht.
   * @param {string[]} periods
   */
  async writePreviousPeriods(periods) {
    for (const period of periods) {
      const ts = this.counters.periods[period].previousEnd || Date.now();
      for (const [id, val] of Object.entries(this.counters.previousSnapshot(period))) {
        await this.setStateAsync(`counters.${id}`, { val, ack: true, ts });
      }
    }
  }

  async poll() {
    if (this.stopped) return;

    try {
      const response = await axios.get(this.url, {
        timeout: Math.max(this.intervalMs, 5000),
      });
      const status = response.data && response.data.ESSRealtimeStatus;
      if (!status) {
        throw new Error("Antwort enthält kein ESSRealtimeStatus");
      }

      const values = computeValues(status, this.batCapacity);
      for (const [id, val] of Object.entries(values)) {
        await this.setStateAsync(id, val, true);
      }

      const now = Date.now();
      const rolled = this.counters.update(values, now);
      if (rolled.length > 0) {
        this.log.debug(`Zeitraumwechsel: ${rolled.join(", ")}`);
        await this.writePreviousPeriods(rolled);
      }
      if (rolled.length > 0 || now - this.lastFlush >= COUNTER_FLUSH_MS) {
        await this.flushCounters();
      }
      await this.setStateChangedAsync("info.connection", true, true);
      if (this.lastPollFailed) {
        this.log.info(`Verbindung zu ${this.hostname} wiederhergestellt`);
        this.lastPollFailed = false;
      }
    } catch (ex) {
      this.counters.interrupt();
      await this.setStateChangedAsync("info.connection", false, true);
      const msg = `Abruf von ${this.hostname} fehlgeschlagen: ${ex.message}`;
      // Nur beim ersten Fehler warnen, danach nicht jede Sekunde das Log fluten
      if (this.lastPollFailed) this.log.debug(msg);
      else this.log.warn(msg);
      this.lastPollFailed = true;
    }

    if (!this.stopped) {
      // Nächster Abruf erst nach Abschluss des vorherigen (keine Überlappung)
      this.pollTimer = this.setTimeout(() => this.poll(), this.intervalMs);
    }
  }

  /**
   * @param {() => void} callback
   */
  onUnload(callback) {
    try {
      this.stopped = true;
      if (this.pollTimer) this.clearTimeout(this.pollTimer);
      // Letzten Stand sichern (best effort, Unload wartet nicht)
      if (this.lastFlush > 0) {
        for (const [id, val] of Object.entries(this.counters.snapshot())) {
          this.setState(`counters.${id}`, val, true);
        }
      }
      this.setState("info.connection", false, true);
    } finally {
      callback();
    }
  }
}

if (require.main !== module) {
  module.exports = (options) => new QHomeEssHybG2(options);
} else {
  new QHomeEssHybG2();
}
