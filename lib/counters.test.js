"use strict";

const { expect } = require("chai");
const {
  CounterEngine,
  periodKey,
  previousPeriodKey,
  derive,
  counterObjects,
  MAX_GAP_MS,
} = require("./counters");

/** Messwerte wie aus computeValues() */
const sample = (o = {}) => ({
  PvPwTotal: 0,
  GridPwPurchase: 0,
  GridPwFeedIn: 0,
  BtPwCharge: 0,
  BtPwDisCharge: 0,
  ConsPw: 0,
  ...o,
});

const at = (...args) => new Date(...args).getTime();

describe("periodKey / previousPeriodKey", () => {
  const d = new Date(2026, 10, 10, 14, 30); // 10.11.2026
  it("liefert Schlüssel aller Zeiträume", () => {
    expect(periodKey("day", d)).to.equal("2026-11-10");
    expect(periodKey("week", d)).to.equal("2026-W46");
    expect(periodKey("month", d)).to.equal("2026-11");
    expect(periodKey("quarter", d)).to.equal("2026-Q4");
    expect(periodKey("halfyear", d)).to.equal("2026-H2");
    expect(periodKey("year", d)).to.equal("2026");
    expect(periodKey("total", d)).to.equal("total");
  });
  it("Quartals- und Halbjahresgrenzen", () => {
    expect(periodKey("quarter", new Date(2026, 2, 31))).to.equal("2026-Q1");
    expect(periodKey("quarter", new Date(2026, 3, 1))).to.equal("2026-Q2");
    expect(periodKey("halfyear", new Date(2026, 5, 30))).to.equal("2026-H1");
    expect(periodKey("halfyear", new Date(2026, 6, 1))).to.equal("2026-H2");
  });
  it("Kalenderwochen nach ISO 8601 an Jahresgrenzen", () => {
    expect(periodKey("week", new Date(2026, 0, 1))).to.equal("2026-W01");
    expect(periodKey("week", new Date(2026, 11, 31))).to.equal("2026-W53");
    expect(periodKey("week", new Date(2027, 0, 3))).to.equal("2026-W53"); // So
    expect(periodKey("week", new Date(2027, 0, 4))).to.equal("2027-W01"); // Mo
    expect(periodKey("week", new Date(2024, 11, 30))).to.equal("2025-W01");
    expect(periodKey("week", new Date(2021, 0, 3))).to.equal("2020-W53");
  });
  it("Woche beginnt Montag 0 Uhr", () => {
    expect(periodKey("week", new Date(2026, 10, 15, 23, 59, 59))).to.equal("2026-W46"); // So
    expect(periodKey("week", new Date(2026, 10, 16, 0, 0, 0))).to.equal("2026-W47"); // Mo
    expect(previousPeriodKey("week", new Date(2026, 10, 16, 0, 0, 1))).to.equal("2026-W46");
    expect(previousPeriodKey("week", new Date(2027, 0, 4, 8))).to.equal("2026-W53");
  });
  it("Vorzeitraum über Monats- und Jahresgrenzen", () => {
    const jan1 = new Date(2027, 0, 1, 0, 0, 5);
    expect(previousPeriodKey("day", jan1)).to.equal("2026-12-31");
    expect(previousPeriodKey("month", jan1)).to.equal("2026-12");
    expect(previousPeriodKey("quarter", jan1)).to.equal("2026-Q4");
    expect(previousPeriodKey("halfyear", jan1)).to.equal("2026-H2");
    expect(previousPeriodKey("year", jan1)).to.equal("2026");
    expect(previousPeriodKey("day", new Date(2028, 2, 1))).to.equal("2028-02-29");
  });
});

