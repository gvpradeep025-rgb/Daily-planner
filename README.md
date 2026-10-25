# Daily Goal Planner

[![Tests](https://github.com/gvpradeep025-rgb/Daily-planner/actions/workflows/tests.yml/badge.svg)](https://github.com/gvpradeep025-rgb/Daily-planner/actions/workflows/tests.yml)
[![Deploy](https://github.com/gvpradeep025-rgb/Daily-planner/actions/workflows/pages.yml/badge.svg)](https://github.com/gvpradeep025-rgb/Daily-planner/actions/workflows/pages.yml)

A client-side planner that turns one goal into a realistic, time-boxed day, and a QA project built around it: a
pure scheduling engine with unit tests, Playwright end-to-end tests that control the clock, and CI on every push.

**Live demo:** https://gvpradeep025-rgb.github.io/Daily-planner/

## What it does

Answer five questions (goal, what you're after, what your day looks like, when you work best, preferences) and it builds
today's schedule, then holds you to it in real time.

### Scheduling rules
The engine (`js/scheduler.js`) has no DOM code, so every rule below is unit tested.

| Rule | Detail |
|---|---|
| No overlaps | Blocks are placed into free gaps only; nothing is merged or stretched to hide a clash |
| Stays inside your day | Every block starts after wake-up and ends by bedtime, including bedtimes after midnight |
| Fixed blocks first | Morning routine, work/classes, commute and wind-down are placed first and never moved |
| Realistic meals | Breakfast within 2.5h of waking, lunch around midday (or a note if you're at work), dinner 2.5h before bed |
| Focus sessions | 50 min on, 10 min break, a 25 min break after every third session, minimum 25 min |
| Peak hours | Focus goes into your peak window first, then other free time |
| Honest workload | Focus time is capped by lifestyle: free 5h, student 3h, part-time 3h, working 2h |
| Protected sleep | No focus work in the last hour before bed; reading is placed right before the wind-down |
| Clear trade-offs | Anything that doesn't fit becomes a visible warning instead of silently disappearing |
| Input validation | Rejects under 5h or over 12h sleep, commitments that clash with your routine or bedtime, past deadlines |

### Time windows for ticking tasks

| Status | When | Can tick? |
|---|---|---|
| Upcoming | Before the task starts | No, shows when it unlocks |
| Active | During the task | Yes, counts as on time with live minutes left |
| Overdue | After it ends, before bedtime | Yes, logged as late after a 15-minute grace period |
| Closed | After bedtime | No, unticked tasks count as missed |

A night owl who sleeps at 1:30 AM is still on the previous day's plan at 00:40. Streaks are worked out from saved
history (consecutive 100% days), so ticking and unticking can't inflate them. The mission badge comes from your actual
completion rate over the last 7 days, not from how many days have passed.

### Also included
Progress page with calendar heatmap and weekly stats, current-state illustrations, XP and confetti for on-time
completions, background music, and all data kept in your browser's localStorage.

## Run it

Open `index.html` in a browser. No build step or server needed.

## Tests

```bash
npm install
npx playwright install chromium
npm test            # unit + end-to-end
npm run test:unit   # scheduling engine only (Node's built-in test runner)
npm run test:e2e    # Playwright, desktop and mobile Chrome
```

| Suite | Tool | Count | What it covers |
|---|---|---|---|
| Unit | `node:test` | 20 | Overlaps and bounds across 200+ generated profiles, meal windows, focus caps, peak hours, validation messages, task status at each boundary minute, local dates, night-owl clock, streak and mission maths |
| End-to-end | Playwright | 16 × 2 devices | Onboarding, step validation, XSS, locked/active/late/missed tasks, clock moving forward, after-midnight plans, reload persistence, streak inflation, settings and progress pages |

The end-to-end tests fix the browser clock with `page.clock.setFixedTime` in the Asia/Kolkata timezone, so time-window
tests give the same result whenever they run. Outside network calls are blocked and any JavaScript error fails the test.

See [BUGS.md](BUGS.md) for the defects found and fixed.

## Project structure

```
index.html            markup
css/styles.css        styles
js/scheduler.js       scheduling engine and time rules (pure functions, works in Node and the browser)
js/app.js             UI, onboarding, progress, persistence
tests/unit/           engine unit tests
tests/e2e/            Playwright specs and helpers
.github/workflows/    tests on every push and PR; GitHub Pages deploy
```

## Privacy

Everything stays in your browser's localStorage. Nothing is sent anywhere.
