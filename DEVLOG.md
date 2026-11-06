# Development log

Newest entries first.

## 2026-11-06 — Validate saved data on startup

**What:** the data read from the phone at startup now goes through a new `normalizeState()` in `src/logic.js`, which
shares its checks with `parseBackup()`. Packs with a missing, invalid or repeated start date are dropped (the rest of the
diary is kept) and a message asks the user to check the history; bad `time`, `rx`, `lastNo` and `lang` values fall back
to their defaults. Date checks are now stricter for both paths: a date must be a real calendar day (`2026-02-30` was
accepted before) and the time must be a valid `HH:MM`. An imported backup with two packs on the same start date is
rejected with its own message instead of being accepted.

**Why:** `load()` accepted any `blisters` array as-is. A single damaged entry (e.g. `null` or a pack without a start
date) made the first render throw, so the app opened to a blank screen with no way to recover from inside it.
Reproduced in the browser build with stored data containing `null`: before, page error "Cannot read properties of null
(reading 'start')" and an empty screen; after, the diary renders and the warning is shown. No calculation in
`compute`, `buildMap` or the reminders changed.

**Files:** `src/logic.js` (`normalize`, `normalizeState`, `parseBackup` refactor), `src/app.js` (`load()`),
`src/i18n.js` (`err.repaired`, `backupErr.dup` in Italian and English), `scripts/test-logic.mjs` (new tests, failing
before the change).

**Checks:**
- `npm ci`: ok
- `npm test`: ok (new tests failed before the change)
- `npm run build`: ok
- Browser check with Playwright on `www/index.html` with damaged stored data: no page errors, warning shown.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

## 2026-11-05 — Tap a calendar day to see its details

**What:** calendar days are now buttons. Tapping one selects it (ring around the number) and shows a line under the
grid with the full date and what that day is: active pill number, placebo number, expected or skipped period, pack
start, today. By default the selected day is today when the current month is shown; other months show a short hint
until a day is tapped. Changing month clears the selection.

**Why:** that information already existed, but only as `aria-label` for screen readers. Sighted users had to decode
colours and dots against the legend, and couldn't tell e.g. which placebo a day was or whether a period was confirmed.

**Files:** `src/app.js` (calendar cells as buttons with `aria-pressed`, `ui.calDay`, detail line with `aria-live`),
`src/i18n.js` (`cal.noInfo`, `cal.hint` in Italian and English), `src/styles.css` (button reset for `.d`, selection
and focus ring, `.cal-detail`), `README.md`, `README.it.md`.

**Checks:**
- `npm ci`: ok
- `npm test`: ok (key parity covers the two new strings)
- `npm run build`: ok
- Browser check with Playwright on `www/index.html` (light and dark, month navigation): no page errors, detail text as expected.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (JDK 21 is).
