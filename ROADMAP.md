# Roadmap

Ideas for the next changes, most useful first. Each one should be a small, reviewable change.

1. **Edit a past pack in History** — change the placebo outcome (taken / skipped / open) or the start date of a recorded
   pack without deleting and re-adding it.
2. **Swipe between months in the calendar** — horizontal swipe on the grid as a shortcut for the arrows, respecting
   reduced motion.
3. **More tests for `src/logic.js`** — `buildMap` gaps and late packs, `planNotifications` horizon and the snoozed "No"
   answer.
4. **Dependency check** — review Capacitor 8.x plugin and esbuild updates, and run `npm audit`.
5. **Accessibility pass** — check contrast of the legend's small dots, focus order in dialogs and TalkBack labels on the
   Today pack.
6. **Pack progress on the Today screen** — a short line with how many packs are recorded and since when.
7. **Keep a copy of unreadable saved data** — when the stored JSON can't be parsed at all, keep the raw text under a
   separate key so it isn't overwritten by the next save and can be recovered via backup.
