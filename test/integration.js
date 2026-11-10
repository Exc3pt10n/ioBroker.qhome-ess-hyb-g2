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
        this.timeout(30000);
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
      });
    });
  },
});
