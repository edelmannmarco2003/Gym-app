// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/store.js');

function seed() {
  const state = S.emptyState();
  const bench = S.addExercise(state, { name: 'Bankdrücken', muscle: 'brust' });
  const squat = S.addExercise(state, { name: 'Kniebeugen', muscle: 'beine' });
  let ts = 1;
  const log = (ex, date, weight, reps) => {
    const set = S.addSet(state, { exerciseId: ex.id, date, weight, reps });
    set.ts = ts++;
    return set;
  };
  return { state, bench, squat, log };
}

test('date helpers use Monday-based weeks and survive month and year borders', () => {
  assert.equal(S.weekStart('2026-11-12'), '2026-11-09'); // Thursday -> Monday
  assert.equal(S.weekStart('2026-11-09'), '2026-11-09');
  assert.equal(S.weekStart('2026-11-15'), '2026-11-09'); // Sunday belongs to the same week
  assert.equal(S.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(S.addDays('2026-03-29', 1), '2026-03-30'); // daylight-saving switch in Europe
  assert.equal(S.diffDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(S.addMonths('2026-01', -1), '2025-12');
  assert.equal(S.isoWeek('2026-11-12'), 46);
  assert.equal(S.isoWeek('2027-01-01'), 53);
  assert.equal(S.keyFromDayNumber(S.dayNumber('2026-11-12')), '2026-11-12');
  assert.ok(S.isDateKey('2026-02-28'));
  assert.ok(!S.isDateKey('2026-02-30'));
  assert.ok(!S.isDateKey('12.11.2026'));
});

test('a day counts as a gym visit as soon as it has one set', () => {
  const { state, bench, squat, log } = seed();
  assert.equal(S.hasVisit(state, '2026-11-12'), false);
  log(bench, '2026-11-12', 60, 10);
  log(bench, '2026-11-12', 60, 8);
  log(squat, '2026-11-12', 80, 5);
  assert.equal(S.hasVisit(state, '2026-11-12'), true);
  assert.deepEqual(S.visitDates(state), ['2026-11-12']); // several sets, still one visit
});

test('visit statistics: week, month, total, streak and average', () => {
  const { state, bench, log } = seed();
  // Weeks starting 2026-10-19, 10-26, 11-02 and 11-09; nothing in the week of 10-12.
  for (const d of ['2026-10-06', '2026-10-20', '2026-10-28', '2026-10-30', '2026-11-03', '2026-11-09', '2026-11-11']) {
    log(bench, d, 50, 10);
  }
  const stats = S.visitStats(state, '2026-11-12');
  assert.equal(stats.total, 7);
  assert.equal(stats.week, 2);
  assert.equal(stats.prevWeek, 1);
  assert.equal(stats.month, 3);
  assert.equal(stats.prevMonth, 4);
  assert.equal(stats.streakWeeks, 4);
  assert.equal(stats.first, '2026-10-06');
  assert.equal(stats.avgPerWeek, 7 / 6);
  assert.equal(S.visitNumberInWeek(state, '2026-11-11'), 2);
  assert.equal(S.visitNumberInWeek(state, '2026-11-09'), 1);
});

test('a week without a visit yet keeps the streak alive, a skipped week ends it', () => {
  const { state, bench, log } = seed();
  log(bench, '2026-10-27', 50, 10);
  log(bench, '2026-11-04', 50, 10);
  assert.equal(S.visitStats(state, '2026-11-10').streakWeeks, 2); // current week still open
  assert.equal(S.visitStats(state, '2026-11-17').streakWeeks, 0); // week of 11-09 was skipped
  assert.equal(S.visitStats(S.emptyState(), '2026-11-10').streakWeeks, 0);
});

test('weekly visit buckets end with the current week', () => {
  const { state, bench, log } = seed();
  log(bench, '2026-11-02', 50, 10);
  log(bench, '2026-11-10', 50, 10);
  log(bench, '2026-11-12', 50, 10);
  const weeks = S.weeklyVisits(state, '2026-11-12', 3);
  assert.deepEqual(weeks.map((w) => [w.start, w.end, w.count]), [
    ['2026-10-26', '2026-11-01', 0],
    ['2026-11-02', '2026-11-08', 1],
    ['2026-11-09', '2026-11-15', 2],
  ]);
});

test('sessions aggregate sets per day', () => {
  const { state, bench, log } = seed();
  log(bench, '2026-11-01', 60, 10);
  log(bench, '2026-11-01', 65, 6);
  log(bench, '2026-11-05', 70, 1);
  const [first, second] = S.exerciseSessions(state, bench.id);
  assert.equal(first.date, '2026-11-01');
  assert.equal(first.maxWeight, 65);
  assert.equal(first.maxReps, 10);
  assert.equal(first.volume, 60 * 10 + 65 * 6);
  assert.equal(first.e1rm, 60 * (1 + 10 / 30));
  assert.equal(second.e1rm, 70); // a single rep is the max itself
});

test('last session and weight records only look at earlier days', () => {
  const { state, bench, log } = seed();
  assert.equal(S.lastSessionBefore(state, bench.id, '2026-11-12'), null);
  log(bench, '2026-11-01', 60, 10);
  log(bench, '2026-11-05', 62.5, 8);
  const a = log(bench, '2026-11-12', 62.5, 8);
  assert.equal(S.prSetId(state, bench.id, '2026-11-12'), null); // equal is not a record
  const b = log(bench, '2026-11-12', 65, 5);
  log(bench, '2026-11-12', 65, 4);
  assert.equal(S.prSetId(state, bench.id, '2026-11-12'), b.id); // first set at the new best
  assert.notEqual(a.id, b.id);
  assert.equal(S.prSetId(state, bench.id, '2026-11-01'), null); // very first day has nothing to beat
  const last = S.lastSessionBefore(state, bench.id, '2026-11-12');
  assert.equal(last.date, '2026-11-05');
  assert.equal(last.sets.length, 1);
});

test('day view groups sets per exercise in the order they were started', () => {
  const { state, bench, squat, log } = seed();
  log(squat, '2026-11-12', 80, 5);
  log(bench, '2026-11-12', 60, 10);
  log(squat, '2026-11-12', 85, 5);
  log(bench, '2026-11-11', 60, 10);
  const day = S.daySets(state, '2026-11-12');
  assert.deepEqual(day.map((d) => d.exerciseId), [squat.id, bench.id]);
  assert.deepEqual(day[0].sets.map((s) => s.weight), [80, 85]);
});

test('exercises are grouped by muscle group in fixed order and sorted by name', () => {
  const state = S.emptyState();
  S.addExercise(state, { name: 'Kniebeugen', muscle: 'beine' });
  S.addExercise(state, { name: 'Butterfly', muscle: 'brust' });
  S.addExercise(state, { name: 'bankdrücken', muscle: 'brust' });
  const groups = S.groupedExercises(state);
  assert.deepEqual(groups.map((g) => g.muscle.id), ['brust', 'beine']);
  assert.deepEqual(groups[0].exercises.map((e) => e.name), ['bankdrücken', 'Butterfly']);
  assert.ok(S.findExerciseByName(state, '  BANKDRÜCKEN '));
  assert.equal(S.addSamples(state), S.SAMPLE_EXERCISES.length - 3);
});

test('deleting an exercise removes its sets and the visits that depended on them', () => {
  const { state, bench, squat, log } = seed();
  log(bench, '2026-11-01', 60, 10);
  log(squat, '2026-11-05', 80, 5);
  S.deleteExercise(state, bench.id);
  assert.deepEqual(S.visitDates(state), ['2026-11-05']);
  assert.equal(state.sets.length, 1);
});

test('deleted sets can be restored once', () => {
  const { state, bench, log } = seed();
  const set = log(bench, '2026-11-01', 60, 10);
  S.deleteSet(state, set.id);
  assert.equal(state.sets.length, 0);
  assert.equal(S.restoreSet(state, set), true);
  assert.equal(S.restoreSet(state, set), false);
  assert.equal(state.sets.length, 1);
});

test('muscle group totals respect the date range', () => {
  const { state, bench, squat, log } = seed();
  log(bench, '2026-10-01', 60, 10);
  log(bench, '2026-11-10', 60, 10);
  log(squat, '2026-11-10', 80, 5);
  log(squat, '2026-11-11', 80, 5);
  assert.deepEqual(S.muscleSetCounts(state, '2026-11-01', '2026-11-12').map((r) => [r.id, r.count]), [['beine', 2], ['brust', 1]]);
  assert.equal(S.muscleSetCounts(state, null, null).find((r) => r.id === 'brust').count, 2);
});

test('normalize drops broken records and rejects foreign files', () => {
  assert.throws(() => S.normalize({ foo: 1 }));
  assert.throws(() => S.normalize(null));
  const clean = S.normalize({
    exercises: [
      { id: 'a', name: '  Latzug  ', muscle: 'ruecken' },
      { id: 'a', name: 'Duplikat', muscle: 'ruecken' },
      { id: 'b', name: 'Unbekannte Gruppe', muscle: 'nope' },
      { id: 'c', name: '   ', muscle: 'brust' },
    ],
    sets: [
      { id: '1', exerciseId: 'a', date: '2026-11-01', weight: 50, reps: 10, ts: 5 },
      { id: '2', exerciseId: 'zzz', date: '2026-11-01', weight: 50, reps: 10 },
      { id: '3', exerciseId: 'a', date: '2026-13-01', weight: 50, reps: 10 },
      { id: '4', exerciseId: 'a', date: '2026-11-01', weight: -5, reps: 10 },
      { id: '5', exerciseId: 'a', date: '2026-11-01', weight: 50, reps: 0 },
      { id: '6', exerciseId: 'a', date: '2026-11-02', weight: '0', reps: 12 },
    ],
  });
  assert.deepEqual(clean.exercises.map((e) => [e.id, e.name, e.muscle]), [['a', 'Latzug', 'ruecken'], ['b', 'Unbekannte Gruppe', 'sonstiges']]);
  assert.deepEqual(clean.sets.map((s) => s.id), ['1', '6']);
  assert.equal(clean.sets[1].weight, 0);
});

test('load keeps a copy of unreadable data instead of overwriting it', () => {
  const data = new Map([[S.STORAGE_KEY, '{not json']]);
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v) };
  assert.deepEqual(S.load(storage), S.emptyState());
  assert.ok([...data.keys()].some((k) => k.startsWith(S.STORAGE_KEY + '.corrupt-')));

  const { state, bench, log } = seed();
  log(bench, '2026-11-01', 60, 10);
  assert.equal(S.save(state, storage), true);
  assert.deepEqual(S.load(storage), state);
});
