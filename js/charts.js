/* Gym Tracker – small dependency-free SVG charts (line and column). Colours live in style.css. */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, text) {
    const el = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    return el;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Round axis steps: 1 / 2 / 2.5 / 5 / 10 × 10^n (integer axes skip 2.5 and never go below 1).
  function niceScale(lo, hi, target, integer) {
    const raw = Math.max((hi - lo) / target, 1e-9);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 && !integer ? 2.5 : n <= 5 ? 5 : 10) * mag;
    if (integer) step = Math.max(1, Math.round(step));
    const min = Math.floor(lo / step + 1e-9) * step;
    const ticks = [];
    for (let v = min; v < hi + step - step * 1e-9; v += step) ticks.push(+v.toFixed(6));
    return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
  }

  // Redraws whenever the container's width changes; stops once the container leaves the page.
  function mount(container, draw) {
    let lastWidth = 0;
    let seen = false;
    const observer = new ResizeObserver(() => {
      if (!container.isConnected) {
        if (seen) observer.disconnect();
        return;
      }
      seen = true;
      const width = Math.round(container.clientWidth);
      if (width > 0 && width !== lastWidth) {
        lastWidth = width;
        draw(width);
      }
    });
    observer.observe(container);
  }

  function makeTooltip() {
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    return tip;
  }

  // Values lead, labels follow. Everything goes in as text, never as markup.
  function fillTooltip(tip, value, title, detail) {
    const strong = document.createElement('strong');
    strong.textContent = value;
    const head = document.createElement('span');
    head.textContent = title;
    tip.replaceChildren(strong, head);
    if (detail) {
      const extra = document.createElement('span');
      extra.className = 'chart-tip-detail';
      extra.textContent = detail;
      tip.append(extra);
    }
  }

  function placeTooltip(tip, width, x, y) {
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const left = clamp(x - tw / 2, 0, Math.max(0, width - tw));
    const top = y - th - 12 >= 0 ? y - th - 12 : y + 14;
    tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  }

  // Pointer and keyboard access to the n data positions of a chart.
  // The pointer only has to be closest to a position, not on the mark itself.
  function interact(svg, hit, centers, setActive) {
    let active = null;
    const set = (i) => {
      active = i;
      setActive(i);
    };
    const nearest = (e) => {
      const x = e.clientX - svg.getBoundingClientRect().left;
      let best = 0;
      for (let i = 1; i < centers.length; i++) {
        if (Math.abs(centers[i] - x) < Math.abs(centers[best] - x)) best = i;
      }
      return best;
    };
    hit.addEventListener('pointerdown', (e) => set(nearest(e)));
    hit.addEventListener('pointermove', (e) => set(nearest(e)));
    hit.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') set(null);
    });
    svg.addEventListener('focus', () => {
      if (active == null) set(centers.length - 1);
    });
    svg.addEventListener('blur', () => set(null));
    svg.addEventListener('keydown', (e) => {
      const last = centers.length - 1;
      const cur = active == null ? last : active;
      let next = null;
      if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
      else if (e.key === 'ArrowRight') next = Math.min(last, cur + 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = last;
      else if (e.key === 'Escape') return set(null);
      else return;
      e.preventDefault();
      set(next);
    });
  }

  function yAxis(svg, scale, labels, left, right, yOf) {
    scale.ticks.forEach((t, i) => {
      const y = Math.round(yOf(t)) + 0.5;
      svg.append(svgEl('line', { class: 'ch-grid', x1: left, x2: right, y1: y, y2: y }));
      svg.append(svgEl('text', { class: 'ch-tick', x: left - 8, y: y, 'text-anchor': 'end', dy: '0.35em' }, labels[i]));
    });
  }

  /**
   * Line chart for one series over time.
   * opts.points      [{ x: number, value: number, title: string, detail?: string }] sorted by x
   * opts.formatValue value -> text for tooltip and end label
   * opts.formatTick  (value, axisMax) -> text for the y axis
   * opts.formatX     (x, span) -> text for the x axis
   * opts.integer     whole-number y axis
   * opts.label       accessible name
   */
  function line(container, opts) {
    const pts = opts.points;
    const tip = makeTooltip();
    container.classList.add('chart-box');

    mount(container, (width) => {
      const height = opts.height || 220;
      const values = pts.map((p) => p.value);
      let lo = Math.min(...values);
      let hi = Math.max(...values);
      const padY = lo === hi ? (hi === 0 ? 1 : hi * 0.1) : (hi - lo) * 0.15;
      lo = Math.max(0, lo - padY);
      hi += padY;
      const scale = niceScale(lo, hi, 4, opts.integer);
      const tickLabels = scale.ticks.map((t) => opts.formatTick(t, scale.max));

      const m = { top: 24, right: 12, bottom: 26, left: Math.max(...tickLabels.map((l) => l.length)) * 6.4 + 14 };
      const plotL = m.left;
      const plotR = width - m.right;
      const plotT = m.top;
      const plotB = height - m.bottom;
      const inset = 8; // keeps the first and last marker off the plot edge
      const xMin = pts[0].x;
      const xMax = pts[pts.length - 1].x;
      const span = xMax - xMin;
      const xOf = (x) => (span === 0 ? (plotL + plotR) / 2 : plotL + inset + ((x - xMin) / span) * (plotR - plotL - 2 * inset));
      const yOf = (v) => plotB - ((v - scale.min) / (scale.max - scale.min)) * (plotB - plotT);

      const svg = svgEl('svg', { width, height, viewBox: '0 0 ' + width + ' ' + height, role: 'img', tabindex: '0', 'aria-label': opts.label });
      yAxis(svg, scale, tickLabels, plotL, plotR, yOf);

      // x axis: a few evenly spaced dates
      const wanted = span === 0 ? 1 : clamp(Math.floor((plotR - plotL) / 76), 2, 5);
      const tickXs = [];
      for (let i = 0; i < wanted; i++) {
        const x = wanted === 1 ? xMin : Math.round(xMin + (span * i) / (wanted - 1));
        if (!tickXs.includes(x)) tickXs.push(x);
      }
      tickXs.forEach((x, i) => {
        const anchor = tickXs.length === 1 ? 'middle' : i === 0 ? 'start' : i === tickXs.length - 1 ? 'end' : 'middle';
        const px = anchor === 'start' ? plotL : anchor === 'end' ? plotR : xOf(x);
        svg.append(svgEl('text', { class: 'ch-tick', x: px, y: height - 6, 'text-anchor': anchor }, opts.formatX(x, span)));
      });

      const coords = pts.map((p) => [xOf(p.x), yOf(p.value)]);
      if (pts.length > 1) {
        svg.append(svgEl('path', { class: 'ch-line', d: coords.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1)).join(' ') }));
      }
      const cross = svgEl('line', { class: 'ch-cross', y1: plotT, y2: plotB, visibility: 'hidden' });
      svg.append(cross);

      // Every session gets a marker while they stay readable; the latest one always does.
      const showAll = pts.length <= 24;
      coords.forEach(([x, y], i) => {
        if (showAll || i === coords.length - 1) svg.append(svgEl('circle', { class: 'ch-dot', cx: x, cy: y, r: 4 }));
      });

      // Direct label on the latest value only.
      const [endX, endY] = coords[coords.length - 1];
      const endLabel = svgEl('text', { class: 'ch-end', x: endX, y: endY - 11, 'text-anchor': 'middle' }, opts.formatValue(pts[pts.length - 1].value));
      svg.append(endLabel);

      const hot = svgEl('circle', { class: 'ch-hot', r: 5.5, visibility: 'hidden' });
      svg.append(hot);
      const hit = svgEl('rect', { class: 'ch-hit', x: 0, y: 0, width, height });
      svg.append(hit);

      container.replaceChildren(svg, tip);
      tip.hidden = true;

      // Keep the end label inside the drawing area.
      const box = endLabel.getBBox();
      if (box.x + box.width > width - 2) endLabel.setAttribute('x', endX - (box.x + box.width - (width - 2)));
      else if (box.x < plotL) endLabel.setAttribute('x', endX + (plotL - box.x));

      interact(svg, hit, coords.map((c) => c[0]), (i) => {
        const on = i != null;
        cross.setAttribute('visibility', on ? 'visible' : 'hidden');
        hot.setAttribute('visibility', on ? 'visible' : 'hidden');
        endLabel.setAttribute('visibility', on ? 'hidden' : 'visible');
        if (!on) {
          tip.hidden = true;
          return;
        }
        const [x, y] = coords[i];
        cross.setAttribute('x1', x);
        cross.setAttribute('x2', x);
        hot.setAttribute('cx', x);
        hot.setAttribute('cy', y);
        fillTooltip(tip, opts.formatValue(pts[i].value), pts[i].title, pts[i].detail);
        placeTooltip(tip, width, x, y);
      });
    });
  }

  /**
   * Column chart for one series of counts.
   * opts.items       [{ value: number, tick: string, title: string }]
   * opts.formatValue value -> text for the tooltip
   * opts.minMax      smallest allowed axis maximum
   * opts.label       accessible name
   */
  function bars(container, opts) {
    const items = opts.items;
    const tip = makeTooltip();
    container.classList.add('chart-box');

    mount(container, (width) => {
      const height = opts.height || 190;
      const scale = niceScale(0, Math.max(opts.minMax || 1, ...items.map((d) => d.value)), 4, true);
      const tickLabels = scale.ticks.map(String);
      const m = { top: 12, right: 8, bottom: 26, left: Math.max(...tickLabels.map((l) => l.length)) * 6.4 + 14 };
      const plotL = m.left;
      const plotR = width - m.right;
      const plotT = m.top;
      const plotB = height - m.bottom;
      const band = (plotR - plotL) / items.length;
      const barW = clamp(Math.min(band * 0.62, band - 2), 3, 24); // thin columns, the rest of the band stays air
      const yOf = (v) => plotB - (v / scale.max) * (plotB - plotT);

      const svg = svgEl('svg', { width, height, viewBox: '0 0 ' + width + ' ' + height, role: 'img', tabindex: '0', 'aria-label': opts.label });
      yAxis(svg, scale, tickLabels, plotL, plotR, yOf);

      const centers = items.map((d, i) => plotL + band * (i + 0.5));
      const every = Math.max(1, Math.ceil(40 / band)); // thin out x labels, always keeping the newest
      const marks = items.map((d, i) => {
        if ((items.length - 1 - i) % every === 0) {
          svg.append(svgEl('text', { class: 'ch-tick', x: centers[i], y: height - 6, 'text-anchor': 'middle' }, d.tick));
        }
        if (d.value <= 0) return null;
        const x = centers[i] - barW / 2;
        const top = yOf(d.value);
        const r = Math.min(4, barW / 2, plotB - top);
        // Rounded at the data end, square on the baseline.
        const path = 'M' + x + ',' + plotB + ' V' + (top + r) + ' Q' + x + ',' + top + ' ' + (x + r) + ',' + top +
          ' H' + (x + barW - r) + ' Q' + (x + barW) + ',' + top + ' ' + (x + barW) + ',' + (top + r) + ' V' + plotB + ' Z';
        const mark = svgEl('path', { class: 'ch-bar', d: path });
        svg.append(mark);
        return mark;
      });

      const hit = svgEl('rect', { class: 'ch-hit', x: 0, y: 0, width, height });
      svg.append(hit);
      container.replaceChildren(svg, tip);
      tip.hidden = true;

      interact(svg, hit, centers, (i) => {
        marks.forEach((mark, j) => mark && mark.classList.toggle('is-active', j === i));
        if (i == null) {
          tip.hidden = true;
          return;
        }
        fillTooltip(tip, opts.formatValue(items[i].value), items[i].title);
        placeTooltip(tip, width, centers[i], yOf(items[i].value));
      });
    });
  }

  root.GymCharts = { line, bars, niceScale };
})(typeof self !== 'undefined' ? self : this);
