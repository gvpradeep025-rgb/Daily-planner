const { test, expect, at, openAt, setTime, onboard, task } = require('./helpers');

test.describe('Onboarding', () => {
  test('builds a full schedule from the five steps', async ({ page }) => {
    await openAt(page, at('06:30'));
    await onboard(page);

    const tasks = page.locator('[data-testid="task"]');
    expect(await tasks.count()).toBeGreaterThan(8);
    await expect(tasks.first().locator('.t-title')).toHaveText('Morning Routine');
    await expect(tasks.last().locator('.t-title')).toHaveText('Wind Down');
    await expect(page.locator('#strategy-list li').first()).toBeVisible();
    await expect(page.locator('#s-tag')).toHaveText('Build Something');
  });

  test('does not move on until each step is answered', async ({ page }) => {
    await openAt(page, at('06:30'));

    await page.click('#next1');
    await expect(page.locator('.step[data-step="1"] [data-testid="step-error"]')).toHaveText('Pick one goal to continue.');

    await page.click('.goal-card[data-val="study"]');
    await page.click('#next1');
    await page.fill('#goal-desc', 'ab');
    await page.click('#next2');
    await expect(page.locator('.step[data-step="2"] [data-testid="step-error"]')).toContainText('at least 3 characters');
    await expect(page.locator('.step[data-step="2"]')).toHaveClass(/active/);
  });

  test('rejects a deadline that is not in the future', async ({ page }) => {
    await openAt(page, at('09:00'));
    await page.click('.goal-card[data-val="study"]');
    await page.click('#next1');
    await page.fill('#goal-desc', 'Pass AWS certification');
    await page.fill('#deadline', '2026-10-25');
    await page.click('#next2');
    await expect(page.locator('.step[data-step="2"] [data-testid="step-error"]')).toHaveText('The deadline must be after today.');
  });

  test('rejects a day with less than 5 hours of sleep', async ({ page }) => {
    await openAt(page, at('09:00'));
    await page.click('.goal-card[data-val="study"]');
    await page.click('#next1');
    await page.fill('#goal-desc', 'Pass AWS certification');
    await page.click('#next2');
    await page.click('.lifestyle-card[data-val="free"]');
    await page.click('#next3');
    await page.click('.prod-card[data-val="night"]');
    await page.fill('#wake-time', '06:00');
    await page.fill('#bed-time', '02:00');
    await page.click('#next4');
    await expect(page.locator('.step[data-step="4"] [data-testid="step-error"]')).toContainText('less than 5 hours of sleep');
  });

  test('rejects work hours that start before the morning routine is done', async ({ page }) => {
    await openAt(page, at('09:00'));
    await page.click('.goal-card[data-val="business"]');
    await page.click('#next1');
    await page.fill('#goal-desc', 'Launch a side hustle');
    await page.click('#next2');
    await page.click('.lifestyle-card[data-val="working"]');
    await page.fill('#work-start', '07:00');
    await page.fill('#work-end', '16:00');
    await page.fill('#commute2', '30');
    await page.click('#next3');
    await page.click('.prod-card[data-val="morning"]');
    await page.fill('#wake-time', '07:00');
    await page.fill('#bed-time', '23:00');
    await page.click('#next4');
    await expect(page.locator('.step[data-step="4"] [data-testid="step-error"]')).toContainText('before your morning routine');
  });
});

test.describe('Security', () => {
  test('text typed by the user is shown as text, never run as code', async ({ page }) => {
    await openAt(page, at('06:30'));
    const payload = '<img src=x onerror="window.__hacked=1">';
    await onboard(page, { desc: payload });

    expect(await page.evaluate(() => window.__hacked)).toBeUndefined();
    await expect(page.locator('.t-desc', { hasText: payload }).first()).toBeVisible();
  });
});

