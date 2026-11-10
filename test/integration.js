const path = require("path");
const http = require("http");
const { tests } = require("@iobroker/testing");
const chai = require("chai");

const PORT = 18089;
const ESS_RESPONSE = {
  ESSRealtimeStatus: {
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
  },
};

tests.integration(path.join(__dirname, ".."), {
  defineAdditionalTests({ suite }) {
    suite("Abruf vom (simulierten) ESS", (getHarness) => {
      let server;
      before(async () => {
        server = http.createServer((req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(ESS_RESPONSE));
        });
        await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
      });
      after(() => server && server.close());

      it("schreibt die Datenpunkte und setzt info.connection", async function () {
        this.timeout(60000);
        const harness = getHarness();
        await harness.changeAdapterConfig("qhome-ess-hyb-g2", {
          native: { hostname: `127.0.0.1:${PORT}`, batCapacity: 4, uptIntervall: 1 },
        });
        await harness.startAdapterAndWait();
        await new Promise((r) => setTimeout(r, 3000));

        const get = (id) => harness.states.getStateAsync(`qhome-ess-hyb-g2.0.${id}`);
        const conn = await get("info.connection");
        chai.expect(conn && conn.val).to.equal(true);
        chai.expect((await get("BtCap")).val).to.equal(2);
        chai.expect((await get("GridPwFeedInWb")).val).to.equal(500);
        chai.expect((await get("BtLast")).val).to.equal(240);
        chai.expect((await get("BtStusCd")).ack).to.equal(true);

        // Zähler: Zeitraum gesetzt, Gesamt-Datenpunkt ohne Vorzeitraum
        chai.expect((await get("counters.year.periodKey")).val).to.equal(String(new Date().getFullYear()));
        const prevTotal = await harness.objects.getObjectAsync("qhome-ess-hyb-g2.0.counters.total.previous.PvGen");
        chai.expect(prevTotal).to.equal(null);

        // Beim Stoppen wird der Stand gesichert ...
        await harness.stopAdapter();
        const pvDay = (await get("counters.day.PvGen")).val;
        chai.expect(pvDay).to.be.greaterThan(0);
        chai.expect((await get("counters.total.PvGen")).val).to.equal(pvDay);

      });
    });

    suite("Zähler nach Neustart", (getHarness) => {
      let server;
      before(async () => {
        server = http.createServer((req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(ESS_RESPONSE));
        });
        await new Promise((r) => server.listen(PORT + 1, "127.0.0.1", r));
      });
      after(() => server && server.close());

      it("übernimmt gespeicherte Stände und zählt weiter", async function () {
        this.timeout(60000);
        const harness = getHarness();
        const ns = "qhome-ess-hyb-g2.0.counters";
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        // Stand vor dem "Neustart": heute 5 kWh, gestern 7 kWh, gesamt 1000 kWh
        await harness.states.setStateAsync(`${ns}.day.periodKey`, { val: today, ack: true });
        await harness.states.setStateAsync(`${ns}.day.PvGen`, { val: 5, ack: true });
        await harness.states.setStateAsync(`${ns}.day.previous.PvGen`, { val: 7, ack: true });
        await harness.states.setStateAsync(`${ns}.total.periodKey`, { val: "total", ack: true });
        await harness.states.setStateAsync(`${ns}.total.PvGen`, { val: 1000, ack: true });

        await harness.changeAdapterConfig("qhome-ess-hyb-g2", {
          native: { hostname: `127.0.0.1:${PORT + 1}`, batCapacity: 4, uptIntervall: 1 },
        });
        await harness.startAdapterAndWait();
        await new Promise((r) => setTimeout(r, 3000));
        await harness.stopAdapter();

        const get = async (id) => (await harness.states.getStateAsync(`${ns}.${id}`)).val;
        chai.expect(await get("day.PvGen")).to.be.greaterThan(5).and.lessThan(5.01);
        chai.expect(await get("day.previous.PvGen")).to.equal(7);
        chai.expect(await get("total.PvGen")).to.be.greaterThan(1000).and.lessThan(1000.01);
      });
    });
  },
});
