# Development log

Newest entries first.

## 2026-11-24 — Translated nav label and focus in the Backup sheet's confirmations

**What:** the bottom navigation's accessible name was hard-coded as "Sezioni"; it now follows the app language
("Sezioni" / "Sections"). In the Backup sheet, the inline confirmations ("Delete the copy?", "Replace the current
data?") used to hide the focused button, leaving keyboard and TalkBack users nowhere. Now focus moves to "Cancel" when
the question appears (the question is read as its description through `aria-describedby`), goes back to "Delete" /
"Import" when cancelled, and after deleting the unreadable copy it moves to the "Restore" heading (or the sheet title
if that heading is not shown).

**Why:** first and third items of the roadmap (accessibility pass, focus after deleting the unreadable copy).

**Files:** `src/app.js` (`applyLang` sets the nav label, new `swapConfirm`, focus after `unreadableYes`, ids and
`tabindex="-1"` on the sheet headings), `src/i18n.js` (`sections` in Italian and English), `src/styles.css` (no focus
ring on programmatically focused headings), `DEVLOG.md`, `ROADMAP.md`. `src/logic.js` is untouched.

**Checks:**
- `npm ci`: ok
- `npm test`: ok
- `npm run build`: ok
- `npm run sync`: ok
- Browser check with Playwright on `www/index.html`, Pixel 7 emulation (Italian light, English dark), with an
  unreadable copy saved: nav label "Sezioni" / "Sections"; Delete → focus on Cancel described by the question;
  Cancel → focus back on Delete; confirming the delete → focus on "Restore"; Import → Cancel → Import the same way;
  no horizontal overflow, no page or console errors.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

## 2026-11-23 — Keep focus and announce the month when changing month

**What:** on the Calendar, the previous/next month buttons used to lose keyboard and TalkBack focus, because the
whole screen is rebuilt on every change; the new month was also never announced (the old live region is recreated
with the screen, so screen readers ignore it). Now a persistent, visually hidden live region (`#live`, `.sr-only`)
announces the new month ("dicembre 2026" / "December 2026") after any month change, swipe included, and focus goes
back to the button that was used. "Today" disappears once the current month is shown, so focus then moves to the
month title (`tabindex="-1"`, no focus ring). A swipe announces the month but leaves focus alone.

**Why:** first item of the roadmap (accessibility pass). Browsing months with TalkBack or a keyboard meant starting
again from the top of the page after every tap.

**Files:** `src/app.js` (`goMonth`, new `monthChanged`, month title focusable), `src/index.html` (`#live` region),
`src/styles.css` (`.sr-only`, title focus outline), `DEVLOG.md`, `ROADMAP.md`. No new strings: the month title is
already localized. `src/logic.js` is untouched.

**Checks:**
- `npm ci`: ok
- `npm test`: ok
- `npm run build`: ok
- `npm run sync`: ok
- Browser check with Playwright on `www/index.html`, Pixel 7 emulation (Italian light, English dark): after "next
  month" focus stays on the button and the live region reads "dicembre 2026" / "December 2026"; after "Today" focus is
  on the month title, the live region reads the current month and Tab moves on to "previous month"; no horizontal
  overflow, no page or console errors.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

## 2026-11-22 — Overlap hint on the Today screen

**What:** when some recorded packs overlap another one (starts less than 24 days apart, the same packs History flags),
the Today screen now shows a small card above the pack: "3 packs overlap each other: check the dates in History."
("3 blister si sovrappongono tra loro: controlla le date nello storico.") with an "Open History" ("Apri storico")
button that switches to the History tab. The count comes from a new pure helper, `overlapCount` in `src/checks.js`,
built on `overlappingPack`; `src/logic.js` is untouched. With no overlaps nothing is shown.

**Why:** fourth item of the roadmap. History already flags overlapping packs, but only if the user opens it; an old
typo keeps shifting forecasts and reminders silently until then.

**Files:** `src/checks.js` (`overlapCount`), `src/app.js` (`overlapView` on the Today screen), `src/i18n.js`
(`overlapHint`, `overlapOpen` in Italian and English), `scripts/test-logic.mjs` (count tests), `DEVLOG.md`, `ROADMAP.md`.

**Checks:**
- `npm ci`: ok (0 vulnerabilities)
- `npm test`: ok
- `npm run build`: ok
- `npm run sync`: ok
- Browser check with Playwright on `www/index.html`, Pixel 7 emulation (Italian light, English dark): with a typo pack
  on 25 Oct the card shows "3", the button opens History; with a clean history no card appears; no horizontal
  overflow, no page or console errors.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

## 2026-11-21 — Tests for the prescription reminder edge cases

**What:** new assertions in `scripts/test-logic.mjs` for `rxStarts`, `nextRx` and `shiftRx`: an rx date before the
first pack behaves like no rx (reminders on the 2nd, 4th… pack); an rx date on a pack's first day belongs to that pack
and the day before to the previous one; "Move" across a skipped placebo treats the 24-day pack as one pack and two moves
return to the original packs; a moved reminder stays on the same pack when the pack before it is started three days
late (the reminder follows the shifted forecast, 30 Dec instead of 27 Dec, and nothing lands on the late pack).
`rxStarts` is now imported by the tests. No app code changed; `src/logic.js` is untouched and all the cases already
behave correctly.

**Why:** second item of the roadmap. These paths decide when the "ask for the prescription" reminder fires and were only
covered by the simple case; a regression there would silently move or drop a reminder.

**Files:** `scripts/test-logic.mjs`, `DEVLOG.md`, `ROADMAP.md`.

**Checks:**
- `npm ci`: ok
- `npm test`: ok
- `npm run build`: ok
- `npm run sync`: ok
- Browser check: not needed, no UI change.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

## 2026-11-20 — Flag overlapping packs in History

**What:** each row of the History list now shows a small note when that pack starts less than 24 days from another
recorded pack: "Overlaps the pack started on Sun 25 Oct: check the date" ("Si sovrappone al blister del dom 25 ott:
controlla la data"), with a tertiary info icon. Both packs of an overlapping pair are flagged, each naming the closest
one. It reuses `overlappingPack` from `src/checks.js`, the same check as the pack sheet; `src/logic.js` is untouched.

**Why:** second item of the roadmap. The sheet only warns while typing a date, so overlaps saved before that warning
existed (usually a wrong month or day) stayed hidden while still shifting forecasts and reminders.

**Files:** `src/app.js` (`historyView`), `src/i18n.js` (`histOverlap` in Italian and English), `src/styles.css`
(`.li-warn`), `scripts/test-logic.mjs` (history-style checks: both sides of an overlap flagged, a clean history
flags nothing), `DEVLOG.md`, `ROADMAP.md`.

**Checks:**
- `npm ci`: ok (`npm audit`: 0 vulnerabilities, so the old `uuid` roadmap item is dropped)
- `npm test`: ok
- `npm run build`: ok
- `npm run sync`: ok
- Browser check with Playwright on `www/index.html`, Pixel 7 emulation (Italian light, English dark): with a typo pack
  on 25 Oct between 12 Oct and 5 Nov, the three involved rows show the note and the 14 Sep row does not; text wraps
  under the icon, no horizontal overflow, no page or console errors.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

## 2026-11-19 — Keep a copy of unreadable saved data

**What:** when the saved diary can't be read at all (broken JSON, or text that is not a diary with a list of packs),
the raw text is now copied under a separate storage key, `diario-yaz-unreadable`, before the app starts empty, so the
next save can no longer overwrite it. The Backup sheet then shows an "Unreadable saved data" section with the text, a
"Copy" button and a "Delete" button with an inline confirmation ("Delete the copy?"). The copy stays available across
restarts until it is deleted. The load error now says "A copy was kept in Backup". Reading the storage moved into a
small module, `src/store.js` (`loadStored`), which takes a Preferences-like object so it can be tested with a fake;
`src/logic.js` is untouched. Packs with a damaged date are still skipped as before ("repaired").

**Why:** second item of the roadmap. Before, an unreadable save showed an error and started an empty diary: the first
pack the user added (often right away, from the setup screen) overwrote the only copy of the old history.

**Files:** `src/store.js` (new), `src/app.js` (`load`, Backup sheet section, `unreadableAsk/No/Yes`, `copyBackup`
with a `data-src`), `src/i18n.js` (`unreadableTitle`, `unreadableWhy`, `unreadableQ` and a clearer `err.load` in
Italian and English), `scripts/test-logic.mjs` (fake storage tests), `README.md`, `README.it.md` (new FAQ entry),
`DEVLOG.md`, `ROADMAP.md`.

**Checks:**
- `npm ci`: ok
- `npm test`: ok (new `loadStored` cases: empty storage, valid diary, repaired packs, five unreadable inputs kept
  without touching the original, kept copy offered after a good save, write failure still returning the text)
- `npm run build`: ok
- `npm run sync`: ok
- Browser check with Playwright on `www/index.html`, Pixel 7 emulation (light and dark): with broken JSON in storage the
  error appears, the copy is written, the Backup sheet from the setup screen shows the section and the "Restore"
  heading; with a valid diary plus an old kept copy the sheet from Settings shows backup, kept copy and restore in that
  order; "Delete" → confirm removes the key and the section while the sheet stays open; no horizontal overflow, no page
  or console errors.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

## 2026-11-18 — Warn about overlapping packs

**What:** the "Add a pack" / "Edit the pack" sheet now shows a gentle note under the date when the chosen start is less
than 24 days from another recorded pack: "This pack overlaps the one started on 9 November 2026: they are less than 24
days apart. Check the date; you can still save." The note updates while the date changes (`input` event), is announced
by screen readers (`aria-live="polite"`), names the closest overlapping pack, ignores the pack being edited and is also
shown when opening the editor of a pack that already overlaps. Saving is still allowed. Same-day starts keep the existing
"duplicate" error. The check lives in a new pure module, `src/checks.js` (`overlappingPack`), so `src/logic.js` is
untouched. The note uses a surface-container-highest box with a tertiary info icon (light and dark).

**Why:** third item of the roadmap. A start inside another pack's 24 active days is almost always a typo (wrong month
or day in the date picker) and silently shifts every forecast and reminder.

**Files:** `src/checks.js` (new), `src/app.js` (`overlapWarn`, `input` listener, info icon), `src/i18n.js`
(`overlapWarn` in Italian and English), `src/styles.css` (`.dlg-warn`), `scripts/test-logic.mjs` (13 new assertions),
`README.md`, `README.it.md`, `DEVLOG.md`, `ROADMAP.md`.

**Checks:**
- `npm ci`: ok
- `npm test`: ok (new `overlappingPack` cases: both neighbours, 23/24-day boundaries, skipped placebo at day 25,
  duplicate, edited pack, empty input)
- `npm run build`: ok
- `npm run sync`: ok
- Browser check with Playwright on `www/index.html`, Pixel 7 emulation (light and dark): the note is hidden when the
  sheet opens, appears for an overlapping date, disappears for a non-overlapping one, saving still works, the edit sheet
  of an overlapping pack shows it at once; no horizontal overflow, no page or console errors.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

## 2026-11-16 — Snackbar above the "Add" button in History

**What:** on the History screen the snackbar ("Pack deleted." with "Undo", "Pack restored.", etc.) now appears above the
extended FAB instead of on top of it: 16 px margin + 56 px FAB + 12 px gap above the navigation bar. On the other screens
(no FAB) and in the setup screen (no navigation bar) its position is unchanged. Pure CSS: a `.screen.has-fab ~ .snackbar`
rule, using the `has-fab` class the History screen already sets on `<main>`.

**Why:** second item of the roadmap. While the 8 s "Undo" snackbar was showing, it covered the lower part of "Add", so
adding the correct pack right after deleting a wrong one meant waiting for it to disappear. Material 3 places snackbars
above FABs. No calculation changed.

**Files:** `src/styles.css`, `DEVLOG.md`, `ROADMAP.md`.

**Checks:**
- `npm ci`: ok
- `npm test`: ok
- `npm run build`: ok
- `npm run sync`: ok
- Browser check with Playwright on `www/index.html`, Pixel 7 emulation (light and dark): after deleting a pack in History
  the snackbar ends 12 px above the FAB (no overlap); on Today the snackbar keeps its old position above the navigation
  bar; no horizontal overflow, no page or console errors.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

## 2026-11-15 — Undo after deleting a pack

**What:** after confirming the deletion of a pack in History, the snackbar now says "Pack deleted." with an "Undo" text
button. Tapping it puts back the packs exactly as they were (including a skipped placebo that the delete had reset to
"not yet"), saves, reschedules the reminders and shows "Pack restored.". The snackbar with an action stays 8 s instead
of 4.5 s so the button can be reached. Any other change to the diary while it is showing (adding or editing a pack, an
answer from a notification, another delete) removes the button, so an old copy can never overwrite newer data. Deleting
the last pack also works: the setup screen appears and "Undo" brings the pack back. The button uses a new
`inverse-primary` colour token (light and dark) on the inverse surface, as in Material 3 snackbars.

**Why:** first item of the roadmap. A mistaken tap on "Delete" meant re-adding the pack by hand with the right date and
placebo outcome. No calculation in `src/logic.js` changed.

**Files:** `src/app.js` (`toast` with an optional action, `undo`, `dropUndo` called from `persist`, `delYes`,
`undoDel`), `src/i18n.js` (`deleted`, `undo`, `restored` in Italian and English), `src/styles.css`
(`--md-sys-color-inverse-primary`, `.snackbar.with-action`, `.snack-txt`, `.snack-btn`), `README.md`, `README.it.md`,
`DEVLOG.md`, `ROADMAP.md`.

**Checks:**
- `npm ci`: ok
- `npm test`: ok (key parity covers the three new strings)
- `npm run build`: ok
- `npm run sync`: ok
- Browser check with Playwright on `www/index.html`, Pixel 7 emulation (light and dark): delete → snackbar with "Undo";
  undo restores the pack in the list and in saved storage; after an edit the button is gone; deleting every pack shows
  the setup screen and undo restores the pack from there; snackbar hides after 8 s; no horizontal overflow, no page or
  console errors.
- `./gradlew assembleDebug`: not run, the Android SDK is not available in this environment (Java is).

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
