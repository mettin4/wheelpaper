// Run: node tests/nightshift.test.js
"use strict";
const assert = require("node:assert/strict");
const NS = require("../nightshift.js");
const { stepRound, START_D, UNITS_PER_BLOCK } = require("../app.js");

// ---- the 60 ms gate: under 60 ms after the previous accepted pass is rejected; exactly 60 counts
assert.equal(NS.GAP_MS, 60);
assert.equal(NS.tooFast(null, 0), false, "the first pass always counts");
assert.equal(NS.tooFast(1000, 1059), true, "59 ms: rejected");
assert.equal(NS.tooFast(1000, 1059.999), true);
assert.equal(NS.tooFast(1000, 1060), false, "exactly 60 ms: accepted");
assert.equal(NS.tooFast(1000, 1061), false);
{
  const n = NS.createNight();
  assert.equal(n.pass(100), "accepted");
  assert.equal(n.pass(130), "rejected");
  assert.equal(n.pass(159), "rejected", "rejected passes do not move the gate: still measured from 100");
  assert.equal(n.pass(160), "accepted", "60 ms after the last accepted pass");
  assert.equal(n.pass(219), "rejected");
  assert.equal(n.pass(220), "accepted");
  assert.deepEqual([n.accepted, n.rejected, n.roundWork], [3, 3, 3 * NS.PASS_UNITS]);
  // the gate holds across a round boundary
  assert.equal(n.pass(999), "accepted");
  assert.equal(n.pass(1030), "rejected", "a new round does not reset the gate");
  assert.equal(n.round, 1);
}

// ---- round math: the night is app.js's stepRound, round by round, price first then steer
{
  const n = NS.createNight();
  assert.equal(n.D, START_D);
  assert.equal(START_D, 10875n);
  // round 0: 10 passes; round 1: none; round 2: one pass (45 >= 40 steers); round 3: 0 again
  for (let i = 0; i < 10; i++) n.pass(i * 90);
  n.pass(2500);
  n.advance(4000);
  let D = 10875n, U = 0n;
  for (const w of [450n, 0n, 45n, 0n]) { const s = stepRound(D, w); U += s.units; D = s.next; }
  assert.equal(n.round, 4);
  assert.equal(n.D, D);
  assert.equal(n.units, U);
  assert.equal(n.blocks(), U / UNITS_PER_BLOCK);
  // by hand for round 0: units at the old difficulty, then steer
  assert.equal(stepRound(10875n, 450n).units, 450n * 10n ** 12n / 10875n);
  assert.equal(stepRound(10875n, 450n).next, (29n * 10875n + 450n * 1000n / 40n) / 30n);
  assert.deepEqual(n.works, [450, 0, 45, 0]);
  // a round under 40 work leaves difficulty alone
  assert.equal(stepRound(n.D, 0n).next, n.D);
}
// passes after the night are not counted
{
  const n = NS.createNight();
  assert.equal(n.pass(48000), "over");
  assert.equal(n.round, 48);
  assert.equal(n.accepted, 0);
  assert.equal(n.D, START_D);
}

// ---- tuning check: a steady 9 passes a second for 48 rounds
function steady(perSecond) {
  const n = NS.createNight();
  for (let k = 0; ; k++) { const t = (k * 1000) / perSecond; if (t >= 48000) break; n.pass(t); }
  n.advance(48000);
  return n.report();
}
const nine = steady(9);
assert.equal(NS.PASS_UNITS, 45);
assert.equal(nine.accepted, 432);
assert.equal(nine.rejected, 0);
assert.equal(nine.work, 432 * 45);
assert.ok(nine.dawn >= 10000n && nine.dawn <= 14000n, "difficulty at dawn in the 10,000-14,000 band: " + nine.dawn);
assert.equal(nine.dawn, 10260n);
// Blocks: 1,852, not double digits. Any constant that lets 9 passes a second move difficulty at all gives
// hundreds of blocks, because a round completes w x 1000 / D blocks and the rule holds D near w x 25,
// i.e. about 40 blocks per round. Double digits needs under 23 work per round, which never reaches the
// 40 needed to steer (17 passes, the 60 ms ceiling, times 2 is 34). See the report for the full sweep.
assert.equal(nine.blocks, 1852n);
// the 60 ms ceiling: 17 passes a second all count, 20 a second loses some
function every(ms) {
  const n = NS.createNight();
  for (let t = 0; t < 48000; t += ms) n.pass(t);
  n.advance(48000);
  return n.report();
}
assert.equal(every(60).rejected, 0);
assert.equal(every(60).accepted, 800, "one pass every 60 ms: all 800 count");
assert.equal(every(50).accepted, 480, "every 50 ms: only every other one clears 60 ms");
assert.equal(every(50).rejected, 480);

