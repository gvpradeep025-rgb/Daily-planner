# Bug Report

Defects found while testing v1 of the planner, and how each was fixed. Each fix has a test that would fail without it.

| # | Severity | Bug | Cause | Fix | Covered by |
|---|---|---|---|---|---|
| 1 | Critical | The schedule never appeared after onboarding | `buildSchedule()` used `taskCount`, which only existed inside `generateStrategy()`, throwing `ReferenceError: taskCount is not defined` | Engine rewrite; subtitle uses the real task count | e2e: builds a full schedule; every e2e test fails on any page error |
| 2 | Critical | Stored XSS: a goal description like `<img src=x onerror=...>` ran as code | User text inserted with `innerHTML` in the summary and timeline | All user text escaped or set with `textContent` | e2e: text typed by the user is shown as text |
| 3 | High | Overlapping blocks were silently stretched together | Clashing blocks were merged by extending the earlier one, hiding the conflict | Interval placement into free gaps only; anything that can't fit becomes a warning | unit: no overlaps across 200+ profiles |
| 4 | High | Blocks could fall outside wake-up and bedtime, especially with late bedtimes or commitments | Hard-coded clock times, no bounds check | Every block placed inside `[wake, bed]`, bedtime after midnight treated as one continuous day | unit: stays between wake and bed |
| 5 | High | The anti-cheat rule had dead code and the "early" state could never be shown | An early `return` ran before the branch that set it | Explicit upcoming / active / overdue / closed states with a 15-minute grace period | unit: task status; e2e: time windows |
| 6 | High | Ticking one "Break" or "Deep Coding" ticked every task with that title after a reload | Completions saved by title | Saved by unique block id with the time it was ticked | e2e: ticked tasks survive a reload |
| 7 | High | Streak could be inflated by unticking and re-ticking the last task | Streak was a counter incremented on each completion | Streak computed from saved history of 100% days | unit: streak; e2e: re-ticking cannot inflate |
| 8 | Medium | "Today" could be the wrong date for users east of UTC (in India, before 5:30 AM) | `new Date().toISOString()` returns the UTC date | Local date helpers everywhere | unit: dateKey uses local time |
| 9 | Medium | A night owl's plan reset at midnight while they were still awake | Day boundary was midnight, not bedtime | Planner day runs wake-up to bedtime | unit + e2e: night owl at 00:40 |
| 10 | Medium | Settings button threw `Cannot read properties of undefined (reading 'target')` | `switchTab` read `event.target` when called from code | Tabs found by `data-tab` | e2e: Settings opens Progress |
| 11 | Medium | Mission badge said "On Track" for anyone who had simply waited, regardless of what they did | Status based on elapsed days only | Based on the last 7 days' completion plus today's on-time rate | unit: mission status |
| 12 | Medium | Impossible inputs accepted: 3 hours of sleep, work starting before waking, deadline in the past | No validation | Validation with a clear message on each step; disabled-looking buttons now explain what's missing instead of ignoring the tap | unit: validation; e2e: onboarding |
| 13 | Low | Page load hung offline and in CI waiting for Google Fonts | Blocking external stylesheet | Font stylesheet now loads without blocking the page (falls back to system fonts); tests block outside requests | All e2e |
| 14 | Low | Restored sessions could rebuild from default form values instead of the saved plan | Saved onboarding answers were never restored to the form | `restoreOnboarding()` runs on load; schedule built from saved state | e2e: night owl at 00:40 (reload) |
| 15 | Low | "Sleep" was a tickable task at bedtime, which can never be ticked honestly | Modelled as a 10-minute task | Bedtime is the end of the day; wind-down says when lights go out | unit: wind-down ends at bedtime |
