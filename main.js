"use strict";

const utils = require("@iobroker/adapter-core");
const axios = require("axios");
const { STATES, computeValues } = require("./lib/ess");

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
      await this.setStateChangedAsync("info.connection", true, true);
      if (this.lastPollFailed) {
        this.log.info(`Verbindung zu ${this.hostname} wiederhergestellt`);
        this.lastPollFailed = false;
      }
    } catch (ex) {
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
