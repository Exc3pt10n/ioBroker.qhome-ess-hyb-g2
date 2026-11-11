"use strict";

/**
 * Energiezähler für Tag, Monat, Quartal, Halbjahr, Jahr und Gesamt.
 *
 * Die Energie wird aus den Leistungswerten (kW) über die tatsächlich
 * vergangene Zeit integriert (Trapezregel). Zeitraumwechsel werden bei
 * jedem Abruf anhand eines Periodenschlüssels erkannt, nicht per Zeitplan.
 * Dadurch funktioniert der Reset auch, wenn der Adapter zum Wechselzeitpunkt
 * nicht lief, und unabhängig von Sommer-/Winterzeit.
 */

/** Längste Lücke zwischen zwei Messwerten, die noch integriert wird (ms) */
const MAX_GAP_MS = 60 * 1000;

/** Zeiträume; "total" wird nie zurückgesetzt. Wochen nach ISO 8601 (Montag bis Sonntag) */
const PERIODS = {
  day: { name: "Heute", prevName: "Gestern" },
  week: { name: "Aktuelle Woche", prevName: "Vorwoche" },
  month: { name: "Aktueller Monat", prevName: "Vormonat" },
  quarter: { name: "Aktuelles Quartal", prevName: "Vorquartal" },
  halfyear: { name: "Aktuelles Halbjahr", prevName: "Vorhalbjahr" },
  year: { name: "Aktuelles Jahr", prevName: "Vorjahr" },
  total: { name: "Gesamt", prevName: null },
};

/** Gezählte Energiemengen (kWh) und die zugehörige Leistung aus computeValues (kW) */
const QUANTITIES = {
  PvGen: { name: "PV-Erzeugung", power: (v) => v.PvPw },
  GridPurchase: { name: "Netzbezug", power: (v) => v.GridPwPurchase },
  GridFeedIn: { name: "Netzeinspeisung", power: (v) => v.GridPwFeedIn },
  BtCharged: { name: "Batterie geladen", power: (v) => v.BtPwCharge / 1000 },
  BtDischarged: {
    name: "Batterie entladen",
    power: (v) => v.BtPwDisCharge / 1000,
  },
  Cons: { name: "Verbrauch", power: (v) => v.ConsPw },
};

/** Abgeleitete Kennzahlen */
const DERIVED = {
  SelfSupply: { name: "Eigenversorgung (Verbrauch ohne Netzbezug)", unit: "kWh" },
  Autarky: { name: "Autarkie", unit: "%" },
  SelfConsRate: { name: "Eigenverbrauchsquote", unit: "%" },
};

const pad = (n) => String(n).padStart(2, "0");

/**
 * Kalenderwoche nach ISO 8601 (Woche mit dem ersten Donnerstag ist KW 1).
 * @param {Date} d
 * @returns {{year: number, week: number}}
 */
function isoWeek(d) {
  // 12 Uhr verwenden, damit die Zeitumstellung keine Rolle spielt
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4, 12);
  const mondayWeek1 = new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7), 12);
  const days = Math.round((thursday.getTime() - mondayWeek1.getTime()) / 86400000);
  const week = Math.floor(days / 7) + 1;
  return { year, week };
}

/**
 * Schlüssel des Zeitraums, in dem das Datum liegt (Ortszeit).
 * @param {string} period
 * @param {Date} d
 */
function periodKey(period, d) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  switch (period) {
    case "day":
      return `${y}-${pad(m)}-${pad(d.getDate())}`;
    case "week": {
      const w = isoWeek(d);
      return `${w.year}-W${pad(w.week)}`;
    }
    case "month":
      return `${y}-${pad(m)}`;
    case "quarter":
      return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    case "halfyear":
      return `${y}-H${m <= 6 ? 1 : 2}`;
    case "year":
      return `${y}`;
    case "total":
      return "total";
    default:
      throw new Error(`Unbekannter Zeitraum: ${period}`);
  }
}

/**
 * Beginn des Zeitraums, in dem das Datum liegt (Ortszeit).
 * @param {string} period
 * @param {Date} d
 */
