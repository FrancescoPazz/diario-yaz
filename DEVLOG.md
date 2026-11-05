# Development log

Newest entries first.

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