// ---- distance and verdict tiers, on the exact boundaries
const T = 10245n;
assert.equal(NS.distance(10260n, T), 15n);
assert.equal(NS.distance(10230n, T), 15n);
assert.equal(NS.distance(T, T), 0n);
for (const [dawn, text, tier] of [
  [T, "RAN LIKE A HAMSTER.", "ran"], [T + 250n, "RAN LIKE A HAMSTER.", "ran"], [T - 250n, "RAN LIKE A HAMSTER.", "ran"],
  [T + 251n, "ALMOST A HAMSTER.", "almost"], [T - 251n, "ALMOST A HAMSTER.", "almost"],
  [T + 1000n, "ALMOST A HAMSTER.", "almost"], [T - 1000n, "ALMOST A HAMSTER.", "almost"],
  [T + 1001n, "TOO FAST FOR A HAMSTER.", "fast"], [17496n, "TOO FAST FOR A HAMSTER.", "fast"],
  [T - 1001n, "SLEPT HALF THE NIGHT.", "slept"], [3030n, "SLEPT HALF THE NIGHT.", "slept"]
]) assert.deepEqual(NS.verdict(dawn, T), { tier, text }, String(dawn));

// ---- the gauge: projected dawn is the real rule run forward at your pace
assert.equal(NS.projectDawn(10875n, 405, 0), 10875n, "no rounds left: where you are");
{
  let D = 10000n; for (let i = 0; i < 7; i++) D = stepRound(D, 300n).next;
  assert.equal(NS.projectDawn(10000n, 300, 7), D);
  assert.equal(NS.projectDawn(10000n, 39, 48), 10000n, "under 40 work the rule leaves it alone");
  assert.equal(NS.projectDawn(1000n, 40, 48), 1000n, "the 1,000 floor holds");
}
assert.equal(NS.PACE_ROUNDS, 3);
assert.equal(NS.paceOf([]), 0);
assert.equal(NS.paceOf([405]), 405);
assert.equal(NS.paceOf([0, 405, 405, 450]), 420, "mean of the last three, rounded down");
assert.equal(NS.paceOf([100, 100, 101]), 100);
// a steady night: the projection is right from the first closed round on, and stays right
{
  const n = NS.createNight(T, true);
  assert.equal(n.projected(), START_D, "before any round closes: the current difficulty");
  const seen = [];
  for (let r = 0; r < 48; r++) { for (let k = 0; k < 9; k++) n.pass(r * 1000 + k * 111); n.advance((r + 1) * 1000); seen.push(n.projected()); }
  assert.ok(seen.every((p) => p === 10260n), "every round projects the true dawn: " + seen.slice(0, 3));
  assert.equal(n.D, 10260n);
}
// a change of pace moves the marker the right way
{
  const n = NS.createNight(T, true);
  for (let r = 0; r < 10; r++) { for (let k = 0; k < 9; k++) n.pass(r * 1000 + k * 111); n.advance((r + 1) * 1000); }
  const steady = n.projected();
  for (let r = 10; r < 13; r++) { for (let k = 0; k < 14; k++) n.pass(r * 1000 + k * 70); n.advance((r + 1) * 1000); }
  assert.ok(n.projected() > steady, "speeding up raises the projection");
  for (let r = 13; r < 16; r++) { for (let k = 0; k < 3; k++) n.pass(r * 1000 + k * 300); n.advance((r + 1) * 1000); }
  assert.ok(n.projected() < steady, "slowing down lowers it");
}
assert.equal(NS.GAUGE_SPAN, 4000);
assert.equal(NS.gaugePos(T, T), 0.5, "on target: the tick");
assert.equal(NS.gaugePos(T + 2000n, T), 0.75);
assert.equal(NS.gaugePos(T - 2000n, T), 0.25);
assert.equal(NS.gaugePos(T + 4000n, T), 1);
assert.equal(NS.gaugePos(T + 9000n, T), 1, "stops at the right end");
assert.equal(NS.gaugePos(1000n, T), 0, "stops at the left end");

