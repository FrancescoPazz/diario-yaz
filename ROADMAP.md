# Roadmap

Ideas for the next changes, most useful first. Each one should be a small, reviewable change.

1. **Accessibility pass** — check contrast of the legend's small dots, focus order in dialogs and TalkBack labels on the
   Today pack; announce the new month to screen readers after a month change.
2. **Snackbar above the FAB** — in History the snackbar covers the lower part of the "Add" button; lift the FAB (or
   place the snackbar above it) while a message is showing.
3. **Keep a copy of unreadable saved data** — when the stored JSON can't be parsed at all, keep the raw text under a
   separate key so it isn't overwritten by the next save and can be recovered via backup.
4. **Warn about overlapping packs** — when adding or editing a pack whose start falls inside the previous pack's 24
   active days, show a gentle warning in the sheet (saving is still allowed), since it is almost always a typo.
5. **Tests for the prescription reminder edge cases** — `rxStarts` with `rx` before the first pack and `shiftRx` across
   a skipped placebo.
6. **Pack progress on the Today screen** — a short line with how many packs are recorded and since when.
7. **Dependency check follow-up** — drop the remaining `uuid` audit warning once `@capacitor/assets` ships a fixed
   `@trapezedev/project`.
