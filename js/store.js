/* Gym Tracker – data model, persistence and statistics (no DOM access). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GymStore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'gymtracker.v1';

  // Fixed order: this is the order muscle groups are listed in everywhere.
  const MUSCLES = [
    { id: 'brust', label: 'Brust' },
    { id: 'ruecken', label: 'Rücken' },
    { id: 'schultern', label: 'Schultern' },
    { id: 'bizeps', label: 'Bizeps' },
    { id: 'trizeps', label: 'Trizeps' },
    { id: 'unterarme', label: 'Unterarme' },
    { id: 'bauch', label: 'Bauch' },
    { id: 'beine', label: 'Beine' },
    { id: 'gesaess', label: 'Gesäß' },
    { id: 'waden', label: 'Waden' },
    { id: 'cardio', label: 'Cardio' },
    { id: 'sonstiges', label: 'Sonstiges' },
  ];
  const MUSCLE_IDS = new Set(MUSCLES.map((m) => m.id));

  // What an entry of an exercise records:
  //   weight – weight (kg) and repetitions      reps – repetitions only (e.g. push-ups)
  //   cardio – duration (minutes) and, optionally, speed (km/h)
  const TYPES = ['weight', 'reps', 'cardio'];

  const SAMPLE_EXERCISES = [
    ['Bankdrücken', 'brust'], ['Schrägbankdrücken', 'brust'], ['Butterfly', 'brust'], ['Liegestütze', 'brust', 'reps'],
    ['Latzug', 'ruecken'], ['Klimmzüge', 'ruecken'], ['Rudern am Kabel', 'ruecken'], ['Kreuzheben', 'ruecken'],
    ['Schulterdrücken', 'schultern'], ['Seitheben', 'schultern'],
    ['Bizepscurls', 'bizeps'], ['Hammercurls', 'bizeps'],
    ['Trizepsdrücken am Kabel', 'trizeps'], ['Dips', 'trizeps'],
    ['Crunches', 'bauch'], ['Beinheben', 'bauch'],
    ['Kniebeugen', 'beine'], ['Beinpresse', 'beine'], ['Beinstrecker', 'beine'], ['Beinbeuger', 'beine'],
    ['Hip Thrust', 'gesaess'],
    ['Wadenheben', 'waden'],
    ['Laufband', 'cardio', 'cardio'], ['Fahrrad-Ergometer', 'cardio', 'cardio'], ['Crosstrainer', 'cardio', 'cardio'],
  ];

  // ---------- dates (local calendar days as 'YYYY-MM-DD' keys) ----------

  const pad = (n) => String(n).padStart(2, '0');

  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function isDateKey(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    return dateKey(parseKey(key)) === key;
  }

  function addDays(key, n) {
    const d = parseKey(key);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }

  // Days since the Unix epoch; calendar-based, so unaffected by daylight saving.
  function dayNumber(key) {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
  }

  function keyFromDayNumber(n) {
    const d = new Date(n * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function diffDays(a, b) {
    return dayNumber(b) - dayNumber(a);
  }

  // Weeks start on Monday.
  function weekStart(key) {
    const d = parseKey(key);
    return addDays(key, -((d.getDay() + 6) % 7));
  }

  function isoWeek(key) {
    const [y, m, d] = key.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
    return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  }

  function addMonths(month, n) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  // ---------- persistence ----------

  function emptyState() {
    return { version: 1, exercises: [], sets: [] };
  }

  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function cleanName(name) {
    return String(name).trim().replace(/\s+/g, ' ').slice(0, 60);
  }

  // The values of one entry for the given exercise type, or null if they make no sense.
  // Fields a type does not use are stored as 0 so that sums never see undefined.
  function cleanEntry(type, raw) {
    if (type === 'cardio') {
      const minutes = Number(raw.minutes);
      const speed = raw.speed == null || raw.speed === '' ? null : Number(raw.speed);
      if (!Number.isFinite(minutes) || minutes <= 0) return null;
      if (speed != null && (!Number.isFinite(speed) || speed <= 0)) return null;
      return { weight: 0, reps: 0, minutes, speed };
    }
    const weight = type === 'reps' ? 0 : Number(raw.weight);
    const reps = Number(raw.reps);
    if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 1) return null;
    return { weight, reps };
  }

  // Validates untrusted data (storage or an imported file) and returns a clean state.
  // Throws when the overall shape is wrong; silently drops individual broken records.
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.exercises) || !Array.isArray(raw.sets)) {
      throw new Error('Ungültiges Datenformat');
    }
    const exercises = [];
    const exerciseIds = new Set();
    for (const e of raw.exercises) {
      if (!e || typeof e.id !== 'string' || !e.id || typeof e.name !== 'string') continue;
      const name = cleanName(e.name);
      if (!name || exerciseIds.has(e.id)) continue;
      exerciseIds.add(e.id);
      exercises.push({
        id: e.id,
        name,
        muscle: MUSCLE_IDS.has(e.muscle) ? e.muscle : 'sonstiges',
        type: TYPES.includes(e.type) ? e.type : 'weight', // data from before types existed is weight training
        createdAt: Number(e.createdAt) || 0,
      });
    }
    const typeOf = new Map(exercises.map((e) => [e.id, e.type]));
    const sets = [];
    const setIds = new Set();
    for (const s of raw.sets) {
      if (!s || typeof s.id !== 'string' || !s.id || setIds.has(s.id)) continue;
      if (!exerciseIds.has(s.exerciseId) || !isDateKey(s.date)) continue;
      const values = cleanEntry(typeOf.get(s.exerciseId), s);
      if (!values) continue;
      setIds.add(s.id);
      sets.push(Object.assign({ id: s.id, exerciseId: s.exerciseId, date: s.date, ts: Number(s.ts) || 0 }, values));
    }
    return { version: 1, exercises, sets };
  }

  function load(storage) {
    const store = storage || localStorage;
    let raw = null;
    try {
      raw = store.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return normalize(JSON.parse(raw));
    } catch (err) {
      // Keep unreadable data around instead of overwriting it with the next save.
      try {
        if (raw) store.setItem(STORAGE_KEY + '.corrupt-' + Date.now(), raw);
      } catch (e) { /* nothing more we can do */ }
      return emptyState();
    }
  }

  function save(state, storage) {
    try {
      (storage || localStorage).setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  // ---------- exercises ----------

  function getExercise(state, id) {
    return state.exercises.find((e) => e.id === id) || null;
  }

  function findExerciseByName(state, name, exceptId) {
    const needle = cleanName(name).toLowerCase();
    return state.exercises.find((e) => e.id !== exceptId && e.name.toLowerCase() === needle) || null;
  }

  function addExercise(state, { name, muscle, type }) {
    const exercise = {
      id: uid(),
      name: cleanName(name),
      muscle: MUSCLE_IDS.has(muscle) ? muscle : 'sonstiges',
      type: TYPES.includes(type) ? type : 'weight',
      createdAt: Date.now(),
    };
    state.exercises.push(exercise);
    return exercise;
  }

  // The type can only change while the exercise has no entries: they would lose their meaning.
  function updateExercise(state, id, { name, muscle, type }) {
    const exercise = getExercise(state, id);
    if (!exercise) return null;
    if (name != null) exercise.name = cleanName(name);
    if (muscle != null && MUSCLE_IDS.has(muscle)) exercise.muscle = muscle;
    if (TYPES.includes(type) && !state.sets.some((s) => s.exerciseId === id)) exercise.type = type;
    return exercise;
  }

  // Removes the exercise together with all of its logged sets.
  function deleteExercise(state, id) {
    state.exercises = state.exercises.filter((e) => e.id !== id);
    state.sets = state.sets.filter((s) => s.exerciseId !== id);
  }

  function addSamples(state) {
    let added = 0;
    for (const [name, muscle, type] of SAMPLE_EXERCISES) {
      if (findExerciseByName(state, name)) continue;
      addExercise(state, { name, muscle, type });
      added++;
    }
    return added;
  }

  // Exercises grouped by muscle group (fixed group order, names A–Z); empty groups are left out.
  function groupedExercises(state) {
    const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
    return MUSCLES.map((muscle) => ({
      muscle,
      exercises: state.exercises
        .filter((e) => e.muscle === muscle.id)
        .sort((a, b) => collator.compare(a.name, b.name)),
    })).filter((g) => g.exercises.length);
  }

  // ---------- sets ----------

  const byTs = (a, b) => a.ts - b.ts;

  // `values` holds the fields of the exercise's type: { weight, reps }, { reps } or { minutes, speed }.
  function addSet(state, { exerciseId, date }, values) {
    const exercise = getExercise(state, exerciseId);
    const clean = exercise && cleanEntry(exercise.type, values);
    if (!clean) return null;
    const set = Object.assign({ id: uid(), exerciseId, date, ts: Date.now() }, clean);
    state.sets.push(set);
    return set;
  }

  function updateSet(state, id, values) {
    const set = state.sets.find((s) => s.id === id);
    const exercise = set && getExercise(state, set.exerciseId);
    const clean = exercise && cleanEntry(exercise.type, values);
    if (!clean) return null;
    return Object.assign(set, clean);
  }

  function deleteSet(state, id) {
    state.sets = state.sets.filter((s) => s.id !== id);
  }

  function restoreSet(state, set) {
    if (!getExercise(state, set.exerciseId) || state.sets.some((s) => s.id === set.id)) return false;
    state.sets.push(set);
    return true;
  }

  function deleteDayExercise(state, exerciseId, date) {
    state.sets = state.sets.filter((s) => !(s.exerciseId === exerciseId && s.date === date));
  }

  // ---------- queries ----------

  // All sets of one day, grouped per exercise in the order the exercises were started.
  function daySets(state, date) {
    const map = new Map();
    for (const s of state.sets) {
      if (s.date !== date) continue;
      if (!map.has(s.exerciseId)) map.set(s.exerciseId, []);
      map.get(s.exerciseId).push(s);
    }
    const out = [];
    for (const [exerciseId, sets] of map) out.push({ exerciseId, sets: sets.sort(byTs) });
    return out.sort((a, b) => byTs(a.sets[0], b.sets[0]));
  }

  // Estimated one-rep max (Epley).
  function epley(weight, reps) {
    return reps <= 1 ? weight : weight * (1 + reps / 30);
  }

  // One entry per training day of an exercise, oldest first.
  function exerciseSessions(state, exerciseId) {
    const byDate = new Map();
    for (const s of state.sets) {
      if (s.exerciseId !== exerciseId) continue;
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date).push(s);
    }
    return [...byDate.keys()].sort().map((date) => {
      const sets = byDate.get(date).sort(byTs);
      let maxWeight = 0, e1rm = 0, volume = 0, maxReps = 0, totalReps = 0, minutes = 0, maxSpeed = 0, distance = 0;
      for (const s of sets) {
        maxWeight = Math.max(maxWeight, s.weight);
        e1rm = Math.max(e1rm, epley(s.weight, s.reps));
        volume += s.weight * s.reps;
        maxReps = Math.max(maxReps, s.reps);
        totalReps += s.reps;
        // cardio entries
        minutes += s.minutes || 0;
        maxSpeed = Math.max(maxSpeed, s.speed || 0);
        distance += ((s.minutes || 0) / 60) * (s.speed || 0); // km, only where a speed was logged
      }
      return { date, sets, maxWeight, e1rm, volume, maxReps, totalReps, minutes, maxSpeed, distance };
    });
  }

  function lastSessionBefore(state, exerciseId, date) {
    let last = null;
    for (const s of state.sets) {
      if (s.exerciseId === exerciseId && s.date < date && (!last || s.date > last)) last = s.date;
    }
    if (!last) return null;
    const sets = state.sets.filter((s) => s.exerciseId === exerciseId && s.date === last).sort(byTs);
    return { date: last, sets };
  }

  // The set that beats the best weight of all earlier days, or null.
  function prSetId(state, exerciseId, date) {
    let before = null;
    const today = [];
    for (const s of state.sets) {
      if (s.exerciseId !== exerciseId) continue;
      if (s.date < date) before = before == null ? s.weight : Math.max(before, s.weight);
      else if (s.date === date) today.push(s);
    }
    if (before == null) return null;
    let best = null;
    for (const s of today.sort(byTs)) {
      if (s.weight > before && (!best || s.weight > best.weight)) best = s;
    }
    return best ? best.id : null;
  }

  // Per exercise: number of training days, last day with its top set, best weight.
  function summaries(state) {
    const map = new Map();
    for (const s of state.sets) {
      let sum = map.get(s.exerciseId);
      if (!sum) {
        sum = { dates: new Set(), lastDate: s.date, lastTop: s, bestWeight: s.weight };
        map.set(s.exerciseId, sum);
      }
      sum.dates.add(s.date);
      sum.bestWeight = Math.max(sum.bestWeight, s.weight);
      const better = s.weight > sum.lastTop.weight || (s.weight === sum.lastTop.weight && s.reps > sum.lastTop.reps);
      if (s.date > sum.lastDate) {
        sum.lastDate = s.date;
        sum.lastTop = s;
      } else if (s.date === sum.lastDate && better) {
        sum.lastTop = s;
      }
    }
    for (const sum of map.values()) {
      sum.sessions = sum.dates.size;
      delete sum.dates;
    }
    return map;
  }

  // ---------- gym visits (a day counts as soon as it has at least one logged set) ----------

  function visitDates(state) {
    return [...new Set(state.sets.map((s) => s.date))].sort();
  }

  function hasVisit(state, date) {
    return state.sets.some((s) => s.date === date);
  }

  // The how-manyth visit of its week the given day is (1-based).
  function visitNumberInWeek(state, date) {
    const start = weekStart(date);
    return visitDates(state).filter((d) => d >= start && d <= date).length;
  }

  function visitStats(state, today) {
    const dates = visitDates(state);
    const thisWeek = weekStart(today);
    const lastWeek = addDays(thisWeek, -7);
    const thisMonth = today.slice(0, 7);
    const lastMonth = addMonths(thisMonth, -1);
    const weeks = new Set();
    let week = 0, prevWeek = 0, month = 0, prevMonth = 0;
    for (const d of dates) {
      const w = weekStart(d);
      weeks.add(w);
      if (w === thisWeek) week++;
      else if (w === lastWeek) prevWeek++;
      const m = d.slice(0, 7);
      if (m === thisMonth) month++;
      else if (m === lastMonth) prevMonth++;
    }
    // Consecutive weeks with a visit. A current week without a visit yet does not break the streak.
    let streakWeeks = 0;
    let cursor = weeks.has(thisWeek) ? thisWeek : lastWeek;
    while (weeks.has(cursor)) {
      streakWeeks++;
      cursor = addDays(cursor, -7);
    }
    let avgPerWeek = 0;
    if (dates.length) {
      const spanWeeks = Math.round(diffDays(weekStart(dates[0]), thisWeek) / 7) + 1;
      avgPerWeek = dates.length / Math.max(1, spanWeeks);
    }
    return {
      total: dates.length, week, prevWeek, month, prevMonth, streakWeeks, avgPerWeek,
      first: dates[0] || null,
    };
  }

  // Visit counts for the last n weeks, oldest first, ending with the current week.
  function weeklyVisits(state, today, n) {
    const counts = new Map();
    for (const d of visitDates(state)) {
      const w = weekStart(d);
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    const current = weekStart(today);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = addDays(current, -7 * i);
      out.push({ start, end: addDays(start, 6), isoWeek: isoWeek(start), count: counts.get(start) || 0 });
    }
    return out;
  }

  // Logged sets per muscle group within [from, to] (either bound may be null), most sets first.
  function muscleSetCounts(state, from, to) {
    const muscleOf = new Map(state.exercises.map((e) => [e.id, e.muscle]));
    const counts = new Map();
    for (const s of state.sets) {
      if ((from && s.date < from) || (to && s.date > to)) continue;
      const m = muscleOf.get(s.exerciseId);
      counts.set(m, (counts.get(m) || 0) + 1);
    }
    return MUSCLES.filter((m) => counts.has(m.id))
      .map((m) => ({ id: m.id, label: m.label, count: counts.get(m.id) }))
      .sort((a, b) => b.count - a.count);
  }

  return {
    STORAGE_KEY, MUSCLES, TYPES, SAMPLE_EXERCISES,
    dateKey, todayKey, parseKey, isDateKey, addDays, diffDays, dayNumber, keyFromDayNumber,
    weekStart, isoWeek, addMonths,
    emptyState, normalize, load, save,
    getExercise, findExerciseByName, addExercise, updateExercise, deleteExercise, addSamples, groupedExercises,
    addSet, updateSet, deleteSet, restoreSet, deleteDayExercise,
    daySets, epley, exerciseSessions, lastSessionBefore, prSetId, summaries,
    visitDates, hasVisit, visitNumberInWeek, visitStats, weeklyVisits, muscleSetCounts,
  };
});
