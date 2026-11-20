# Roadmap

Ideas for the next changes, most useful first. Each one should be a small, reviewable change.

1. **Accessibility pass** — check contrast of the legend's small dots, focus order in dialogs and TalkBack labels on the
   Today pack; announce the new month to screen readers after a month change.
2. **Tests for the prescription reminder edge cases** — `rxStarts` with `rx` before the first pack and `shiftRx` across
   a skipped placebo.
3. **Pack progress on the Today screen** — a short line with how many packs are recorded and since when.
4. **Focus after deleting the unreadable copy** — move focus to the next heading of the Backup sheet so TalkBack users
   are not left on a removed button.
5. **Overlap count in Settings or Today** — a one-line hint ("2 packs overlap, check History") so overlaps are noticed
   without opening History.
6. **Shrink the FAB while scrolling** — shrink the extended "Add" FAB to its icon-only form when the History list is
   scrolled down, and expand it again at the top, as in Material 3.
