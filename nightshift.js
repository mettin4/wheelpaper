/* The Wheelpaper, THE NIGHT SHIFT: a pacing game on the whitepaper's difficulty rule. */
(function () {
  "use strict";

  // The rule itself lives in app.js (stepRound, START_D, UNITS_PER_BLOCK); this file only calls it.
  var node = typeof module !== "undefined" && module.exports;
  var sim = node ? require("./app.js") : window.Wheelpaper;
  // Never fail quietly here: without these the section is an empty gap and a dead button. index.html's ?v=
  // keeps a cached app.js from pairing with this file; if that ever slips, this says so in the console.
  if (!sim || !sim.stepRound || (!node && !sim.dotMatrix)) throw new Error("THE NIGHT SHIFT: app.js is missing or out of date (no window.Wheelpaper). Hard-refresh the page.");

  /* ---------- tuning ----------
     PASS_UNITS: work units per accepted pass, the one tunable constant. At 45, a steady 9 passes a second
     (405 work per round) plays like one of Squeektoshi's active rounds on Sepolia, which run about 400 to 500:
     difficulty heads for 405 x 1000 / 40 = 10,125 and each round completes about 40 blocks.
     tests/nightshift.test.js holds the tuning check. */
  var PASS_UNITS = 45;
  var GAP_MS = 60;        // a pass under 60 ms after the previous accepted pass is rejected; exactly 60 counts
  var ROUNDS = 48;        // one night
  var ROUND_MS = 1000;    // one round per second
  var PACE_ROUNDS = 3;    // "your pace": the mean work of the last few closed rounds
  var GAUGE_SPAN = 4000;  // the gauge shows the target +/- this much; the marker stops at the ends

  function tooFast(prevAt, t) { return prevAt !== null && t - prevAt < GAP_MS; }

  /* ---------- scoring ---------- */
  function distance(dawn, target) { return dawn > target ? dawn - target : target - dawn; }
  function verdict(dawn, target) {
    var d = distance(dawn, target);
    if (d <= 250n) return { tier: "ran", text: "RAN LIKE A HAMSTER." };
    if (d <= 1000n) return { tier: "almost", text: "ALMOST A HAMSTER." };
    return dawn > target ? { tier: "fast", text: "TOO FAST FOR A HAMSTER." } : { tier: "slept", text: "SLEPT HALF THE NIGHT." };
  }
  // Under 40 work a round does not steer, so a night with no such round leaves difficulty at the launch value.
  // That is not pacing: it gets this stamp in place of a verdict and never counts as a best.
  var STEER_WORK = 40;
  var BARELY = { tier: "barely", text: "THE WHEEL BARELY TURNED." };
  function barelyTurned(works) { return works.every(function (w) { return w < STEER_WORK; }); }

  /* ---------- the gauge ----------
     Projected dawn: the real rule run forward from where you are, at your current pace, to the end of the night.
     Before the first round closes there is no pace yet, so the projection is simply the current difficulty. */
  function projectDawn(D, work, roundsLeft) {
    var w = BigInt(work);
    for (var i = 0; i < roundsLeft; i++) D = sim.stepRound(D, w).next;
    return D;
  }
  function paceOf(works) {
    var recent = works.slice(-PACE_ROUNDS), sum = 0;
    for (var i = 0; i < recent.length; i++) sum += recent[i];
    return recent.length ? Math.floor(sum / recent.length) : 0;
  }
  // 0 = left end, 0.5 = on the target, 1 = right end
  function gaugePos(projected, target) {
    var p = Number(projected - target) / (2 * GAUGE_SPAN) + 0.5;
    return Math.max(0, Math.min(1, p));
  }

  // One night. Times are ms since the start. Rounds close in order: each is priced at the difficulty in force
  // before it, then steers it (stepRound does both, in that order), exactly as on chain. The target is fixed
  // when the night starts. live = false means it is the launch value, not Squeektoshi's difficulty.
  function createNight(target, live) {
    var n = { round: 0, D: sim.START_D, units: 0n, roundWork: 0, work: 0, accepted: 0, rejected: 0, lastAt: null, works: [],
              target: target === undefined ? sim.START_D : BigInt(target), live: !!live };
    n.advance = function (t) {
      while (n.round < ROUNDS && t >= (n.round + 1) * ROUND_MS) {
        var r = sim.stepRound(n.D, BigInt(n.roundWork));
        n.units += r.units; n.D = r.next; n.work += n.roundWork; n.works.push(n.roundWork); n.roundWork = 0; n.round += 1;
      }
      return n.round >= ROUNDS;
    };
    n.pass = function (t) {
      if (n.advance(t)) return "over";
      if (tooFast(n.lastAt, t)) { n.rejected += 1; return "rejected"; }
      n.lastAt = t; n.accepted += 1; n.roundWork += PASS_UNITS;
      return "accepted";
    };
    n.blocks = function () { return n.units / sim.UNITS_PER_BLOCK; };
    n.projected = function () { return n.works.length ? projectDawn(n.D, paceOf(n.works), ROUNDS - n.round) : n.D; };
    n.report = function () {
      var scored = !barelyTurned(n.works);
      return { blocks: n.blocks(), dawn: n.D, target: n.target, live: n.live, delta: distance(n.D, n.target), scored: scored,
               verdict: scored ? verdict(n.D, n.target) : BARELY, work: n.work, accepted: n.accepted, rejected: n.rejected };
    };
    return n;
  }

  var en = function (x) { return x.toLocaleString("en-US"); };
  function targetLabel(target, live) { return "TARGET · " + en(target) + (live ? "" : " (LAUNCH VALUE)"); }
  // With no live reading the target is the launch value, so the line must not call it Squeektoshi's.
  function copyText(r) {
    if (!r.scored) return "Night shift: " + r.verdict.text + " " + en(r.blocks) + " blocks. wheelpaper.online";
    var base = r.live ? "Squeektoshi's real " + en(r.target) : "the launch value " + en(r.target);
    return "Night shift: dawn difficulty " + en(r.dawn) + ", " + en(r.delta) + " off " + base + ". " + en(r.blocks) + " blocks. wheelpaper.online";
  }

  /* ---------- the card: 1200 x 675, the site's dot-matrix style ---------- */
  var CARD_W = 1200, CARD_H = 675;
  // the site's 5 x 7 numerals: on dots gold, off dots dim, a real comma between digit groups
  function drawDM(ctx, text, x, y, h, c, glyphs, fonts) {
    var P = h / 7, x0 = x;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === ",") {
        ctx.fillStyle = c.gold; ctx.font = Math.round(h * 0.8) + "px " + fonts.mono; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
        x0 += Math.max(4, h * 0.1) - P;
        ctx.fillText(",", x0, y + h + h * 0.12);
        x0 += ctx.measureText(",").width + Math.max(4, h * 0.1);
        continue;
      }
      var g = glyphs[ch];
      if (!g) continue;
      for (var row = 0; row < 7; row++) for (var col = 0; col < g[row].length; col++) {
        var on = g[row][col] === "#";
        ctx.fillStyle = on ? c.gold : c.line2;
        ctx.beginPath(); ctx.arc(x0 + col * P + P / 2, y + row * P + P / 2, on ? P * 0.4 : P * 0.16, 0, Math.PI * 2); ctx.fill();
      }
      x0 += g[0].length * P + P;
    }
    return x0 - P - x;
  }
  var SHAPE_STYLE = { px: ["gold", 1], "px-dim": ["gold2", 0.55], "px-stand": ["muted", 0.55], magnet: ["blue", 1], sensor: ["muted", 1] };

  function drawCard(cv, r, o) {
    cv.width = CARD_W; cv.height = CARD_H;
    var ctx = cv.getContext("2d"), c = o.colors, x, y;
    var spacing = function (s) { if ("letterSpacing" in ctx) ctx.letterSpacing = s; };
    ctx.fillStyle = c.bg; ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.fillStyle = c.grid;
    for (x = 9; x < CARD_W; x += 18) for (y = 9; y < CARD_H; y += 18) { ctx.beginPath(); ctx.arc(x, y, 1.25, 0, Math.PI * 2); ctx.fill(); }

    // the wheel glyph: the hero wheel's own pixels, at rest, magnet under the sensor
    ctx.save(); ctx.translate(80, 118);
    o.shapes.forEach(function (s) {
      var st = SHAPE_STYLE[s.cls] || SHAPE_STYLE.px;
      ctx.globalAlpha = st[1]; ctx.fillStyle = c[st[0]];
      if (s.k === "c") { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(s.x, s.y, s.s, s.s);
    });
    ctx.restore(); ctx.globalAlpha = 1;

    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = c.muted; ctx.font = "16px " + o.fonts.mono; spacing("3px");
    ctx.fillText("THE NIGHT SHIFT", 560, 74);
    ctx.fillStyle = c.gold; ctx.font = "600 56px " + o.fonts.head; spacing("1px");
    var fitted = Math.min(56, Math.floor(56 * (CARD_W - 80 - 560) / ctx.measureText(r.verdict.text).width)); // keeps the right margin
    ctx.font = "600 " + fitted + "px " + o.fonts.head;
    ctx.fillText(r.verdict.text, 560, 104);

    var cells = [["DISTANCE FROM TARGET", en(r.delta), 560, 196], ["DIFFICULTY AT DAWN", en(r.dawn), 850, 196],
                 ["BLOCKS", en(r.blocks), 560, 376], ["PASSES", en(r.accepted), 850, 376]];
    cells.forEach(function (cell) {
      ctx.fillStyle = c.muted; ctx.font = "16px " + o.fonts.mono; ctx.textBaseline = "top"; ctx.textAlign = "left";
      spacing("1.5px");
      ctx.fillText(cell[0], cell[2], cell[3]);
      spacing("0px");
      drawDM(ctx, cell[1], cell[2], cell[3] + 34, 56, c, o.glyphs, o.fonts);
    });
    ctx.fillStyle = c.muted; ctx.font = "16px " + o.fonts.mono; ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillText((r.live ? "target " : "launch value ") + en(r.target), 560, 196 + 34 + 56 + 14);
    ctx.fillText(en(r.rejected) + " too fast", 850, 376 + 34 + 56 + 14);

    ctx.fillStyle = c.line2; ctx.fillRect(80, 590, CARD_W - 160, 1);
    ctx.textBaseline = "middle";
    ctx.fillStyle = c.gold; ctx.font = "20px " + o.fonts.mono; ctx.fillText("wheelpaper.online", 80, 626);
    ctx.fillStyle = c.muted; ctx.font = "16px " + o.fonts.mono; ctx.textAlign = "right"; spacing("0.6px");
    ctx.fillText("UNOFFICIAL. NOT AFFILIATED WITH SQUEEKCHAIN.", CARD_W - 80, 626);
    spacing("0px");
    ctx.textAlign = "left";
    return cv;
  }

  /* ---------- personal best: the smallest distance. Storage is a nicety, never a requirement ---------- */
  var BEST_KEY = "wheelpaper.nightshift.bestDelta";
  function readBest(storage) {
    try { var v = storage.getItem(BEST_KEY); return v !== null && /^\d+$/.test(v) ? BigInt(v) : null; } catch (e) { return null; }
  }
  function keepBest(storage, delta) {
    var best = readBest(storage);
    if (best !== null && best <= delta) return best;
    try { storage.setItem(BEST_KEY, String(delta)); } catch (e) { /* not stored; this visit still shows it */ }
    return delta;
  }

  if (node) {
    module.exports = { PASS_UNITS: PASS_UNITS, GAP_MS: GAP_MS, ROUNDS: ROUNDS, ROUND_MS: ROUND_MS, PACE_ROUNDS: PACE_ROUNDS, GAUGE_SPAN: GAUGE_SPAN,
                       tooFast: tooFast, createNight: createNight, distance: distance, verdict: verdict, projectDawn: projectDawn, paceOf: paceOf,
                       gaugePos: gaugePos, barelyTurned: barelyTurned, targetLabel: targetLabel, copyText: copyText, drawCard: drawCard, readBest: readBest, keepBest: keepBest,
                       CARD_W: CARD_W, CARD_H: CARD_H, BEST_KEY: BEST_KEY };
    return;
  }

  /* ---------- the section ---------- */
  var root = document.getElementById("nightshift");
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var css = getComputedStyle(document.documentElement);
  var tok = function (n) { return css.getPropertyValue(n).trim(); };
  var stage = $("ns-stage"), svg = $("ns-wheel"), block = root.querySelector(".ns");
  var storage = null;
  try { storage = window.localStorage; } catch (e) { storage = null; }

  // the compact wheel: the hero drawing, copied once app.js has built it
  var strip = function (id) { return $(id).outerHTML.replace(' id="' + id + '"', ""); };
  svg.innerHTML = strip("wheel-stand") + '<g class="ns__rot">' + $("wheel-rot").innerHTML + "</g>" + strip("wheel-hub") +
    $("wheel-sensor").outerHTML.replace(' id="wheel-sensor"', ' id="ns-sensor"');
  var rot = svg.querySelector(".ns__rot"), sensor = $("ns-sensor");

  var night = null, t0 = 0, raf = 0, day = null, liveTarget = null, report = null, best = storage ? readBest(storage) : null;
  var shown = {}, fastTimer = null, hitTimer = null, workTimer = null, angle = 0, speed = 0, lastFrame = 0, gaugeRound = -1;

  function dm(id, text, label) {
    if (shown[id] === text) return;
    shown[id] = text;
    sim.dotMatrix($(id), text);
    $(id).setAttribute("aria-label", label || text);
  }
  function txt(id, text) { if (shown[id] !== text) { shown[id] = text; $(id).textContent = text; } }
  function renderBest() {
    var el = $("ns-best");
    if (best === null) { el.textContent = ""; el.removeAttribute("data-ready"); return; }
    el.textContent = "Your best: " + en(best) + " off target";
    el.setAttribute("data-ready", "");
  }
  function renderDay() {
    var el = $("ns-day");
    if (day === null) { el.textContent = ""; el.removeAttribute("data-ready"); return; }
    el.textContent = "Squeektoshi, last 24 hours: " + en(day) + " blocks.";
    el.setAttribute("data-ready", "");
  }
  function renderGauge(n) {
    var p = n.projected();
    $("ns-mark").style.left = (gaugePos(p, n.target) * 100).toFixed(2) + "%";
    $("ns-proj").textContent = "projected dawn " + en(p);
    $("ns-gauge").setAttribute("aria-label", "Projected dawn difficulty " + en(p) + ", target " + en(n.target));
  }
  function renderHud(n, left) {
    dm("ns-left", String(left), left + " seconds left");
    dm("ns-blocks", en(n.blocks()), en(n.blocks()) + " blocks");
    dm("ns-work", en(n.roundWork), en(n.roundWork) + " work this round");
    txt("ns-d", en(n.D));
    txt("ns-target", targetLabel(n.target, n.live));
    if (n.round !== gaugeRound) { gaugeRound = n.round; renderGauge(n); }
  }
  function newNight() { return liveTarget !== null ? createNight(liveTarget, true) : createNight(sim.START_D, false); }
  function secondsLeft(now) { return Math.max(0, Math.min(ROUNDS, Math.ceil((ROUNDS * ROUND_MS - (now - t0)) / 1000))); }
  // the HUD is on show before the first press: the night as it will start, with the target it will play for
  function renderIdle() { gaugeRound = -1; renderHud(newNight(), ROUNDS); }

  /* wheel motion: each accepted pass kicks it forward, friction winds it down */
  var KICK = 40, MAX_SPEED = 900, FRICTION_S = 0.5;
  function frame() {
    var now = performance.now(); // the same clock the passes are stamped with
    var dt = Math.min(64, Math.max(0, now - lastFrame)) / 1000; lastFrame = now;
    if (night) {
      if (night.advance(now - t0)) { dawn(); }
      else renderHud(night, secondsLeft(now));
    }
    if (!reduceMotion) {
      speed *= Math.exp(-dt / FRICTION_S);
      if (speed < 1) speed = 0;
      angle = (angle + speed * dt) % 360;
      rot.setAttribute("transform", "rotate(" + angle.toFixed(2) + " 200 200)");
    }
    raf = night || speed > 0 ? requestAnimationFrame(frame) : 0;
  }
  function loop() { if (!raf) { lastFrame = performance.now(); raf = requestAnimationFrame(frame); } }

  function flashFast() {
    var el = $("ns-fast");
    el.setAttribute("data-on", "");
    clearTimeout(fastTimer);
    fastTimer = setTimeout(function () { el.removeAttribute("data-on"); }, 450);
  }
  function pass() {
    if (!night) return;
    var res = night.pass(performance.now() - t0);
    if (res === "rejected") { flashFast(); return; }
    if (res !== "accepted") return;
    speed = Math.min(MAX_SPEED, speed + KICK);
    sensor.classList.add("is-hit");
    clearTimeout(hitTimer);
    hitTimer = setTimeout(function () { sensor.classList.remove("is-hit"); }, 90);
    // every accepted press shows at once, on its own, not on the next frame
    dm("ns-work", en(night.roundWork), en(night.roundWork) + " work this round");
    $("ns-work").setAttribute("data-hit", "");
    clearTimeout(workTimer);
    workTimer = setTimeout(function () { $("ns-work").removeAttribute("data-hit"); }, 90);
    loop();
  }

  function start() {
    night = newNight(); report = null; t0 = performance.now(); gaugeRound = -1;
    root.setAttribute("data-state", "running");
    $("ns-fast").removeAttribute("data-on");
    renderHud(night, ROUNDS);
    // Everything you play with on one screen before the first press. Narrow: from the wheel down to the gauge.
    // Wide: the whole composition from the heading down.
    var narrow = window.matchMedia("(max-width: 720px)").matches;
    var top = (narrow ? block : $("t-night")).getBoundingClientRect().top;
    var bottom = (narrow ? $("ns-gauge") : block).getBoundingClientRect().bottom;
    if (top < 56 || bottom > window.innerHeight) (narrow ? block : root).scrollIntoView({ block: "start" });
    // focus leaves the hidden button so a held spacebar never presses anything else
    try { stage.focus({ preventScroll: true }); } catch (e) { stage.focus(); }
    loop();
  }
  function dawn() {
    report = night.report(); night = null;
    if (report.scored) {
      if (storage) best = keepBest(storage, report.delta);
      else best = best === null || report.delta < best ? report.delta : best;
    }
    var v = $("ns-verdict");
    v.textContent = report.verdict.text;
    v.setAttribute("data-tier", report.verdict.tier);
    dm("ns-r-delta", en(report.delta), en(report.delta) + " from target");
    txt("ns-r-of", "from " + (report.live ? "" : "launch value ") + en(report.target));
    dm("ns-r-dawn", en(report.dawn), "difficulty " + en(report.dawn));
    dm("ns-r-blocks", en(report.blocks), en(report.blocks) + " blocks");
    dm("ns-r-acc", en(report.accepted), en(report.accepted) + " accepted");
    dm("ns-r-rej", en(report.rejected), en(report.rejected) + " too fast");
    renderDay(); renderBest();
    root.setAttribute("data-state", "dawn");
  }

  stage.addEventListener("pointerdown", function (e) {
    if (!night || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    pass();
  });
  document.addEventListener("keydown", function (e) {
    if (!night || !(e.key === " " || e.code === "Space")) return;
    e.preventDefault(); // the page does not scroll while you run
    if (!e.repeat) pass();
  });
  $("ns-start").addEventListener("click", start);
  $("ns-again").addEventListener("click", start);

  function flashDone(btn) {
    var label = btn.getAttribute("data-label") || btn.textContent;
    btn.setAttribute("data-label", label);
    btn.textContent = "Copied."; btn.classList.add("is-done");
    clearTimeout(btn._t);
    btn._t = setTimeout(function () { btn.textContent = label; btn.classList.remove("is-done"); }, 1000);
  }
  function fallbackCopy(t) {
    var ta = document.createElement("textarea");
    ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* nothing else to try */ }
    document.body.removeChild(ta);
  }
  $("ns-copy").addEventListener("click", function () {
    if (!report) return;
    var t = copyText(report);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).catch(function () { fallbackCopy(t); });
    else fallbackCopy(t);
    flashDone($("ns-copy"));
  });

  function wheelShapes() {
    var out = [];
    ["wheel-stand", "wheel-rot", "wheel-hub", "wheel-sensor"].forEach(function (id) {
      Array.prototype.forEach.call($(id).children, function (e) {
        var cls = id === "wheel-sensor" ? "sensor" : e.getAttribute("class");
        if (e.tagName.toLowerCase() === "circle") out.push({ k: "c", x: +e.getAttribute("cx"), y: +e.getAttribute("cy"), r: +e.getAttribute("r"), cls: cls });
        else out.push({ k: "r", x: +e.getAttribute("x"), y: +e.getAttribute("y"), s: +e.getAttribute("width"), cls: cls });
      });
    });
    return out;
  }
  function cardOptions() {
    return { shapes: wheelShapes(), glyphs: sim.GLYPHS, fonts: { head: tok("--font-head"), mono: tok("--font-mono") },
             colors: { bg: tok("--bg"), grid: tok("--grid-dot"), gold: tok("--gold"), gold2: tok("--gold-2"), muted: tok("--muted"), line2: tok("--line-2"), blue: tok("--blue") } };
  }
  function download(href, revoke) {
    var a = document.createElement("a");
    a.href = href; a.download = "nightshift.png"; a.style.display = "none";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    if (revoke) setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
  }
  function renderCard() {
    var go = function () { return drawCard(document.createElement("canvas"), report, cardOptions()); };
    if (!document.fonts || !document.fonts.load) return Promise.resolve(go());
    return Promise.all([document.fonts.load('600 56px "Barlow Condensed"'), document.fonts.load('16px "IBM Plex Mono"')]).then(go, go);
  }
  $("ns-save").addEventListener("click", function () {
    if (!report) return;
    renderCard().then(function (cv) {
      if (cv.toBlob) cv.toBlob(function (b) { if (b) download(URL.createObjectURL(b), true); else download(cv.toDataURL("image/png")); }, "image/png");
      else download(cv.toDataURL("image/png"));
    });
  });

  // the target: Squeektoshi's live difficulty from the shared poll; the last good reading stands until a newer one
  document.addEventListener("wheelpaper:live", function (e) {
    var D = e.detail && e.detail.data && e.detail.data.difficulty;
    // "waiting" means the API has no reading at all, so an older value is no longer Squeektoshi's difficulty
    if (D) liveTarget = BigInt(D);
    else if (e.detail && e.detail.state === "waiting") liveTarget = null;
    else return;
    if (root.getAttribute("data-state") === "idle") renderIdle();
  });
  // the comparison: the settlements section's own decoded rounds, handed over after each fetch; the last good
  // count stays until a newer one arrives
  document.addEventListener("wheelpaper:rounds", function (e) {
    var n = e.detail && e.detail.blocks24h;
    if (n === null || n === undefined) return;
    day = n;
    if (report) renderDay();
  });

  renderBest();
  renderIdle();
})();
