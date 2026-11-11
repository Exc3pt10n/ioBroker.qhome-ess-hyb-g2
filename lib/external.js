"use strict";

/**
 * Zusätzliche PV-Erzeuger (z. B. ein zweiter Wechselrichter über einen
 * anderen ioBroker-Adapter). Der Adapter abonniert die konfigurierten
 * Datenpunkte; hier werden die zuletzt empfangenen Werte gehalten,
 * in kW umgerechnet und auf Aktualität geprüft.
 */

/** Werte älter als dies gelten als veraltet und zählen als 0 (ms) */
const STALE_MS = 60 * 1000;

/**
 * Konfiguration bereinigen: leere Zeilen und doppelte Datenpunkte entfernen.
 * @param {any} list Inhalt von native.extPvSources
 * @returns {{id: string, name: string, factor: number}[]}
 */
function normalizeSources(list) {
  // Beim Zusammenführen von Konfigurationen kann aus dem Array ein Objekt
  // mit den Schlüsseln "0", "1", ... werden: dann dessen Werte verwenden.
  if (list && typeof list === "object" && !Array.isArray(list)) list = Object.values(list);
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const row of list) {
    if (!row || row.enabled === false) continue;
    const id = typeof row.stateId === "string" ? row.stateId.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: (typeof row.name === "string" && row.name.trim()) || id,
      factor: row.unit === "kW" ? 1 : 1 / 1000,
    });
  }
  return out;
}

class ExternalSources {
  /**
   * @param {{id: string, name: string, factor: number}[]} sources
   */
  constructor(sources) {
    this.sources = sources;
    /** @type {Map<string, {val: number, ts: number}>} */
    this.values = new Map();
    /** @type {Set<string>} zuletzt als veraltet gemeldete Quellen */
    this.staleReported = new Set();
  }

  get configured() {
    return this.sources.length > 0;
  }

  get ids() {
    return this.sources.map((s) => s.id);
  }

  /**
   * Neuen Wert eines Datenpunkts übernehmen.
   * @param {string} id
   * @param {{val: any, ts?: number} | null | undefined} state
   */
  update(id, state) {
    if (!this.sources.some((s) => s.id === id)) return;
    if (!state) {
      this.values.delete(id);
      return;
    }
    const val = parseFloat(state.val);
    this.values.set(id, {
      val: Number.isFinite(val) ? val : 0,
      ts: Number.isFinite(state.ts) ? Number(state.ts) : Date.now(),
    });
  }

  /**
   * Summe aller aktuellen Erzeuger in kW.
   * Veraltete oder fehlende Werte zählen als 0, negative Werte
   * (Eigenverbrauch des Wechselrichters nachts) ebenfalls.
   * @param {number} now
   * @returns {{kw: number, newlyStale: {name: string, lastKw: number}[], recovered: string[]}}
   */
  sumKw(now) {
    let kw = 0;
    const newlyStale = [];
    const recovered = [];
    for (const s of this.sources) {
      const v = this.values.get(s.id);
      const valueKw = v ? Math.max(0, v.val * s.factor) : 0;
      const stale = !v || now - v.ts > STALE_MS;
      if (stale) {
        if (!this.staleReported.has(s.id)) {
          this.staleReported.add(s.id);
          newlyStale.push({ name: s.name, lastKw: valueKw });
        }
        continue;
      }
      if (this.staleReported.delete(s.id)) recovered.push(s.name);
      kw += valueKw;
    }
    return { kw, newlyStale, recovered };
  }
}

module.exports = { STALE_MS, normalizeSources, ExternalSources };
