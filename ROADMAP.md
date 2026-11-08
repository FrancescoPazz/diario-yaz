# Roadmap

Ideas for the next changes, most useful first. Each one should be a small, reviewable change.

1. **More tests for `src/logic.js`** — `buildMap` gaps and late packs, `planNotifications` horizon and the snoozed "No"
   answer.
2. **Swipe between months in the calendar** — horizontal swipe on the grid as a shortcut for the arrows, respecting
   reduced motion.
3. **Accessibility pass** — check contrast of the legend's small dots, focus order in dialogs and TalkBack labels on the
   Today pack.
4. **Keep a copy of unreadable saved data** — when the stored JSON can't be parsed at all, keep the raw text under a
   separate key so it isn't overwritten by the next save and can be recovered via backup.
5. **Pack progress on the Today screen** — a short line with how many packs are recorded and since when.
6. **Dependency check follow-up** — drop the remaining `uuid` audit warning once `@capacitor/assets` ships a fixed
   `@trapezedev/project`.
7. **Undo after deleting a pack** — a snackbar with an "Undo" action that restores the deleted pack, so a mistaken tap
   doesn't need a manual re-add.
8. **Warn about overlapping packs** — when adding or editing a pack whose start falls inside the previous pack's 24
   active days, show a gentle warning in the sheet (saving is still allowed), since it is almost always a typo.
