"use strict";

/**
 * Datenpunkt-Definitionen (Echtzeitwerte des ESS).
 * Namen englisch mit deutscher Übersetzung, Leistungen mit Rolle value.power.
 */
const POWER = "value.power";
const STATES = {
  AbsPcsPw: { name: { en: "Inverter power (absolute)", de: "Wechselrichterleistung absolut" }, unit: "kW", role: POWER },
  BtCap: { name: { en: "Battery energy stored", de: "Batterie Kapazität" }, unit: "kWh", role: "value.energy" },
  BtLast: { name: { en: "Battery remaining time (charge/discharge)", de: "Restlaufzeit (laden/entladen)" }, unit: "min" },
  BtPw: { name: { en: "Battery power", de: "Batterieleistung" }, unit: "kW", role: POWER },
  BtSoc: { name: { en: "Battery state of charge", de: "Batterie Ladezustand" }, unit: "%", role: "value.battery" },
  BtStusCd: {
    name: { en: "Battery status code", de: "Batteriestatuscode" },
    states: { 0: "Discharging", 1: "Charging", 2: "Idle" },
  },
  ColecTm: { name: { en: "Collection time", de: "Abfragezeitpunkt" }, type: "string", role: "text" },
  ConsPw: { name: { en: "Consumption power", de: "Bedarf Leistung" }, unit: "kW", role: POWER },
  EmsOpMode: { name: { en: "EMS operating mode", de: "EMS-Betriebsart" } },
  ErrorCnt: { name: { en: "Error count", de: "Anzahl Fehler" } },
  GridPw: { name: { en: "Grid power", de: "Netzleistung" }, unit: "kW", role: POWER },
  GridPwPurchase: { name: { en: "Grid purchase", de: "Netzbezug" }, unit: "kW", role: POWER },
  GridPwFeedIn: { name: { en: "Grid feed-in", de: "Netzeinspeisung" }, unit: "kW", role: POWER },
  GridPwPurchaseWb: { name: { en: "Grid purchase (W)", de: "Netzbezug (W)" }, unit: "W", role: POWER },
  GridPwFeedInWb: { name: { en: "Grid feed-in (W)", de: "Netzeinspeisung (W)" }, unit: "W", role: POWER },
  GridStusCd: {
    name: { en: "Grid status code", de: "Netzstatuscode" },
    states: { 0: "Purchase", 1: "Feed-in" },
  },
  OperStusCd: { name: { en: "Operating status code", de: "Betriebsstatuscode" } },
  PcsPw: { name: { en: "Inverter power", de: "Wechselrichterleistung" }, unit: "W", role: POWER },
  PowerOutletPw: { name: { en: "Power outlet power", de: "Leistung Steckdose" } },
  PvPw: { name: { en: "PV power Q.HOME", de: "Photovoltaikleistung Q.HOME" }, unit: "kW", role: POWER },
  PvPwExt: { name: { en: "PV power additional inverters", de: "Photovoltaikleistung zusätzliche Erzeuger" }, unit: "kW", role: POWER },
  PvPwTotal: { name: { en: "PV power total", de: "Photovoltaikleistung Gesamt" }, unit: "kW", role: POWER },
  RankPer: { name: { en: "Rank percentage", de: "Rang in Prozent" } },
  BtPwCharge: { name: { en: "Battery charging power", de: "Ladeleistung Batterie" }, unit: "W", role: POWER },
  BtPwDisCharge: { name: { en: "Battery discharging power", de: "Entladeleistung Batterie" }, unit: "W", role: POWER },
  BtChargeIndicator: { name: { en: "Battery charging indicator", de: "Ladeindikator Batterie" } },
  BtDisChargeIndicator: { name: { en: "Battery discharging indicator", de: "Entladeindikator Batterie" } },
};

/**
 * Wandelt einen Zahlenwert sicher um; ungültige Werte werden zu 0.
 * @param {any} v
 */
function toNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Restlaufzeit in Minuten; liefert 0 statt Infinity/NaN bei Leistung 0.
 * @param {number} energy kWh
 * @param {number} power kW
 */
function runtimeMinutes(energy, power) {
  if (!power || power <= 0) return 0;
  return Math.round((energy / power) * 60);
}

/**
 * Wandelt den ESS-Zeitstempel (YYYYMMDDhhmmss) in ein lesbares Datum um.
 * @param {any} input
 */
