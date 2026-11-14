"use strict";

const { expect } = require("chai");
const { ExternalSources, normalizeSources, STALE_MS } = require("../../lib/external");

describe("normalizeSources", () => {
  it("übernimmt aktive Zeilen, rechnet W in kW um und entfernt Doppelte/Leere", () => {
    const s = normalizeSources([
      { enabled: true, name: "Sungrow", stateId: " sungrow-local.0.inverter.activePower ", unit: "W" },
      { enabled: true, name: "Doppelt", stateId: "sungrow-local.0.inverter.activePower", unit: "W" },
      { enabled: false, name: "Aus", stateId: "x.0.p", unit: "kW" },
      { enabled: true, name: "", stateId: "", unit: "W" },
      { name: "Ohne Haken", stateId: "y.0.p", unit: "kW" },
    ]);
    expect(s).to.deep.equal([
      { id: "sungrow-local.0.inverter.activePower", name: "Sungrow", factor: 0.001 },
      { id: "y.0.p", name: "Ohne Haken", factor: 1 },
    ]);
  });
  it("akzeptiert eine als Objekt gespeicherte Liste", () => {
    const s = normalizeSources({ 0: { enabled: true, name: "Sungrow", stateId: "a.0.p", unit: "W" } });
    expect(s).to.deep.equal([{ id: "a.0.p", name: "Sungrow", factor: 0.001 }]);
  });
  it("verträgt fehlende Konfiguration", () => {
    expect(normalizeSources(undefined)).to.deep.equal([]);
  });
});

describe("ExternalSources", () => {
  const sungrow = { id: "sungrow-local.0.inverter.activePower", name: "Sungrow", factor: 0.001 };
  const other = { id: "other.0.power", name: "Garage", factor: 1 };

  it("summiert aktuelle Werte in kW", () => {
    const e = new ExternalSources([sungrow, other]);
    e.update(sungrow.id, { val: 1500, ts: 1000 });
    e.update(other.id, { val: 0.4, ts: 1000 });
    expect(e.sumKw(5000).kw).to.be.closeTo(1.9, 1e-9);
  });

  it("ignoriert fremde Datenpunkte", () => {
    const e = new ExternalSources([sungrow]);
    e.update("foo.0.bar", { val: 9999, ts: 1000 });
    expect(e.sumKw(1000).kw).to.equal(0);
  });

  it("veraltete Werte zählen als 0 und werden einmal gemeldet", () => {
    const e = new ExternalSources([sungrow]);
    e.update(sungrow.id, { val: 2000, ts: 0 });
    expect(e.sumKw(STALE_MS).kw).to.equal(2);
    const r1 = e.sumKw(STALE_MS + 1);
    expect(r1.kw).to.equal(0);
    expect(r1.newlyStale).to.deep.equal([{ name: "Sungrow", lastKw: 2 }]);
    expect(e.sumKw(STALE_MS + 5000).newlyStale).to.deep.equal([]);
    e.update(sungrow.id, { val: 1000, ts: STALE_MS + 6000 });
    const r2 = e.sumKw(STALE_MS + 6000);
    expect(r2.kw).to.equal(1);
    expect(r2.recovered).to.deep.equal(["Sungrow"]);
  });

  it("fehlender Wert und negative Leistung zählen als 0", () => {
    const e = new ExternalSources([sungrow]);
    expect(e.sumKw(1000).kw).to.equal(0);
    e.update(sungrow.id, { val: -5, ts: 1000 });
    expect(e.sumKw(1000).kw).to.equal(0);
  });
});
