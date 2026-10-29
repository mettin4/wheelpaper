/* The Wheelpaper, phase 1. Unofficial. */
(function () {
  "use strict";

  /* ---------- difficulty model (whitepaper, exact integer rules) ----------
     blockUnits += floor(w * 10^12 / D)
     D_next      = floor((29 * D + floor(w * 1000 / 40)) / 30)   when w >= 40
     D_next      = D                                              when w <  40
     D never falls below 1,000. One block = 1,000,000,000 block units.
     BigInt throughout: w * 10^12 exceeds Number.MAX_SAFE_INTEGER at w = 10,000. */
  var UNITS_PER_BLOCK = 1000000000n;
  var START_D = 10875n;
  var MIN_D = 1000n;
  var MAX_WORK = 10000;
  var ROUNDS = 48;

  function stepRound(D, w) {
    var units = (w * 1000000000000n) / D;
    var next = D;
    if (w >= 40n) {
      next = (29n * D + (w * 1000n) / 40n) / 30n;
      if (next < MIN_D) next = MIN_D;
    }
    return { units: units, next: next };
  }

  function simulateNight(work, rounds, startD) {
    if (!Number.isInteger(work) || work < 0 || work > MAX_WORK) throw new RangeError("work must be an integer 0..10000");
    rounds = rounds === undefined ? ROUNDS : rounds;
    var w = BigInt(work);
    var D = startD === undefined ? START_D : BigInt(startD);
    var before = D, blockUnits = 0n, series = [D];
    for (var i = 0; i < rounds; i++) {
      var r = stepRound(D, w);
      blockUnits += r.units;
      D = r.next;
      series.push(D);
    }
    return { rounds: rounds, work: w, before: before, after: D, blockUnits: blockUnits, blocks: blockUnits / UNITS_PER_BLOCK, series: series };
  }

  /* ---------- supply (whitepaper launch values) ----------
     6,900 SQK per completed block, 210,000,000 premine, 2,100,000,000 cap.
     Blocks can mint 1,890,000,000; block 273,914 mints the last 300. All values < 2^53, exact as Number. */
  var SQK_PER_BLOCK = 6900;
  var CAP = 2100000000;
  var PREMINE = 210000000;
  var BLOCK_MINTABLE = CAP - PREMINE;
  var LAST_BLOCK = 273914;

  function supplyAt(blocks) {
    if (!Number.isInteger(blocks) || blocks < 0) throw new RangeError("blocks must be a non-negative integer");
    var minted = Math.min(blocks * SQK_PER_BLOCK, BLOCK_MINTABLE);
    var total = PREMINE + minted;
    return { blocks: blocks, minted: minted, total: total, left: CAP - total };
  }

  /* ---------- Squeek levels (whitepaper) ---------- */
  var LEVELS = [
    { level: 1, power: 1000, cooldown: 1000 },
    { level: 2, power: 2200, cooldown: 3000 },
    { level: 3, power: 4840, cooldown: 7000 },
    { level: 4, power: 10648, cooldown: 14000 },
    { level: 5, power: 23426, cooldown: 21000 },
    { level: 6, power: 51536, cooldown: 28000 },
    { level: 7, power: 113380, cooldown: 35000 },
    { level: 8, power: 249436, cooldown: 42000 },
    { level: 9, power: 548759, cooldown: 49000 },
    { level: 10, power: 1207269, cooldown: null } // cannot merge
  ];
  function levelCost(level) {
    if (!Number.isInteger(level) || level < 1 || level > 10) throw new RangeError("level must be 1..10");
    var cost = Math.pow(2, level - 1);
    return { level: level, l1Used: cost, burned: cost - 1 };
  }

  // The Money live line: launch math (supplyAt) applied to the live Sepolia block height.
  function moneyLine(height) {
    var en = function (n) { return n.toLocaleString("en-US"); };
    return "Sepolia has completed " + en(height) + " blocks so far. At launch values that would be " +
      en(supplyAt(height).minted) + " SQK minted.";
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      simulateNight: simulateNight, stepRound: stepRound, START_D: START_D, MIN_D: MIN_D, UNITS_PER_BLOCK: UNITS_PER_BLOCK,
      supplyAt: supplyAt, levelCost: levelCost, LEVELS: LEVELS, CAP: CAP, PREMINE: PREMINE, LAST_BLOCK: LAST_BLOCK,
      moneyLine: moneyLine
    };
  }
  if (typeof document === "undefined") return;

  /* ---------- helpers ---------- */
  var fmt = function (n) { return n.toLocaleString("en-US"); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var css = getComputedStyle(document.documentElement);
  var C = {
    gold: css.getPropertyValue("--gold").trim(),
    goldHi: css.getPropertyValue("--gold-hi").trim(),
    blue: css.getPropertyValue("--blue").trim(),
    muted: css.getPropertyValue("--muted").trim(),
    line2: css.getPropertyValue("--line-2").trim(),
    grid: css.getPropertyValue("--grid-dot").trim(),
    text: css.getPropertyValue("--text").trim()
  };
  var SVGNS = "http://www.w3.org/2000/svg";

  // Live layer (live.js polls once, dispatches "wheelpaper:live"). Every listener below is optional:
  // with no event, or an event without data, the page behaves exactly as before.
  function onLive(fn) { document.addEventListener("wheelpaper:live", function (e) { if (e.detail) fn(e.detail); }); }
  // Difficulty start: whitepaper launch value unless the visitor picks tonight's live value.
  var start = { pick: "launch", live: null };
  function startD() { return start.pick === "tonight" && start.live ? BigInt(start.live) : START_D; }

  /* ---------- dot-matrix numerals, 5x7 ---------- */
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
    ",": ["..", "..", "..", "..", "..", ".#", "#."]
  };

  // Digit groups are matrix SVGs; thousands separators are a thin gap plus a real comma,
  // so a separator can never be mistaken for a matrix dot.
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

  /* ---------- 1. the wheel ---------- */
  function circle(parent, cx, cy, r, cls) {
    var c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("cx", cx.toFixed(2)); c.setAttribute("cy", cy.toFixed(2)); c.setAttribute("r", r);
    c.setAttribute("class", cls);
    parent.appendChild(c);
  }
  function rect(parent, x, y, s, cls) {
    var r = document.createElementNS(SVGNS, "rect");
    r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", s); r.setAttribute("height", s);
    r.setAttribute("class", cls);
    parent.appendChild(r);
  }

  function buildWheel() {
    var cx = 200, cy = 200;
    var rot = document.getElementById("wheel-rot");
    var stand = document.getElementById("wheel-stand");
    var hub = document.getElementById("wheel-hub");
    var sensor = document.getElementById("wheel-sensor");
    var i, a, t;

    // stand: symmetric square-pixel cradle under the rim, centered on x = 200, static
    for (t = 0; t < 6; t++) {
      rect(stand, cx - 19 - t * 8, 372 + t * 8, 6, "px-stand");
      rect(stand, cx + 13 + t * 8, 372 + t * 8, 6, "px-stand");
    }
    for (var x = cx - 83; x <= cx + 77; x += 8) rect(stand, x, 420, 6, "px-stand");

    // outer rim, inner rim, tread rungs between them
    for (i = 0; i < 72; i++) { a = (i / 72) * Math.PI * 2; circle(rot, cx + 164 * Math.sin(a), cy - 164 * Math.cos(a), 4.2, "px"); }
    for (i = 0; i < 60; i++) { a = (i / 60) * Math.PI * 2; circle(rot, cx + 136 * Math.sin(a), cy - 136 * Math.cos(a), 3.4, "px"); }
    for (i = 0; i < 24; i++) {
      if (i === 0) continue; // magnet sits here
      a = (i / 24) * Math.PI * 2;
      circle(rot, cx + 150 * Math.sin(a), cy - 150 * Math.cos(a), 2.6, "px-dim");
    }
    // spokes
    for (i = 0; i < 6; i++) {
      a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      for (var r = 28; r <= 124; r += 12) circle(rot, cx + r * Math.sin(a), cy - r * Math.cos(a), 3, "px");
    }
    // magnet: a square pixel tile at 12 o'clock, aligned with the sensor at animation start
    rect(rot, cx - 8, cy - 150 - 8, 16, "magnet");

    // hub: 3x3 square tiles, static axle
    for (var hx = -1; hx <= 1; hx++) for (var hy = -1; hy <= 1; hy++) rect(hub, cx + hx * 9 - 3.5, cy + hy * 9 - 3.5, 7, "px");

    // sensor mark: pixel bracket above the rim at 12 o'clock
    [[-12, 6], [-4, 6], [4, 6], [-12, -2], [4, -2]].forEach(function (p) { rect(sensor, cx + p[0], 6 + p[1], 8, "px"); });
  }

  function runWheel() {
    var rot = document.getElementById("wheel-rot");
    var sensor = document.getElementById("wheel-sensor");
    var out = document.getElementById("work-count");
    var count = 0, timer = null;
    function render() {
      dotMatrix(out, fmt(count));
      out.setAttribute("aria-label", fmt(count) + " work units");
    }
    function hit() {
      count += 1;
      render();
      sensor.classList.add("is-hit");
      clearTimeout(timer);
      timer = setTimeout(function () { sensor.classList.remove("is-hit"); }, 150);
    }
    render();
    // One animation iteration = one revolution; the magnet is at the sensor at every iteration boundary.
    rot.addEventListener("animationiteration", hit);

    // Live: once real telemetry arrives a frame loop takes over from the CSS spin, starting from the
    // CSS angle so nothing jumps. Speed eases toward the hamster's pace; sleeping winds down to a stop
    // over 1 s. The counter still ticks once per revolution (magnet passing 12 o'clock), so it pauses too.
    var line = document.getElementById("wheel-live");
    var LINE_RUN = "Live: the wheel spins at Squeektoshi's real pace.", LINE_SLEEP = "Squeektoshi is sleeping right now.";
    var driven = false, angle = 0, speed = 0, target = 0, stopFrom = null, stopAt = 0, raf = 0, lastT = 0;
    function cssAngle() {
      var m = /matrix\(([^)]+)\)/.exec(getComputedStyle(rot).transform || "");
      if (!m) return 0;
      var p = m[1].split(",").map(Number);
      return (Math.atan2(p[1], p[0]) * 180 / Math.PI + 360) % 360;
    }
    function frame(now) {
      var dt = Math.min(64, Math.max(0, now - lastT)) / 1000; lastT = now;
      if (stopFrom !== null) speed = Math.max(0, stopFrom * (1 - (now - stopAt) / 1000));
      else speed += (target - speed) * Math.min(1, dt / 0.6);
      var before = angle;
      angle += speed * dt;
      if (Math.floor(angle / 360) > Math.floor(before / 360)) hit();
      rot.style.transform = "rotate(" + (angle % 360).toFixed(2) + "deg)";
      raf = stopFrom !== null && speed === 0 ? 0 : requestAnimationFrame(frame);
    }
    onLive(function (d) {
      var plan = d.wheel;
      if (!plan || plan.mode === "decorative" || !line) return; // no data yet: the CSS spin stays exactly as it was
      var text = plan.mode === "running" ? LINE_RUN : LINE_SLEEP;
      if (line.textContent !== text) line.textContent = text;
      if (reduceMotion) return; // the wheel is already still; the line still tells the truth
      if (!driven) {
        driven = true;
        angle = cssAngle();
        speed = 180; // the CSS spin: 360 degrees per 2 s
        rot.style.animation = "none";
        rot.style.transform = "rotate(" + angle.toFixed(2) + "deg)";
      }
      if (plan.mode === "running") { target = 360 / plan.duration; stopFrom = null; }
      else if (stopFrom === null) { stopFrom = speed; stopAt = performance.now(); }
      if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
    });
  }

  // Difficulty readout: the hero wheel drawing at 48px, turning at w / 5,000 revolutions per second
  // (0 = still, 10,000 = one revolution per 0.5 s).
  function runMiniWheel() {
    var svg = document.getElementById("mini-wheel"), input = document.getElementById("work");
    if (!svg) return;
    var rot = document.createElementNS(SVGNS, "g");
    rot.setAttribute("class", "mini-rot");
    rot.innerHTML = document.getElementById("wheel-rot").innerHTML;
    svg.innerHTML = document.getElementById("wheel-stand").outerHTML.replace(' id="wheel-stand"', "");
    svg.appendChild(rot);
    svg.insertAdjacentHTML("beforeend", document.getElementById("wheel-hub").outerHTML.replace(' id="wheel-hub"', ""));
    var angle = 0, last = performance.now(), visible = true;
    function frame(now) {
      var dt = Math.min(64, now - last); last = now;
      if (visible) {
        angle += (dt / 1000) * (Number(input.value) / 5000) * 360; // unwrapped degrees
        rot.setAttribute("transform", "rotate(" + (angle % 360).toFixed(2) + " 200 200)");
        rot.dataset.angle = angle.toFixed(2);
      }
      requestAnimationFrame(frame);
    }
    if (reduceMotion) return;
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(svg);
    requestAnimationFrame(frame);
  }

  /* ---------- 2. three clocks ---------- */
  function setupCanvas(cv) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function runClocks() {
    var tracks = Array.prototype.slice.call(document.querySelectorAll(".clock__track"));
    // Speeds are illustrative, not to scale: a 10-minute round vs ~12 s Ethereum blocks.
    var spec = {
      rounds: { color: C.gold, mode: "smooth", period: 12000 },
      squeek: { color: C.goldHi, mode: "work" },
      eth: { color: C.blue, mode: "hop", hop: 140 }
    };
    var state = tracks.map(function (cv) { return { cv: cv, s: spec[cv.dataset.clock], pos: 0, lit: [] }; });
    var visible = true, last = performance.now();

    function draw(st, dt, now) {
      var g = setupCanvas(st.cv), ctx = g.ctx, pitch = 12, n = Math.max(4, Math.floor((g.w - 6) / pitch)), y = g.h / 2;
      if (st.lit.length !== n) st.lit = new Array(n).fill(0);
      var s = st.s, idx;
      if (s.mode === "smooth") {
        st.pos = (st.pos + dt / s.period) % 1;
        idx = Math.floor(st.pos * n);
      } else if (s.mode === "hop") {
        st.acc = (st.acc || 0) + dt;
        while (st.acc >= s.hop) { st.acc -= s.hop; st.pos = (st.pos + 1) % n; }
        idx = st.pos;
      } else {
        // "filled by work": speed follows a slow wandering signal, with pauses
        var v = Math.max(0, Math.sin(now / 1700) + 0.6 * Math.sin(now / 610 + 1.3) - 0.15);
        st.pos = (st.pos + (dt / 2600) * v * 1.6) % 1;
        idx = Math.floor(st.pos * n);
      }
      st.lit[idx] = 1;
      ctx.clearRect(0, 0, g.w, g.h);
      for (var i = 0; i < n; i++) {
        st.lit[i] = Math.max(0, st.lit[i] - dt / 700);
        var x = 3 + i * pitch + pitch / 2;
        ctx.beginPath();
        ctx.fillStyle = C.line2;
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        if (st.lit[i] > 0) {
          ctx.globalAlpha = st.lit[i];
          ctx.fillStyle = s.color;
          ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      var hx = 3 + idx * pitch + pitch / 2;
      ctx.fillStyle = s.color;
      ctx.fillRect(hx - 5, y - 5, 10, 10);
    }

    function frame(now) {
      var dt = Math.min(64, now - last); last = now;
      if (visible) state.forEach(function (st) { draw(st, dt, now); });
      if (!reduceMotion) requestAnimationFrame(frame);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(document.querySelector(".clocks"));
    }
    if (reduceMotion) {
      // static snapshot: different positions so the three clocks still read as independent
      state[0].pos = 0.2; state[1].pos = 0.55; state[2].pos = 9;
      state.forEach(function (st) { draw(st, 0, 0); });
      window.addEventListener("resize", function () { state.forEach(function (st) { draw(st, 0, 0); }); });
    } else {
      requestAnimationFrame(frame);
    }
  }

  /* ---------- 3. difficulty ---------- */
  function niceStep(range) {
    var raw = range / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }

  function drawChart(cv, series) {
    var g = setupCanvas(cv), ctx = g.ctx;
    var vals = series.map(Number); // D values are small integers, exact as Number
    var mobile = g.w < 520;
    var padL = mobile ? 64 : 80, padR = 16, padT = 56, padB = 40;
    var pw = g.w - padL - padR, ph = g.h - padT - padB;
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1000) { lo -= 1000; hi += 1000; }
    var step = niceStep(hi - lo);
    lo = Math.max(0, Math.floor(lo / step) * step); hi = Math.ceil(hi / step) * step;
    var X = function (i) { return padL + (i / (vals.length - 1)) * pw; };
    var Y = function (v) { return padT + (1 - (v - lo) / (hi - lo)) * ph; };

    ctx.clearRect(0, 0, g.w, g.h);
    // dotted grid
    ctx.fillStyle = C.grid;
    for (var gx = padL; gx <= padL + pw + 0.5; gx += 12) for (var gy = padT; gy <= padT + ph + 0.5; gy += 12) ctx.fillRect(gx - 1, gy - 1, 2, 2);

    ctx.font = '13px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textBaseline = "middle";
    // y ticks
    ctx.textAlign = "right";
    for (var v = lo; v <= hi + 0.5; v += step) {
      ctx.fillStyle = C.line2; ctx.fillRect(padL, Math.round(Y(v)), pw, 1);
      ctx.fillStyle = C.muted; ctx.fillText(fmt(Math.round(v)), padL - 8, Y(v));
    }
    // x ticks
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    var xt = mobile ? [0, 12, 24, 36, 48] : [0, 6, 12, 18, 24, 30, 36, 42, 48];
    xt.forEach(function (i) { ctx.fillStyle = C.muted; ctx.fillText(fmt(i), X(i), padT + ph + 10); });
    // axis titles
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("difficulty", 8, 12);
    ctx.fillText("round", 8, padT + ph + 10);

    // line, then one pixel per round
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.beginPath();
    vals.forEach(function (d, i) { i ? ctx.lineTo(X(i), Y(d)) : ctx.moveTo(X(i), Y(d)); });
    ctx.stroke();
    var m = mobile ? 2 : 3;
    ctx.fillStyle = C.gold;
    vals.forEach(function (d, i) { ctx.fillRect(Math.round(X(i)) - m, Math.round(Y(d)) - m, 2 * m, 2 * m); });
  }

  function runDifficulty() {
    var input = document.getElementById("work");
    var cv = document.getElementById("chart");
    var note = document.getElementById("sleep-note");
    var last = null;

    function update() {
      var work = Number(input.value);
      var r = simulateNight(work, undefined, startD());
      last = r;
      dotMatrix(document.getElementById("work-value"), fmt(work));
      input.setAttribute("aria-valuetext", fmt(work) + " work units per round");
      dotMatrix(document.getElementById("blocks-out"), fmt(r.blocks));
      document.getElementById("blocks-out").setAttribute("aria-label", fmt(r.blocks) + " blocks completed");
      document.getElementById("d-after").textContent = fmt(r.after);
      note.hidden = work !== 0;
      drawChart(cv, r.series);
    }
    input.addEventListener("input", update);
    update();
    var redraw = function () { if (last) drawChart(cv, last.series); };
    if ("ResizeObserver" in window) new ResizeObserver(redraw).observe(cv);
    else window.addEventListener("resize", redraw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);

    // Start toggle: its space is reserved in CSS, it only becomes visible and usable once a live
    // difficulty arrives. Until then (or if it never does) Launch and the original footnote stand.
    var tog = document.getElementById("start-toggle"), footnote = document.getElementById("start-note");
    if (!tog || !footnote) return;
    var NOTE_LAUNCH = footnote.textContent;
    var NOTE_TONIGHT = "Tonight's real Sepolia difficulty, read live from the public Squeekchain API.";
    var opts = Array.prototype.slice.call(tog.querySelectorAll("[data-start]"));
    var tonightBtn = tog.querySelector('[data-start="tonight"]');
    function pick(which) {
      start.pick = which;
      opts.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.start === which)); });
      footnote.textContent = which === "tonight" ? NOTE_TONIGHT : NOTE_LAUNCH;
      update();
    }
    opts.forEach(function (b) { b.addEventListener("click", function () { pick(b.dataset.start); }); });
    onLive(function (d) {
      var D = d.data && d.data.difficulty;
      if (!D) return;
      var changed = start.live !== D;
      start.live = D;
      tonightBtn.textContent = "Tonight · " + fmt(D);
      if (!tog.hasAttribute("data-ready")) {
        tog.setAttribute("data-ready", "");
        tog.removeAttribute("inert");
        tog.removeAttribute("aria-hidden");
      }
      if (changed && start.pick === "tonight") update();
    });
  }

  // Copy result: the current night as one shareable line, plus wherever this page is hosted.
  function runCopyResult() {
    var btn = document.getElementById("copy-result"), input = document.getElementById("work"), timer = null;
    if (!btn) return;
    var label = btn.textContent;
    function text() {
      var r = simulateNight(Number(input.value), undefined, startD());
      return "If Squeektoshi runs " + fmt(Number(input.value)) + " work units per round for one night: " + fmt(r.blocks) +
        " blocks, difficulty " + fmt(r.before) + " -> " + fmt(r.after) + ". " + location.href;
    }
    function fallback(t) {
      var ta = document.createElement("textarea");
      ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) { /* nothing else to try */ }
      document.body.removeChild(ta);
    }
    btn.addEventListener("click", function () {
      var t = text();
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).catch(function () { fallback(t); });
      else fallback(t);
      btn.textContent = "Copied.";
      btn.classList.add("is-done");
      clearTimeout(timer);
      timer = setTimeout(function () { btn.textContent = label; btn.classList.remove("is-done"); }, 1000);
    });
  }

  /* ---------- section dots ---------- */
  function runSectionNav() {
    var nav = document.getElementById("secnav");
    if (!nav) return;
    var dots = Array.prototype.slice.call(nav.querySelectorAll(".secnav__dot"));
    var secs = dots.map(function (d) { return document.querySelector(d.getAttribute("href")); });
    var queued = false;
    // active = the last section whose top has crossed the middle of the viewport
    function update() {
      queued = false;
      var mid = window.innerHeight / 2, active = 0;
      secs.forEach(function (s, i) { if (s.getBoundingClientRect().top <= mid) active = i; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) active = secs.length - 1;
      dots.forEach(function (d, i) { d.setAttribute("aria-current", String(i === active)); });
    }
    window.addEventListener("scroll", function () { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener("resize", update);
    dots.forEach(function (d, i) {
      d.addEventListener("click", function (e) {
        e.preventDefault();
        secs[i].scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        if (history.replaceState) history.replaceState(null, "", d.getAttribute("href"));
      });
    });
    update();
  }

  /* ---------- 4. the money ---------- */
  function drawSupply(cv, s) {
    var g = setupCanvas(cv), ctx = g.ctx;
    var pitch = g.w < 520 ? 7 : 9, rows = g.w < 520 ? 4 : 5, r = pitch * 0.36;
    var cols = Math.max(10, Math.floor(g.w / pitch));
    var x0 = (g.w - cols * pitch) / 2 + pitch / 2, y0 = (g.h - rows * pitch) / 2 + pitch / 2;
    var per = CAP / cols;
    ctx.clearRect(0, 0, g.w, g.h);
    for (var c = 0; c < cols; c++) {
      var start = c * per, end = (c + 1) * per, color, alpha = 1, rad = r;
      if (end <= PREMINE + 0.5) color = C.blue;
      else if (end <= s.total + 0.5) color = C.gold;
      else if (start < s.total) { color = C.gold; alpha = 0.25 + 0.75 * (s.total - start) / per; }
      else { color = C.line2; rad = r * 0.55; }
      ctx.globalAlpha = alpha; ctx.fillStyle = color;
      for (var k = 0; k < rows; k++) { ctx.beginPath(); ctx.arc(x0 + c * pitch, y0 + k * pitch, rad, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    // the cap: block 273,914 brings the total to 2,100,000,000, the bar's right end. Thin gold tick, label set beneath it.
    var tickX = Math.min(Math.round((g.w + cols * pitch) / 2), g.w - 2);
    ctx.fillStyle = C.gold;
    ctx.fillRect(tickX, 0, 2, g.h);
    var cap = document.getElementById("supply-cap");
    if (cap) cap.style.marginRight = Math.max(0, g.w - tickX - 2) + "px";
  }

  function runMoney() {
    var input = document.getElementById("blocks"), cv = document.getElementById("supply-bar");
    var note = document.getElementById("cap-note"), last = null;
    function update() {
      var blocks = Math.min(Number(input.value), LAST_BLOCK); // step 1,000 cannot land on 273,914; the top stop clamps to it
      var s = supplyAt(blocks);
      last = s;
      dotMatrix(document.getElementById("blocks-value"), fmt(blocks));
      input.setAttribute("aria-valuetext", fmt(blocks) + " completed blocks");
      document.getElementById("m-minted").textContent = fmt(s.minted);
      document.getElementById("m-total").textContent = fmt(s.total);
      document.getElementById("m-left").textContent = fmt(s.left);
      note.hidden = blocks !== LAST_BLOCK;
      drawSupply(cv, s);
    }
    input.addEventListener("input", update);
    update();
    var redraw = function () { if (last) drawSupply(cv, last); };
    if ("ResizeObserver" in window) new ResizeObserver(redraw).observe(cv); else window.addEventListener("resize", redraw);

    // Live line under the source: space reserved in CSS, text appears only with a live block height.
    var liveLine = document.getElementById("money-live");
    if (!liveLine) return;
    onLive(function (d) {
      if (!d.data) return;
      liveLine.textContent = moneyLine(d.data.height);
      liveLine.setAttribute("data-ready", "");
      liveLine.removeAttribute("aria-hidden");
    });
  }

  /* ---------- 5. the squeeks ---------- */
  function runSqueeks() {
    var host = document.getElementById("pyramid");
    var buttons = [];
    // L10 on top, L1 at the base; dot count shrinks as levels rise
    for (var i = LEVELS.length - 1; i >= 0; i--) {
      var L = LEVELS[i], dots = 2 * (11 - L.level), P = 10, parts = [];
      for (var d = 0; d < dots; d++) parts.push('<circle cx="' + (d * P + P / 2) + '" cy="5" r="3.6"/>');
      var b = document.createElement("button");
      b.type = "button";
      b.className = "lv";
      b.dataset.level = String(L.level);
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", "Level " + L.level + ", power " + fmt(L.power));
      b.innerHTML = '<span class="lv__name">L' + L.level + '</span><span class="lv__dots"><svg viewBox="0 0 ' + dots * P + ' 10" aria-hidden="true" focusable="false">' + parts.join("") + '</svg></span><span class="lv__power">' + fmt(L.power) + "</span>";
      host.appendChild(b);
      buttons.push(b);
    }
    function select(level) {
      var L = LEVELS[level - 1], c = levelCost(level);
      buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.dataset.level) === level)); });
      dotMatrix(document.getElementById("lv-level"), String(level));
      document.getElementById("lv-power").textContent = fmt(L.power);
      document.getElementById("lv-cooldown").textContent = L.cooldown === null ? "cannot merge" : fmt(L.cooldown) + " blocks";
      document.getElementById("lv-cost").textContent = fmt(c.l1Used);
      document.getElementById("lv-burn").textContent = fmt(c.burned);
    }
    host.addEventListener("click", function (e) {
      var b = e.target.closest(".lv");
      if (b) select(Number(b.dataset.level));
    });
    select(10);
  }

  /* ---------- slider affordance: fill, drag state, one-time hint, first-view nudge ---------- */
  function store(key, val) {
    try { if (val === undefined) return window.localStorage.getItem(key); window.localStorage.setItem(key, val); } catch (e) { return null; }
    return null;
  }
  function sliderAffordance(input, nudge) {
    var wrap = input.parentElement;
    var hint = document.querySelector('.drag-hint[data-for="' + input.id + '"]');
    function fill() {
      var min = Number(input.min), max = Number(input.max);
      wrap.style.setProperty("--p", String((Number(input.value) - min) / (max - min)));
    }
    input.addEventListener("input", fill);
    fill();

    // The hint shows on every load and retires for the rest of the visit after the first drag of THIS slider.
    // After the 300ms fade, release its space so no gap is left under the slider.
    hint.addEventListener("transitionend", function (e) { if (e.propertyName === "opacity" && hint.classList.contains("is-gone")) hint.hidden = true; });
    var dragging = false;
    function start() { dragging = true; input.classList.add("is-dragging"); input.classList.remove("is-nudging"); }
    function end() { if (!dragging) return; dragging = false; input.classList.remove("is-dragging"); }
    input.addEventListener("pointerdown", start);
    input.addEventListener("touchstart", start, { passive: true });
    ["pointerup", "pointercancel", "touchend", "touchcancel", "blur"].forEach(function (t) { input.addEventListener(t, end); });
    window.addEventListener("pointerup", end);
    // first real drag (a value change while the handle is held) retires the hint for good
    input.addEventListener("input", function () {
      if (!dragging || hint.classList.contains("is-gone")) return;
      hint.classList.add("is-gone");
    });

    if (nudge && !reduceMotion && store("wheelpaper.nudged") !== "1" && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        io.disconnect();
        store("wheelpaper.nudged", "1");
        if (dragging) return;
        input.classList.add("is-nudging");
        input.addEventListener("animationend", function () { input.classList.remove("is-nudging"); }, { once: true });
      }, { threshold: 1 });
      io.observe(input);
    }
  }

  buildWheel();
  runWheel();
  runMiniWheel();
  runClocks();
  runDifficulty();
  runCopyResult();
  runMoney();
  runSqueeks();
  sliderAffordance(document.getElementById("work"), true);
  sliderAffordance(document.getElementById("blocks"), false);
  runSectionNav();
})();
