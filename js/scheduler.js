/*
 * Scheduler: the planning engine, kept free of any DOM code so it can be unit tested.
 *
 * All times are minutes from the midnight that starts the planner day. A bedtime after midnight
 * is stored as more than 1440 (01:00 the next morning = 1500), so the day is one continuous line.
 *
 * Rules the engine guarantees:
 *  - every block sits between wake-up and bedtime, and no two blocks overlap
 *  - fixed blocks (routine, commitment, commute, wind-down) are placed first; nothing moves them
 *  - meals sit in realistic windows: breakfast within 2h of waking, lunch around midday,
 *    dinner at least 2.5h before bed where possible
 *  - focus sessions are 50 minutes (or shorter to fill a gap, never under 25) followed by a 10 minute break,
 *    placed in your peak hours first and capped by how much free time your lifestyle realistically has
 *  - nothing demanding is scheduled in the last hour before bed
 */
(function (root) {
  'use strict';

  var DAY = 1440;
  var PEAKS = { morning: [360, 720], afternoon: [720, 1080], night: [1080, 1440], flexible: null };
  var FOCUS_CAP = { free: 300, student: 180, working: 120, parttime: 180 };
  var GOAL_FOCUS_CAP = { fitness: 60, mental: 60 };
  var SESSION = 50, MIN_SESSION = 25, BREAK = 10, LONG_BREAK = 25;

  function toMin(t) {
    if (typeof t !== 'string' || !/^\d{1,2}:\d{2}$/.test(t)) return NaN;
    var p = t.split(':');
    var h = +p[0], m = +p[1];
    if (h > 23 || m > 59) return NaN;
    return h * 60 + m;
  }

  function clock(m) {
    var x = ((m % DAY) + DAY) % DAY;
    var h = Math.floor(x / 60), mm = x % 60;
    return (h % 12 || 12) + ':' + String(mm).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
  }

  function duration(min) {
    if (min < 60) return min + 'm';
    return Math.floor(min / 60) + 'h' + (min % 60 ? ' ' + (min % 60) + 'm' : '');
  }

  /** Turns the onboarding answers into absolute minutes on one continuous line. */
  function normalise(p) {
    var wake = toMin(p.wake), bedRaw = toMin(p.bed);
    var bed = bedRaw > wake ? bedRaw : bedRaw + DAY;
    var out = { wake: wake, bed: bed, commit: null, commute: Math.max(0, parseInt(p.commute, 10) || 0) };
    if (p.workStart && p.workEnd) {
      var cs = toMin(p.workStart), ce = toMin(p.workEnd);
      if (cs < wake) { cs += DAY; ce += DAY; }
      while (ce <= cs) ce += DAY;
      out.commit = { start: cs, end: ce };
    }
    return out;
  }

  /** Returns a list of human-readable problems. An empty list means the profile can be scheduled. */
  function validate(p) {
    var errors = [];
    if (isNaN(toMin(p.wake))) errors.push('Pick a valid wake-up time.');
    if (isNaN(toMin(p.bed))) errors.push('Pick a valid bedtime.');
    if (errors.length) return errors;
    var n = normalise(p);
    var awake = n.bed - n.wake;
    if (DAY - awake < 300) errors.push('That leaves less than 5 hours of sleep. Move bedtime earlier or wake-up later.');
    if (DAY - awake > 720) errors.push('That is more than 12 hours of sleep. Check your wake-up and bedtime.');
    if (p.workStart || p.workEnd) {
      if (isNaN(toMin(p.workStart)) || isNaN(toMin(p.workEnd))) {
        errors.push('Enter both a start and an end time for your commitment.');
      } else if (toMin(p.workStart) === toMin(p.workEnd)) {
        errors.push('Your commitment starts and ends at the same time.');
      } else {
        var c = n.commit;
        if (c.end - c.start > 960) errors.push('A commitment longer than 16 hours leaves no room to plan.');
        if (c.start - n.commute < n.wake + 20) errors.push('Your commitment (plus commute) starts before your morning routine is done. Wake up earlier.');
        if (c.end + n.commute > n.bed - 30) errors.push('Your commitment (plus commute) runs into your wind-down time. Move bedtime later.');
      }
    }
    if (n.commute > 180) errors.push('Commute must be 3 hours or less each way.');
    return errors;
  }

  function Day(wake, bed) {
    this.wake = wake;
    this.bed = bed;
    this.blocks = [];
    this.warnings = [];
    this.seq = 0;
  }

  Day.prototype.isFree = function (start, dur) {
    if (start < this.wake || start + dur > this.bed) return false;
    for (var i = 0; i < this.blocks.length; i++) {
      var b = this.blocks[i];
      if (start < b.start + b.dur && b.start < start + dur) return false;
    }
    return true;
  };

  /** Earliest start in [earliest, latest - dur] where dur minutes are free, or null. */
  Day.prototype.findSlot = function (earliest, latest, dur) {
    earliest = Math.max(earliest, this.wake);
    latest = Math.min(latest, this.bed);
    var sorted = this.blocks.slice().sort(function (a, b) { return a.start - b.start; });
    var t = earliest;
    for (var i = 0; i < sorted.length; i++) {
      var b = sorted[i];
      if (b.start + b.dur <= t) continue;
      if (b.start >= t + dur) break;
      t = Math.max(t, b.start + b.dur);
    }
    return t + dur <= latest ? t : null;
  };

  /** Longest free gap inside [from, to]. */
  Day.prototype.largestGap = function (from, to) {
    var sorted = this.blocks.slice().sort(function (a, b) { return a.start - b.start; });
    var best = { start: from, len: 0 }, t = from;
    for (var i = 0; i < sorted.length; i++) {
      var b = sorted[i];
      if (b.start + b.dur <= t) continue;
      if (b.start >= to) break;
      if (b.start - t > best.len) best = { start: t, len: b.start - t };
      t = Math.max(t, b.start + b.dur);
    }
    if (to - t > best.len) best = { start: t, len: to - t };
    return best;
  };

  /** Latest free start in the window, stepping back 5 minutes at a time. */
  Day.prototype.placeLate = function (earliest, latest, dur, spec) {
    for (var t = Math.min(latest, this.bed) - dur; t >= Math.max(earliest, this.wake); t -= 5) {
      if (this.isFree(t, dur)) return this.add(t, dur, spec);
    }
    return null;
  };

  Day.prototype.add = function (start, dur, spec) {
    var block = {
      id: spec.kind + '-' + (++this.seq),
      kind: spec.kind,
      title: spec.title,
      desc: spec.desc || '',
      icon: spec.icon || '•',
      reason: spec.reason || '',
      start: start,
      dur: dur,
      task: spec.task !== false
    };
    this.blocks.push(block);
    return block;
  };

  /** Place in the first free slot in the window. Returns the block, or null and a warning. */
  Day.prototype.place = function (earliest, latest, dur, spec, warning) {
    var s = this.findSlot(earliest, latest, dur);
    if (s === null) {
      if (warning) this.warnings.push(warning);
      return null;
    }
    return this.add(s, dur, spec);
  };

  function goalSession(goal, desc, when) {
    var d = desc || 'your goal';
    var map = {
      fitness: { title: 'Training Plan', desc: 'Plan and log: ' + d, icon: '📈', reason: 'Tracking training makes progress visible and keeps load sensible.' },
      study: { title: 'Deep Study', desc: 'Study: ' + d, icon: '🧠', reason: when === 'peak' ? 'Hardest material goes in your sharpest hours.' : 'Review and practice questions outside peak hours.' },
      coding: { title: 'Deep Coding', desc: 'Build: ' + d, icon: '💻', reason: '50-minute blocks are long enough for flow, short enough to stay sharp.' },
      business: { title: when === 'peak' ? 'Revenue Work' : 'Build & Improve', desc: d, icon: when === 'peak' ? '💰' : '🛠️', reason: 'Work that earns money goes first, operations after.' },
      creative: { title: when === 'peak' ? 'Creative Work' : 'Refine & Polish', desc: d, icon: '🎨', reason: 'Create in peak hours, edit outside them.' },
      productivity: { title: 'Deep Work', desc: 'Focus: ' + d, icon: '🎯', reason: 'Your most important task in your best hours.' },
      mental: { title: 'Self-Care', desc: d, icon: '💚', reason: 'Small daily care beats one big effort.' },
      custom: { title: 'Goal Work', desc: d, icon: '🎯', reason: 'Focused, time-boxed progress on your goal.' }
    };
    return map[goal] || map.custom;
  }

  /**
   * Builds one day. Throws if the profile is invalid, so call validate() first.
   * Returns { blocks: [...sorted], warnings: [...], wake, bed, focusMinutes }.
   */
  function build(p) {
    var errors = validate(p);
    if (errors.length) throw new Error(errors.join(' '));
    var n = normalise(p);
    var day = new Day(n.wake, n.bed);
    var prefs = p.prefs || [];
    var has = function (x) { return prefs.indexOf(x) !== -1; };
    var w = n.wake, b = n.bed;
    var lastFocusEnd = b - 60;

    // 1. Fixed anchors
    day.add(w, 20, { kind: 'routine', title: 'Morning Routine', desc: 'Water, freshen up, pick today\'s one priority. No phone yet.', icon: '☀️', reason: 'Starting without your phone keeps the morning yours.' });
    day.add(b - 30, 15, { kind: 'wind', title: 'Review Day', desc: 'What got done? Move anything unfinished to tomorrow.', icon: '📝', reason: 'Closing the day stops tasks circling in your head at night.' });
    day.add(b - 15, 15, { kind: 'wind', title: 'Wind Down', desc: 'Screens off, lights low. Lights out at ' + clock(b) + '.', icon: '🌙', reason: 'Bright screens late delay sleep.' });

    if (n.commit) {
      var c = n.commit;
      var label = { student: 'Classes', working: 'Work', parttime: 'Shift' }[p.lifestyle] || 'Commitment';
      if (n.commute > 0) day.add(c.start - n.commute, n.commute, { kind: 'commute', title: 'Commute', desc: 'Podcast, audiobook or flashcards.', icon: '🚗', task: false });
      day.add(c.start, c.end - c.start, { kind: 'commit', title: label, desc: clock(c.start) + ' – ' + clock(c.end), icon: '💼', reason: 'Fixed. Everything else is planned around it.', task: false });
      if (n.commute > 0) day.add(c.end, n.commute, { kind: 'commute', title: 'Commute Back', desc: 'Decompress. No work email.', icon: '🚗', task: false });
    }

    // 2. Morning habits, before breakfast
    var morningLimit = w + 180;
    if (has('meditation')) day.place(w + 20, morningLimit, 15, { kind: 'habit', title: 'Meditation', desc: 'Sit, breathe, 15 minutes.', icon: '🧘', reason: 'Early is the time it most often actually happens.' });
    if (has('journal')) day.place(w + 20, morningLimit, 10, { kind: 'habit', title: 'Journaling', desc: 'Thoughts, plan, one thing you are grateful for.', icon: '📝' });

    var wantsWorkout = has('morning-workout') || has('evening-workout') || p.goal === 'fitness';
    var eveningWorkout = has('evening-workout') && !has('morning-workout');
    var workoutSpec = { kind: 'habit', title: 'Workout', desc: p.goal === 'fitness' && p.desc ? 'Train: ' + p.desc : 'Warm up, train, stretch.', icon: '💪', reason: 'A fixed slot turns exercise into a habit.' };
    var workoutDone = false;
    if (wantsWorkout && !eveningWorkout) {
      workoutDone = !!day.place(w + 20, w + 240, 45, workoutSpec);
      if (!workoutDone) day.warnings.push('No 45-minute gap for a morning workout, so it moves to the evening.');
    }

    // 3. Meals
    var breakfast = day.place(w + 20, w + 150, 20, { kind: 'meal', title: 'Breakfast', desc: 'Protein and slow carbs.', icon: '🍳', reason: 'Protein in the morning prevents the mid-morning crash.' },
      'No room for breakfast at home. Eat on the way.');
    var breakfastEnd = breakfast ? breakfast.start + breakfast.dur : w + 60;

    var lunchEarliest = Math.max(720, breakfastEnd + 180);
    var lunchLatest = Math.max(lunchEarliest + 90, 900);
    var lunch = null;
    if (n.commit && n.commit.start <= lunchEarliest && n.commit.end >= lunchEarliest + 90) {
      day.warnings.push('Lunch falls during your ' + ({ student: 'classes', working: 'work', parttime: 'shift' }[p.lifestyle] || 'commitment') + '. Eat there, around ' + clock(lunchEarliest) + '.');
    } else {
      lunch = day.place(lunchEarliest, lunchLatest, 30, { kind: 'meal', title: 'Lunch', desc: 'Protein, veg, slow carbs. Keep it light.', icon: '🍽️', reason: 'A light lunch softens the afternoon dip.' },
        'No 30-minute gap for lunch between ' + clock(lunchEarliest) + ' and ' + clock(lunchLatest) + '.');
    }
    var lunchEnd = lunch ? lunch.start + lunch.dur : lunchEarliest + 30;

    var dinnerEarliest = Math.max(1110, lunchEnd + 240);
    var dinnerLatest = b - 150;
    var dinner = null;
    if (dinnerLatest >= dinnerEarliest + 30) {
      dinner = day.place(dinnerEarliest, dinnerLatest, 30, { kind: 'meal', title: 'Dinner', desc: 'Lighter than lunch.', icon: '🍽️', reason: 'Finishing dinner 2.5 hours before bed helps you sleep.' });
    }
    if (!dinner) {
      dinner = day.place(Math.min(dinnerEarliest, b - 120), b - 60, 30, { kind: 'meal', title: 'Dinner', desc: 'Keep it light, bed is close.', icon: '🍽️', reason: 'A late, light dinner beats skipping it.' },
        'No room for dinner before bed. Add a snack instead.');
      if (dinner) day.warnings.push('Dinner is less than 2.5 hours before bed. Keep it light.');
    }
    var dinnerStart = dinner ? dinner.start : b - 150;
    var dinnerEnd = dinner ? dinner.start + dinner.dur : b - 120;

    if (has('cooking')) day.place(dinnerStart - 60, dinnerStart, 30, { kind: 'habit', title: 'Meal Prep', desc: 'Cook dinner plus tomorrow\'s lunch.', icon: '👨‍🍳' },
      'No time to meal-prep before dinner today.');

    // 4. Evening workout, needs to finish 2 hours before bed
    if (wantsWorkout && !workoutDone) {
      var ew = day.place(Math.max(960, w + 60), dinnerStart, 45, workoutSpec) || day.place(dinnerEnd + 60, b - 120, 45, workoutSpec);
      if (!ew) day.warnings.push('No 45-minute slot for a workout today that ends 2 hours before bed.');
    }

    // 5. Goal focus sessions in peak hours first. 50 minutes on, 10 off, and a 25-minute break after every third session.
    var cap = Math.min(FOCUS_CAP[p.lifestyle] || 180, GOAL_FOCUS_CAP[p.goal] || 999);
    var focusFrom = w + 20, focusTo = lastFocusEnd;
    var focusMinutes = 0, sessions = 0;
    function fillFocus(from, to, when) {
      var guard = 0;
      while (focusMinutes < cap && guard++ < 20) {
        var len = Math.min(SESSION, cap - focusMinutes);
        if (len < MIN_SESSION) return;
        var slot = day.findSlot(from, to, len);
        if (slot === null) {
          var gap = day.largestGap(from, to);
          if (gap.len < MIN_SESSION) return;
          slot = gap.start;
          len = Math.min(len, gap.len);
        }
        var g = goalSession(p.goal, p.desc, when);
        day.add(slot, len, { kind: 'focus', title: g.title, desc: g.desc, icon: g.icon, reason: g.reason });
        focusMinutes += len;
        sessions++;
        var rest = sessions % 3 === 0 ? LONG_BREAK : BREAK;
        if (day.isFree(slot + len, rest)) {
          day.add(slot + len, rest, { kind: 'break', title: rest === LONG_BREAK ? 'Long Break' : 'Break', desc: rest === LONG_BREAK ? 'Three sessions done. Step away properly.' : 'Stand up, water, look away from the screen.', icon: '🚶', task: false });
        }
      }
    }
    var peak = PEAKS[p.productivity];
    if (peak) fillFocus(Math.max(peak[0], focusFrom), Math.min(peak[1], focusTo), 'peak');

    // 6. Chosen activities: walk after lunch, the rest in the evening, reading last before the wind-down
    var eveningFrom = dinnerEnd, eveningTo = b - 30;
    var evening = [
      ['walks', 20, { kind: 'habit', title: 'Walk', desc: 'Outside, no headphones if you can.', icon: '🚶' }],
      ['family', 30, { kind: 'habit', title: 'Family Time', desc: 'Phones away.', icon: '👨‍👩‍👧' }],
      ['social', 30, { kind: 'habit', title: 'Social Time', desc: 'Call or meet a friend.', icon: '💬' }],
      ['music', 20, { kind: 'habit', title: 'Music Practice', desc: 'Play, slowly and properly.', icon: '🎵' }],
      ['reading', 30, { kind: 'habit', title: 'Reading', desc: 'A physical book if you have one.', icon: '📖', reason: 'Reading is a calm last activity before the wind-down.' }],
      ['gaming', 30, { kind: 'habit', title: 'Gaming', desc: 'Guilt-free. Timer on.', icon: '🎮' }],
      ['free', 30, { kind: 'habit', title: 'Free Time', desc: 'Anything you like.', icon: '🛋️' }]
    ];
    evening.forEach(function (e) {
      if (!has(e[0])) return;
      var placed = e[0] === 'walks' && lunch ? day.place(lunchEnd, lunchEnd + 120, e[1], e[2]) : null;
      if (!placed && e[0] === 'reading') placed = day.placeLate(eveningFrom, eveningTo, e[1], e[2]);
      if (!placed) placed = day.place(eveningFrom, eveningTo, e[1], e[2]) || day.place(w + 20, eveningTo, e[1], e[2]);
      if (!placed) day.warnings.push('No room for ' + e[2].title.toLowerCase() + ' today.');
    });

    // 7. Any focus time still owed goes into the remaining free time
    fillFocus(focusFrom, focusTo, peak ? 'other' : 'peak');
    if (focusMinutes < Math.min(cap, 50)) day.warnings.push('Only ' + duration(focusMinutes) + ' of focused goal time fits today. Look for something to drop.');

    var blocks = day.blocks.sort(function (a, b2) { return a.start - b2.start; });
    return { blocks: blocks, warnings: day.warnings, wake: w, bed: b, focusMinutes: focusMinutes };
  }

  // ---------- Time rules for ticking tasks ----------

  var GRACE = 15;

  /**
   * upcoming: not started yet, cannot be ticked
   * active:   in its window, can be ticked
   * overdue:  window passed, can still be ticked before bed but counts as late
   * closed:   the day is over (past bedtime), cannot be ticked
   */
  function taskStatus(block, now, bed) {
    if (now >= bed) return 'closed';
    if (now < block.start) return 'upcoming';
    if (now < block.start + block.dur) return 'active';
    return 'overdue';
  }

  function isOnTime(block, doneAt) {
    return doneAt <= block.start + block.dur + GRACE;
  }

  // ---------- Calendar helpers (local time, never UTC) ----------

  function dateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function addDays(key, n) {
    var p = key.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }

  function daysBetween(fromKey, toKey) {
    var a = fromKey.split('-'), b = toKey.split('-');
    var da = Date.UTC(+a[0], +a[1] - 1, +a[2]), db = Date.UTC(+b[0], +b[1] - 1, +b[2]);
    return Math.round((db - da) / 86400000);
  }

  /**
   * Where are we on the planner's own clock? A night owl who sleeps at 01:00 is still on
   * yesterday's plan at 00:30, so that time maps to minute 1470 of yesterday's day.
   */
  function plannerNow(date, wake, bed) {
    var m = date.getHours() * 60 + date.getMinutes();
    var today = dateKey(date);
    if (m < wake && bed > DAY && m + DAY < bed + 60) return { key: addDays(today, -1), minute: m + DAY };
    return { key: today, minute: m };
  }

  /** Consecutive fully-completed days, counting back from today (or yesterday if today isn't finished yet). */
  function computeStreak(daily, todayKey) {
    var key = daily[todayKey] && daily[todayKey].pct === 100 ? todayKey : addDays(todayKey, -1);
    var streak = 0;
    while (daily[key] && daily[key].pct === 100) {
      streak++;
      key = addDays(key, -1);
    }
    return streak;
  }

  /**
   * Mission status from real behaviour: average completion over the last 7 planner days
   * (days with no record count as 0) plus today's on-time rate for tasks already due.
   */
  function missionStatus(daily, todayKey, startKey, todayDone, todayDue) {
    var scores = [];
    for (var i = 1; i <= 7; i++) {
      var k = addDays(todayKey, -i);
      if (startKey && daysBetween(startKey, k) < 0) break;
      scores.push(daily[k] ? daily[k].pct : 0);
    }
    if (todayDue > 0) scores.push(Math.round((todayDone / todayDue) * 100));
    if (!scores.length) return { label: 'Just Started', cls: 'on-track', score: null };
    var avg = Math.round(scores.reduce(function (a, x) { return a + x; }, 0) / scores.length);
    if (avg >= 90) return { label: 'Ahead of Schedule', cls: 'ahead', score: avg };
    if (avg >= 70) return { label: 'On Track', cls: 'on-track', score: avg };
    if (avg >= 45) return { label: 'Catching Up', cls: 'catching-up', score: avg };
    return { label: 'Behind Schedule', cls: 'behind', score: avg };
  }

  var api = {
    toMin: toMin, clock: clock, duration: duration, validate: validate, build: build,
    taskStatus: taskStatus, isOnTime: isOnTime, GRACE: GRACE,
    dateKey: dateKey, addDays: addDays, daysBetween: daysBetween, plannerNow: plannerNow,
    computeStreak: computeStreak, missionStatus: missionStatus
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Scheduler = api;
})(this);
