# Roadmap

Ideas for the next changes, most useful first. Each one should be a small, reviewable change.

1. **Edit a past pack in History** — change the placebo outcome (taken / skipped / open) or the start date of a recorded
   pack without deleting and re-adding it.
2. **Swipe between months in the calendar** — horizontal swipe on the grid as a shortcut for the arrows, respecting
   reduced motion.
3. **More tests for `src/logic.js`** — `buildMap` gaps and late packs, `parseBackup` edge cases (bad time, unknown
   language), `planNotifications` horizon and the snoozed "No" answer.
4. **Validate stored data on load** — `load()` accepts any `blisters` array; reuse `parseBackup`'s normalisation so a
   corrupted entry can't break rendering.
5. **Dependency check** — review Capacitor 8.x plugin and esbuild updates, and run `npm audit`.
6. **Accessibility pass** — check contrast of the legend's small dots, focus order in dialogs and TalkBack labels on the
   Today pack.
7. **Pack progress on the Today screen** — a short line with how many packs are recorded and since when.
