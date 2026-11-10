![Logo](admin/qhome-ess-hyb-g2.png)
# ioBroker.qhome-ess-hyb-g2

[![Test and Release](https://github.com/Exc3pt10n/ioBroker.qhome-ess-hyb-g2/actions/workflows/test-and-release.yml/badge.svg?branch=main)](https://github.com/Exc3pt10n/ioBroker.qhome-ess-hyb-g2/actions/workflows/test-and-release.yml)
[![License: MIT](https://img.shields.io/github/license/Exc3pt10n/ioBroker.qhome-ess-hyb-g2)](LICENSE)

## qhome-ess-hyb-g2 adapter for ioBroker

Liest die Echtzeitwerte eines QCells **Q.HOME+ ESS HYB-G2** über dessen lokale
Web-Schnittstelle (`/R3EMSAPP_REAL.ems?file=ESSRealtimeStatus.json`) aus und stellt
sie als Datenpunkte unter `qhome-ess-hyb-g2.<instanz>.*` bereit.

### Installation

Der Adapter ist nicht auf npm veröffentlicht und wird direkt aus GitHub installiert.

**Admin-Oberfläche:** Reiter *Adapter* → GitHub-Symbol („Installieren aus eigener URL";
ggf. Expertenmodus aktivieren) → Reiter *Beliebig* → folgende URL eintragen und
installieren, danach eine Instanz anlegen:

```
https://github.com/Exc3pt10n/ioBroker.qhome-ess-hyb-g2/tarball/main
```

**Konsole** auf dem ioBroker-Host:

```bash
iobroker url https://github.com/Exc3pt10n/ioBroker.qhome-ess-hyb-g2/tarball/main
iobroker add qhome-ess-hyb-g2
```

Updates werden auf dieselbe Weise installiert, Instanz und Einstellungen bleiben erhalten.

Voraussetzungen: js-controller ≥ 5.0.19, Admin ≥ 6.13.16.

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

### Energiezähler

Unter `counters.*` zählt der Adapter die Energie für **Tag, Monat, Quartal, Halbjahr,
Jahr und Gesamt**. Grundlage sind die abgerufenen Leistungswerte, integriert über die
tatsächlich vergangene Zeit. Lücken von mehr als 60 Sekunden, zum Beispiel weil das
ESS nicht erreichbar war, werden nicht hochgerechnet.

| Zeitraum | Kanal | Vorzeitraum |
|---|---|---|
| Tag | `counters.day` | `counters.day.previous` (gestern) |
| Monat | `counters.month` | `counters.month.previous` (Vormonat) |
| Quartal | `counters.quarter` | `counters.quarter.previous` (Vorquartal) |
| Halbjahr | `counters.halfyear` | `counters.halfyear.previous` (Vorhalbjahr) |
| Jahr | `counters.year` | `counters.year.previous` (Vorjahr) |
| Gesamt | `counters.total` | – (wird nie zurückgesetzt) |

Jeder Kanal enthält:

| ID | Beschreibung | Einheit |
|---|---|---|
| `PvGen` | PV-Erzeugung | kWh |
| `GridPurchase` | Netzbezug | kWh |
| `GridFeedIn` | Netzeinspeisung | kWh |
| `BtCharged` | Batterie geladen | kWh |
| `BtDischarged` | Batterie entladen | kWh |
| `Cons` | Verbrauch | kWh |
| `SelfSupply` | Eigenversorgung (Verbrauch − Netzbezug) | kWh |
| `Autarky` | Autarkie (Eigenversorgung / Verbrauch) | % |
| `SelfConsRate` | Eigenverbrauchsquote ((PV − Einspeisung) / PV) | % |
| `periodKey` | aktueller Zeitraum, z. B. `2026-11-10`, `2026-Q4`, `2026-H2` | |

Der Zeitraumwechsel wird bei jedem Abruf erkannt, nicht über einen Zeitplan. Der
bisherige Stand wandert dann nach `previous` und der Zähler beginnt bei 0. Das
funktioniert auch, wenn der Adapter zum Wechselzeitpunkt nicht lief. War der Adapter
länger als einen ganzen Zeitraum aus, wird `previous` auf 0 gesetzt, statt einen
älteren Zeitraum als Vorzeitraum anzuzeigen. Die Zählerstände werden alle 10 Sekunden
und beim Beenden gespeichert und nach einem Neustart wieder eingelesen.

#### Verlauf aufzeichnen (z. B. SQL)

Für einen Langzeitverlauf aktiviert man für die `previous`-Datenpunkte einen
History-Adapter (SQL, InfluxDB, History). Beim Zeitraumwechsel schreibt der Adapter
jeden Vorzeitraum-Wert **genau einmal**, auch wenn er gleich dem vorherigen ist. Als
Zeitstempel verwendet er das **Ende des abgelaufenen Zeitraums**, zum Beispiel
gestern 23:59:59.999. Dadurch erscheint der Wert im Diagramm beim richtigen Tag,
Monat oder Jahr.

Einstellungen je Datenpunkt (Zahnrad in der Objektansicht):

| Einstellung | Wert |
|---|---|
| Aktiviert | ✔ |
| Nur Änderungen aufzeichnen | **aus**, sonst fehlen Tage mit gleichem Wert |
| Entprellzeit | 0 |
| Gleiche Werte trotzdem aufzeichnen | 0 (aus) |
| Speicherdauer | unbegrenzt |

### Entwicklung

```bash
npm ci
npm run lint
npm test                 # Unit-Tests + Paketprüfung
npm run test:integration # Startet den Adapter in einer Test-ioBroker-Instanz
```

Einen lokalen Entwicklungsstand testen: `npm pack`, das `.tgz` auf den ioBroker-Host
kopieren und dort `cd /opt/iobroker && npm i /pfad/zur/datei.tgz` ausführen, danach
`iobroker upload qhome-ess-hyb-g2`.

### Release erstellen

1. Bei jeder Änderung, die man im Betrieb bemerkt, unter `### **WORK IN PROGRESS**` im
   Changelog eine Zeile `* (Autor) Beschreibung` ergänzen.
2. Auf `main` mit sauberem Arbeitsverzeichnis ausführen:
   ```bash
   npm run release patch   # nur Fehlerbehebungen, z. B. 0.1.0 → 0.1.1
   npm run release minor   # neue Funktionen, z. B. 0.1.1 → 0.2.0
   ```
   Das Skript erhöht die Version in `package.json` und `io-package.json`, macht aus dem
   Platzhalter einen Versionseintrag mit Datum, übersetzt die News für `io-package.json`,
   committet, setzt den Tag `vX.Y.Z` und pusht beides. Mit `--dry` lässt es sich
   vorher gefahrlos ausprobieren.

Eine bestimmte Version installieren:
`https://github.com/Exc3pt10n/ioBroker.qhome-ess-hyb-g2/tarball/v0.1.0`

## Changelog
### **WORK IN PROGRESS**

### 0.1.0 (2026-11-10)
* (Sebastian) Energiezähler für Tag, Monat, Quartal, Halbjahr, Jahr und Gesamt inkl. Vorzeitraum, Autarkie und Eigenverbrauchsquote; Vorzeitraum-Werte werden für History-Adapter mit Zeitstempel am Periodenende geschrieben
* (Sebastian) Adapter lauffähig gemacht: Funktionsumfang des bisherigen JavaScript-Skripts (Echtzeitwerte), jsonConfig-Oberfläche

### 0.0.1
* (Sebastian) initial release

## License
MIT License

Copyright (c) 2025-2026 Sebastian <kontakt@jansesoft.de>

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