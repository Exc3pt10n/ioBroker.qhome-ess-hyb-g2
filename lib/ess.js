"use strict";

/**
 * Datenpunkt-Definitionen (Echtzeitwerte des ESS)
 */
const STATES = {
  AbsPcsPw: { name: "Wechselrichterleistung absolut", unit: "kW" },
  BtCap: { name: "Batterie Kapazität", unit: "kWh" },
  BtLast: { name: "Restlaufzeit (laden/entladen)", unit: "Min" },
  BtPw: { name: "Batterieleistung", unit: "kW" },
  BtSoc: { name: "Batterie Ladezustand", unit: "%", role: "value.battery" },
  BtStusCd: {
    name: "Batteriestatuscode",
    states: { 0: "Entladen", 1: "Laden", 2: "Bereit" },
  },
  ColecTm: { name: "Abfragezeitpunkt", type: "string", role: "text" },
  ConsPw: { name: "Bedarf Leistung", unit: "kW" },
  EmsOpMode: { name: "EmsOpMode" },
  ErrorCnt: { name: "Anzahl Fehler" },
  GridPw: { name: "Netzleistung", unit: "kW" },
  GridPwPurchase: { name: "Netzbezug", unit: "kW" },
  GridPwFeedIn: { name: "Netzeinspeisung", unit: "kW" },
  GridPwPurchaseWb: { name: "Netzbezug", unit: "W" },
  GridPwFeedInWb: { name: "Netzeinspeisung", unit: "W" },
  GridStusCd: {
    name: "Netzstatuscode",
    states: { 0: "Bezug", 1: "Einspeisung" },
  },
  OperStusCd: { name: "OperStusCd" },
  PcsPw: { name: "Wechselrichterleistung", unit: "W" },
  PowerOutletPw: { name: "PowerOutletPw" },
  PvPw: { name: "Photovoltaikleistung", unit: "kW" },
  RankPer: { name: "RankPer" },
  BtPwCharge: { name: "Ladeleistung Batterie", unit: "W" },
  BtPwDisCharge: { name: "Entladeleistung Batterie", unit: "W" },
  BtChargeIndicator: { name: "Ladeindikator Batterie" },
  BtDisChargeIndicator: { name: "Entladeindikator Batterie" },
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
 */
function computeValues(status, batCapacity) {
  const BtSoc = toNumber(status.BtSoc);
  const BtStusCd = parseInt(status.BtStusCd, 10);
  const BtPw = toNumber(status.BtPw);
  const PvPw = toNumber(status.PvPw);
  const GridStusCd = parseInt(status.GridStusCd, 10);
  const GridPw = toNumber(status.GridPw);
  const ConsPw = toNumber(status.ConsPw);
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
const OBSOLETE_STATES = [
  "PvPwTotal", // war immer identisch mit PvPw
];

module.exports = { STATES, OBSOLETE_STATES, computeValues, transformTimestamp, runtimeMinutes };
