# Roadmap

Ideas for the next changes, most useful first. Each one should be a small, reviewable change.

1. **Accessibility pass** — check contrast of the legend's small dots, focus order in dialogs and TalkBack labels on the
   Today pack; announce the new month to screen readers after a month change.
2. **Overlap hint in History** — mark packs that overlap their neighbour in the History list too, so old typos (made
   before the sheet warned about them) are easy to spot.
3. **Tests for the prescription reminder edge cases** — `rxStarts` with `rx` before the first pack and `shiftRx` across
   a skipped placebo.
4. **Pack progress on the Today screen** — a short line with how many packs are recorded and since when.
5. **Focus after deleting the unreadable copy** — move focus to the next heading of the Backup sheet so TalkBack users
   are not left on a removed button.
6. **Dependency check follow-up** — drop the remaining `uuid` audit warning once `@capacitor/assets` ships a fixed
   `@trapezedev/project`.
7. **Shrink the FAB while scrolling** — shrink the extended "Add" FAB to its icon-only form when the History list is
   scrolled down, and expand it again at the top, as in Material 3.
