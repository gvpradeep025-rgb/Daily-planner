// Unit tests for the scheduling engine. Run with: node --test tests/unit/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../js/scheduler.js');

const base = {
  goal: 'coding', desc: 'portfolio site', lifestyle: 'free', workStart: '', workEnd: '', commute: 0,
  productivity: 'morning', wake: '07:00', bed: '23:00', prefs: []
};
const profile = (over) => Object.assign({}, base, over);

function assertValidDay(r) {
  for (let i = 0; i < r.blocks.length; i++) {
    const b = r.blocks[i];
    assert.ok(b.dur > 0, `${b.title} has a positive duration`);
    assert.ok(b.start >= r.wake, `${b.title} starts after wake-up`);
    assert.ok(b.start + b.dur <= r.bed, `${b.title} ends before bedtime`);
    if (i > 0) {
      const prev = r.blocks[i - 1];
      assert.ok(prev.start + prev.dur <= b.start, `${prev.title} and ${b.title} do not overlap`);
    }
  }
}

test('toMin and clock convert both ways', () => {
  assert.equal(S.toMin('07:30'), 450);
  assert.equal(S.clock(450), '7:30 AM');
  assert.equal(S.clock(1500), '1:00 AM');
  assert.ok(Number.isNaN(S.toMin('25:00')));
});

test('a normal day has no overlaps and stays between wake and bed', () => {
  assertValidDay(S.build(profile()));
});

test('every combination of lifestyle, peak, sleep and preferences produces a valid day', () => {
  const lifestyles = [['free'], ['student', '09:00', '15:00', 30], ['working', '09:00', '17:00', 45], ['parttime', '14:00', '20:00', 0]];
  const sleeps = [['06:00', '22:30'], ['08:00', '00:30'], ['10:00', '02:00']];
  const prefsSets = [[], ['morning-workout', 'meditation', 'journal', 'reading', 'social', 'walks', 'music', 'family', 'gaming', 'free', 'cooking']];
  let built = 0;
  for (const goal of ['fitness', 'study', 'mental', 'custom'])
    for (const l of lifestyles)
      for (const productivity of ['morning', 'afternoon', 'night', 'flexible'])
        for (const s of sleeps)
          for (const prefs of prefsSets) {
            const p = profile({ goal, lifestyle: l[0], workStart: l[1] || '', workEnd: l[2] || '', commute: l[3] || 0, productivity, wake: s[0], bed: s[1], prefs });
            if (S.validate(p).length) continue;
            assertValidDay(S.build(p));
            built++;
          }
  assert.ok(built > 200, `built ${built} days`);
});

test('fixed anchors: routine at wake-up, wind-down ends exactly at bedtime', () => {
  const r = S.build(profile());
  assert.equal(r.blocks[0].title, 'Morning Routine');
  assert.equal(r.blocks[0].start, S.toMin('07:00'));
  const last = r.blocks[r.blocks.length - 1];
  assert.equal(last.title, 'Wind Down');
  assert.equal(last.start + last.dur, S.toMin('23:00'));
});

test('commitment and commute are fixed and not tickable', () => {
  const r = S.build(profile({ lifestyle: 'working', workStart: '09:00', workEnd: '17:00', commute: 30 }));
  const work = r.blocks.find((b) => b.kind === 'commit');
  assert.equal(work.start, 540);
  assert.equal(work.dur, 480);
  assert.equal(work.task, false);
  const commutes = r.blocks.filter((b) => b.kind === 'commute');
  assert.deepEqual(commutes.map((c) => [c.start, c.dur]), [[510, 30], [1020, 30]]);
});

test('lunch inside working hours becomes a note, not a block', () => {
  const r = S.build(profile({ lifestyle: 'working', workStart: '09:00', workEnd: '17:00' }));
  assert.equal(r.blocks.some((b) => b.title === 'Lunch'), false);
  assert.ok(r.warnings.some((w) => w.startsWith('Lunch falls during your work')));
});

test('dinner is at least 2.5 hours before bed when there is room', () => {
  const r = S.build(profile());
  const dinner = r.blocks.find((b) => b.title === 'Dinner');
  assert.ok(dinner.start + dinner.dur <= r.bed - 150);
});

test('focus time respects the lifestyle cap', () => {
  const cap = { free: 300, student: 180, working: 120, parttime: 180 };
  const r1 = S.build(profile({ lifestyle: 'free' }));
  assert.equal(r1.focusMinutes, cap.free);
  const r2 = S.build(profile({ lifestyle: 'working', workStart: '09:00', workEnd: '17:00' }));
  assert.ok(r2.focusMinutes <= cap.working);
});

test('focus sessions are 25 to 50 minutes and none run into the last hour before bed', () => {
  const r = S.build(profile({ productivity: 'night' }));
  const focus = r.blocks.filter((b) => b.kind === 'focus');
  assert.ok(focus.length > 0);
  for (const f of focus) {
    assert.ok(f.dur >= 25 && f.dur <= 50, `session of ${f.dur} min`);
    assert.ok(f.start + f.dur <= r.bed - 60);
  }
});