// ---- the target and its label
assert.equal(NS.targetLabel(10245n, true), "TARGET · 10,245");
assert.equal(NS.targetLabel(10875n, false), "TARGET · 10,875 (LAUNCH VALUE)");
assert.equal(NS.createNight().target, 10875n, "no target given: the launch value");
assert.equal(NS.createNight().live, false);

// ---- copy result, exact template
const rep = (() => { const n = NS.createNight(T, true); n.D = 10260n; n.units = 1852n * UNITS_PER_BLOCK; n.accepted = 432; n.rejected = 3; n.works = [405]; return n.report(); })();
assert.equal(NS.copyText(rep), "Night shift: dawn difficulty 10,260, 15 off Squeektoshi's real 10,245. 1,852 blocks. wheelpaper.online");
assert.equal(NS.copyText(Object.assign({}, rep, { live: false, target: 10875n, delta: 615n })),
  "Night shift: dawn difficulty 10,260, 615 off the launch value 10,875. 1,852 blocks. wheelpaper.online");

// ---- the zero-press guard: no round reached 40 work, so no verdict and no best
assert.equal(NS.barelyTurned([0, 0, 39]), true);
assert.equal(NS.barelyTurned([39, 40]), false, "exactly 40 reaches it");
assert.equal(NS.barelyTurned(new Array(47).fill(0).concat(NS.PASS_UNITS)), false, "one pass is 45 work");
{
  const idle = (target, live) => { const n = NS.createNight(target, live); n.advance(NS.ROUNDS * NS.ROUND_MS); return n.report(); };
  // on the launch value, doing nothing lands exactly on target: the case the guard exists for
  const a = idle();
  assert.deepEqual([a.scored, a.delta, a.dawn], [false, 0n, 10875n]);
  assert.deepEqual(a.verdict, { tier: "barely", text: "THE WHEEL BARELY TURNED." });
  assert.equal(NS.copyText(a), "Night shift: THE WHEEL BARELY TURNED. 0 blocks. wheelpaper.online");
  // the stamp replaces the verdict whatever the target is
  const b = idle(9546n, true);
  assert.deepEqual([b.scored, b.verdict.tier, b.delta], [false, "barely", 1329n]);
  // one pass in one round is a scored night
  const n = NS.createNight(9546n, true); n.pass(5000); n.advance(NS.ROUNDS * NS.ROUND_MS);
  const c = n.report();
  assert.deepEqual([c.scored, c.dawn, c.verdict.tier], [true, 10550n, "fast"]);
}

// ---- personal best: the smallest distance; works with storage, without it, and with storage that throws
{
  const mem = new Map(), ok = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(NS.readBest(ok), null);
  assert.equal(NS.keepBest(ok, 900n), 900n);
  assert.equal(NS.keepBest(ok, 1200n), 900n, "a farther night does not replace the best");
  assert.equal(NS.keepBest(ok, 15n), 15n);
  assert.equal(NS.keepBest(ok, 0n), 0n, "dead on target is the best there is");
  assert.equal(NS.keepBest(ok, 5n), 0n, "and 0 is not mistaken for nothing");
  assert.equal(mem.get(NS.BEST_KEY), "0");
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(NS.readBest(broken), null);
  assert.equal(NS.keepBest(broken, 500n), 500n);
  mem.set(NS.BEST_KEY, "garbage");
  assert.equal(NS.readBest(ok), null);
}

