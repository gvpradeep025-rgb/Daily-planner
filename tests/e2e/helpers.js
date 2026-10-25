const path = require('path');
const { test: base, expect } = require('@playwright/test');

const APP = 'file://' + path.resolve(__dirname, '../../index.html');

/** A wall-clock moment in India time, e.g. at('07:05') or at('00:40', '2026-10-27'). */
const at = (hhmm, day = '2026-10-26') => new Date(`${day}T${hhmm}:00+05:30`);

/**
 * Extends the base test so every test:
 *  - blocks outside network calls (Google Fonts) so runs are fast and identical offline and on CI
 *  - fails if the page throws any JavaScript error
 */
const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(/^https?:\/\//, (route) => route.abort());
    await use(page);
    expect(errors, 'JavaScript errors on the page').toEqual([]);
  }
});

async function openAt(page, time) {
  await page.clock.setFixedTime(time);
  await page.goto(APP);
}

/** Moves the clock and lets the app react, the same way its 30-second timer would. */
async function setTime(page, time) {
  await page.clock.setFixedTime(time);
  await page.evaluate(() => { refreshTimeline(); updateDash(); });
}

const defaults = {
  goal: 'coding', desc: 'Build my portfolio site', lifestyle: 'free',
  productivity: 'morning', wake: '07:00', bed: '23:00', prefs: []
};

/** Walks the 5 onboarding steps and builds the day. */
async function onboard(page, options = {}) {
  const o = Object.assign({}, defaults, options);
  await page.click(`.goal-card[data-val="${o.goal}"]`);
  await page.click('#next1');
  await page.fill('#goal-desc', o.desc);
  if (o.deadline) await page.fill('#deadline', o.deadline);
  await page.click('#next2');
  await page.click(`.lifestyle-card[data-val="${o.lifestyle}"]`);
  if (o.lifestyle === 'working') {
    await page.fill('#work-start', o.workStart);
    await page.fill('#work-end', o.workEnd);
    await page.fill('#commute2', String(o.commute || 0));
  }
  await page.click('#next3');
  await page.click(`.prod-card[data-val="${o.productivity}"]`);
  await page.fill('#wake-time', o.wake);
  await page.fill('#bed-time', o.bed);
  await page.click('#next4');
  for (const p of o.prefs) await page.click(`.pref-chip[data-val="${p}"]`);
  await page.click('#next5');
  await page.click('.cta-btn');
  await expect(page.locator('#schedule-view')).toBeVisible();
}

const task = (page, title) => page.locator('[data-testid="task"]', { has: page.locator('.t-title', { hasText: title }) }).first();

module.exports = { test, expect, APP, at, openAt, setTime, onboard, task };
