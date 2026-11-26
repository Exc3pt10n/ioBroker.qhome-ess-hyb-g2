# Development

## Setup and checks

```bash
npm ci
npm run lint
npm test                 # unit tests (test/unit) and package file checks
npm run test:integration # starts the adapter in a test ioBroker instance (stable js-controller)
```

Unit tests live in `test/unit/`, not next to the sources in `lib/`: everything in `lib/` is shipped, and the
`release-guard` treats every change there as a change to the package that needs a new version.

## Project structure

| Path | Content |
|---|---|
| `main.js` | Adapter: configuration, polling loop, state creation, counter persistence |
| `lib/ess.js` | State definitions and conversion of the ESS response (`computeValues`) |
| `lib/counters.js` | Energy counters per period (integration, period change, previous period) |
| `lib/external.js` | Additional PV inverters (subscribed foreign states, staleness check) |
| `admin/` | Settings page (jsonConfig) and translations (`admin/i18n/<lang>/translations.json`) |

## Translations

Texts in code and log messages are English. Object names are `{ en, de }` objects; the settings page uses
`"i18n": true` with one `translations.json` per language (en, de, ru, pt, nl, fr, it, es, pl, uk, zh-cn).

## Releases

Releases are created by the central workflow
[`Exc3pt10n/ioBroker-workflows`](https://github.com/Exc3pt10n/ioBroker-workflows) (`.github/workflows/test-and-release.yml`):

1. A pull request that changes shipped files raises the version **once**: `version` in `package.json` /
   `package-lock.json`, `common.version` and a new entry at the top of `common.news` (all 11 languages, at most 7
   entries) in `io-package.json`, and a changelog section `### X.Y.Z (YYYY-MM-DD)` in the README. The
   `release-guard` check verifies this in the pull request.
2. After the merge to `main`, the release job sets the tag `vX.Y.Z` and creates a GitHub release with the packed
   `.tgz`; the `deploy` job then publishes exactly this package to npm (Trusted Publishing).

Before a pull request, check for findings of the ioBroker repository checker:

```bash
npx @iobroker/repochecker https://github.com/Exc3pt10n/ioBroker.qhome-ess-hyb-g2 <branch>
```

Testers without npm can install the `.tgz` of a GitHub release:

```bash
iobroker url https://github.com/Exc3pt10n/ioBroker.qhome-ess-hyb-g2/releases/download/vX.Y.Z/iobroker.qhome-ess-hyb-g2-X.Y.Z.tgz qhome-ess-hyb-g2
```