describe("CounterEngine", () => {
  it("integriert Leistung über die tatsächliche Zeit (Trapezregel)", () => {
    const c = new CounterEngine();
    const t0 = at(2026, 10, 10, 12, 0, 0);
    c.update(sample({ PvPwTotal: 2 }), t0);
    c.update(sample({ PvPwTotal: 4 }), t0 + 10000); // 10 s, Ø 3 kW
    // 3 kW * 10 s = 3 * 10/3600 kWh
    expect(c.periods.day.values.PvGen).to.be.closeTo(30 / 3600, 1e-12);
    expect(c.periods.total.values.PvGen).to.be.closeTo(30 / 3600, 1e-12);
  });

  it("rechnet Batterie-W in kW um und zählt alle Größen", () => {
    const c = new CounterEngine();
    const t0 = at(2026, 10, 10, 12);
    const v = sample({
      PvPwTotal: 3.6, GridPwPurchase: 0.36, GridPwFeedIn: 1.8,
      BtPwCharge: 720, BtPwDisCharge: 0, ConsPw: 1.08,
    });
    c.update(v, t0);
    c.update(v, t0 + 1000);
    const d = c.periods.day.values;
    expect(d.PvGen).to.be.closeTo(0.001, 1e-12);
    expect(d.GridPurchase).to.be.closeTo(0.0001, 1e-12);
    expect(d.GridFeedIn).to.be.closeTo(0.0005, 1e-12);
    expect(d.BtCharged).to.be.closeTo(0.0002, 1e-12);
    expect(d.BtDischarged).to.equal(0);
    expect(d.Cons).to.be.closeTo(0.0003, 1e-12);
  });

  it("überbrückt keine Lücken größer MAX_GAP_MS und keine Unterbrechung", () => {
    const c = new CounterEngine();
    const t0 = at(2026, 10, 10, 12);
    c.update(sample({ PvPwTotal: 5 }), t0);
    c.update(sample({ PvPwTotal: 5 }), t0 + MAX_GAP_MS + 1);
    expect(c.periods.day.values.PvGen).to.equal(0);
    c.interrupt();
    c.update(sample({ PvPwTotal: 5 }), t0 + MAX_GAP_MS + 2000);
    expect(c.periods.day.values.PvGen).to.equal(0);
  });

  it("ignoriert negative Werte", () => {
    const c = new CounterEngine();
    const t0 = at(2026, 10, 10, 12);
    c.update(sample({ ConsPw: -1 }), t0);
    c.update(sample({ ConsPw: -1 }), t0 + 1000);
    expect(c.periods.day.values.Cons).to.equal(0);
  });

  it("Tageswechsel: Werte wandern nach 'previous', andere Zeiträume laufen weiter", () => {
    const c = new CounterEngine();
    const t0 = at(2026, 10, 10, 23, 59, 58);
    c.update(sample({ PvPwTotal: 3.6 }), t0);
    c.update(sample({ PvPwTotal: 3.6 }), t0 + 1000);
    const changed = c.update(sample({ PvPwTotal: 3.6 }), t0 + 3000); // 00:00:01
    expect(changed).to.deep.equal(["day"]);
    expect(c.periods.day.key).to.equal("2026-11-11");
    expect(c.periods.day.previous.PvGen).to.be.closeTo(0.001, 1e-12);
    // Intervall über Mitternacht zählt zum neuen Tag
    expect(c.periods.day.values.PvGen).to.be.closeTo(0.002, 1e-12);
    expect(c.periods.month.values.PvGen).to.be.closeTo(0.003, 1e-12);
  });

  it("Jahreswechsel setzt alle Zeiträume außer Gesamt zurück", () => {
    const c = new CounterEngine();
    const t0 = at(2026, 11, 31, 23, 59, 59);
    c.update(sample({ PvPwTotal: 3.6 }), t0);
    const changed = c.update(sample({ PvPwTotal: 3.6 }), t0 + 2000);
    // 31.12.2026 und 01.01.2027 liegen beide in KW 53/2026
    expect(changed).to.deep.equal(["day", "month", "quarter", "halfyear", "year"]);
    expect(c.periods.year.key).to.equal("2027");
    expect(c.periods.year.previous.PvGen).to.equal(0);
    expect(c.periods.total.values.PvGen).to.be.closeTo(0.002, 1e-12);
  });

  it("merkt sich das Ende des Vorzeitraums als Zeitstempel", () => {
    const c = new CounterEngine();
    c.update(sample(), at(2026, 11, 31, 23, 59, 59));
    c.update(sample(), at(2027, 0, 1, 0, 0, 1));
    expect(c.periods.day.previousEnd).to.equal(at(2027, 0, 1) - 1);
    expect(c.periods.month.previousEnd).to.equal(at(2027, 0, 1) - 1);
    expect(new Date(c.periods.day.previousEnd).getDate()).to.equal(31);
  });

  it("erster Start meldet keinen Zeitraumwechsel", () => {
    const c = new CounterEngine();
    expect(c.update(sample(), at(2026, 10, 10, 6, 0))).to.deep.equal([]);
    expect(c.periods.day.previousEnd).to.equal(null);
  });

  it("previousSnapshot liefert nur den Vorzeitraum des Zeitraums", () => {
    const c = new CounterEngine();
    c.restore("day", "2026-11-09", { PvGen: 10, GridPurchase: 0, GridFeedIn: 4, BtCharged: 0, BtDischarged: 0, Cons: 8 });
    c.update(sample(), at(2026, 10, 10, 0, 0, 1));
    const snap = c.previousSnapshot("day");
    expect(snap["day.previous.PvGen"]).to.equal(10);
    expect(snap["day.previous.SelfConsRate"]).to.equal(60);
    expect(Object.keys(snap).every((k) => k.startsWith("day.previous."))).to.equal(true);
    expect(c.previousSnapshot("total")).to.deep.equal({});
  });

  it("Wochenwechsel Sonntag → Montag", () => {
    const c = new CounterEngine();
    c.update(sample({ PvPwTotal: 3.6 }), at(2026, 10, 15, 23, 59, 59));
    const changed = c.update(sample({ PvPwTotal: 3.6 }), at(2026, 10, 16, 0, 0, 0));
    expect(changed).to.deep.equal(["day", "week"]);
    expect(c.periods.week.key).to.equal("2026-W47");
    expect(c.periods.week.previousEnd).to.equal(at(2026, 10, 16) - 1);
    expect(c.periods.month.values.PvGen).to.be.closeTo(0.001, 1e-12);
  });

  it("Halbjahreswechsel am 1. Juli", () => {
    const c = new CounterEngine();
    c.update(sample(), at(2026, 5, 30, 23, 59, 59));
    const changed = c.update(sample(), at(2026, 6, 1, 0, 0, 0));
    expect(changed).to.deep.equal(["day", "month", "quarter", "halfyear"]);
  });

  it("Neustart nach Mitternacht: gespeicherter Tag wird zu 'gestern'", () => {
    const c = new CounterEngine();
    c.restore("day", "2026-11-09", { PvGen: 12.5, GridPurchase: 1, GridFeedIn: 0, BtCharged: 0, BtDischarged: 0, Cons: 8 });
    c.restore("month", "2026-11", { PvGen: 100 }, {});
    c.update(sample(), at(2026, 10, 10, 6, 0));
    expect(c.periods.day.previous.PvGen).to.equal(12.5);
    expect(c.periods.day.values.PvGen).to.equal(0);
    expect(c.periods.month.values.PvGen).to.equal(100);
  });

  it("Neustart nach mehreren Tagen Pause: kein falsches 'gestern'", () => {
    const c = new CounterEngine();
    c.restore("day", "2026-11-05", { PvGen: 12.5 }, { PvGen: 9 });
    c.update(sample(), at(2026, 10, 10, 6, 0));
    expect(c.periods.day.previous.PvGen).to.equal(0);
    expect(c.periods.day.values.PvGen).to.equal(0);
  });

  it("erster Start setzt nichts zurück", () => {
    const c = new CounterEngine();
    c.restore("total", undefined, { PvGen: 5 });
    c.update(sample(), at(2026, 10, 10, 6, 0));
    expect(c.periods.total.key).to.equal("total");
    expect(c.periods.total.values.PvGen).to.equal(5);
  });

  it("snapshot enthält alle Datenpunkte aus counterObjects", () => {
    const c = new CounterEngine();
    c.update(sample(), at(2026, 10, 10, 6, 0));
    expect(Object.keys(c.snapshot()).some((k) => k.includes(".previous."))).to.equal(false);
    const snapIds = Object.keys(c.snapshot({ includePrevious: true })).sort();
    const stateIds = Object.entries(counterObjects())
      .filter(([, o]) => o.type === "state")
      .map(([id]) => id)
      .sort();
    expect(snapIds).to.deep.equal(stateIds);
    expect(snapIds).to.include("total.PvGen");
    expect(snapIds).to.not.include("total.previous.PvGen");
    expect(snapIds).to.include("halfyear.previous.Autarky");
  });
});

describe("derive", () => {
  it("berechnet Eigenversorgung, Autarkie und Eigenverbrauchsquote", () => {
    const r = derive({ PvGen: 10, GridPurchase: 2, GridFeedIn: 4, BtCharged: 0, BtDischarged: 0, Cons: 8 });
    expect(r.SelfSupply).to.equal(6);
    expect(r.Autarky).to.equal(75);
    expect(r.SelfConsRate).to.equal(60);
  });
  it("liefert 0 statt NaN ohne Verbrauch/Erzeugung", () => {
    const r = derive({ PvGen: 0, GridPurchase: 0, GridFeedIn: 0, BtCharged: 0, BtDischarged: 0, Cons: 0 });
    expect(r).to.deep.equal({ SelfSupply: 0, Autarky: 0, SelfConsRate: 0 });
  });
});
