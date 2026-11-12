/* Gym Tracker – user interface. */
(function () {
  'use strict';

  const S = window.GymStore;
  const C = window.GymCharts;
  const UI_KEY = 'gymtracker.ui';
  const TAB_KEY = 'gymtracker.tab';

  const TABS = [
    { id: 'training', label: 'Training', icon: 'dumbbell' },
    { id: 'exercises', label: 'Übungen', icon: 'list' },
    { id: 'progress', label: 'Fortschritt', icon: 'chart' },
  ];

  const RANGES = [
    { id: '4w', label: '4 Wochen', days: 28, title: 'Letzte 4 Wochen' },
    { id: '3m', label: '3 Monate', days: 91, title: 'Letzte 3 Monate' },
    { id: '1y', label: '1 Jahr', days: 365, title: 'Letztes Jahr' },
    { id: 'all', label: 'Alles', days: null, title: 'Gesamter Zeitraum' },
  ];

  // ---------- formatting ----------

  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
  const fmtNum = (n) => nf2.format(n);

  const DF = {
    long: new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
    longYear: new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    short: new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }),
    shortYear: new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }),
    tick: new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' }),
    monthYear: new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }),
    monthShort: new Intl.DateTimeFormat('de-DE', { month: 'short', year: '2-digit' }),
  };
  const fmtDate = (style, key) => DF[style].format(S.parseKey(key));

  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  // Accepts "62,5" as well as "62.5".
  function parseNum(text) {
    const t = String(text).trim().replace(',', '.');
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  }
  const toInput = (n) => String(n).replace('.', ',');

  // Entry fields per exercise type.
  const FIELDS = {
    weight: { label: 'Gewicht', unit: 'kg', step: 2.5, inputmode: 'decimal', min: 0, max: 1000, error: 'Bitte ein Gewicht in kg eintragen (0 für Körpergewicht).' },
    reps: { label: 'Wiederholungen', unit: 'Wdh.', step: 1, inputmode: 'numeric', integer: true, min: 1, max: 1000, error: 'Bitte die Wiederholungen eintragen (mindestens 1).' },
    minutes: { label: 'Zeit', unit: 'Min.', step: 1, inputmode: 'decimal', min: 0.5, max: 1440, error: 'Bitte die Zeit in Minuten eintragen.' },
    speed: { label: 'Geschwindigkeit', unit: 'km/h', step: 0.5, inputmode: 'decimal', min: 0.1, max: 100, optional: true, error: 'Die Geschwindigkeit sieht nicht richtig aus – leer lassen, wenn du sie nicht brauchst.' },
  };
  const TYPE_FIELDS = { weight: ['weight', 'reps'], reps: ['reps'], cardio: ['minutes', 'speed'] };
  const TYPE_LABELS = {
    weight: 'Gewicht + Wiederholungen',
    reps: 'Nur Wiederholungen',
    cardio: 'Zeit (+ Geschwindigkeit)',
  };
  const TYPE_METRICS = { weight: ['weight', 'e1rm', 'volume', 'reps'], reps: ['reps', 'totalReps'], cardio: ['minutes', 'speed', 'distance'] };

  // One entry as text: "60 kg × 10", "20 Wdh.", "30 Min. · 10 km/h"
  function formatSet(type, s) {
    if (type === 'cardio') return fmtNum(s.minutes) + ' Min.' + (s.speed ? ' · ' + fmtNum(s.speed) + ' km/h' : '');
    if (type === 'reps') return s.reps + ' Wdh.';
    return fmtNum(s.weight) + ' kg × ' + s.reps;
  }

  // "60 kg × 10/9/8 · 65 kg × 6", "20/15/12 Wdh.", "30 Min. · 10 km/h"
  function summarizeSets(sets, type) {
    if (type === 'cardio') return sets.map((s) => formatSet(type, s)).join(' + ');
    if (type === 'reps') return sets.map((s) => s.reps).join('/') + ' Wdh.';
    const parts = [];
    for (const s of sets) {
      const last = parts[parts.length - 1];
      if (last && last.weight === s.weight) last.reps.push(s.reps);
      else parts.push({ weight: s.weight, reps: [s.reps] });
    }
    return parts.map((p) => fmtNum(p.weight) + ' kg × ' + p.reps.join('/')).join(' · ');
  }

  const METRICS = {
    weight: {
      label: 'Gewicht', title: 'Höchstes Gewicht pro Training, in kg',
      get: (s) => s.maxWeight, fmt: (v) => fmtNum(v) + ' kg', tick: (v) => fmtNum(v),
    },
    e1rm: {
      label: '1RM', title: 'Geschätzte Maximalkraft (1RM nach Epley), in kg',
      get: (s) => s.e1rm, fmt: (v) => nf1.format(v) + ' kg', tick: (v) => fmtNum(v),
    },
    volume: {
      label: 'Volumen', title: 'Bewegtes Gewicht pro Training (Gewicht × Wdh.)',
      get: (s) => s.volume, fmt: (v) => nf0.format(v) + ' kg',
      tick: (v, max) => (max >= 10000 ? nf1.format(v / 1000) + ' t' : nf0.format(v)),
    },
    reps: {
      label: 'Wdh.', title: 'Meiste Wiederholungen in einem Satz',
      get: (s) => s.maxReps, fmt: (v) => nf0.format(v) + ' Wdh.', tick: (v) => nf0.format(v), integer: true,
    },
    totalReps: {
      label: 'Gesamt', title: 'Wiederholungen pro Training insgesamt',
      get: (s) => s.totalReps, fmt: (v) => nf0.format(v) + ' Wdh.', tick: (v) => nf0.format(v), integer: true,
    },
    minutes: {
      label: 'Zeit', title: 'Zeit pro Training, in Minuten',
      get: (s) => s.minutes, fmt: (v) => nf1.format(v) + ' Min.', tick: (v) => fmtNum(v),
    },
    // Speed and distance only exist for trainings where a speed was entered.
    speed: {
      label: 'Tempo', title: 'Höchste Geschwindigkeit pro Training, in km/h',
      get: (s) => s.maxSpeed, has: (s) => s.maxSpeed > 0, fmt: (v) => nf1.format(v) + ' km/h', tick: (v) => fmtNum(v),
    },
    distance: {
      label: 'Strecke', title: 'Strecke pro Training (Zeit × Geschwindigkeit), in km',
      get: (s) => s.distance, has: (s) => s.maxSpeed > 0, fmt: (v) => nf2.format(v) + ' km', tick: (v) => fmtNum(v),
    },
  };

  // ---------- DOM helpers ----------

  const $ = (sel) => document.querySelector(sel);

  function append(el, children) {
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) append(el, c);
      else el.append(c); // strings become text nodes, so user text is never parsed as HTML
    }
  }

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    append(el, children);
    return el;
  }

  function fill(el, ...children) {
    el.replaceChildren();
    append(el, children);
  }

  const ICONS = {
    dumbbell: '<path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 4 3 5-7"/>',
    settings: '<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h8M16 18h4"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
    chevronRight: '<path d="M9 18l6-6-6-6"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
  };

  function icon(name, size) {
    const t = document.createElement('template');
    const px = size || 20;
    t.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="' + px + '" height="' + px +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICONS[name] + '</svg>';
    return t.content.firstChild;
  }

  // ---------- state ----------

  let state = S.load();

  function loadUi() {
    try {
      return JSON.parse(localStorage.getItem(UI_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  const saved = loadUi();
  const startDay = S.todayKey();
  const ui = {
    tab: 'training',
    date: startDay,          // day shown on the training tab
    today: startDay,         // calendar day the app last saw
    drafts: {},              // date -> exercise ids added to that day that have no set yet
    pending: {},             // "date|exerciseId" -> { weight, reps } typed but not logged yet
    calMonth: startDay.slice(0, 7),
    range: RANGES.some((r) => r.id === saved.range) ? saved.range : '3m',
    metrics: Object.assign({ weight: 'weight', reps: 'reps', cardio: 'minutes' }, saved.metrics), // chosen chart metric per type
    openGroups: new Set(),   // expanded muscle groups on the exercises tab
    progressExercise: saved.progressExercise || null,
    flashSet: null,
  };
  if (saved.drafts && Array.isArray(saved.drafts[startDay])) ui.drafts[startDay] = saved.drafts[startDay];

  function saveUi() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({
        drafts: ui.drafts, range: ui.range, metrics: ui.metrics, progressExercise: ui.progressExercise,
      }));
    } catch (e) { /* view preferences are not essential */ }
  }

  // Persist the data and redraw.
  function commit() {
    if (!S.save(state)) toast('Speichern fehlgeschlagen – der Browser-Speicher ist voll oder gesperrt.');
    render();
  }

  // ---------- toast ----------

  let toastTimer = null;

  function hideToast() {
    clearTimeout(toastTimer);
    $('#toast').classList.remove('show');
  }

  function toast(message, opts) {
    const el = $('#toast');
    const action = opts && opts.action;
    fill(el,
      h('span', null, message),
      action ? h('button', {
        class: 'toast-action', type: 'button',
        onclick: () => {
          hideToast();
          opts.onAction();
        },
      }, action) : null);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 6000 : 3200);
  }

  // ---------- sheet (bottom dialog) ----------

  const sheet = $('#sheet');
  let sheetPushed = false; // the open sheet owns a history entry, so "back" closes it
  let ignorePop = 0;

  function openSheet(title, body, foot) {
    fill(sheet,
      h('div', { class: 'sheet-head' },
        h('h2', { class: 'sheet-title', id: 'sheet-title' }, title),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Schließen', onclick: closeSheet }, icon('close'))),
      h('div', { class: 'sheet-body' }, body),
      foot ? h('div', { class: 'sheet-foot' }, foot) : null);
    if (!sheet.open) {
      sheet.showModal();
      try {
        history.pushState({ gymSheet: true }, '');
        sheetPushed = true;
      } catch (e) {
        sheetPushed = false;
      }
    }
  }

  function closeSheet() {
    if (!sheet.open) return;
    sheet.close();
    if (sheetPushed) {
      sheetPushed = false;
      ignorePop++;
      history.back();
    }
  }

  sheet.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeSheet();
  });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) closeSheet(); // tap on the backdrop
  });

  // ---------- confirm dialog ----------

  let cancelConfirm = null;

  function confirmDialog({ title, text, ok, danger }) {
    return new Promise((resolve) => {
      const dlg = $('#confirm');
      const done = (answer) => {
        cancelConfirm = null;
        dlg.close();
        resolve(answer);
      };
      cancelConfirm = () => done(false);
      fill(dlg,
        h('h2', { id: 'confirm-title' }, title),
        h('p', { id: 'confirm-text' }, text),
        h('div', { class: 'confirm-actions' },
          h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => done(false) }, 'Abbrechen'),
          h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button', onclick: () => done(true) }, ok)));
      dlg.oncancel = (e) => {
        e.preventDefault();
        done(false);
      };
      dlg.showModal();
    });
  }

  window.addEventListener('popstate', () => {
    if (ignorePop > 0) {
      ignorePop--;
      return;
    }
    if (cancelConfirm) cancelConfirm();
    if (sheet.open) {
      sheetPushed = false;
      sheet.close();
    }
  });

  // ---------- navigation ----------

  function switchTab(tab) {
    ui.tab = tab;
    try {
      sessionStorage.setItem(TAB_KEY, tab); // a reload returns to the same tab
    } catch (e) { /* storage may be unavailable */ }
    render();
    window.scrollTo(0, 0);
  }

  function goToDate(date) {
    ui.date = date > S.todayKey() ? S.todayKey() : date;
    render();
  }

  function showProgress(exerciseId) {
    ui.progressExercise = exerciseId;
    saveUi();
    switchTab('progress');
    const card = $('#exercise-progress');
    if (card) card.scrollIntoView({ block: 'start' });
  }

  // ---------- day drafts (exercises added to a day before their first set) ----------

  function addToDay(date, ids) {
    const logged = new Set(S.daySets(state, date).map((d) => d.exerciseId));
    const list = ui.drafts[date] || (ui.drafts[date] = []);
    for (const id of ids) if (!logged.has(id) && !list.includes(id)) list.push(id);
    saveUi();
  }

  function removeDraft(date, id) {
    if (!ui.drafts[date]) return;
    ui.drafts[date] = ui.drafts[date].filter((x) => x !== id);
    if (!ui.drafts[date].length) delete ui.drafts[date];
    saveUi();
  }

  // ---------- shared components ----------

  function stepper({ label, unit, value, step, inputmode, optional, onChange }) {
    const input = h('input', {
      class: 'stepper-input', type: 'text', inputmode, value, placeholder: optional ? 'optional' : '–',
      'aria-label': label + ' (' + unit + ')', autocomplete: 'off', enterkeyhint: 'done',
    });
    const changed = () => {
      el.classList.remove('invalid');
      if (onChange) onChange(input.value);
    };
    const bump = (dir) => {
      const cur = parseNum(input.value);
      const next = Math.max(0, Math.round(((Number.isNaN(cur) ? 0 : cur) + dir * step) * 100) / 100);
      input.value = toInput(next);
      changed();
    };
    input.addEventListener('input', changed);
    input.addEventListener('focus', () => input.select());
    const el = h('div', { class: 'stepper' },
      h('button', { class: 'stepper-btn', type: 'button', 'aria-label': label + ' verringern', onclick: () => bump(-1) }, '−'),
      h('label', { class: 'stepper-field' }, input, h('span', { class: 'stepper-unit' }, unit)),
      h('button', { class: 'stepper-btn', type: 'button', 'aria-label': label + ' erhöhen', onclick: () => bump(1) }, '+'));
    return { el, input };
  }

  // Steppers for all fields of an exercise type. `initial` maps field -> text.
  function entrySteppers(type, initial, onChange) {
    return TYPE_FIELDS[type].map((key) => Object.assign({ key }, stepper(Object.assign({}, FIELDS[key], {
      value: initial[key] != null ? initial[key] : '',
      onChange: onChange ? (v) => onChange(key, v) : null,
    }))));
  }

  // Reads and checks the fields; marks the first offending one and returns { error } if invalid.
  function readEntry(steppers) {
    const values = {};
    let error = null;
    for (const st of steppers) {
      const f = FIELDS[st.key];
      const text = st.input.value.trim();
      const n = parseNum(text);
      const empty = text === '' || (f.optional && n === 0);
      const bad = empty ? !f.optional : !(n >= f.min && n <= f.max && (!f.integer || Number.isInteger(n)));
      st.el.classList.toggle('invalid', bad);
      if (bad && !error) {
        error = f.error;
        st.input.focus();
      }
      values[st.key] = empty ? null : n;
    }
    return error ? { error } : { values };
  }

  const toInputs = (type, set) => Object.fromEntries(TYPE_FIELDS[type].map((k) => [k, set[k] == null ? '' : toInput(set[k])]));

  function chipButton(label, pressed, onClick, focusKey, disabled) {
    return h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(pressed), 'data-fk': focusKey, disabled, onclick: onClick,
    }, label);
  }

  function menuItem(iconName, label, onClick, danger) {
    return h('button', { class: 'menu-item' + (danger ? ' is-danger' : ''), type: 'button', onclick: onClick }, icon(iconName), label);
  }

  function kpi(label, value, sub) {
    return h('div', { class: 'kpi' },
      h('div', { class: 'kpi-label' }, label),
      h('div', { class: 'kpi-value' }, value),
      sub ? h('div', { class: 'kpi-sub' }, sub) : null);
  }

  function cardHead(title, sub, actions) {
    return h('div', { class: 'card-head' },
      h('div', { class: 'card-titles' }, h('h3', null, title), sub ? h('p', { class: 'muted' }, sub) : null),
      actions ? h('div', { class: 'card-actions' }, actions) : null);
  }

  // Every chart has a table twin, so no value is reachable by hovering only.
  function tableDetails(head, rows) {
    return h('details', { class: 'table-view' },
      h('summary', null, 'Als Tabelle anzeigen'),
      h('table', null,
        h('thead', null, h('tr', null, head.map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c)))))));
  }

  // ---------- training tab ----------

  function relativeDay(date, today) {
    const diff = S.diffDays(date, today);
    if (diff === 0) return 'Heute';
    if (diff === 1) return 'Gestern';
    return 'Vor ' + diff + ' Tagen';
  }

  function dateBar(date, today) {
    const picker = h('input', { class: 'date-native', type: 'date', max: today, value: date, tabindex: '-1', 'aria-hidden': 'true' });
    picker.addEventListener('change', () => {
      if (S.isDateKey(picker.value)) goToDate(picker.value);
    });
    const openPicker = () => {
      try {
        picker.showPicker();
      } catch (e) {
        picker.focus();
        picker.click();
      }
    };
    const sameYear = date.slice(0, 4) === today.slice(0, 4);
    return h('div', { class: 'datebar' },
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Vorheriger Tag', 'data-fk': 'day-prev',
        onclick: () => goToDate(S.addDays(date, -1)),
      }, icon('chevronLeft', 24)),
      h('div', { class: 'datebar-mid' },
        h('button', { class: 'datebar-main', type: 'button', 'aria-label': 'Datum wählen, aktuell ' + fmtDate('longYear', date), 'data-fk': 'day-pick', onclick: openPicker },
          h('span', { class: 'datebar-rel' }, relativeDay(date, today)),
          h('span', { class: 'datebar-full' }, fmtDate(sameYear ? 'long' : 'longYear', date))),
        picker),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Nächster Tag', 'data-fk': 'day-next', disabled: date >= today,
        onclick: () => goToDate(S.addDays(date, 1)),
      }, icon('chevronRight', 24)));
  }

  function visitBanner(date, hasEntries) {
    if (!hasEntries) {
      return h('p', { class: 'banner' }, icon('calendar', 18), h('span', null, 'Noch kein Eintrag – der erste Satz zählt als Gym-Besuch.'));
    }
    const n = S.visitNumberInWeek(state, date);
    return h('p', { class: 'banner is-on' }, icon('check', 18),
      h('span', null, h('strong', null, 'Gym-Besuch gezählt'), ' · ' + n + '. Besuch der Woche'));
  }

  function logSet(exerciseId, date, values) {
    const firstOfDay = !S.hasVisit(state, date);
    const set = S.addSet(state, { exerciseId, date }, values);
    if (!set) return;
    delete ui.pending[date + '|' + exerciseId];
    removeDraft(date, exerciseId);
    ui.flashSet = set.id;
    commit();
    if (firstOfDay) {
      toast('Gym-Besuch gezählt – ' + S.visitNumberInWeek(state, date) + '. Besuch der Woche');
      // Ask the browser not to evict the data when storage runs low.
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    }
  }

  function removeSet(set) {
    S.deleteSet(state, set.id);
    // Keep the exercise card on the day even if this was its only set.
    if (!state.sets.some((s) => s.exerciseId === set.exerciseId && s.date === set.date)) addToDay(set.date, [set.exerciseId]);
    commit();
    toast('Eintrag gelöscht', {
      action: 'Rückgängig',
      onAction: () => {
        if (S.restoreSet(state, set)) {
          removeDraft(set.date, set.exerciseId);
          commit();
        }
      },
    });
  }

  function openSetEditor(set, exercise, number) {
    const steppers = entrySteppers(exercise.type, toInputs(exercise.type, set));
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const form = h('form', {
      class: 'form', novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const entry = readEntry(steppers);
        if (entry.error) {
          error.textContent = entry.error;
          error.hidden = false;
          return;
        }
        S.updateSet(state, set.id, entry.values);
        closeSheet();
        commit();
      },
    },
      h('div', { class: 'entry-fields' + (steppers.length === 1 ? ' is-single' : '') }, steppers.map((st) => st.el)),
      error,
      h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Speichern'),
      h('button', {
        class: 'btn btn-ghost-danger btn-block', type: 'button',
        onclick: () => {
          closeSheet();
          removeSet(set);
        },
      }, 'Eintrag löschen'));
    openSheet(exercise.name + ' · ' + (exercise.type === 'cardio' ? 'Eintrag ' : 'Satz ') + number, form);
  }

  function openCardMenu(exercise, sets, date) {
    openSheet(exercise.name, h('div', { class: 'menu' },
      menuItem('chart', 'Fortschritt anzeigen', () => {
        closeSheet();
        showProgress(exercise.id);
      }),
      menuItem('trash', 'Von diesem Tag entfernen', async () => {
        if (sets.length) {
          const yes = await confirmDialog({
            title: 'Einträge löschen?',
            text: plural(sets.length, 'Eintrag', 'Einträge') + ' von „' + exercise.name + '“ am ' + fmtDate('short', date) + ' werden gelöscht.',
            ok: 'Löschen', danger: true,
          });
          if (!yes) return;
          S.deleteDayExercise(state, exercise.id, date);
        }
        removeDraft(date, exercise.id);
        delete ui.pending[date + '|' + exercise.id];
        closeSheet();
        commit();
      }, true)));
  }

  function exerciseCard(exercise, sets, date) {
    const key = date + '|' + exercise.id;
    const last = S.lastSessionBefore(state, exercise.id, date);
    // Start from the previous set; on the first set of the day from last time's first set.
    const base = sets.length ? sets[sets.length - 1] : last ? last.sets[0] : null;
    const type = exercise.type;
    const noun = type === 'cardio' ? 'Eintrag' : 'Satz';
    const initial = Object.assign(base ? toInputs(type, base) : {}, ui.pending[key]);
    const steppers = entrySteppers(type, initial, (field, v) => {
      (ui.pending[key] = ui.pending[key] || {})[field] = v;
    });
    const setValue = (s) => {
      if (type === 'cardio') {
        return [h('b', null, fmtNum(s.minutes)), ' Min.', s.speed ? [h('span', { class: 'set-x' }, '·'), h('b', null, fmtNum(s.speed)), ' km/h'] : null];
      }
      if (type === 'reps') return [h('b', null, s.reps), ' Wdh.'];
      return [h('b', null, fmtNum(s.weight)), ' kg', h('span', { class: 'set-x' }, '×'), h('b', null, s.reps), ' Wdh.'];
    };
    const recordId = S.prSetId(state, exercise.id, date);
    const muscle = S.MUSCLES.find((m) => m.id === exercise.muscle);

    return h('section', { class: 'card exercise-card', 'aria-label': exercise.name },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-titles' },
          h('span', { class: 'muscle-tag' }, muscle.label),
          h('h3', null, exercise.name)),
        h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': 'Mehr zu ' + exercise.name,
          onclick: () => openCardMenu(exercise, sets, date),
        }, icon('more', 22))),
      last ? h('p', { class: 'last-time' }, h('span', null, 'Letztes Mal · ' + fmtDate('short', last.date) + ': '), summarizeSets(last.sets, type)) : null,
      sets.length ? h('ol', { class: 'sets' }, sets.map((s, i) =>
        h('li', { class: 'set' + (s.id === ui.flashSet ? ' flash' : '') },
          h('button', {
            class: 'set-main', type: 'button', onclick: () => openSetEditor(s, exercise, i + 1),
            'aria-label': noun + ' ' + (i + 1) + ': ' + formatSet(type, s) + ' – bearbeiten',
          },
            h('span', { class: 'set-no' }, i + 1),
            h('span', { class: 'set-val' }, setValue(s)),
            s.id === recordId ? h('span', { class: 'badge' }, icon('star', 12), h('span', { class: 'badge-text' }, 'Rekord')) : null),
          h('button', {
            class: 'icon-btn set-del', type: 'button', 'aria-label': noun + ' ' + (i + 1) + ' löschen',
            onclick: () => removeSet(s),
          }, icon('close', 18))))) : null,
      h('form', {
        class: 'entry', novalidate: true,
        onsubmit: (e) => {
          e.preventDefault();
          const entry = readEntry(steppers);
          if (entry.error) toast(entry.error);
          else logSet(exercise.id, date, entry.values);
        },
      },
        h('div', { class: 'entry-fields' + (steppers.length === 1 ? ' is-single' : '') }, steppers.map((st) => st.el)),
        h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, icon('check'), noun + ' ' + (sets.length + 1) + ' eintragen')));
  }

  function openExercisePicker() {
    const date = ui.date;
    const present = new Set([...S.daySets(state, date).map((d) => d.exerciseId), ...(ui.drafts[date] || [])]);
    const selected = new Set();
    const summary = S.summaries(state);
    const today = S.todayKey();

    const createNew = () => openExerciseForm({ onSaved: (ex) => addToDay(date, [ex.id]) });

    if (!state.exercises.length) {
      openSheet('Übung hinzufügen', h('div', { class: 'empty' },
        h('h2', null, 'Noch keine Übungen'),
        h('p', null, 'Lege deine erste Übung an oder starte mit einer Auswahl gängiger Übungen.'),
        h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: createNew }, icon('plus'), 'Neue Übung anlegen'),
        h('button', {
          class: 'btn btn-secondary btn-block', type: 'button',
          onclick: () => {
            loadSamples();
            openExercisePicker();
          },
        }, 'Beispielübungen laden')));
      return;
    }

    const list = h('div', { class: 'picker' });
    const addBtn = h('button', {
      class: 'btn btn-primary btn-block', type: 'button', disabled: true,
      onclick: () => {
        addToDay(date, [...selected]);
        closeSheet();
        render();
      },
    }, 'Übungen auswählen');
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Übung suchen …', 'aria-label': 'Übung suchen', autocomplete: 'off', enterkeyhint: 'search' });

    const renderList = () => {
      const q = search.value.trim().toLowerCase();
      const groups = S.groupedExercises(state)
        .map((g) => ({ muscle: g.muscle, exercises: g.exercises.filter((e) => !q || e.name.toLowerCase().includes(q)) }))
        .filter((g) => g.exercises.length);
      fill(list, groups.length ? groups.map((g) =>
        h('section', { class: 'group' },
          h('h3', { class: 'group-title' }, g.muscle.label),
          h('div', { class: 'rows' }, g.exercises.map((ex) => {
            const there = present.has(ex.id);
            const sum = summary.get(ex.id);
            const box = h('input', { type: 'checkbox', disabled: there });
            box.checked = there || selected.has(ex.id);
            box.addEventListener('change', () => {
              if (box.checked) selected.add(ex.id);
              else selected.delete(ex.id);
              addBtn.disabled = selected.size === 0;
              addBtn.textContent = selected.size ? plural(selected.size, 'Übung', 'Übungen') + ' hinzufügen' : 'Übungen auswählen';
            });
            return h('label', { class: 'row pick' + (there ? ' is-disabled' : '') }, box,
              h('span', { class: 'row-text' },
                h('span', { class: 'row-title' }, ex.name),
                h('span', { class: 'row-sub' }, there ? 'Schon im Training' : sum ? 'Zuletzt ' + relativeDay(sum.lastDate, today).toLowerCase() : 'Noch nicht trainiert')));
          })))) : h('p', { class: 'muted' }, 'Keine Übung gefunden.'));
    };
    search.addEventListener('input', renderList);
    renderList();

    openSheet('Übung hinzufügen',
      [search, list],
      [addBtn, h('button', { class: 'btn btn-secondary btn-block', type: 'button', onclick: createNew }, icon('plus'), 'Neue Übung anlegen')]);
  }

  function viewTraining() {
    const date = ui.date;
    const today = S.todayKey();
    const day = S.daySets(state, date);
    const logged = new Set(day.map((d) => d.exerciseId));
    const drafts = (ui.drafts[date] || []).filter((id) => !logged.has(id) && S.getExercise(state, id));
    const cards = [
      ...day.map((d) => exerciseCard(S.getExercise(state, d.exerciseId), d.sets, date)),
      ...drafts.map((id) => exerciseCard(S.getExercise(state, id), [], date)),
    ];
    return h('div', { class: 'view' },
      dateBar(date, today),
      date !== today ? h('button', { class: 'chip chip-center', type: 'button', onclick: () => goToDate(today) }, 'Zurück zu heute') : null,
      visitBanner(date, day.length > 0),
      cards.length ? cards : h('div', { class: 'empty' },
        h('h2', null, date === today ? 'Bereit fürs Training?' : 'Kein Training an diesem Tag'),
        h('p', null, 'Füge eine Übung hinzu und trag Gewicht und Wiederholungen ein.')),
      h('button', { class: 'btn btn-block ' + (cards.length ? 'btn-secondary' : 'btn-primary'), type: 'button', onclick: openExercisePicker }, icon('plus'), 'Übung hinzufügen'));
  }

  // ---------- exercises tab ----------

  function loadSamples() {
    const added = S.addSamples(state);
    commit();
    toast(added ? plural(added, 'Übung', 'Übungen') + ' hinzugefügt' : 'Die Beispielübungen sind schon vorhanden');
  }

  function openExerciseForm({ exercise, presetMuscle, onSaved }) {
    const hasEntries = !!exercise && state.sets.some((st) => st.exerciseId === exercise.id);
    const name = h('input', {
      class: 'input', id: 'exercise-name', type: 'text', maxlength: '60', placeholder: 'z. B. Bankdrücken',
      value: exercise ? exercise.name : '', autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'done',
    });
    const muscle = h('select', { class: 'input select', id: 'exercise-muscle' },
      h('option', { value: '' }, 'Bitte wählen …'),
      S.MUSCLES.map((m) => h('option', { value: m.id }, m.label)));
    muscle.value = exercise ? exercise.muscle : presetMuscle || '';
    const type = h('select', { class: 'input select', id: 'exercise-type', disabled: hasEntries },
      S.TYPES.map((t) => h('option', { value: t }, TYPE_LABELS[t])));
    type.value = exercise ? exercise.type : muscle.value === 'cardio' ? 'cardio' : 'weight';
    // Picking the Cardio group suggests the matching kind of entry until the user chooses one.
    let typeTouched = !!exercise;
    type.addEventListener('change', () => {
      typeTouched = true;
    });
    muscle.addEventListener('change', () => {
      if (!typeTouched) type.value = muscle.value === 'cardio' ? 'cardio' : 'weight';
    });
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const fail = (message, focusEl) => {
      error.textContent = message;
      error.hidden = false;
      if (focusEl) focusEl.focus();
    };
    const form = h('form', {
      class: 'form', novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const cleanName = name.value.trim().replace(/\s+/g, ' ');
        if (!cleanName) return fail('Bitte gib der Übung einen Namen.', name);
        if (!muscle.value) return fail('Bitte wähle eine Gruppe.', muscle);
        if (S.findExerciseByName(state, cleanName, exercise && exercise.id)) return fail('Eine Übung mit diesem Namen gibt es schon.', name);
        const data = { name: cleanName, muscle: muscle.value, type: type.value };
        const result = exercise ? S.updateExercise(state, exercise.id, data) : S.addExercise(state, data);
        ui.openGroups.add(result.muscle);
        if (onSaved) onSaved(result);
        closeSheet();
        commit();
        toast(exercise ? 'Übung gespeichert' : '„' + result.name + '“ angelegt');
      },
    },
      h('div', { class: 'field' }, h('label', { for: 'exercise-name' }, 'Name'), name),
      h('div', { class: 'field' }, h('label', { for: 'exercise-muscle' }, 'Gruppe'), muscle),
      h('div', { class: 'field' }, h('label', { for: 'exercise-type' }, 'Was trägst du ein?'), type,
        hasEntries ? h('p', { class: 'muted' }, 'Lässt sich nicht mehr ändern, weil es schon Einträge gibt.') : null),
      error,
      h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, exercise ? 'Speichern' : 'Übung anlegen'));
    openSheet(exercise ? 'Übung bearbeiten' : 'Neue Übung', form);
    if (!exercise) name.focus();
  }

  function openExerciseDetail(exercise) {
    const sessions = S.exerciseSessions(state, exercise.id);
    const muscle = S.MUSCLES.find((m) => m.id === exercise.muscle);
    const type = exercise.type;
    const bestOf = (get) => sessions.reduce((max, s) => Math.max(max, get(s)), 0);
    const best = type === 'cardio' ? fmtNum(bestOf((s) => s.minutes)) + ' Min.'
      : type === 'reps' ? bestOf((s) => s.maxReps) + ' Wdh.'
        : fmtNum(bestOf((s) => s.maxWeight)) + ' kg';
    const setCount = sessions.reduce((n, s) => n + s.sets.length, 0);
    const today = S.todayKey();

    const body = h('div', { class: 'detail' },
      h('span', { class: 'muscle-tag' }, muscle.label),
      h('div', { class: 'kpis kpis-3' },
        kpi('Trainings', sessions.length),
        kpi('Bestwert', sessions.length ? best : '–'),
        kpi('Zuletzt', sessions.length ? fmtDate('tick', sessions[sessions.length - 1].date) : '–')),
      sessions.length ? h('ul', { class: 'history' }, sessions.slice(-4).reverse().map((s) =>
        h('li', null, h('span', { class: 'history-date' }, fmtDate('short', s.date)), h('span', null, summarizeSets(s.sets, type))))) : null,
      h('div', { class: 'menu' },
        h('button', {
          class: 'btn btn-primary btn-block', type: 'button',
          onclick: () => {
            addToDay(today, [exercise.id]);
            ui.date = today;
            closeSheet();
            switchTab('training');
          },
        }, icon('dumbbell'), 'Heute trainieren'),
        sessions.length ? menuItem('chart', 'Fortschritt anzeigen', () => {
          closeSheet();
          showProgress(exercise.id);
        }) : null,
        menuItem('edit', 'Übung bearbeiten', () => openExerciseForm({ exercise })),
        menuItem('trash', 'Übung löschen', async () => {
          const yes = await confirmDialog({
            title: '„' + exercise.name + '“ löschen?',
            text: setCount
              ? 'Die Übung und ihre ' + plural(setCount, 'Eintrag', 'Einträge') + ' werden endgültig gelöscht.'
              : 'Die Übung wird gelöscht.',
            ok: 'Löschen', danger: true,
          });
          if (!yes) return;
          S.deleteExercise(state, exercise.id);
          closeSheet();
          commit();
          toast('Übung gelöscht');
        }, true)));
    openSheet(exercise.name, body);
  }

  function viewExercises() {
    const groups = S.groupedExercises(state);
    const total = state.exercises.length;
    if (!total) {
      return h('div', { class: 'view' },
        h('h1', null, 'Übungen'),
        h('div', { class: 'empty' },
          h('h2', null, 'Noch keine Übungen'),
          h('p', null, 'Lege deine Übungen an – sie werden nach Muskelgruppe sortiert.'),
          h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => openExerciseForm({}) }, icon('plus'), 'Neue Übung anlegen'),
          h('button', { class: 'btn btn-secondary btn-block', type: 'button', onclick: loadSamples }, 'Beispielübungen laden')));
    }
    const summary = S.summaries(state);

    return h('div', { class: 'view' },
      h('div', { class: 'view-head' },
        h('h1', null, 'Übungen'),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openExerciseForm({}) }, icon('plus', 18), 'Neue Übung')),
      // One dropdown per group; they remember whether they are open.
      groups.map((g) => {
        const details = h('details', { class: 'group-drop', open: ui.openGroups.has(g.muscle.id) },
          h('summary', { 'data-fk': 'group-' + g.muscle.id },
            h('span', { class: 'group-name' }, g.muscle.label),
            h('span', { class: 'group-count' }, g.exercises.length),
            icon('chevronDown', 20)),
          h('div', { class: 'rows' }, g.exercises.map((ex) => {
            const sum = summary.get(ex.id);
            return h('button', { class: 'row', type: 'button', onclick: () => openExerciseDetail(ex) },
              h('span', { class: 'row-text' },
                h('span', { class: 'row-title' }, ex.name),
                h('span', { class: 'row-sub' }, sum
                  ? 'Zuletzt ' + fmtDate('short', sum.lastDate) + ' · ' + formatSet(ex.type, sum.lastTop)
                  : 'Noch nicht trainiert')),
              icon('chevronRight', 18));
          })));
        details.addEventListener('toggle', () => {
          if (details.open) ui.openGroups.add(g.muscle.id);
          else ui.openGroups.delete(g.muscle.id);
        });
        return details;
      }));
  }

  // ---------- progress tab ----------

  function calendarCard(today) {
    const month = ui.calMonth;
    const [year, monthNo] = month.split('-').map(Number);
    const first = new Date(year, monthNo - 1, 1);
    const daysInMonth = new Date(year, monthNo, 0).getDate();
    const visits = new Set(S.visitDates(state));
    const cells = [];
    for (let i = 0; i < (first.getDay() + 6) % 7; i++) cells.push(h('span', { class: 'cal-gap' }));
    let count = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const key = month + '-' + String(day).padStart(2, '0');
      const visited = visits.has(key);
      if (visited) count++;
      cells.push(h('button', {
        class: 'cal-day' + (visited ? ' is-visit' : '') + (key === today ? ' is-today' : ''),
        type: 'button', disabled: key > today,
        'aria-label': fmtDate('longYear', key) + (visited ? ', Gym-Besuch' : ''),
        onclick: () => {
          ui.date = key;
          switchTab('training');
        },
      }, day));
    }
    const move = (n) => () => {
      ui.calMonth = S.addMonths(month, n);
      render();
    };
    return h('section', { class: 'card' },
      cardHead(DF.monthYear.format(first), plural(count, 'Gym-Besuch', 'Gym-Besuche'), [
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Vorheriger Monat', 'data-fk': 'cal-prev', onclick: move(-1) }, icon('chevronLeft')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nächster Monat', 'data-fk': 'cal-next', disabled: month >= today.slice(0, 7), onclick: move(1) }, icon('chevronRight')),
      ]),
      h('div', { class: 'cal' },
        ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => h('span', { class: 'cal-wd', 'aria-hidden': 'true' }, d)),
        cells));
  }

  function weeklyCard(today) {
    const weeks = S.weeklyVisits(state, today, 12);
    const weekTitle = (w) => 'KW ' + w.isoWeek + ' · ' + fmtDate('tick', w.start) + '–' + fmtDate('tick', w.end);
    const box = h('div');
    C.bars(box, {
      label: 'Gym-Besuche pro Woche in den letzten 12 Wochen',
      items: weeks.map((w) => ({ value: w.count, tick: fmtDate('tick', w.start), title: weekTitle(w) })),
      formatValue: (v) => plural(v, 'Besuch', 'Besuche'),
      minMax: 4,
    });
    return h('section', { class: 'card' },
      cardHead('Besuche pro Woche', 'Letzte 12 Wochen, Woche ab Montag'),
      box,
      tableDetails(['Woche', 'Besuche'], weeks.slice().reverse().map((w) => [weekTitle(w), String(w.count)])));
  }

  function currentProgressExercise() {
    const chosen = S.getExercise(state, ui.progressExercise);
    if (chosen) return chosen;
    // Default: whatever was trained most recently.
    let latest = null;
    for (const s of state.sets) {
      if (!latest || s.date > latest.date || (s.date === latest.date && s.ts > latest.ts)) latest = s;
    }
    return latest ? S.getExercise(state, latest.exerciseId) : null;
  }

  function exerciseCardProgress(today, range) {
    const exercise = currentProgressExercise();
    const from = range.days ? S.addDays(today, -(range.days - 1)) : null;
    const all = S.exerciseSessions(state, exercise.id);
    const type = exercise.type;
    const metricIds = TYPE_METRICS[type];
    // Weight exercises only ever logged with 0 kg have no weight curve: show repetitions instead.
    const bodyweightOnly = type === 'weight' && all.length > 0 && all.every((s) => s.maxWeight === 0);
    const chosen = metricIds.includes(ui.metrics[type]) ? ui.metrics[type] : metricIds[0];
    const metricId = bodyweightOnly ? 'reps' : chosen;
    const metric = METRICS[metricId];
    const inRange = from ? all.filter((s) => s.date >= from) : all;
    const sessions = metric.has ? inRange.filter(metric.has) : inRange;

    const select = h('select', { class: 'input select', 'aria-label': 'Übung', 'data-fk': 'progress-exercise' },
      S.groupedExercises(state).map((g) => h('optgroup', { label: g.muscle.label },
        g.exercises.map((e) => h('option', { value: e.id, selected: e.id === exercise.id }, e.name)))));
    select.addEventListener('change', () => {
      ui.progressExercise = select.value;
      saveUi();
      render();
    });

    const metricChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Messwert' },
      metricIds.map((id) => chipButton(METRICS[id].label, id === metricId, () => {
        ui.metrics[type] = id;
        saveUi();
        render();
      }, 'metric-' + id, bodyweightOnly && id !== 'reps')));

    let content;
    if (!sessions.length) {
      content = h('p', { class: 'chart-empty' }, inRange.length
        ? 'Dafür fehlt die Geschwindigkeit – trag sie beim Training mit ein.'
        : all.length
          ? 'Keine Einträge im gewählten Zeitraum – wähle oben einen längeren.'
          : 'Für diese Übung gibt es noch keine Einträge.');
    } else {
      const values = sessions.map(metric.get);
      const lastValue = values[values.length - 1];
      const bestValue = Math.max(...values);
      const bestSession = sessions[values.indexOf(bestValue)];
      const delta = lastValue - values[0];
      const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
      const pct = values[0] > 0 ? sign + nf0.format(Math.abs(delta / values[0]) * 100) + '\u00a0%' : null;

      const box = h('div');
      C.line(box, {
        label: metric.title + ' für ' + exercise.name + ', ' + plural(sessions.length, 'Training', 'Trainings') +
          '. Zuletzt ' + metric.fmt(lastValue) + ', Bestwert ' + metric.fmt(bestValue) + '.',
        points: sessions.map((s) => ({
          x: S.dayNumber(s.date), value: metric.get(s), title: fmtDate('shortYear', s.date), detail: summarizeSets(s.sets, type),
        })),
        formatValue: metric.fmt,
        formatTick: metric.tick,
        formatX: (x, span) => fmtDate(span > 300 ? 'monthShort' : 'tick', S.keyFromDayNumber(x)),
        integer: metric.integer,
      });
      content = [
        h('div', { class: 'kpis kpis-3' },
          kpi('Zuletzt', metric.fmt(lastValue), fmtDate('tick', sessions[sessions.length - 1].date)),
          kpi('Bestwert', metric.fmt(bestValue), fmtDate('tick', bestSession.date)),
          kpi('Veränderung', sessions.length > 1 ? sign + metric.fmt(Math.abs(delta)) : '–',
            sessions.length > 1 ? pct || 'seit ' + fmtDate('tick', sessions[0].date) : 'ab 2 Trainings')),
        h('p', { class: 'chart-title' }, metric.title),
        box,
        tableDetails(['Datum', 'Einträge', metric.label], sessions.slice().reverse().map((s) => [fmtDate('shortYear', s.date), summarizeSets(s.sets, type), metric.fmt(metric.get(s))])),
      ];
    }

    return h('section', { class: 'card', id: 'exercise-progress' },
      cardHead('Leistung pro Übung', range.title),
      select, metricChips, content);
  }

  function muscleCard(today, range) {
    const from = range.days ? S.addDays(today, -(range.days - 1)) : null;
    const rows = S.muscleSetCounts(state, from, today);
    const max = rows.length ? rows[0].count : 0;
    return h('section', { class: 'card' },
      cardHead('Sätze pro Gruppe', range.title),
      rows.length ? h('div', { class: 'hbars' }, rows.map((r) =>
        h('div', { class: 'hbar' },
          h('span', { class: 'hbar-label' }, r.label),
          h('span', { class: 'hbar-track' },
            h('span', { class: 'hbar-fill', style: 'width:calc((100% - 44px) * ' + (r.count / max).toFixed(4) + ')' }),
            h('span', { class: 'hbar-val' }, r.count)))))
        : h('p', { class: 'chart-empty' }, 'Keine Einträge im gewählten Zeitraum.'));
  }

  function viewProgress() {
    const today = S.todayKey();
    if (!state.sets.length) {
      return h('div', { class: 'view' },
        h('h1', null, 'Fortschritt'),
        h('div', { class: 'empty' },
          h('h2', null, 'Noch keine Daten'),
          h('p', null, 'Sobald du deinen ersten Satz einträgst, siehst du hier deine Gym-Besuche und deinen Leistungsfortschritt.'),
          h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => switchTab('training') }, 'Zum Training')));
    }
    const stats = S.visitStats(state, today);
    const range = RANGES.find((r) => r.id === ui.range);
    return h('div', { class: 'view' },
      h('h1', null, 'Fortschritt'),
      h('h2', { class: 'section-title' }, 'Gym-Besuche'),
      h('div', { class: 'kpis' },
        kpi('Diese Woche', stats.week, 'Vorwoche: ' + stats.prevWeek),
        kpi('Dieser Monat', stats.month, 'Vormonat: ' + stats.prevMonth),
        kpi('Gesamt', stats.total, 'Ø ' + nf1.format(stats.avgPerWeek) + ' pro Woche'),
        kpi('Serie', stats.streakWeeks, stats.streakWeeks === 1 ? 'Woche in Folge' : 'Wochen in Folge')),
      calendarCard(today),
      weeklyCard(today),
      h('h2', { class: 'section-title' }, 'Leistung'),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Zeitraum' },
        RANGES.map((r) => chipButton(r.label, r.id === ui.range, () => {
          ui.range = r.id;
          saveUi();
          render();
        }, 'range-' + r.id))),
      exerciseCardProgress(today, range),
      muscleCard(today, range));
  }

  // ---------- settings ----------

  function exportData() {
    const payload = Object.assign({ app: 'gym-tracker', exportedAt: new Date().toISOString() }, state);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = h('a', { href: url, download: 'gym-tracker-' + S.todayKey() + '.json' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function importData(file) {
    let incoming;
    try {
      incoming = S.normalize(JSON.parse(await file.text()));
    } catch (e) {
      await confirmDialog({ title: 'Import nicht möglich', text: 'Die Datei ist kein gültiges Gym-Tracker-Backup.', ok: 'OK' });
      return;
    }
    const yes = await confirmDialog({
      title: 'Backup einspielen?',
      text: 'Deine aktuellen Daten werden durch das Backup ersetzt (' + plural(incoming.exercises.length, 'Übung', 'Übungen') + ', ' +
        plural(incoming.sets.length, 'Eintrag', 'Einträge') + ').',
      ok: 'Ersetzen', danger: true,
    });
    if (!yes) return;
    state = incoming;
    ui.drafts = {};
    ui.pending = {};
    saveUi();
    closeSheet();
    commit();
    toast('Backup eingespielt');
  }

  function openSettings() {
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    file.addEventListener('change', () => {
      if (file.files[0]) importData(file.files[0]);
      file.value = '';
    });
    const visits = S.visitDates(state).length;
    openSheet('Daten & Backup', h('div', { class: 'menu' },
      h('p', { class: 'muted' }, 'Deine Daten liegen nur in diesem Browser auf diesem Gerät. Sichere sie ab und zu als Datei – so kannst du sie auch auf ein anderes Gerät mitnehmen.'),
      h('p', { class: 'data-stats' }, plural(state.exercises.length, 'Übung', 'Übungen') + ' · ' + plural(state.sets.length, 'Eintrag', 'Einträge') + ' · ' + plural(visits, 'Gym-Besuch', 'Gym-Besuche')),
      menuItem('download', 'Backup herunterladen', exportData),
      menuItem('upload', 'Backup einspielen', () => file.click()),
      menuItem('list', 'Beispielübungen laden', () => {
        closeSheet();
        loadSamples();
      }),
      menuItem('trash', 'Alle Daten löschen', async () => {
        const yes = await confirmDialog({
          title: 'Wirklich alles löschen?',
          text: 'Alle Übungen, Einträge und Gym-Besuche werden endgültig gelöscht.',
          ok: 'Alles löschen', danger: true,
        });
        if (!yes) return;
        state = S.emptyState();
        ui.drafts = {};
        ui.pending = {};
        ui.progressExercise = null;
        saveUi();
        closeSheet();
        commit();
        toast('Alle Daten gelöscht');
      }, true),
      file));
  }

  // ---------- render ----------

  const VIEWS = { training: viewTraining, exercises: viewExercises, progress: viewProgress };

  function render() {
    // Re-rendering replaces the pressed control; put the focus back on its successor.
    const active = document.activeElement;
    const focusKey = active && active.dataset ? active.dataset.fk : null;

    fill($('#view'), VIEWS[ui.tab]());
    ui.flashSet = null;

    for (const btn of document.querySelectorAll('.tab')) {
      if (btn.dataset.tab === ui.tab) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    }
    if (focusKey) {
      const next = document.querySelector('[data-fk="' + focusKey + '"]');
      if (next && !next.disabled) next.focus({ preventScroll: true });
    }
  }

  function init() {
    fill($('#topbar-actions'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Daten & Backup', onclick: openSettings }, icon('settings', 22)));
    fill($('#tabbar'), TABS.map((t) =>
      h('button', { class: 'tab', type: 'button', 'data-tab': t.id, onclick: () => switchTab(t.id) }, icon(t.icon, 24), h('span', null, t.label))));

    try {
      const lastTab = sessionStorage.getItem(TAB_KEY);
      if (VIEWS[lastTab]) ui.tab = lastTab;
    } catch (e) { /* storage may be unavailable */ }
    render();

    // The app often stays open in the background: follow the calendar day when it comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const now = S.todayKey();
      if (now === ui.today) return;
      if (ui.date === ui.today) ui.date = now;
      ui.today = now;
      ui.calMonth = now.slice(0, 7);
      render();
    });

    // Another tab of the app changed the data.
    window.addEventListener('storage', (e) => {
      if (e.key === S.STORAGE_KEY) {
        state = S.load();
        render();
      }
    });

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
  }

  init();
})();
