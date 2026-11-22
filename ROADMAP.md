# Roadmap

Ideas for the next changes, most useful first. Each one should be a small, reviewable change.

1. **Accessibility pass** — check contrast of the legend's small dots, focus order in dialogs and TalkBack labels on the
   Today pack; announce the new month to screen readers after a month change.
2. **Pack progress on the Today screen** — a short line with how many packs are recorded and since when.
3. **Focus after deleting the unreadable copy** — move focus to the next heading of the Backup sheet so TalkBack users
   are not left on a removed button.
4. **Shrink the FAB while scrolling** — shrink the extended "Add" FAB to its icon-only form when the History list is
   scrolled down, and expand it again at the top, as in Material 3.
5. **Tests for the calendar map around a skipped placebo** — `buildMap` when a skipped pack is followed by a late pack
   (gap days, skipped period marker on a gap day).
6. **Scroll to the first flagged pack** — when History is opened from the Today overlap hint, scroll to and focus the
   first overlapping row.
