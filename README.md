![Logo](admin/qhome-ess-hyb-g2.png)
# ioBroker.qhome-ess-hyb-g2

[![NPM version](http://img.shields.io/npm/v/iobroker.qhome-ess-hyb-g2.svg)](https://www.npmjs.com/package/iobroker.qhome-ess-hyb-g2)
[![Downloads](https://img.shields.io/npm/dm/iobroker.qhome-ess-hyb-g2.svg)](https://www.npmjs.com/package/iobroker.qhome-ess-hyb-g2)
![Number of Installations (latest)](http://iobroker.live/badges/qhome-ess-hyb-g2-installed.svg)
![Number of Installations (stable)](http://iobroker.live/badges/qhome-ess-hyb-g2-stable.svg)
[![Dependency Status](https://img.shields.io/david/Exc3pt10n/iobroker.qhome-ess-hyb-g2.svg)](https://david-dm.org/Exc3pt10n/iobroker.qhome-ess-hyb-g2)
[![Known Vulnerabilities](https://snyk.io/test/github/Exc3pt10n/ioBroker.qhome-ess-hyb-g2/badge.svg)](https://snyk.io/test/github/Exc3pt10n/ioBroker.qhome-ess-hyb-g2)

[![NPM](https://nodei.co/npm/iobroker.qhome-ess-hyb-g2.png?downloads=true)](https://nodei.co/npm/iobroker.qhome-ess-hyb-g2/)

## qhome-ess-hyb-g2 adapter for ioBroker

Liest die Echtzeitwerte eines QCells **Q.HOME+ ESS HYB-G2** über dessen lokale
Web-Schnittstelle (`/R3EMSAPP_REAL.ems?file=ESSRealtimeStatus.json`) aus und stellt
sie als Datenpunkte unter `qhome-ess-hyb-g2.<instanz>.*` bereit.

### Konfiguration

| Einstellung | Beschreibung | Standard |
|---|---|---|
| ESS Hostname / IP-Adresse | Hostname oder IP des Speichers | `qhome.local` |
| Speicherkapazität (kWh) | Nutzbare Kapazität der Batterie | `4` |
| Abfrageintervall (Sekunden) | Abstand zwischen zwei Abrufen | `1` |

### Datenpunkte

| ID | Beschreibung | Einheit |
|---|---|---|
| `ColecTm` | Abfragezeitpunkt | |
| `PvPw` / `PvPwTotal` | Photovoltaikleistung | kW |
| `ConsPw` | Bedarf Leistung | kW |
| `GridPw` | Netzleistung | kW |
| `GridStusCd` | Netzstatus (0 = Bezug, 1 = Einspeisung) | |
| `GridPwPurchase` / `GridPwPurchaseWb` | Netzbezug | kW / W |
| `GridPwFeedIn` / `GridPwFeedInWb` | Netzeinspeisung | kW / W |
| `BtSoc` | Batterie Ladezustand | % |
| `BtCap` | Batterie Kapazität (aktuell gespeicherte Energie) | kWh |
| `BtPw` | Batterieleistung | kW |
| `BtStusCd` | Batteriestatus (0 = Entladen, 1 = Laden, 2 = Geladen) | |
| `BtPwCharge` / `BtPwDisCharge` | Lade-/Entladeleistung Batterie | W |
| `BtChargeIndicator` / `BtDisChargeIndicator` | 1, wenn geladen / entladen wird | |
| `BtLast` | Restlaufzeit bis voll / leer | Min |
| `PcsPw` / `AbsPcsPw` | Wechselrichterleistung | W / kW |
| `PowerOutletPw`, `OperStusCd`, `EmsOpMode`, `RankPer`, `ErrorCnt` | Rohwerte des ESS | |
| `info.connection` | Verbindung zum ESS | |

### Entwicklung

```bash
npm ci
npm run lint
npm test                 # Unit-Tests + Paketprüfung
npm run test:integration # Startet den Adapter in einer Test-ioBroker-Instanz
```

Lokal installieren: `npm pack`, das `.tgz` auf den ioBroker-Host kopieren und dort
`cd /opt/iobroker && npm i /pfad/zur/datei.tgz` ausführen, danach
`iobroker upload qhome-ess-hyb-g2`.

## Changelog

### **WORK IN PROGRESS**
* (Sebastian) Adapter lauffähig gemacht: Funktionsumfang des bisherigen JavaScript-Skripts (Echtzeitwerte), jsonConfig-Oberfläche

### 0.0.1
* (Sebastian) initial release

## License
MIT License

Copyright (c) 2025 Sebastian <kontakt@jansesoft.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.