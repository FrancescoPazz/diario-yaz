# Roadmap

Ideas for the next changes, most useful first. Each one should be a small, reviewable change.

1. **Accessibility pass, part three** — check contrast of the legend's small dots, focus order in the Add/Edit dialog
   and richer TalkBack labels on the Today pack (active or placebo, pills left).
2. **Pack progress on the Today screen** — a short line with how many packs are recorded and since when.
3. **Shrink the FAB while scrolling** — shrink the extended "Add" FAB to its icon-only form when the History list is
   scrolled down, and expand it again at the top, as in Material 3.
4. **Tests for the calendar map around a skipped placebo** — `buildMap` when a skipped pack is followed by a late pack
   (gap days, skipped period marker on a gap day).
5. **Scroll to the first flagged pack** — when History is opened from the Today overlap hint, scroll to and focus the
   first overlapping row.
6. **Focus after deleting a pack** — after "Delete" in History, move focus to the next row (or the FAB) instead of the
   top of the page.
