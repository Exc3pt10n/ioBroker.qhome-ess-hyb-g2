"use strict";

const { expect } = require("chai");
const { STATES, computeValues, transformTimestamp } = require("./lib/ess");

const base = {
  ColecTm: "20251110143005",
  PowerOutletPw: "0",
  GridPw: "0.5",
  ConsPw: "1.2",
  BtSoc: "50",
  PcsPw: "700",
  AbsPcsPw: "0.7",
  PvPw: "2.0",
  GridStusCd: "1",
  BtStusCd: "1",
  BtPw: "0.5",
  OperStusCd: "0",
  EmsOpMode: "0",
  RankPer: "0",
  ErrorCnt: "0",
};

describe("transformTimestamp", () => {
  it("wandelt YYYYMMDDhhmmss in ein lokales Datum um", () => {
    const expected = new Date(2025, 10, 10, 14, 30, 5).toLocaleString();
    expect(transformTimestamp("20251110143005")).to.equal(expected);
  });
  it("gibt unbekannte Formate unverändert zurück", () => {
    expect(transformTimestamp("abc")).to.equal("abc");
  });
});

describe("computeValues", () => {
  it("Einspeisung + Laden", () => {
    const v = computeValues(base, 4);
    expect(v.GridPwFeedIn).to.equal(0.5);
    expect(v.GridPwFeedInWb).to.equal(500);
    expect(v.GridPwPurchase).to.equal(0);
    expect(v.BtCap).to.equal(2);
    expect(v.BtPwCharge).to.equal(500);
    expect(v.BtChargeIndicator).to.equal(1);
    expect(v.BtDisChargeIndicator).to.equal(0);
    // (4 - 2) kWh / 0.5 kW = 4 h = 240 min
    expect(v.BtLast).to.equal(240);
    expect(v.PvPwTotal).to.equal(2);
    expect(v.PcsPw).to.equal(700);
  });

  it("Bezug + Entladen", () => {
    const v = computeValues({ ...base, GridStusCd: "0", BtStusCd: "0", BtPw: "1" }, 4);
    expect(v.GridPwPurchase).to.equal(0.5);
    expect(v.GridPwPurchaseWb).to.equal(500);
    expect(v.GridPwFeedIn).to.equal(0);
    expect(v.BtPwDisCharge).to.equal(1000);
    expect(v.BtDisChargeIndicator).to.equal(1);
    expect(v.BtLast).to.equal(120);
  });

  it("Batterie bereit: Restlaufzeit über Verbrauch", () => {
    const v = computeValues({ ...base, BtStusCd: "2", ConsPw: "0.5" }, 4);
    expect(v.BtLast).to.equal(240);
  });

  it("liefert 0 statt Infinity bei Leistung 0", () => {
    const v = computeValues({ ...base, BtStusCd: "0", BtPw: "0" }, 4);
    expect(v.BtLast).to.equal(0);
  });
});

describe("computeValues mit echter Geräteantwort", () => {
  // Antwort eines Q.HOME+ ESS HYB-G2 vom 11.11.2026 (Zahlen teils als Zahl, teils als String)
  const real = {
    ColecTm: "20261111104056",
    PowerOutletPw: "0",
    GridPw: 0.7,
    UnitPrice: 0.0,
    ConsPw: 0.8,
    BtSoc: 7,
    PcsPw: 61.0,
    AbsPcsPw: 0.1,
    PvPw: 0.1,
    GridStusCd: "0",
    BtStusCd: "2",
    BtPw: 0.0,
    OperStusCd: "0",
    EmsOpMode: "0",
    RankPer: 0,
    ErrorCnt: 0,
  };

  it("verarbeitet gemischte Zahl-/String-Werte", () => {
    const v = computeValues(real, 4);
    expect(v.GridStusCd).to.equal(0);
    expect(v.BtStusCd).to.equal(2);
    expect(v.GridPwPurchase).to.equal(0.7);
    expect(v.GridPwPurchaseWb).to.be.closeTo(700, 1e-9);
    expect(v.GridPwFeedIn).to.equal(0);
    expect(v.PcsPw).to.equal(61); // W
    expect(v.AbsPcsPw).to.equal(0.1); // kW
    expect(v.BtCap).to.be.closeTo(0.28, 1e-12);
    expect(v.BtPwCharge).to.equal(0);
    expect(v.BtPwDisCharge).to.equal(0);
    // Status 2: Restlaufzeit = Batterieinhalt / Verbrauch = 0,28 kWh / 0,8 kW = 21 min
    expect(v.BtLast).to.equal(21);
  });

  it("Status 2 heißt \"Bereit\" (Batterie ruht, z. B. bei 7 % SoC)", () => {
    expect(STATES.BtStusCd.states[2]).to.equal("Bereit");
  });

  it("Energiebilanz: Verbrauch = Netzbezug + PV (Batterie ruht)", () => {
    const v = computeValues(real, 4);
    expect(v.GridPwPurchase + v.PvPw).to.be.closeTo(v.ConsPw, 1e-9);
  });
});