// ---- the card renders: 1200 x 675, the verdict, the four numbers, the label, the address, the unofficial line
{
  const calls = { text: [], arcs: 0, rects: 0 };
  const ctx = new Proxy({}, {
    get(o, k) {
      if (k === "fillText") return (t) => calls.text.push(String(t));
      if (k === "arc") return () => { calls.arcs++; };
      if (k === "fillRect") return () => { calls.rects++; };
      if (k === "measureText") return (t) => ({ width: String(t).length * 10 });
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { o[k] = v; return true; }
  });
  const cv = { width: 0, height: 0, getContext: () => ctx };
  const glyph = [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."];
  const glyphs = Object.fromEntries("0123456789".split("").map((d) => [d, glyph]));
  const shapes = [{ k: "c", x: 200, y: 36, r: 4.2, cls: "px" }, { k: "r", x: 192, y: 42, s: 16, cls: "magnet" }];
  const colors = { bg: "#0b0b0d", grid: "#29292b", gold: "#ffc048", gold2: "#f2c230", muted: "#82828f", line2: "#26262f", blue: "#5b7cfa" };
  NS.drawCard(cv, rep, { shapes, glyphs, colors, fonts: { head: "x", mono: "y" } });
  assert.deepEqual([cv.width, cv.height], [1200, 675]);
  for (const t of ["THE NIGHT SHIFT", "RAN LIKE A HAMSTER.", "DISTANCE FROM TARGET", "DIFFICULTY AT DAWN", "BLOCKS", "PASSES", "target 10,245", "3 too fast", "wheelpaper.online", "UNOFFICIAL. NOT AFFILIATED WITH SQUEEKCHAIN."])
    assert.ok(calls.text.includes(t), "card text: " + t);
  // 15 + 10,260 + 1,852 + 432: 2 + 5 + 4 + 3 = 14 digits of 35 dots each, and the background grid
  const grid = Math.ceil((1200 - 9) / 18) * Math.ceil((675 - 9) / 18);
  assert.equal(calls.arcs, grid + 14 * 35 + 1);
  assert.equal(calls.text.filter((t) => t === ",").length, 2, "two thousands separators");
  // the fallback card does not call the launch value a live target
  calls.text.length = 0;
  NS.drawCard(cv, Object.assign({}, rep, { live: false, target: 10875n }), { shapes, glyphs, colors, fonts: { head: "x", mono: "y" } });
  assert.ok(calls.text.includes("launch value 10,875"));
}

// ---- the comparison: blocks in the last 24 hours, from the settlements section's decoded rounds
{
  const P = require("../proof.js");
  const rounds = P.readLogs(require("./fixtures/roundrecorded-2026-11-04.json"), "0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44");
  const newest = rounds[rounds.length - 1];
  const since = newest.at - 86400000;
  const start = rounds.filter((r) => r.at < since).pop();
  assert.equal(P.blocksSince(rounds, since), newest.cumulativeBlockUnits / 1000000000n - start.cumulativeBlockUnits / 1000000000n);
  assert.equal(P.blocksSince(rounds, rounds[0].at), null, "window does not reach back far enough: no number");
  assert.equal(P.blocksSince(rounds, newest.at + 1), 0n, "nothing since: 0 blocks");
  assert.equal(P.blocksSince(null, since), null);
}

// ---- every local script and stylesheet shares one ?v=, so a cached old file can't pair with a new one
{
  const html = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:<script src|<link rel="stylesheet" href)="(?!https?:)([^"]+)"/g)].map((m) => m[1]);
  assert.equal(refs.length, 7, "styles.css and six scripts");
  const versions = new Set(refs.map((r) => (/\.(?:js|css)\?v=(\d+)$/.exec(r) || [])[1]));
  assert.equal(versions.size, 1, "one version across all of them: " + refs.join(" "));
  assert.ok(![...versions].includes(undefined), "every local asset is versioned: " + refs.join(" "));
}

console.log("nightshift.test.js: all assertions passed (PASS_UNITS " + NS.PASS_UNITS + "; 9 passes/s -> difficulty " +
  nine.dawn.toLocaleString("en-US") + ", " + nine.blocks.toLocaleString("en-US") + " blocks)");