test.describe('Time windows', () => {
  test('a task that has not started is locked', async ({ page }) => {
    await openAt(page, at('07:05'));
    await onboard(page);

    const dinner = task(page, 'Dinner');
    await expect(dinner).toHaveAttribute('data-status', 'upcoming');
    await expect(dinner.locator('[data-testid="task-status"]')).toContainText('Unlocks at');
    await expect(dinner.locator('[data-testid="task-check"]')).toHaveAttribute('aria-disabled', 'true');
    await dinner.locator('[data-testid="task-check"]').click({ force: true });
    await expect(dinner.locator('[data-testid="task-check"]')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#e-text')).toContainText('Not yet');
  });

  test('the current task can be ticked and counts as on time', async ({ page }) => {
    await openAt(page, at('07:05'));
    await onboard(page);

    const routine = task(page, 'Morning Routine');
    await expect(routine).toHaveAttribute('data-status', 'active');
    await expect(routine.locator('[data-testid="task-status"]')).toHaveText('Now · 15 min left');
    await routine.locator('[data-testid="task-check"]').click();
    await expect(routine).toHaveAttribute('data-status', 'done');
    await expect(routine.locator('[data-testid="task-status"]')).toHaveText('Done at 7:05 AM');
    await expect(page.locator('#ring-text')).not.toHaveText('0%');
  });

  test('a task ticked long after it ended is logged as late', async ({ page }) => {
    await openAt(page, at('07:05'));
    await onboard(page);
    await setTime(page, at('10:00'));

    const routine = task(page, 'Morning Routine');
    await expect(routine).toHaveAttribute('data-status', 'overdue');
    await routine.locator('[data-testid="task-check"]').click();
    await expect(routine.locator('[data-testid="task-status"]')).toHaveText('Done late at 10:00 AM');
    await expect(routine).toHaveClass(/late/);
  });

  test('statuses move forward as the clock moves', async ({ page }) => {
    await openAt(page, at('07:05'));
    await onboard(page);
    const routine = task(page, 'Morning Routine');
    await expect(routine).toHaveAttribute('data-status', 'active');
    await setTime(page, at('07:30'));
    await expect(routine).toHaveAttribute('data-status', 'overdue');
  });

  test('after bedtime the day is closed and unticked tasks are missed', async ({ page }) => {
    await openAt(page, at('07:05'));
    await onboard(page);
    await setTime(page, at('23:10'));

    const routine = task(page, 'Morning Routine');
    await expect(routine).toHaveAttribute('data-status', 'closed');
    await expect(routine.locator('[data-testid="task-status"]')).toHaveText('Missed');
    await expect(routine.locator('[data-testid="task-check"]')).toHaveAttribute('aria-disabled', 'true');
    await routine.locator('[data-testid="task-check"]').click({ force: true });
    await expect(routine.locator('[data-testid="task-check"]')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#e-text')).toContainText('today is closed');
  });

  test('a night owl at 00:40 is still on yesterday\'s plan', async ({ page }) => {
    await openAt(page, at('20:00'));
    await onboard(page, { productivity: 'night', wake: '09:00', bed: '01:30' });
    await task(page, 'Morning Routine').locator('[data-testid="task-check"]').click();

    await page.clock.setFixedTime(at('00:40', '2026-10-27'));
    await page.reload();

    await expect(task(page, 'Morning Routine')).toHaveAttribute('data-status', 'done');
    const review = task(page, 'Review Day');
    await expect(review).toHaveAttribute('data-status', 'upcoming');
    await expect(review.locator('[data-testid="task-status"]')).toHaveText('Unlocks at 1:00 AM');
  });
});

test.describe('Progress and streaks', () => {
  test('ticked tasks survive a page reload', async ({ page }) => {
    await openAt(page, at('07:05'));
    await onboard(page);
    await task(page, 'Morning Routine').locator('[data-testid="task-check"]').click();
    await page.reload();
    await expect(task(page, 'Morning Routine')).toHaveAttribute('data-status', 'done');
  });

  test('finishing every task gives a 1-day streak that re-ticking cannot inflate', async ({ page }) => {
    await openAt(page, at('22:50'));
    await onboard(page);

    const checks = page.locator('[data-testid="task-check"]');
    const n = await checks.count();
    for (let i = 0; i < n; i++) await checks.nth(i).click();
    await expect(page.locator('#streak-card')).toHaveClass(/show/);
    await expect(page.locator('#streak-count')).toHaveText('1');

    await checks.nth(n - 1).click();
    await checks.nth(n - 1).click();
    await expect(page.locator('#streak-count')).toHaveText('1');
  });

  test('the Settings button opens the Progress page', async ({ page }) => {
    await openAt(page, at('07:05'));
    await onboard(page);
    await page.click('.profile-avatar-wrap');
    await page.click('text=Settings');
    await expect(page.locator('#progress-view')).toBeVisible();
    await expect(page.locator('.nav-tab[data-tab="progress"]')).toHaveClass(/active/);
  });

  test('the progress calendar marks today with the saved completion', async ({ page }) => {
    await openAt(page, at('07:05'));
    await onboard(page);
    await task(page, 'Morning Routine').locator('[data-testid="task-check"]').click();
    await page.click('.nav-tab[data-tab="progress"]');
    await expect(page.locator('.p-cal-day.today')).toHaveText('26');
    await expect(page.locator('#p-total-done')).toHaveText('1');
  });
});