function periodStart(period, d) {
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (period) {
    case "day":
      return new Date(y, m, d.getDate());
    case "week":
      return new Date(y, m, d.getDate() - ((d.getDay() + 6) % 7));
    case "month":
      return new Date(y, m, 1);
    case "quarter":
      return new Date(y, m - (m % 3), 1);
    case "halfyear":
      return new Date(y, m < 6 ? 0 : 6, 1);
    case "year":
      return new Date(y, 0, 1);
    default:
      return new Date(0);
  }
}

/**
 * Schlüssel des direkt vorangehenden Zeitraums.
 * @param {string} period
 * @param {Date} d
 */
function previousPeriodKey(period, d) {
  return periodKey(period, new Date(periodStart(period, d).getTime() - 1));
}

const emptyValues = () =>
  Object.fromEntries(Object.keys(QUANTITIES).map((k) => [k, 0]));

/**
 * Berechnet die abgeleiteten Kennzahlen aus den Zählerständen.
 * @param {Record<string, number>} v
 */
function derive(v) {
  const SelfSupply = Math.max(0, v.Cons - v.GridPurchase);
  const Autarky = v.Cons > 0 ? clampPct((SelfSupply / v.Cons) * 100) : 0;
  const SelfConsRate =
    v.PvGen > 0 ? clampPct(((v.PvGen - v.GridFeedIn) / v.PvGen) * 100) : 0;
  return { SelfSupply, Autarky, SelfConsRate };
}

/** @param {number} x */
function clampPct(x) {
  return Math.min(100, Math.max(0, x));
}

class CounterEngine {
  constructor() {
    /** @type {Record<string, {key: string, values: Record<string, number>, previous: Record<string, number>, previousEnd: number|null}>} */
    this.periods = {};
    for (const p of Object.keys(PERIODS)) {
      this.periods[p] = {
        key: "",
        values: emptyValues(),
        previous: emptyValues(),
        previousEnd: null,
      };
    }
    this.lastTs = null;
    this.lastPowers = null;
  }

  /**
   * Gespeicherten Stand wiederherstellen (z. B. nach Neustart).
   * @param {string} period
   * @param {string} key
   * @param {Record<string, number>} values
   * @param {Record<string, number>} [previous]
   */
  restore(period, key, values, previous) {
    const p = this.periods[period];
    if (!p) return;
    p.key = key || "";
    for (const q of Object.keys(QUANTITIES)) {
      p.values[q] = Number.isFinite(values[q]) ? values[q] : 0;
      if (previous) p.previous[q] = Number.isFinite(previous[q]) ? previous[q] : 0;
    }
  }

  /**
   * Prüft auf Zeitraumwechsel und setzt betroffene Zähler zurück.
   * @param {Date} now
   * @returns {string[]} gewechselte Zeiträume (ohne Erststart)
   */
  rollover(now) {
    const changed = [];
    for (const period of Object.keys(PERIODS)) {
      const p = this.periods[period];
      const key = periodKey(period, now);
      if (p.key === key) continue;

      if (p.key === "") {
        // Erster Start: Zeitraum übernehmen, nichts zurücksetzen
        p.key = key;
        continue;
      }

      // Nur wenn der gespeicherte Zeitraum direkt vorausging, ist er der
      // Vorzeitraum. Bei längerer Pause gab es dazwischen keine Daten.
      p.previous =
        p.key === previousPeriodKey(period, now) ? { ...p.values } : emptyValues();
      // Zeitstempel für den Verlauf: letzter Moment des Vorzeitraums
      p.previousEnd = periodStart(period, now).getTime() - 1;
      p.values = emptyValues();
      p.key = key;
      changed.push(period);
    }
    return changed;
  }

