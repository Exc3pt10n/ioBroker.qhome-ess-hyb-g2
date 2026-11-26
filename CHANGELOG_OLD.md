# Older changes

These versions were only distributed via GitHub, not via npm.

### 0.4.0 (2026-11-14)

- (Exc3pt10n) **Breaking:** Node.js 22 or newer is required
- (Exc3pt10n) The package only contains the files needed at runtime; unused template leftovers (example VIS widgets, gulp translation script) removed

### 0.3.1 (2026-11-14)

- (Exc3pt10n) Security update: axios updated to 1.21.1 (fixes several known vulnerabilities in axios, form-data and follow-redirects)

### 0.3.0 (2026-11-11)

- (Exc3pt10n) Additional PV inverters (e.g. a second inverter via another adapter): new states `PvPwExt` and `PvPwTotal`, PV counters include these inverters; consumption is then calculated from the energy balance, as the Q.HOME meters at the grid connection point

### 0.2.0 (2026-11-11)

- (Exc3pt10n) **Breaking:** state `PvPwTotal` removed (always identical to `PvPw`); it is deleted automatically on startup
- (Exc3pt10n) Battery status 2 is called "ready" instead of "charged" (the battery is idle, not necessarily full)
- (Exc3pt10n) Weekly counter (Monday to Sunday, ISO 8601 calendar week) incl. previous week

### 0.1.0 (2026-11-10)

- (Exc3pt10n) Energy counters for day, month, quarter, half-year, year and total incl. previous period, autarky and self-consumption rate; previous-period values are written for history adapters with the end of the period as timestamp
- (Exc3pt10n) Adapter operational: real-time values of the ESS (functionality of the former JavaScript script), jsonConfig settings page

### 0.0.1

- (Exc3pt10n) initial release