function transformTimestamp(input) {
  if (input === undefined || input === null) return "";
  const s = input.toString();
  const m = s.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/);
  if (!m) return s;
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return date.toLocaleString();
}

/**
 * Berechnet alle Datenpunktwerte aus der ESS-Antwort.
 * @param {Record<string, any>} status Inhalt von ESSRealtimeStatus
 * @param {number} batCapacity Speicherkapazität in kWh
 * @param {{extPvKw?: number, hasExt?: boolean}} [ext] zusätzliche PV-Erzeuger
 *   (Summe in kW; hasExt = mindestens ein Erzeuger konfiguriert)
 */
function computeValues(status, batCapacity, ext = {}) {
  const BtSoc = toNumber(status.BtSoc);
  const BtStusCd = parseInt(status.BtStusCd, 10);
  const BtPw = toNumber(status.BtPw);
  const PvPw = toNumber(status.PvPw);
  const GridStusCd = parseInt(status.GridStusCd, 10);
  const GridPw = toNumber(status.GridPw);
  const PvPwExt = Math.max(0, toNumber(ext.extPvKw));
  const PvPwTotal = PvPw + PvPwExt;
  const BtCap = (batCapacity * BtSoc) / 100;

  // Netzstatus
  let GridPwPurchase = 0;
  let GridPwFeedIn = 0;
  let GridPwPurchaseWb = 0;
  let GridPwFeedInWb = 0;
  if (GridStusCd === 0) {
    GridPwPurchase = GridPw;
    GridPwPurchaseWb = GridPw * 1000;
  } else if (GridStusCd === 1) {
    GridPwFeedIn = GridPw;
    GridPwFeedInWb = GridPw * 1000;
  }

  // Batterie-Leistung
  let BtPwCharge = 0;
  let BtPwDisCharge = 0;
  let BtChargeIndicator = 0;
  let BtDisChargeIndicator = 0;
  if (BtStusCd === 0) {
    BtPwDisCharge = BtPw * 1000;
    BtDisChargeIndicator = 1;
  } else if (BtStusCd === 1) {
    BtPwCharge = BtPw * 1000;
    BtChargeIndicator = 1;
  }

  // Verbrauch: Der Q.HOME misst am Hausanschluss und kennt nur seine eigene
  // PV. Die Leistung zusätzlicher Erzeuger sieht er nur als geringeren
  // Netzbezug bzw. höhere Einspeisung, sein ConsPw ist dann zu niedrig.
  // Mit zusätzlichen Erzeugern daher aus der Energiebilanz berechnen.
  const ConsPw = ext.hasExt
    ? Math.max(
        0,
        PvPwTotal + GridPwPurchase - GridPwFeedIn + (BtPwDisCharge - BtPwCharge) / 1000
      )
    : toNumber(status.ConsPw);

  // Batterielaufzeit
  let BtLast = 0;
  switch (BtStusCd) {
    case 0:
      BtLast = runtimeMinutes(BtCap, BtPw);
      break;
    case 1:
      BtLast = runtimeMinutes(batCapacity - BtCap, BtPw);
      break;
    case 2:
      BtLast = runtimeMinutes(BtCap, ConsPw);
      break;
  }

  return {
    ColecTm: transformTimestamp(status.ColecTm),
    PowerOutletPw: toNumber(status.PowerOutletPw),
    GridPw,
    ConsPw,
    BtSoc,
    PcsPw: toNumber(status.PcsPw),
    AbsPcsPw: toNumber(status.AbsPcsPw),
    PvPw,
    PvPwExt,
    PvPwTotal,
    GridStusCd: Number.isFinite(GridStusCd) ? GridStusCd : 0,
    BtStusCd: Number.isFinite(BtStusCd) ? BtStusCd : 0,
    BtPw,
    OperStusCd: toNumber(status.OperStusCd),
    EmsOpMode: toNumber(status.EmsOpMode),
    RankPer: toNumber(status.RankPer),
    ErrorCnt: toNumber(status.ErrorCnt),
    BtCap,
    BtLast,
    BtPwCharge,
    BtPwDisCharge,
    GridPwFeedIn,
    GridPwFeedInWb,
    GridPwPurchase,
    GridPwPurchaseWb,
    BtChargeIndicator,
    BtDisChargeIndicator,
  };
}

/**
 * Datenpunkte früherer Versionen, die beim Start gelöscht werden
 */
const OBSOLETE_STATES = [];

module.exports = { STATES, OBSOLETE_STATES, computeValues, transformTimestamp, runtimeMinutes };
