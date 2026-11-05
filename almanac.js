/* The Wheelpaper, THE ALMANAC. Seven days of the wheel in half-hour cells, from /v1/measurement/stats. */
(function () {
  "use strict";

  /* ---------- reading the feed (pure, testable) ----------
     activity.days[]           seven rows, oldest first, that turn at window.startAt's time of day (noon UTC), not midnight:
       .date                   "2026-11-03": that date's afternoon, then the NEXT date's morning
       .buckets[48]            .startMinuteUtc, .coverage ("complete" | "partial" | "future" | "missing"), .workUnits (string | null)
     activity.summary          .observedWorkUnits, .peakWindowStartMinuteUtc
     window.startAt            "2026-10-30T12:00:00.000Z"
     The same response feeds TONIGHT's lifetime distance; live.js passes it along, so this section never fetches. */
  var DIGITS = /^\d+$/;
  function intOf(v) {
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return v;
    if (typeof v === "string" && DIGITS.test(v) && Number.isSafeInteger(Number(v))) return Number(v);
    return null;
  }

  // Work in a half hour -> 0 (ran nothing) .. 4 (the busiest half hours of the week), relative to the week's peak.
  function level(work, max) {
    if (!(work > 0) || !(max > 0)) return 0;
    return Math.min(4, Math.max(1, Math.ceil((4 * work) / max)));
  }

  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function dayLabel(date) {
    var t = Date.parse(date + "T00:00:00Z");
    if (!isFinite(t)) return null;
    var d = new Date(t);
    return DAYS[d.getUTCDay()] + " " + d.getUTCDate();
  }
  function hhmm(minute) {
    var p = function (x) { return (x < 10 ? "0" : "") + x; };
    return p(Math.floor(minute / 60)) + ":" + p(minute % 60);
  }

  // The minute of the day the feed's rows turn at. With no window to read, rows are taken as plain UTC days.
  function turnMinute(json) {
    var t = Date.parse(json && json.window && json.window.startAt);
    if (!isFinite(t)) return 0;
    var d = new Date(t);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  // Response -> the map and its three readouts, or null if it is not a usable 7-day history.
  // The map's rows are real UTC days, each half hour on its true date, so a cell lines up with the settlements' clock.
  function readAlmanac(json) {
    var a = json && typeof json === "object" ? json.activity : null;
    if (!a || !Array.isArray(a.days) || !a.days.length || !a.summary) return null;
    var turn = turnMinute(json), byDate = {}, newest = null;
    for (var i = 0; i < a.days.length; i++) {
      var d = a.days[i], label = dayLabel(d && d.date);
      if (!label || !Array.isArray(d.buckets) || d.buckets.length !== 48) return null;
      var base = Date.parse(d.date + "T00:00:00Z");
      for (var k = 0; k < 48; k++) {
        var date = new Date(base + (k * 30 < turn ? 86400000 : 0)).toISOString().slice(0, 10), b = d.buckets[k];
        if (!byDate[date]) byDate[date] = new Array(48).fill(null);
        if (!b || b.coverage === "future") continue; // no reading yet: drawn as nothing, never as a zero
        byDate[date][k] = intOf(b.workUnits);
        if (newest === null || date > newest) newest = date;
      }
    }
    if (newest === null) newest = a.days[a.days.length - 1].date;
    var out = [], max = 0, end = Date.parse(newest + "T00:00:00Z");
    for (var n = 6; n >= 0; n--) {
      var day = new Date(end - n * 86400000).toISOString().slice(0, 10);
      if (byDate[day]) out.push({ date: day, label: dayLabel(day), cells: byDate[day] });
    }
    out.forEach(function (r) { r.cells.forEach(function (w) { if (w !== null && w > max) max = w; }); });
    out.forEach(function (r) { r.levels = r.cells.map(function (w) { return w === null ? null : level(w, max); }); });
    var active = out.filter(function (r) { return r.cells.some(function (w) { return w > 0; }); }).length;
    var total = intOf(a.summary.observedWorkUnits), peak = intOf(a.summary.peakWindowStartMinuteUtc);
    if (total === null || (peak !== null && peak >= 1440)) return null;
    return { days: out, max: max, total: total, peak: peak === null ? null : hhmm(peak), active: active };
  }

  // Which cell is "now": the row whose date is today in UTC, and the half hour within it.
  function nowCell(alm, ms) {
    var d = new Date(ms), date = d.toISOString().slice(0, 10);
    for (var i = 0; i < alm.days.length; i++) if (alm.days[i].date === date) return { row: i, col: Math.floor((d.getUTCHours() * 60 + d.getUTCMinutes()) / 30) };
    return null;
  }

  var LINE_DOWN = "Measurement history unreachable. The rest of the page works without it.";
  var REFRESH_MS = 10 * 60 * 1000; // the history is daily-grained: new data is taken at most every 10 minutes

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { level: level, dayLabel: dayLabel, hhmm: hhmm, readAlmanac: readAlmanac, turnMinute: turnMinute, nowCell: nowCell, LINE_DOWN: LINE_DOWN, REFRESH_MS: REFRESH_MS };
  }
  if (typeof document === "undefined") return;

  /* ---------- dot-matrix numerals: the site's glyphs, plus a colon for the clock ---------- */
  var GLYPHS = {
    "0": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    ":": [".", ".", "#", ".", "#", ".", "."]
  };
  function digitGroup(text) {
    var P = 10, R = 4, R_OFF = 1.6, x0 = 0, parts = [];
    for (var i = 0; i < text.length; i++) {
      var g = GLYPHS[text[i]];
      if (!g) continue;
      for (var row = 0; row < 7; row++) {
        for (var col = 0; col < g[row].length; col++) {
          var on = g[row][col] === "#";
          parts.push('<circle class="' + (on ? "on" : "off") + '" cx="' + (x0 + col * P + P / 2) + '" cy="' + (row * P + P / 2) + '" r="' + (on ? R : R_OFF) + '"/>');
        }
      }
      x0 += g[0].length * P + P;
    }
    var w = Math.max(P, x0 - P);
    return '<svg viewBox="0 0 ' + w + " " + 7 * P + '" aria-hidden="true" focusable="false">' + parts.join("") + "</svg>";
  }
  function dotMatrix(el, text) {
    el.innerHTML = text.split(",").map(digitGroup).join('<span class="dm__sep" aria-hidden="true">,</span>');
    el.setAttribute("aria-label", text);
  }

  /* ---------- the section ---------- */
  var root = document.getElementById("almanac");
  if (!root) return;
  var rows = root.querySelectorAll(".alm__row svg");
  var down = document.getElementById("alm-down");
  var vTotal = document.getElementById("alm-total"), vPeak = document.getElementById("alm-peak"), vActive = document.getElementById("alm-active");
  var current = null, acceptedAt = 0;
  var fmt = function (n) { return n.toLocaleString("en-US"); };
  var CELL = 16, R = [1.5, 3, 4, 5, 6.5]; // radius per level; level 0 is the faint grid dot

  function drawRow(svg, levels, outlineCol) {
    var parts = [];
    for (var c = 0; c < 48; c++) {
      var lv = levels[c], cx = c * CELL + CELL / 2;
      if (lv !== null) parts.push('<circle class="alm-l' + lv + '" cx="' + cx + '" cy="8" r="' + R[lv] + '"/>');
      if (c === outlineCol) parts.push('<rect class="alm-now" x="' + (c * CELL + 0.5) + '" y="0.5" width="' + (CELL - 1) + '" height="' + (CELL - 1) + '"/>');
    }
    svg.innerHTML = parts.join("");
  }

  function render() {
    if (!current) {
      root.setAttribute("data-state", "unreachable");
      down.textContent = LINE_DOWN;
      return;
    }
    root.setAttribute("data-state", "live");
    down.textContent = "";
    var now = nowCell(current, Date.now());
    for (var i = 0; i < rows.length; i++) {
      var d = current.days[i];
      var label = rows[i].parentNode.querySelector(".alm__day");
      if (!d) { rows[i].innerHTML = ""; label.textContent = ""; continue; }
      label.textContent = d.label;
      rows[i].setAttribute("aria-label", d.label + ": " + d.cells.reduce(function (s, w) { return s + (w || 0); }, 0).toLocaleString("en-US") + " work units");
      drawRow(rows[i], d.levels, now && now.row === i ? now.col : -1);
    }
    dotMatrix(vTotal, fmt(current.total));
    if (current.peak) dotMatrix(vPeak, current.peak); else { vPeak.innerHTML = ""; vPeak.removeAttribute("aria-label"); }
    dotMatrix(vActive, String(current.active));
  }

  // Each poll: take the shared stats if they parse and 10 minutes have passed since the last accepted ones.
  // The "now" outline moves every cycle regardless. A failed read keeps the last good map.
  document.addEventListener("wheelpaper:live", function (e) {
    var json = e.detail && e.detail.stats;
    if (!current || Date.now() - acceptedAt >= REFRESH_MS) {
      var next = null;
      try { next = readAlmanac(json); } catch (err) { next = null; }
      if (next) { current = next; acceptedAt = Date.now(); }
    }
    render();
  });
})();
