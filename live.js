/* The Wheelpaper, TONIGHT strip. Live Sepolia values; the page never depends on them. */
(function () {
  "use strict";

  /* ---------- reading the public status (pure, testable) ----------
     One GET to /v1/status carries everything the strip shows:
       builder.anchor.blockHeight      Squeek block height settled on Ethereum
       measurement.cumulativeWorkUnits work units counted by the wheel
       measurement.distanceMm          distance run, millimetres
       measurement.freshness           "online" | "stale"
       measurement.observedAt          last wheel reading, ISO UTC
       measurement.rpmMilli            wheel speed, revolutions per minute x 1000
       builder.anchor.workPerThousandBlocks  current difficulty D (whitepaper launch value 10,875)
     measurement.distanceMm resets every day, so the distance comes from a second GET in the same cycle:
       /v1/measurement/stats  lifetime.observedDistanceMm  total distance since the first reading
     If only that call fails, the strip falls back to today's distanceMm and says so in the label.
     The same reading feeds the hero wheel, the difficulty start toggle and the money line:
     each poll dispatches "wheelpaper:live" on document; app.js listens. */
  var API = "https://api.squeekchain.com/v1/status";
  var STATS_API = "https://api.squeekchain.com/v1/measurement/stats?range=7d";
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
    // rpm and difficulty are optional: without them the strip still works and those features stay off.
    var rpmMilli = intOf(m.rpmMilli), difficulty = intOf(a.workPerThousandBlocks);
    return { height: height, work: work, mm: mm, observedAt: observed, stale: m.freshness === "stale" || tooOld,
             rpm: rpmMilli === null ? null : rpmMilli / 1000, difficulty: difficulty > 0 ? difficulty : null };
  }

  // The API answered and has no wheel reading: measurement is null, as after a testnet redeploy. That is not an
  // outage, and whatever this tab read before belongs to the previous chain.
  function noMeasurement(json) { return !!json && typeof json === "object" && "measurement" in json && json.measurement === null; }

  // Lifetime distance in mm from /v1/measurement/stats, or null if the response does not carry it.
  function readStats(json) {
    var l = json && typeof json === "object" ? json.lifetime : null;
    return l && typeof l === "object" ? intOf(l.observedDistanceMm) : null;
  }

  var LABEL_LIFETIME = "Distance run, lifetime";
  var LABEL_TODAY = "Distance run, today";
  // Lifetime distance when the stats call worked, today's distance from /status when it did not.
  function withDistance(data, lifetimeMm) {
    if (!data) return null;
    var lifetime = lifetimeMm !== null && lifetimeMm !== undefined;
    data.distanceMm = lifetime ? lifetimeMm : data.mm;
    data.distanceLabel = lifetime ? LABEL_LIFETIME : LABEL_TODAY;
    return data;
  }

  // Seconds per revolution at the hamster's pace, clamped so the drawing stays readable.
  function wheelDuration(rpm) { return Math.min(10, Math.max(0.4, 60 / rpm)); }

  // decorative: never had data, keep the CSS spin. running: real pace. sleeping: wind down and stop.
  function wheelPlan(data) {
    if (!data) return { mode: "decorative" };
    if (data.stale || !(data.rpm > 0)) return { mode: "sleeping" };
    return { mode: "running", duration: wheelDuration(data.rpm) };
  }

  var fmtInt = function (n) { return n.toLocaleString("en-US"); };
  function fmtKm(mm) { return (mm / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function utcHHMM(ms) { return new Date(ms).toISOString().slice(11, 16); }

  var LINE_LIVE = "Live Sepolia test values from the public Squeekchain API. Everything below uses launch values from the whitepaper.";
  var LINE_DOWN = "Live feed unreachable. The whitepaper math below works without it.";
  var LINE_WAITING = "Live feed is up, no wheel reading yet. The whitepaper math below works without it.";
  function sleepingLine(ms) { return "Squeektoshi is sleeping. Last reading " + utcHHMM(ms) + " UTC."; }

  // What the strip should show, given the newest fetch result, the last good reading and whether the API
  // answered with no measurement. A failed fetch keeps the last reading; an answer of "nothing" does not.
  function view(result, last, waiting) {
    if (result) return { state: result.stale ? "sleeping" : "live", data: result, dot: result.stale ? "off" : "on",
                         line: result.stale ? sleepingLine(result.observedAt) : LINE_LIVE };
    if (waiting) return { state: "waiting", data: null, dot: "off", line: LINE_WAITING };
    if (last) return { state: last.view.state, data: last.data, dot: "off", line: last.view.line };
    return { state: "unreachable", data: null, dot: "off", line: LINE_DOWN };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { readStatus: readStatus, readStats: readStats, withDistance: withDistance,
                       LABEL_LIFETIME: LABEL_LIFETIME, LABEL_TODAY: LABEL_TODAY, STATS_API: STATS_API,
                       view: view, noMeasurement: noMeasurement, fmtKm: fmtKm, utcHHMM: utcHHMM, API: API,
                       wheelDuration: wheelDuration, wheelPlan: wheelPlan,
                       LINE_LIVE: LINE_LIVE, LINE_DOWN: LINE_DOWN, LINE_WAITING: LINE_WAITING, sleepingLine: sleepingLine };
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
  var el = strip && {
    height: document.getElementById("tn-height"),
    work: document.getElementById("tn-work"),
    km: document.getElementById("tn-km"),
    kmLabel: document.getElementById("tn-km-label"),
    line: document.getElementById("tn-line"),
    down: document.getElementById("tn-down")
  };
  var last = null, lastAttempt = 0, timer = null, inFlight = false;

  // One reading, every consumer: the strip here, the rest through the event.
  function publish(v) {
    if (strip) render(v);
    // stats: this cycle's raw /v1/measurement/stats response (or null), shared so THE ALMANAC needs no fetch of its own
    var detail = { state: v.state, data: v.data, wheel: wheelPlan(v.data), stats: cycleStats };
    var ev;
    try { ev = new CustomEvent("wheelpaper:live", { detail: detail }); }
    catch (e) { ev = document.createEvent("CustomEvent"); ev.initCustomEvent("wheelpaper:live", false, false, detail); }
    document.dispatchEvent(ev);
  }

  function render(v) {
    strip.setAttribute("data-state", v.state);
    strip.setAttribute("data-dot", v.dot);
    if (v.data) {
      var h = fmtInt(v.data.height), w = fmtInt(v.data.work), k = fmtKm(v.data.distanceMm);
      dotMatrix(el.height, h); el.height.setAttribute("aria-label", h);
      dotMatrix(el.work, w); el.work.setAttribute("aria-label", w);
      dotMatrix(el.km, k); el.km.setAttribute("aria-label", k + " km");
      el.kmLabel.textContent = v.data.distanceLabel;
    }
    el.line.textContent = v.line;
    el.down.textContent = v.data ? LINE_DOWN : v.line;
  }

  // One GET with its own timeout; resolves to parsed JSON or null, never rejects.
  function getJson(url) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var killer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    var request = fetch(url, { method: "GET", mode: "cors", credentials: "omit", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; }); // abort, CORS, DNS, bad JSON: all just "no data", never an unhandled rejection
    var deadline = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, TIMEOUT_MS + 50); });
    return Promise.race([request, deadline])
      .then(function (res) { clearTimeout(killer); return res; }, function () { clearTimeout(killer); return null; });
  }

  // Both calls run in parallel each cycle; the status call alone decides live / sleeping / waiting / unreachable.
  // A page without the strip (the widget) has no distance to show, so it skips the stats call.
  var cycleStats = null, cycleWaiting = false;
  function fetchStatus() {
    return Promise.all([getJson(API), strip ? getJson(STATS_API) : null]).then(function (r) {
      cycleStats = r[1] && typeof r[1] === "object" ? r[1] : null;
      cycleWaiting = noMeasurement(r[0]);
      var lifetime = null;
      try { lifetime = readStats(r[1]); } catch (e) { lifetime = null; }
      return withDistance(readStatus(r[0]), lifetime);
    });
  }

  function tick() {
    timer = null;
    if (document.hidden || inFlight) return;
    inFlight = true;
    lastAttempt = Date.now();
    cycleWaiting = false;
    var done = function (result) {
      inFlight = false;
      var v = view(result, last, cycleWaiting);
      if (result) last = { data: result, view: v };
      else if (cycleWaiting) last = null;
      publish(v);
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
