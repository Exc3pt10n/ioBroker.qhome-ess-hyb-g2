# Hinweise für Claude

## Versionierung

Jede Änderung, die gemergt werden soll, zieht die Adapter-Version **einmal pro Pull Request** hoch
(Semantic Versioning, solange < 1.0): neue Funktion oder Breaking Change → Minor, Fehlerbehebung → Patch.
Reine Änderungen an Entwicklungswerkzeugen ohne Auswirkung auf Nutzer (CI-Workflows, Tests,
Lint-Konfiguration, `CLAUDE.md`, `DEVELOPMENT.md`) brauchen keine neue Version.

Anzupassen sind jeweils `package.json`/`package-lock.json` (`version`, im Lockfile oben und unter
`packages[""]`), `io-package.json` (`common.version` und neuer Eintrag oben in `common.news`) und der
Changelog im `README.md`.

Der Changelog-Abschnitt im README heißt `### X.Y.Z (JJJJ-MM-TT)`, Einträge im Format `- (Exc3pt10n) …` auf
Englisch; daraus entstehen die Release-Notes. Breaking Changes mit `**Breaking:**` markieren. Im README bleiben
die letzten Versionen, ältere wandern nach `CHANGELOG_OLD.md`. Der `common.news`-Eintrag der neuen Version braucht
alle 11 Sprachen (en, de, ru, pt, nl, fr, it, es, pl, uk, zh-cn); **höchstens 7 Einträge** und nur Versionen, die es
auf npm gibt bzw. geben wird. Das prüft der `release-guard` im Pull Request.

## Sprache und Übersetzungen

- README, `CHANGELOG_OLD.md` und `DEVELOPMENT.md` sind **englisch**; die deutsche Beschreibung steht in
  `docs/de/README.md` (ohne Installation aus GitHub, ohne Entwickler-Befehle).
- Log-Meldungen und Fehlertexte sind **englisch** (ohne Übersetzung).
- `common.name` der Objekte: `{ en, de }`; Statustexte (`common.states`) englisch. Der Unit-Test
  „Objektnamen" in `test/unit/ess.test.js` prüft das.
- Einstellungsseite: `admin/jsonConfig.json` mit `"i18n": true`, Texte englisch, Übersetzungen in
  `admin/i18n/<lang>/translations.json` für alle 11 Sprachen.
- Kommentare im Code dürfen deutsch bleiben.

## Verteilung über npm

Der Adapter wird über npm verteilt (Parameter `npm-package: true` im zentralen Workflow); ins
ioBroker-Repository kommt er erst, wenn Sebastian das entscheidet.

- Es gibt **kein** `prepare`-Skript, `common.nogit` ist gesetzt.
- `@iobroker/testing` bleibt auf dem aktuellen Stand (6.x; bringt chai/mocha/sinon mit), `admin` als globale
  Abhängigkeit mindestens 7.6.20, `js-controller` mindestens 6.0.11.
- Autor überall `Exc3pt10n <kontakt@jansesoft.de>` (package.json, io-package.json, README, LICENSE).
- Ausgeliefert wird nur, was in `files` steht (`admin/`, `lib/`, `main.js`, `io-package.json`, `LICENSE`).
  Unit-Tests liegen deshalb in `test/unit/`, nicht in `lib/`.
- Für Tester ohne npm-Version: das `.tgz` am jeweiligen GitHub-Release (siehe `DEVELOPMENT.md`). Eine Installation
  aus `tarball/main` bzw. dem früheren Branch `release` ist nicht mehr vorgesehen.

Vor einem Pull Request auf Funde des ioBroker-Repocheckers achten:

```bash
npx @iobroker/repochecker https://github.com/Exc3pt10n/ioBroker.qhome-ess-hyb-g2 <branch>
```

## Release

Tags, GitHub-Releases und npm-Versionen entstehen **nur** über den Workflow, nie von Hand:

- Nach dem Merge auf `main`: Sind alle Prüfungen grün und fehlt der Tag `vX.Y.Z` zur Version in `package.json`,
  setzt der Release-Job den annotierten Tag und legt ein GitHub-Release mit Notes aus dem README und dem gepackten
  `.tgz` an. Danach veröffentlicht der Job `deploy` genau dieses Paket auf npm (Trusted Publishing, Provenance).
- Auf Feature-Branches keine Tags pushen; ein versehentlich lokal erstellter Tag wird mit `git tag -d vX.Y.Z`
  wieder gelöscht.
- Einmalig von Hand (Sebastian): das erste `.tgz` selbst veröffentlichen
  (`npm publish iobroker.qhome-ess-hyb-g2-X.Y.Z.tgz --access public`), danach auf npmjs beim Paket unter
  Settings → Trusted publishing GitHub Actions mit Owner `Exc3pt10n`, diesem Repository und dem Workflow
  `test-and-release.yml` eintragen. `deploy` überspringt Versionen, die es auf npm schon gibt.

## Automatische Tests (GitHub Actions)

`.github/workflows/test-and-release.yml` (Dateiname nicht ändern, Trusted Publishing hängt daran) hat den Aufbau
des ioBroker-Standards:

- `check-and-lint`: `ioBroker/testing-action-check@v2` (Lint, Paket-Tests)
- `adapter`: zentraler Workflow `Exc3pt10n/ioBroker-workflows/.github/workflows/adapter.yml@v1` – Tests auf Node 22
  und 24, Integrationstest (echte js-controller-Instanz, stabile Version), Installationstest des gepackten Pakets,
  `npm audit --omit=dev --audit-level=high`, `release-guard` und nach dem Merge das Release
- `adapter-tests`: `ioBroker/testing-action-adapter@v1`, Node 22/24/26 auf Linux, Windows und macOS
- `deploy`: nach einem Release Veröffentlichung auf npm

Ändert ein PR ausgelieferte Dateien (alles aus `files`, dazu Laufzeit-Felder in `package.json` wie `dependencies`
oder `engines` und Laufzeit-Pakete im Lockfile), braucht er einen Versionssprung.

**Pflicht-Checks** für den Branch-Schutz von `main`: `adapter / ci-result` und `check-and-lint`.

Fehler im zentralen Workflow selbst gehören in das Repo `Exc3pt10n/ioBroker-workflows`.

Wird die Node-Mindestversion geändert: `engines` in `package.json`/`package-lock.json` und README
(Voraussetzungen) gemeinsam anpassen.

## Prüfen vor dem Push

```bash
npm run lint
npm test
npm run test:integration
```
