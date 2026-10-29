// Run: node tests/sim.test.js
"use strict";
const assert = require("node:assert/strict");
const { simulateNight, stepRound, START_D, MIN_D } = require("../app.js");

// Whitepaper worked example (rounds-and-blocks page): D = 10,000, w = 80
// -> 8 blocks of progress (8,000,000,000 units), next D = 9,733.
{
  const r = stepRound(10000n, 80n);
  assert.equal(r.units, 8000000000n);
  assert.equal(r.next, 9733n);
}

const rows = [];
for (const w of [0, 40, 1000, 10000]) {
  const r = simulateNight(w);
  let prev = START_D;
  for (const D of r.series) {
    assert.equal(typeof D, "bigint", "difficulty must be integer (bigint)");
    assert.ok(D >= MIN_D, `D fell below 1,000 at w=${w}`);
    if (w < 40) assert.equal(D, prev, "D must not change when w < 40");
    prev = D;
  }
  assert.equal(typeof r.blockUnits, "bigint");
  assert.equal(typeof r.blocks, "bigint");
  assert.equal(r.series.length, 49);
  rows.push({ w, rounds: r.rounds, finalD: r.after, blocks: r.blocks, blockUnits: r.blockUnits });
}

// below-40 values are frozen too
for (const w of [1, 39]) assert.equal(simulateNight(w).after, START_D);
// long run at w=40 converges to the 1,000 floor and never crosses it
{
  const r = simulateNight(40, 2000);
  assert.ok(r.series.every((D) => D >= MIN_D));
  assert.equal(r.after, MIN_D);
}
// input guard
assert.throws(() => simulateNight(10001));
assert.throws(() => simulateNight(1.5));

const f = (n) => n.toLocaleString("en-US");
console.log("w (work/round) | rounds | final difficulty | blocks completed | block units");
for (const r of rows) console.log(`${f(r.w).padStart(14)} | ${String(r.rounds).padStart(6)} | ${f(r.finalD).padStart(16)} | ${f(r.blocks).padStart(16)} | ${f(r.blockUnits)}`);
console.log("all assertions passed");
