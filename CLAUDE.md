# Hinweise für Claude

## Versionierung (bei jeder Änderung)

Jede Änderung, die man im Betrieb des Adapters bemerkt (Funktion, Fehlerbehebung,
geänderte oder entfernte Datenpunkte, Einstellungen), bekommt **im selben PR**:

1. einen Changelog-Eintrag unter `### **WORK IN PROGRESS**` in `README.md`
   (`* (Sebastian) Beschreibung`, Breaking Changes mit `**Breaking:**` markieren), und
2. einen Versionssprung nach Semantic Versioning (solange 0.x):
   - `patch`: nur Fehlerbehebungen
   - `minor`: neue Funktionen oder Breaking Changes

Reine CI-, Test-, Refactoring- oder Doku-Änderungen bekommen keinen Versionssprung.

Versionssprung auf einem Feature-Branch:

```bash
npx release-script <patch|minor> --yes --noPush --branchPattern 'claude/*'
git tag -d vX.Y.Z   # Tag nicht pushen, er wird nach dem Merge auf main gesetzt
```

Das Skript fügt danach einen leeren Platzhalter `### **WORK IN PROGRESS**` in
`README.md` ein; diesen als eigenen Commit mitnehmen.

Das Skript braucht ein sauberes Arbeitsverzeichnis. Ist der Übersetzungsdienst nicht
erreichbar, die News vorher selbst übersetzt unter `common.news.NEXT` in
`io-package.json` eintragen (alle Sprachen wie bei den vorhandenen Einträgen); das
Skript ersetzt `NEXT` durch die neue Version.

Den Tag `vX.Y.Z` setzt der Workflow `.github/workflows/tag-release.yml` nach dem
Merge auf `main` automatisch.

## Prüfen vor dem Push

```bash
npm run lint
npm test
npm run test:integration
```