  /**
   * Neue Messwerte verarbeiten.
   * @param {Record<string, number>} values Ergebnis von computeValues()
   * @param {number} ts Zeitstempel in ms
   * @returns {string[]} gewechselte Zeiträume
   */
  update(values, ts) {
    const changed = this.rollover(new Date(ts));

    const powers = {};
    for (const [q, def] of Object.entries(QUANTITIES)) {
      const pw = def.power(values);
      // Energiezähler laufen nur vorwärts
      powers[q] = Number.isFinite(pw) && pw > 0 ? pw : 0;
    }

    if (this.lastTs !== null && this.lastPowers) {
      const dt = ts - this.lastTs;
      if (dt > 0 && dt <= MAX_GAP_MS) {
        const hours = dt / 3600000;
        for (const q of Object.keys(QUANTITIES)) {
          const kWh = ((this.lastPowers[q] + powers[q]) / 2) * hours;
          for (const p of Object.values(this.periods)) p.values[q] += kWh;
        }
      }
    }

    this.lastTs = ts;
    this.lastPowers = powers;
    return changed;
  }

  /** Ablauf unterbrochen (z. B. Abruf fehlgeschlagen): keine Lücke überbrücken */
  interrupt() {
    this.lastTs = null;
    this.lastPowers = null;
  }

  /**
   * Vorzeitraum-Werte eines Zeitraums inkl. abgeleiteter Werte
   * (IDs relativ zu "counters.").
   * @param {string} period
   * @returns {Record<string, number>}
   */
  previousSnapshot(period) {
    const p = this.periods[period];
    const out = {};
    if (!p || !PERIODS[period].prevName) return out;
    const prev = { ...p.previous, ...derive(p.previous) };
    for (const [k, v] of Object.entries(prev)) out[`${period}.previous.${k}`] = round(v);
    return out;
  }

  /**
   * Alle Zählerstände inkl. abgeleiteter Werte als flache Liste von
   * Datenpunkt-IDs (relativ zu "counters.") und Werten.
   * Vorzeitraum-Werte nur mit includePrevious (sie werden sonst
   * ausschließlich beim Zeitraumwechsel über previousSnapshot geschrieben).
   * @param {{includePrevious?: boolean}} [opts]
   * @returns {Record<string, number|string>}
   */
  snapshot(opts = {}) {
    const out = {};
    for (const [period, def] of Object.entries(PERIODS)) {
      const p = this.periods[period];
      out[`${period}.periodKey`] = p.key;
      const cur = { ...p.values, ...derive(p.values) };
      for (const [k, v] of Object.entries(cur)) out[`${period}.${k}`] = round(v);
      if (def.prevName && opts.includePrevious) Object.assign(out, this.previousSnapshot(period));
    }
    return out;
  }
}

/** @param {number} v */
function round(v) {
  return Math.round(v * 10000) / 10000;
}

/**
 * Objektdefinitionen für alle Zähler-Datenpunkte (relativ zu "counters.").
 * @returns {Record<string, {type: string, common: Record<string, any>}>}
 */
function counterObjects() {
  const objs = {};
  const addSet = (prefix, label) => {
    for (const [k, def] of Object.entries(QUANTITIES)) {
      objs[`${prefix}.${k}`] = {
        type: "state",
        common: { name: `${label}: ${def.name}`, unit: "kWh", role: "value.energy" },
      };
    }
    for (const [k, def] of Object.entries(DERIVED)) {
      objs[`${prefix}.${k}`] = {
        type: "state",
        common: {
          name: `${label}: ${def.name}`,
          unit: def.unit,
          role: def.unit === "kWh" ? "value.energy" : "value",
        },
      };
    }
  };

  for (const [period, def] of Object.entries(PERIODS)) {
    objs[period] = { type: "channel", common: { name: def.name } };
    objs[`${period}.periodKey`] = {
      type: "state",
      common: { name: `${def.name}: Zeitraum`, type: "string", role: "text" },
    };
    addSet(period, def.name);
    if (def.prevName) {
      objs[`${period}.previous`] = { type: "channel", common: { name: def.prevName } };
      addSet(`${period}.previous`, def.prevName);
    }
  }
  return objs;
}

module.exports = {
  MAX_GAP_MS,
  PERIODS,
  QUANTITIES,
  DERIVED,
  CounterEngine,
  periodKey,
  previousPeriodKey,
  periodStart,
  isoWeek,
  derive,
  counterObjects,
};
