"use strict";

const utils = require("@iobroker/adapter-core");
const axios = require("axios");

class QHomeAdapter extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "qhome-ess-hyb-g2",
    });

    this.initialized = false;
    this.resetMeterReadings = false;
    this.DEBUG_RUNTIME = false;
    this.DEBUG_SQL = false;

    this.on("ready", this.onReady.bind(this));
  }

  configValid() {
    const c = this.config;

    const isString = (v) => typeof v === "string" && v.trim().length > 0;
    const isPositiveNumber = (v) =>
      typeof v === "number" && isFinite(v) && v > 0;

    return (
      isString(c.hostname) &&
      isPositiveNumber(c.batCapacity) &&
      isPositiveNumber(c.uptIntervall) &&
      isPositiveNumber(c.pBuy) &&
      isPositiveNumber(c.pSell) &&
      isPositiveNumber(c.pLease) &&
      isString(c.SqlInstance) &&
      isString(c.dbName) &&
      isString(c.dbTable)
    );
  }

  async onReady() {
    this.DpPath = `${this.name}.${this.instance}`;

    if (!this.configValid()) {
      this.log.warn(
        "Konfiguration unvollständig oder ungültig. Adapterstart abgebrochen."
      );
      return;
    }

    const {
      hostname,
      batCapacity,
      uptIntervall,
      pSell,
      pBuy,
      pLease,
      dbName,
      dbTable,
      SqlInstance,
      enableDbStorage,
    } = this.config;

    this.batCapacity = batCapacity;
    this.pSell = pSell;
    this.pBuy = pBuy;
    this.pLease = pLease;
    this.dbName = dbName;
    this.dbTable = dbTable;
    this.SqlInstance = SqlInstance;
    this.enableDbStorage = enableDbStorage;

    const { pvSource1, pvSource2, pvSource3 } = this.config;
    this.pvSources = [pvSource1, pvSource2, pvSource3].filter(
      (s) => typeof s === "string" && s.trim().length > 0
    );

    if (!this.initialized) {
      this.initialized = true;
      await this.createStates();

      if (this.enableDbStorage) {
        await this.createDbTable();
      }
    }

    this.pollingInterval = setInterval(
      () => this.main(hostname),
      uptIntervall * 1000
    );

    if (this.enableDbStorage) {
      this.midnightTimer = setInterval(() => {
        const now = new Date();
        if (now.getHours() === 23 && now.getMinutes() === 59) {
          this.resetMeterReadings = true;
        }
      }, 60 * 1000); // prüft jede Minute
    }
  }

  transformTimestamp(input) {
    return new Date(
      input
        .toString()
        .replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/, "$4:$5:$6 $2/$3/$1")
    ).toLocaleString();
  }

  async getStateAsync(id) {
    return new Promise((resolve) => {
      this.getState(id, (err, state) => resolve(state));
    });
  }

  async setStateAsync(id, val) {
    return new Promise((resolve) => {
      this.setState(id, { val, ack: true }, () => resolve());
    });
  }

  async main(hostname) {
    const startTime = this.DEBUG_RUNTIME ? Date.now() : null;
    const urlAPI = `http://${hostname}/R3EMSAPP_REAL.ems?file=ESSRealtimeStatus.json`;

    try {
      const response = await axios.get(urlAPI);
      const status = response.data.ESSRealtimeStatus;

      let PvPwTotal = parseFloat(status.PvPw) || 0;

      for (const source of this.pvSources) {
        if (typeof source !== "string" || source.trim() === "") continue;

        try {
          const state = await this.getStateAsync(source.trim());
          const val = parseFloat(state?.val);
          if (isFinite(val)) PvPwTotal += val;
        } catch (err) {
          this.log.warn(
            `⚠️ Zusätzliche PV-Quelle '${source}' konnte nicht gelesen werden: ${err.message}`
          );
        }
      }

      const BtSoc = parseFloat(status.BtSoc);
      const BtStusCd = parseInt(status.BtStusCd);
      const BtPw = parseFloat(status.BtPw);
      const GridStusCd = parseInt(status.GridStusCd);
      const GridPw = parseFloat(status.GridPw);
      const BtCap = (this.batCapacity * BtSoc) / 100;

      let GridPwPurchase = 0,
        GridPwFeedIn = 0,
        GridPwPurchaseWb = 0,
        GridPwFeedInWb = 0;
      if (GridStusCd === 0) {
        GridPwPurchase = GridPw;
        GridPwPurchaseWb = GridPw * 1000;
      } else if (GridStusCd === 1) {
        GridPwFeedIn = GridPw;
        GridPwFeedInWb = GridPw * 1000;
      }

      let BtPwCharge = 0,
        BtPwDisCharge = 0,
        BtChargeIndicator = 0,
        BtDisChargeIndicator = 0;
      if (BtStusCd === 0) {
        BtPwDisCharge = BtPw * 1000;
        BtDisChargeIndicator = 1;
      } else if (BtStusCd === 1) {
        BtPwCharge = BtPw * 1000;
        BtChargeIndicator = 1;
      }

      const ConsPw =
        PvPwTotal +
        GridPwPurchase +
        BtPwDisCharge / 1000 -
        GridPwFeedIn -
        BtPwCharge / 1000;

      let BtLast = 0;
      switch (BtStusCd) {
        case 0:
          BtLast = Math.round((BtCap / BtPw) * 60);
          break;
        case 1:
          BtLast = Math.round(((this.batCapacity - BtCap) / BtPw) * 60);
          break;
        case 2:
          BtLast = Math.round((BtCap / ConsPw) * 60);
          break;
      }

      const dpValues = {
        ColecTm: this.transformTimestamp(status.ColecTm),
        PowerOutletPw: parseInt(status.PowerOutletPw),
        GridPw,
        ConsPw,
        BtSoc,
        PcsPw: status.PcsPw,
        AbsPcsPw: status.AbsPcsPw,
        PvPw: parseFloat(status.PvPw),
        PvPwTotal,
        GridStusCd,
        BtStusCd,
        BtPw,
        OperStusCd: parseInt(status.OperStusCd),
        EmsOpMode: parseInt(status.EmsOpMode),
        RankPer: status.RankPer,
        ErrorCnt: status.ErrorCnt,
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

      for (const [key, val] of Object.entries(dpValues)) {
        await this.setStateAsync(`${this.DpPath}.${key}`, val);
      }

      await this.updateMeterReadings(
        PvPwTotal,
        GridStusCd,
        GridPw,
        BtStusCd,
        BtPw
      );
    } catch (ex) {
      this.log.error(`main() error: ${ex.message}`);
    }

    if (this.DEBUG_RUNTIME) {
      this.log.info(`${Date.now() - startTime} ms`);
    }
  }

  async updateMeterReadings(PvPw, GridStusCd, GridPw, BtStusCd, BtPw) {
    const keys = [
      "TodayGen",
      "TodayDemand",
      "TodayFeedIn",
      "TodayCharged",
      "TodayDischarged",
    ];

    const values = {};
    for (const key of keys) {
      const state = await this.getStateAsync(`${this.DpPath}.${key}`);
      values[key] = parseFloat(state?.val || 0);
    }

    if (this.resetMeterReadings) {
      this.resetMeterReadings = false;

      if (this.enableDbStorage) {
        await this.saveMeterValuesToDb(
          values.TodayGen,
          values.TodayDemand,
          values.TodayFeedIn,
          values.TodayCharged,
          values.TodayDischarged
        );

        await this.updateCurrentYear();
        await this.updateTotals();
      }

      for (const key of keys) {
        values[key] = 0;
      }
    }

    const delta = (val) => (val / 3600) * this.config.uptIntervall;
    values.TodayGen += delta(PvPw);

    if (GridStusCd === 0) values.TodayDemand += delta(GridPw);
    else if (GridStusCd === 1) values.TodayFeedIn += delta(GridPw);

    if (BtStusCd === 0) values.TodayDischarged += delta(BtPw);
    else if (BtStusCd === 1) values.TodayCharged += delta(BtPw);

    const TodaySelfCons =
      values.TodayGen -
      values.TodayFeedIn -
      values.TodayCharged +
      values.TodayDischarged;
    const TodayCons = TodaySelfCons + values.TodayDemand;
    const TodayAutarky = TodayCons > 0 ? (TodaySelfCons / TodayCons) * 100 : 0;
    const TodayCost = values.TodayDemand * this.pBuy;
    const TodayEarn = values.TodayFeedIn * this.pSell;
    const leaseCost = this.getPriceLeasePaymentToday();
    const TodayEffectivePrice =
      TodayCons > 0 && isFinite(TodayCons)
        ? (TodayCost + leaseCost - TodayEarn) / TodayCons
        : 0;

    const output = {
      ...values,
      TodayCost,
      TodayEarn,
      TodayCons,
      TodayAutarky,
      TodaySelfCons,
      TodayEffectivePrice,
    };

    for (const [key, val] of Object.entries(output)) {
      await this.setStateAsync(`${this.DpPath}.${key}`, val);
    }
  }

  async getPriceLeasePaymentToday() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Number((this.pLease / daysInMonth).toFixed(8));
  }

  async createStates() {
    const states = {
      // Aktuelle Werte
      AbsPcsPw: { name: "Wechselrichterleistung absolut", unit: "kW" },
      BtCap: { name: "Batterie Kapazität", unit: "kWh" },
      BtLast: { name: "Restlaufzeit (laden/entladen)", unit: "Min" },
      BtPw: { name: "Batterieleistung", unit: "kW" },
      BtSoc: { name: "Batterie Ladezustand", unit: "%" },
      BtStusCd: {
        name: "Batteriestatuscode",
        unit: "",
        states: { 0: "Entladen", 1: "Laden", 2: "Geladen" },
      },
      ColecTm: { name: "Abfragezeitpunkt", type: "string", unit: "" },
      ConsData: {
        name: "Verbrauchswerte Durchschnittsverbrauch",
        type: "string",
        unit: "",
      },
      ConsPw: { name: "Bedarf Leistung", unit: "kW" },
      EmsOpMode: { name: "EmsOpMode", unit: "" },
      ErrorCnt: { name: "Anzahl Fehler", unit: "" },
      GridPw: { name: "Netzleistung", unit: "kW" },
      GridPwPurchase: { name: "Netzbezug", unit: "kW" },
      GridPwFeedIn: { name: "Netzeinspeisung", unit: "kW" },
      GridPwPurchaseWb: { name: "Netzbezug", unit: "W" },
      GridPwFeedInWb: { name: "Netzeinspeisung", unit: "W" },
      GridStusCd: {
        name: "Netzstatuscode",
        unit: "",
        states: { 0: "Bezug", 1: "Einspeisung" },
      },
      OperStusCd: { name: "OperStusCd", unit: "" },
      PcsPw: { name: "Wechselrichterleistung", unit: "W" },
      PowerOutletPw: { name: "PowerOutletPw", unit: "" },
      PvPw: { name: "Photovoltaikleistung", unit: "kW" },
      PvPwTotal: { name: "Photovoltaikleistung Gesamt", unit: "kW" },
      RankPer: { name: "RankPer", unit: "" },
      BtPwCharge: { name: "Ladeleistung Batterie", unit: "W" },
      BtPwDisCharge: { name: "Entladeleistung Batterie", unit: "W" },
      BtChargeIndicator: {
        name: "Ladeindikator Batterie",
        unit: "",
        type: "number",
      },
      BtDisChargeIndicator: {
        name: "Entladeindikator Batterie",
        unit: "",
        type: "number",
      },

      // Tageswerte
      TodayDemand: { name: "Heute bezogen", unit: "kWh" },
      TodayFeedIn: { name: "Heute eingespeist", unit: "kWh" },
      TodayGen: { name: "Heute generiert", unit: "kWh" },
      TodayCharged: { name: "Heute geladen", unit: "kWh" },
      TodayDischarged: { name: "Heute entladen", unit: "kWh" },
      TodayCons: { name: "Heute verbraucht", unit: "kWh" },
      TodayCost: { name: "Kosten Bezug", unit: "Euro" },
      TodayEarn: { name: "Erlös Verkauf", unit: "Euro" },
      TodayAutarky: { name: "Autarkie heute", unit: "%" },
      TodaySelfCons: { name: "Eigenverbrauch heute", unit: "kWh" },
      TodayEffectivePrice: {
        name: "Heutiger effektiver Preis je kWh",
        unit: "Euro/kWh",
      },

      // Jahreswerte
      CurYearDemand: { name: "Aktuelles Jahr bezogen", unit: "kWh" },
      CurYearFeedIn: { name: "Aktuelles Jahr eingespeist", unit: "kWh" },
      CurYearGen: { name: "Aktuelles Jahr generiert", unit: "kWh" },
      CurYearCharged: { name: "Aktuelles Jahr geladen", unit: "kWh" },
      CurYearDischarged: { name: "Aktuelles Jahr entladen", unit: "kWh" },
      CurYearCons: { name: "Aktuelles Jahr verbraucht", unit: "kWh" },
      CurYearCost: { name: "Aktuelles Jahr Kosten Bezug", unit: "Euro" },
      CurYearEarn: { name: "Aktuelles Jahr Erlös Verkauf", unit: "Euro" },
      CurYearAutarky: { name: "Aktuelles Jahr Autarkie", unit: "%" },
      CurYearSelfCons: { name: "Aktuelles Jahr Eigenverbrauch", unit: "kWh" },
      CurYearEffectivePrice: {
        name: "Aktuelles Jahr effektiver Preis je kWh",
        unit: "Euro/kWh",
      },

      // Gesamtwerte
      TotalDemand: { name: "Gesamt bezogen", unit: "kWh" },
      TotalFeedIn: { name: "Gesamt eingespeist", unit: "kWh" },
      TotalGen: { name: "Gesamt erzeugt", unit: "kWh" },
      TotalCharged: { name: "Gesamt geladen", unit: "kWh" },
      TotalDischarged: { name: "Gesamt entladen", unit: "kWh" },
      TotalCons: { name: "Gesamt verbraucht", unit: "kWh" },
      TotalCost: { name: "Gesamtkosten Bezug", unit: "Euro" },
      TotalEarn: { name: "Gesamterlös Verkauf", unit: "Euro" },
      TotalAutarky: { name: "Gesamt Autarkie", unit: "%" },
      TotalSelfCons: { name: "Gesamt Eigenverbrauch", unit: "kWh" },
      TotalEffectivePrice: {
        name: "Gesamt effektiver Preis je kWh",
        unit: "Euro/kWh",
      },
    };

    for (const [key, config] of Object.entries(states)) {
      await this.setObjectNotExistsAsync(`${this.DpPath}.${key}`, {
        type: "state",
        common: {
          name: config.name,
          type: config.type || "number",
          role: "value",
          unit: config.unit || "",
          states: config.states || undefined,
          read: true,
          write: true,
        },
        native: {},
      });
    }
  }

  async createDbTable() {
    const qry = `
    CREATE TABLE IF NOT EXISTS ${this.dbName}.${this.dbTable} (
      Timestamp timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      TodayGen float NOT NULL DEFAULT 0,
      TodayDemand float NOT NULL DEFAULT 0,
      TodayFeedIn float NOT NULL DEFAULT 0,
      TodayCharged float NOT NULL DEFAULT 0,
      TodayDischarged float NOT NULL DEFAULT 0,
      PriceBuy FLOAT NOT NULL DEFAULT 0,
      PriceLeasePayment FLOAT NOT NULL DEFAULT 0,
      PRIMARY KEY (Timestamp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `;

    this.sendTo("sql.0", "query", qry, (result) => {
      if (result.error) {
        this.log.error(result.error);
      } else if (this.DEBUG_SQL) {
        this.log.info(`Rows: ${JSON.stringify(result.result)}`);
      }
    });
  }

  async updateCurrentYear() {
    const qry = `
      SELECT 
        SUM(TodayGen) AS CurYearGen,
        SUM(TodayDemand) AS CurYearDemand,
        SUM(TodayFeedIn) AS CurYearFeedIn,
        SUM(TodayCharged) AS CurYearCharged,
        SUM(TodayDischarged) AS CurYearDischarged,
        SUM(PriceLeasePayment) AS PriceLeasePayment,
        SUM(TodayDemand * PriceBuy) AS CurYearCost
      FROM ${this.dbName}.${this.dbTable}
      WHERE Timestamp >= CONCAT(YEAR(NOW()), '-01-01')
        AND Timestamp <= CONCAT(YEAR(NOW()), '-12-31');
    `;

    this.sendTo("sql.0", "query", async (result) => {
      if (result.error) {
        this.log.error(result.error);
        return;
      }

      const r = result.result[0];
      const CurYearSelfCons =
        r.CurYearGen - r.CurYearFeedIn - r.CurYearCharged + r.CurYearDischarged;
      const CurYearCons = CurYearSelfCons + r.CurYearDemand;
      const CurYearAutarky = (CurYearSelfCons / CurYearCons) * 100;
      const CurYearEffectivePrice = parseFloat(
        (
          (r.CurYearCost + r.PriceLeasePayment - r.CurYearFeedIn * this.pSell) /
          CurYearCons
        ).toFixed(4)
      );

      const values = {
        CurYearGen: r.CurYearGen,
        CurYearDemand: r.CurYearDemand,
        CurYearFeedIn: r.CurYearFeedIn,
        CurYearCharged: r.CurYearCharged,
        CurYearDischarged: r.CurYearDischarged,
        CurYearSelfCons,
        CurYearCons,
        CurYearAutarky,
        CurYearCost: r.CurYearCost,
        CurYearEarn: r.CurYearFeedIn * this.pSell,
        CurYearEffectivePrice,
      };

      for (const [key, val] of Object.entries(values)) {
        await this.setStateAsync(`${this.DpPath}.${key}`, val);
      }
    });
  }

  async updateTotals() {
    const qry = `
      SELECT 
        SUM(TodayGen) AS TotalGen,
        SUM(TodayDemand) AS TotalDemand,
        SUM(TodayFeedIn) AS TotalFeedIn,
        SUM(TodayCharged) AS TotalCharged,
        SUM(TodayDischarged) AS TotalDischarged,
        SUM(PriceLeasePayment) AS PriceLeasePayment,
        SUM(TodayDemand * PriceBuy) AS TotalCost
      FROM ${this.dbName}.${this.dbTable}
      WHERE Timestamp >= "2021-09-24 23:59:00";
    `;

    this.sendTo("sql.0", "query", async (result) => {
      if (result.error) {
        this.log.error(result.error);
        return;
      }

      const r = result.result[0];
      const TotalSelfCons =
        r.TotalGen - r.TotalFeedIn - r.TotalCharged + r.TotalDischarged;
      const TotalCons = TotalSelfCons + r.TotalDemand;
      const TotalAutarky = (TotalSelfCons / TotalCons) * 100;
      const TotalEffectivePrice = parseFloat(
        (
          (r.TotalCost + r.PriceLeasePayment - r.TotalFeedIn * this.pSell) /
          TotalCons
        ).toFixed(4)
      );

      const values = {
        TotalGen: r.TotalGen,
        TotalDemand: r.TotalDemand,
        TotalFeedIn: r.TotalFeedIn,
        TotalCharged: r.TotalCharged,
        TotalDischarged: r.TotalDischarged,
        TotalSelfCons,
        TotalCons,
        TotalAutarky,
        TotalCost: r.TotalCost,
        TotalEarn: r.TotalFeedIn * this.pSell,
        TotalEffectivePrice,
      };

      for (const [key, val] of Object.entries(values)) {
        await this.setStateAsync(`${this.DpPath}.${key}`, val);
      }
    });
  }
}

if (require.main !== module) {
  module.exports = (options) => new QHomeAdapter(options);
} else {
  new QHomeAdapter();
}
