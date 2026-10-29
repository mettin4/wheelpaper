// Run: node tests/money.test.js
"use strict";
const assert = require("node:assert/strict");
const { supplyAt, levelCost, LEVELS, CAP, PREMINE, LAST_BLOCK } = require("../app.js");

const f = (n) => n.toLocaleString("en-US");

// section 4: supply
const rows = [0, 100000, 273913, 273914].map((b) => supplyAt(b));
assert.equal(rows[0].minted, 0);
assert.equal(rows[0].total, 210000000);
assert.equal(rows[1].minted, 690000000);
assert.equal(rows[2].minted, 1889999700);
assert.equal(rows[2].left, 300);
assert.equal(rows[3].minted, 1890000000);
assert.equal(rows[3].total, 2100000000);
assert.equal(rows[3].left, 0);
assert.equal(LAST_BLOCK, 273914);
assert.equal(supplyAt(400000).total, CAP, "never past the cap");
for (const r of rows) {
  assert.ok(Number.isSafeInteger(r.minted) && Number.isSafeInteger(r.total) && Number.isSafeInteger(r.left));
  assert.equal(r.total + r.left, CAP);
  assert.equal(r.total - r.minted, PREMINE);
}
assert.throws(() => supplyAt(-1));

console.log("blocks  | SQK minted by blocks | total supply  | left to the cap");
for (const r of rows) console.log(`${f(r.blocks).padStart(7)} | ${f(r.minted).padStart(20)} | ${f(r.total).padStart(13)} | ${f(r.left)}`);

// section 5: levels
const costs = LEVELS.map((L) => levelCost(L.level).l1Used);
assert.deepEqual(costs, [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]);
assert.deepEqual(LEVELS.map((L) => levelCost(L.level).burned), [0, 1, 3, 7, 15, 31, 63, 127, 255, 511]);
assert.deepEqual(LEVELS.map((L) => L.power), [1000, 2200, 4840, 10648, 23426, 51536, 113380, 249436, 548759, 1207269]);
assert.deepEqual(LEVELS.map((L) => L.cooldown), [1000, 3000, 7000, 14000, 21000, 28000, 35000, 42000, 49000, null]);
assert.throws(() => levelCost(11));

console.log("\nlevel | power     | merge cooldown | L1 used | burned");
for (const L of LEVELS) {
  const c = levelCost(L.level);
  console.log(`${String(L.level).padStart(5)} | ${f(L.power).padStart(9)} | ${(L.cooldown === null ? "cannot merge" : f(L.cooldown)).padStart(14)} | ${f(c.l1Used).padStart(7)} | ${f(c.burned)}`);
}
console.log("all assertions passed");
