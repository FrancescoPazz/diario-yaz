# Development log

Newest entries first.

## 2026-11-10 — Swipe between months in the calendar

**What:** a horizontal swipe on the calendar grid now changes month: swipe left for the next month, right for the
previous one. A gesture counts as a swipe when it moves at least 48 px sideways, mostly horizontally (|dx| > 1.5 |dy|)
and within 800 ms, so vertical scrolling and taps on a day behave as before. The grid slides in from the side of the
new month (250 ms, also when using the arrows); the animation is off when the system asks for reduced motion. The
calendar card clips horizontally so the slide never widens the page.

**Why:** first item of the roadmap. On a phone the arrows sit in the top corner; a swipe is the expected shortcut. No
calculation changed and the arrows still work as before (and remain the accessible way to change month).

**Files:** `src/app.js` (`goMonth`, `calSlide`, passive touch listeners), `src/styles.css` (`touch-action: pan-y` on the
grid, `.cal-card` clip, `slide-next` / `slide-prev` animations inside the reduced-motion media query), `README.md`,
`README.it.md`, `DEVLOG.md`, `ROADMAP.md`.

**Checks:**
- `npm ci`: ok
- `npm test`: ok
- `npm run build`: ok
- `npm run sync`: ok
- Browser check with Playwright on `www/index.html`, Pixel 7 emulation with real touch events (light and dark): swipe
  left → next month, swipe right → previous month, a mostly vertical drag doesn't change month, arrows still work and
  animate, tapping a day still selects it, no horizontal page overflow, no page or console errors.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

## 2026-11-09 — More tests for the pack, calendar and reminder calculations

**What:** new tests in `scripts/test-logic.mjs`, no app code changes.
- `buildMap`: "gap" days of a late pack (counted from the day after day 28, not projected), the expected start moving
  to tomorrow after "No", a pack started late keeping its real start, a pack recorded early cutting the previous one
  short, and day 24 marked as the end of a pack whose placebo was skipped.
- `planNotifications`: every reminder falls between today and the horizon (also when day 28 is already past), and after
  "No" the new-pack question moves from today to tomorrow while still pointing at the original expected day.
- `applyAnswer`: a new pack on day 25 records the placebo as skipped; answers for another pack, before day 25, unknown
  or with no packs are ignored; "No" only stores the day; the input state is not modified.

**Why:** first item of the roadmap. These paths drive the calendar colours and the scheduled reminders but were only
covered indirectly. Each new block was checked by temporarily breaking the matching line in `src/logic.js` (gap count
off by one, no lower bound on reminders, day-25 check, gap end after "No"): all four mutations make `npm test` fail.
`src/logic.js` itself is unchanged; no bug was found.

**Files:** `scripts/test-logic.mjs`, `DEVLOG.md`, `ROADMAP.md`.

**Checks:**
- `npm ci`: ok
- `npm test`: ok
- `npm run build`: ok
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

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