test('a morning person gets focus sessions in the morning first', () => {
  const r = S.build(profile({ productivity: 'morning' }));
  const first = r.blocks.find((b) => b.kind === 'focus');
  assert.ok(first.start < 720, 'first session before noon');
});

test('reading is placed right before the wind-down', () => {
  const r = S.build(profile({ prefs: ['reading'] }));
  const reading = r.blocks.find((b) => b.title === 'Reading');
  assert.equal(reading.start + reading.dur, r.bed - 30);
});

test('breaks are not tasks; every third session gets a long break', () => {
  const r = S.build(profile({ lifestyle: 'free' }));
  const breaks = r.blocks.filter((b) => b.kind === 'break');
  assert.ok(breaks.every((b) => b.task === false));
  assert.ok(breaks.some((b) => b.title === 'Long Break' && b.dur === 25));
});

test('a bedtime after midnight is one continuous day', () => {
  const r = S.build(profile({ wake: '09:00', bed: '01:00' }));
  assert.equal(r.bed, 1500);
  assertValidDay(r);
});

test('validation rejects impossible days with a clear message', () => {
  assert.match(S.validate(profile({ wake: '07:00', bed: '03:00' }))[0], /less than 5 hours of sleep/);
  assert.match(S.validate(profile({ wake: '07:00', bed: '18:00' }))[0], /more than 12 hours/);
  assert.match(S.validate(profile({ lifestyle: 'working', workStart: '07:00', workEnd: '17:00', commute: 30 }))[0], /before your morning routine/);
  assert.match(S.validate(profile({ lifestyle: 'working', workStart: '12:00', workEnd: '22:45' }))[0], /wind-down/);
  assert.match(S.validate(profile({ lifestyle: 'working', workStart: '09:00', workEnd: '09:00' }))[0], /same time/);
  assert.match(S.validate(profile({ commute: 200, lifestyle: 'working', workStart: '12:00', workEnd: '14:00' })).join(' '), /3 hours or less/);
  assert.throws(() => S.build(profile({ bed: '03:00' })));
});

test('task status follows the clock', () => {
  const block = { start: 600, dur: 50 };
  assert.equal(S.taskStatus(block, 599, 1380), 'upcoming');
  assert.equal(S.taskStatus(block, 600, 1380), 'active');
  assert.equal(S.taskStatus(block, 649, 1380), 'active');
  assert.equal(S.taskStatus(block, 650, 1380), 'overdue');
  assert.equal(S.taskStatus(block, 1380, 1380), 'closed');
});

test('on time means within 15 minutes of the end', () => {
  const block = { start: 600, dur: 50 };
  assert.equal(S.isOnTime(block, 665), true);
  assert.equal(S.isOnTime(block, 666), false);
});

test('dateKey uses local time, not UTC', () => {
  assert.equal(S.dateKey(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  assert.equal(S.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(S.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(S.daysBetween('2026-10-25', '2026-11-01'), 7);
});

test('plannerNow keeps a night owl on yesterday\'s plan until bedtime', () => {
  const at0030 = new Date(2026, 9, 26, 0, 30);
  assert.deepEqual(S.plannerNow(at0030, 540, 1500), { key: '2026-10-25', minute: 1470 });
  assert.deepEqual(S.plannerNow(at0030, 420, 1380), { key: '2026-10-26', minute: 30 });
  const at0800 = new Date(2026, 9, 26, 8, 0);
  assert.deepEqual(S.plannerNow(at0800, 540, 1500), { key: '2026-10-26', minute: 480 });
});

test('streak counts consecutive full days and cannot be inflated', () => {
  const daily = {
    '2026-10-22': { pct: 100 }, '2026-10-23': { pct: 100 }, '2026-10-24': { pct: 80 }, '2026-10-25': { pct: 100 }
  };
  assert.equal(S.computeStreak(daily, '2026-10-25'), 1);
  assert.equal(S.computeStreak(daily, '2026-10-26'), 1, 'today unfinished, yesterday counts');
  daily['2026-10-24'].pct = 100;
  assert.equal(S.computeStreak(daily, '2026-10-25'), 4);
  assert.equal(S.computeStreak(daily, '2026-10-25'), 4, 'calling again changes nothing');
  assert.equal(S.computeStreak({}, '2026-10-25'), 0);
});

test('mission status reflects real completion, not just elapsed days', () => {
  const daily = { '2026-10-24': { pct: 100 }, '2026-10-25': { pct: 100 } };
  assert.equal(S.missionStatus(daily, '2026-10-26', '2026-10-24', 4, 4).label, 'Ahead of Schedule');
  const poor = { '2026-10-24': { pct: 20 }, '2026-10-25': { pct: 10 } };
  assert.equal(S.missionStatus(poor, '2026-10-26', '2026-10-24', 0, 3).label, 'Behind Schedule');
  assert.equal(S.missionStatus({}, '2026-10-26', '2026-10-26', 0, 0).label, 'Just Started');
});
