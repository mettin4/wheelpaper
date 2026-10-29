/* The Wheelpaper, TONIGHT strip. Live Sepolia values; the page never depends on them. */
(function () {
  "use strict";

  /* ---------- reading the public status (pure, testable) ----------
     One GET to /v1/status carries everything the strip shows:
       builder.anchor.blockHeight      Squeek block height settled on Ethereum
       measurement.cumulativeWorkUnits work units counted by the wheel
       measurement.distanceMm          distance run, millimetres
       measurement.freshness           "online" | "stale"
       measurement.observedAt          last wheel reading, ISO UTC */
  var API = "https://api.squeekchain.com/v1/status";
  var TIMEOUT_MS = 5000;
  var REFRESH_MS = 60000;
  var DIGITS = /^\d+$/;

  function intOf(v) {
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return v;
    if (typeof v === "string" && DIGITS.test(v) && Number.isSafeInteger(Number(v))) return Number(v);
    return null;
  }

  // Returns null for anything that does not look like a real status response.
  function readStatus(json) {
    if (!json || typeof json !== "object") return null;
    var m = json.measurement, a = json.builder && json.builder.anchor;
    if (!m || !a) return null;
    var height = intOf(a.blockHeight), work = intOf(m.cumulativeWorkUnits), mm = intOf(m.distanceMm);
    var observed = Date.parse(m.observedAt);
    if (height === null || work === null || mm === null || !isFinite(observed)) return null;
    // Stale if the API says so, or if the reading is older than its own limit
    // (measured against the API's clock, so a wrong visitor clock cannot flip it).
    var generated = Date.parse(json.generatedAt);
    var limit = intOf(m.staleAfterSeconds);
    var tooOld = isFinite(generated) && limit !== null && generated - observed > limit * 1000;
    return { height: height, work: work, mm: mm, observedAt: observed, stale: m.freshness === "stale" || tooOld };
  }

  var fmtInt = function (n) { return n.toLocaleString("en-US"); };
  function fmtKm(mm) { return (mm / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function utcHHMM(ms) { return new Date(ms).toISOString().slice(11, 16); }

  var LINE_LIVE = "Live Sepolia test values from the public Squeekchain API. Everything below uses launch values from the whitepaper.";
  var LINE_DOWN = "Live feed unreachable. The whitepaper math below works without it.";
  function sleepingLine(ms) { return "Squeektoshi is sleeping. Last reading " + utcHHMM(ms) + " UTC."; }

  // What the strip should show, given the newest fetch result and the last good reading.
  function view(result, last) {
    if (result) return { state: result.stale ? "sleeping" : "live", data: result, dot: result.stale ? "off" : "on",
                         line: result.stale ? sleepingLine(result.observedAt) : LINE_LIVE };
    if (last) return { state: last.view.state, data: last.data, dot: "off", line: last.view.line };
    return { state: "unreachable", data: null, dot: "off", line: LINE_DOWN };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { readStatus: readStatus, view: view, fmtKm: fmtKm, utcHHMM: utcHHMM, API: API,
                       LINE_LIVE: LINE_LIVE, LINE_DOWN: LINE_DOWN, sleepingLine: sleepingLine };
  }
  if (typeof document === "undefined") return;

  /* ---------- dot-matrix numerals: app.js glyphs, plus a decimal point for km ---------- */
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
    ".": [".", ".", ".", ".", ".", ".", "#"]
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
  }

  /* ---------- the strip ---------- */
  var strip = document.getElementById("tonight");
  if (!strip) return;
  var el = {
    height: document.getElementById("tn-height"),
    work: document.getElementById("tn-work"),
    km: document.getElementById("tn-km"),
    line: document.getElementById("tn-line"),
    down: document.getElementById("tn-down")
  };
  var last = null, lastAttempt = 0, timer = null, inFlight = false;

  function render(v) {
    strip.setAttribute("data-state", v.state);
    strip.setAttribute("data-dot", v.dot);
    if (v.data) {
      var h = fmtInt(v.data.height), w = fmtInt(v.data.work), k = fmtKm(v.data.mm);
      dotMatrix(el.height, h); el.height.setAttribute("aria-label", h);
      dotMatrix(el.work, w); el.work.setAttribute("aria-label", w);
      dotMatrix(el.km, k); el.km.setAttribute("aria-label", k + " km");
    }
    el.line.textContent = v.line;
    el.down.textContent = LINE_DOWN;
  }

  function fetchStatus() {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var killer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    var request = fetch(API, { method: "GET", mode: "cors", credentials: "omit", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; }); // abort, CORS, DNS, bad JSON: all just "no data", never an unhandled rejection
    var deadline = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, TIMEOUT_MS + 50); });
    return Promise.race([request, deadline])
      .then(readStatus)
      .then(function (res) { clearTimeout(killer); return res; }, function () { clearTimeout(killer); return null; });
  }

  function tick() {
    timer = null;
    if (document.hidden || inFlight) return;
    inFlight = true;
    lastAttempt = Date.now();
    var done = function (result) {
      inFlight = false;
      var v = view(result, last);
      if (result) last = { data: result, view: v };
      render(v);
      schedule(REFRESH_MS);
    };
    try { fetchStatus().then(done, function () { done(null); }); } catch (e) { done(null); }
  }

  function schedule(ms) {
    if (timer) clearTimeout(timer);
    timer = document.hidden ? null : setTimeout(tick, ms);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { if (timer) clearTimeout(timer); timer = null; return; }
    schedule(Math.max(0, REFRESH_MS - (Date.now() - lastAttempt)));
  });

  tick();
})();
