// Run: node tests/almanac.test.js
"use strict";
const assert = require("node:assert/strict");
const A = require("../almanac.js");
// GET https://api.squeekchain.com/v1/measurement/stats?range=7d, captured 2026-11-04 18:51 UTC
const stats = require("./fixtures/stats-7d-2026-11-04.json");

// bucket scaling: 0 ran nothing, 1..4 by quarters of the week's busiest half hour
const max = 1776;
for (const [w, lv] of [[0, 0], [1, 1], [444, 1], [445, 2], [888, 2], [889, 3], [1332, 3], [1333, 4], [1776, 4]]) {
  assert.equal(A.level(w, max), lv, `work ${w}`);
}
assert.equal(A.level(5, 0), 0, "no peak, no level");
assert.equal(A.level(null, max), 0);
assert.equal(A.level(9999, max), 4, "clamped");

// labels and clock
assert.equal(A.dayLabel("2026-11-03"), "Tue 3");
assert.equal(A.dayLabel("2026-11-02"), "Mon 2");
assert.equal(A.dayLabel("nope"), null);
assert.equal(A.hhmm(1320), "22:00");
assert.equal(A.hhmm(30), "00:30");

// the real week
const alm = A.readAlmanac(stats);
assert.equal(alm.days.length, 7);
assert.deepEqual(alm.days.map((d) => d.label), ["Thu 29", "Fri 30", "Sat 31", "Sun 1", "Mon 2", "Tue 3", "Wed 4"]);
assert.equal(alm.max, 1776);
assert.deepEqual([alm.total, alm.peak, alm.active], [60070, "22:00", 6]);
for (const d of alm.days) assert.equal(d.cells.length, 48);
// every day's cells add up to that day's total in the feed
stats.activity.days.forEach((d, i) => assert.equal(alm.days[i].cells.reduce((s, w) => s + (w || 0), 0), Number(d.observedWorkUnits), d.date));
// "future" buckets have no reading: drawn as nothing, never as zero
const today = alm.days[6];
assert.equal(today.cells[0], null); assert.equal(today.levels[0], null);
assert.equal(today.cells[30], 0); assert.equal(today.levels[30], 0);
// the busiest cell is level 4 and levels never exceed 4
assert.ok(alm.days.some((d) => d.levels.includes(4)));
assert.ok(alm.days.every((d) => d.levels.every((l) => l === null || (l >= 0 && l <= 4))));

// the "now" outline: today's row, the half hour that contains the clock
assert.deepEqual(A.nowCell(alm, Date.parse("2026-11-04T18:51:00Z")), { row: 6, col: 37 });
assert.deepEqual(A.nowCell(alm, Date.parse("2026-11-04T00:00:00Z")), { row: 6, col: 0 });
assert.equal(A.nowCell(alm, Date.parse("2026-11-07T10:00:00Z")), null, "a day outside the map has no outline");

// anything malformed is "no data", never a crash
const bad = [null, "x", {}, { activity: {} }, { activity: { days: [], summary: {} } },
  { activity: { days: [{ date: "2026-11-04", buckets: [] }], summary: stats.activity.summary } },
  { activity: { days: stats.activity.days, summary: { ...stats.activity.summary, observedWorkUnits: "-1" } } }];
for (const b of bad) assert.equal(A.readAlmanac(b), null);
assert.equal(A.REFRESH_MS, 600000);

console.log("almanac.test.js: all assertions passed");
