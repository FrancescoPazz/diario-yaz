# Development log

Newest entries first.

## 2026-11-08 — Edit a recorded pack in History

**What:** each pack in History now has an edit button next to the delete one. It opens the same sheet used to add a
pack, titled "Edit the pack", with the start date and placebo outcome (taken / skipped / not yet) already filled in.
Saving replaces that pack, with the same checks as adding (date required, not in the future, not the start date of
another pack), then the expected dates and reminders are recalculated and a snackbar confirms the change.

**Why:** first item of the roadmap. Fixing a wrong date or outcome meant deleting the pack and adding it again, which is
easy to get wrong and briefly changes the forecast. No calculation in `src/logic.js` changed; the edit only rewrites the
saved pack and the existing `persist()` sorts and reschedules as before.

**Files:** `src/app.js` (`edit` action, `ui.editStart`, edit mode for the add sheet, row actions), `src/i18n.js`
(`editAria`, `editTitle`, `edited` in Italian and English), `src/styles.css` (`.li-acts`), `README.md`, `README.it.md`,
`ROADMAP.md`.

**Checks:**
- `npm ci`: ok
- `npm test`: ok (key parity covers the three new strings)
- `npm run build`: ok
- `npm run sync`: ok
- Browser check with Playwright on `www/index.html` (light and dark): sheet prefilled with the pack's date and outcome,
  duplicate date rejected inside the sheet, edited pack saved and re-sorted, snackbar shown, "Add" still opens an empty
  sheet afterwards, no page or console errors.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

## 2026-11-07 — Update Capacitor and dev dependencies

**What:** dependency update, no app code changes.
- `@capacitor/core`, `@capacitor/android`, `@capacitor/cli`: 8.5.3 → 8.6.0
- `@capacitor/assets` (dev, used by `npm run icons`): 3.0.5 → 4.0.0
- `@material-symbols/svg-400` (dev): 0.48.0 → 0.48.3
- `npm audit fix` for transitive dev packages (`glob`, `minimatch`, `rimraf`)

The other plugins (`app`, `local-notifications`, `preferences`) and `esbuild` were already on their latest 8.x / 0.28
releases. The Android library's `build.gradle` in 8.6.0 uses the same SDK levels (min 24, compile/target 36), AndroidX
versions and Java 21 as 8.5.3, so `android/variables.gradle` needs no change.

**Why:** stay current with the Capacitor 8 line and clear the `npm audit` findings: before, 10 vulnerabilities
(1 critical `tar` and 3 high `sharp`/libvips, all pulled in by `@capacitor/assets` 3.x); after, 4 moderate. The remaining
four are all `uuid` < 11.1.1 via `xcode` → `@trapezedev/project` → `@capacitor/assets`, an iOS project helper that is
dev-only, not shipped in the APK, and has no non-breaking fix yet. None of these packages are part of the app bundle.

**Files:** `package.json`, `package-lock.json`.

**Checks:**
- `npm ci` (clean `node_modules`): ok
- `npm test`: ok
- `npm run build`: ok
- `npx cap sync android`: ok, 3 plugins found
- `npm run icons` with `@capacitor/assets` 4.0.0: ok, 74 Android assets generated (output discarded, the committed
  icons are unchanged)
- Browser check with Playwright on `www/index.html`: no page or console errors, first-run screen renders.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

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
