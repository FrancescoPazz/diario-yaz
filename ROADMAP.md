# Roadmap

Ideas for the next changes, most useful first. Each one should be a small, reviewable change.

1. **Accessibility pass, part three** — check contrast of the legend's small dots, focus order in the Add/Edit dialog
   and richer TalkBack labels on the Today pack (active or placebo, pills left).
2. **Shrink the FAB while scrolling** — shrink the extended "Add" FAB to its icon-only form when the History list is
   scrolled down, and expand it again at the top, as in Material 3.
3. **Scroll to the first flagged pack** — when History is opened from the Today overlap hint, scroll to and focus the
   first overlapping row.
4. **Pack count in History** — show the same "pack N since ..." summary at the top of History, with the number of
   skipped periods.
5. **Calendar legend in dark mode** — review the legend and the day-detail sheet in dark mode for contrast and
   spacing on small screens.
6. **Tests for notifications after a skipped placebo** — `planNotifications` when the latest pack has the placebo
   skipped and no newer pack (no period reminder, new-pack questions from day 25).
