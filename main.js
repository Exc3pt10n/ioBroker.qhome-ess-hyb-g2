"use strict";

const utils = require("@iobroker/adapter-core");
const axios = require("axios");
const { STATES, OBSOLETE_STATES, computeValues } = require("./lib/ess");
const { CounterEngine, PERIODS, QUANTITIES, counterObjects } = require("./lib/counters");
const { ExternalSources, normalizeSources } = require("./lib/external");

/** Zählerstände spätestens alle x ms in die Datenpunkte schreiben */
const COUNTER_FLUSH_MS = 10 * 1000;

/** Größte zulässige Timer-Dauer in Node.js (ms), größere Werte lösen sofort aus */
const MAX_TIMER_MS = 2147483647;

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
    this.external = new ExternalSources([]);

    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }

  async onReady() {
    await this.setStateAsync("info.connection", false, true);

    const hostname = (this.config.hostname || "").toString().trim();
    const batCapacity = parseFloat(String(this.config.batCapacity));
    const interval = parseFloat(String(this.config.uptIntervall));

    const intervalMs = Math.round(interval * 1000);
    if (!hostname || !(batCapacity > 0) || !(intervalMs >= 1000 && intervalMs <= MAX_TIMER_MS)) {
      this.log.error(
        `Invalid configuration (hostname: "${hostname}", batCapacity: ${this.config.batCapacity}, uptIntervall: ${this.config.uptIntervall}; the polling interval must be between 1 and ${Math.floor(MAX_TIMER_MS / 1000)} seconds). Adapter is not started.`
      );
      return;
    }

    this.hostname = hostname;
    this.batCapacity = batCapacity;
    this.intervalMs = intervalMs;
    this.url = `http://${hostname}/R3EMSAPP_REAL.ems?file=ESSRealtimeStatus.json`;

    await this.setupExternalSources();
    await this.removeObsoleteStates();
    await this.createStates();
    await this.createCounterObjects();
    await this.restoreCounters();
    await this.poll();
  }

  /** Zusätzliche PV-Erzeuger abonnieren und Startwerte einlesen */
  async setupExternalSources() {
    this.external = new ExternalSources(normalizeSources(this.config.extPvSources));
    for (const src of this.external.sources) {
      const obj = await this.getForeignObjectAsync(src.id);
      if (!obj) {
        this.log.warn(`Additional PV inverter "${src.name}": state ${src.id} does not exist`);
      }
      await this.subscribeForeignStatesAsync(src.id);
      this.external.update(src.id, await this.getForeignStateAsync(src.id));
      this.log.info(`Additional PV inverter "${src.name}": ${src.id} (${src.factor === 1 ? "kW" : "W"})`);
    }
  }

  /**
   * @param {string} id
   * @param {ioBroker.State | null | undefined} state
   */
  onStateChange(id, state) {
    this.external.update(id, state);
  }

  /** Summe der zusätzlichen Erzeuger in kW, mit Meldung veralteter Werte */
  externalPvKw() {
    if (!this.external.configured) return 0;
    const { kw, newlyStale, recovered } = this.external.sumKw(Date.now());
    for (const s of newlyStale) {
      const msg = `Additional PV inverter "${s.name}" provides no current values, counted as 0 kW`;
      // Nachts (letzter Wert 0) ist das normal, sonst ein Problem
      if (s.lastKw > 0) this.log.warn(msg);
      else this.log.debug(msg);
    }
    for (const name of recovered) {
      this.log.debug(`Additional PV inverter "${name}" provides values again`);
    }
    return kw;
  }

  /**
   * Datenpunkte früherer Versionen löschen. Hat ein Datenpunkt Einstellungen
   * anderer Adapter (History, SQL, InfluxDB …) in common.custom, bleibt er
   * erhalten, damit diese Einstellungen nicht verloren gehen.
   */
  async removeObsoleteStates() {
    for (const id of OBSOLETE_STATES) {
      const obj = await this.getObjectAsync(id);
      if (!obj) continue;
      const custom = obj.common && obj.common.custom;
      if (custom && Object.keys(custom).length > 0) {
        this.log.warn(
          `Obsolete state ${id} is no longer updated but was kept because it has custom settings (e.g. history); delete it manually if no longer needed`
        );
        continue;
      }
      await this.delObjectAsync(id);
      this.log.info(`Obsolete state ${id} deleted`);
    }
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
      common: { name: { en: "Energy counters", de: "Energiezähler" } },
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

  /** poll() aus dem Timer: Fehler abfangen statt unbehandelter Promise-Ablehnung */
  pollSafe() {
    this.poll().catch((e) => this.log.error(`Unexpected error while polling: ${e && e.message ? e.message : e}`));
  }

  async poll() {
    if (this.stopped) return;

    try {
      const response = await axios.get(this.url, {
        timeout: Math.max(this.intervalMs, 5000),
      });
      const status = response.data && response.data.ESSRealtimeStatus;
      if (!status) {
        throw new Error("Response contains no ESSRealtimeStatus");
      }

      const values = computeValues(status, this.batCapacity, {
        extPvKw: this.externalPvKw(),
        hasExt: this.external.configured,
      });
      for (const [id, val] of Object.entries(values)) {
        await this.setStateAsync(id, val, true);
      }

      const now = Date.now();
      const rolled = this.counters.update(values, now);
      if (rolled.length > 0) {
        this.log.debug(`Period change: ${rolled.join(", ")}`);
        await this.writePreviousPeriods(rolled);
      }
      if (rolled.length > 0 || now - this.lastFlush >= COUNTER_FLUSH_MS) {
        await this.flushCounters();
      }
      await this.setStateChangedAsync("info.connection", true, true);
      if (this.lastPollFailed) {
        this.log.info(`Connection to ${this.hostname} restored`);
        this.lastPollFailed = false;
      }
    } catch (ex) {
      this.counters.interrupt();
      await this.setStateChangedAsync("info.connection", false, true);
      const msg = `Polling ${this.hostname} failed: ${ex.message}`;
      // Nur beim ersten Fehler warnen, danach nicht jede Sekunde das Log fluten
      if (this.lastPollFailed) this.log.debug(msg);
      else this.log.warn(msg);
      this.lastPollFailed = true;
    }

    if (!this.stopped) {
      // Nächster Abruf erst nach Abschluss des vorherigen (keine Überlappung)
      this.pollTimer = this.setTimeout(() => this.pollSafe(), this.intervalMs);
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
