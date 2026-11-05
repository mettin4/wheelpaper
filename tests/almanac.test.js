// Run: node tests/almanac.test.js
"use strict";
const assert = require("node:assert/strict");
const A = require("../almanac.js");
// GET https://api.squeekchain.com/v1/measurement/stats?range=7d, captured 2026-11-04 18:51 UTC
const stats = require("./fixtures/stats-7d-2026-11-04.json");
// The same, captured 2026-11-05 14:01 UTC: the new chain's whole history, which ran 02:30-07:00 UTC on Nov 5
const newChain = require("./fixtures/stats-7d-2026-11-05.json");

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
assert.deepEqual([alm.total, alm.peak], [60070, "22:00"]);
for (const d of alm.days) assert.equal(d.cells.length, 48);
// nothing is lost or invented: the map holds exactly the week's work
assert.equal(alm.days.flatMap((d) => d.cells).reduce((s, w) => s + (w || 0), 0), 60070);
// feed rows turn at noon: row "11-03" minute 0 is the morning of Nov 4, row "11-03" minute 1290 is the night of Nov 3
assert.equal(A.turnMinute(stats), 720);
assert.equal(alm.days[6].cells[0], 498, "Nov 4 00:00");
assert.equal(alm.days[5].cells[1290 / 30], 409, "Nov 3 21:30");
assert.equal(alm.days[0].cells[0], null, "before the window opened: nothing, not a zero");
// "future" buckets have no reading: drawn as nothing, never as zero
const today = alm.days[6];
assert.equal(today.cells[40], null); assert.equal(today.levels[40], null);
assert.equal(today.cells[30], 0); assert.equal(today.levels[30], 0);
// the busiest cell is level 4 and levels never exceed 4
assert.ok(alm.days.some((d) => d.levels.includes(4)));
assert.ok(alm.days.every((d) => d.levels.every((l) => l === null || (l >= 0 && l <= 4))));

// the "now" outline: today's row, the half hour that contains the clock
assert.deepEqual(A.nowCell(alm, Date.parse("2026-11-04T18:51:00Z")), { row: 6, col: 37 });
assert.deepEqual(A.nowCell(alm, Date.parse("2026-11-04T00:00:00Z")), { row: 6, col: 0 });
assert.equal(A.nowCell(alm, Date.parse("2026-11-07T10:00:00Z")), null, "a day outside the map has no outline");

// Cross-check against the chain: every half hour lands on the date the blocks say (block timestamps, Sepolia)
{
  const a = A.readAlmanac(newChain), row = (label) => a.days.find((d) => d.label === label), sum = (d) => d.cells.reduce((s, w) => s + (w || 0), 0);
  assert.deepEqual(a.days.map((d) => d.label), ["Fri 30", "Sat 31", "Sun 1", "Mon 2", "Tue 3", "Wed 4", "Thu 5"]);
  assert.deepEqual([a.total, a.peak, a.active], [3817, "04:30", 1]);
  assert.equal(sum(row("Thu 5")), 3817, "all of it on Nov 5"); assert.equal(sum(row("Wed 4")), 0, "none of it on Nov 4");
  const thu = row("Thu 5").cells;
  assert.deepEqual([150, 240, 270, 300, 330, 390].map((m) => thu[m / 30]), [6, 721, 1130, 669, 962, 329]);
  // the feed's own record for the busiest half hour names the same cell
  const rec = newChain.records.mostWorkHalfHour, at = new Date(rec.occurredAt);
  assert.equal(thu[(at.getUTCHours() * 60 + at.getUTCMinutes()) / 30], Number(rec.value));
  assert.equal(at.toISOString().slice(0, 10), "2026-11-05");
  // 14:01 UTC: read up to now, nothing after it
  assert.equal(thu[27], 0); assert.equal(thu[28], null);
  assert.deepEqual(A.nowCell(a, Date.parse("2026-11-05T14:01:00Z")), { row: 6, col: 28 });
  // the first hours of a UTC day, before that day's own feed row exists: the morning still lands on the new date
  const early = JSON.parse(JSON.stringify(newChain));
  early.activity.days.pop(); early.window.startAt = "2026-10-29T12:00:00.000Z";
  const e = A.readAlmanac(early);
  assert.equal(e.days.at(-1).label, "Thu 5"); assert.equal(e.days.at(-1).cells[9], 1130);
  // a feed with no window, or rows that turn at midnight: left exactly where they are
  const plain = JSON.parse(JSON.stringify(newChain)); delete plain.window;
  const p = A.readAlmanac(plain);
  assert.equal(A.turnMinute(plain), 0); assert.equal(p.days.at(-1).label, "Thu 5"); assert.equal(p.days.find((d) => d.label === "Wed 4").cells[9], 1130);
}

// anything malformed is "no data", never a crash
const bad = [null, "x", {}, { activity: {} }, { activity: { days: [], summary: {} } },
  { activity: { days: [{ date: "2026-11-04", buckets: [] }], summary: stats.activity.summary } },
  { activity: { days: stats.activity.days, summary: { ...stats.activity.summary, observedWorkUnits: "-1" } } }];
for (const b of bad) assert.equal(A.readAlmanac(b), null);
assert.equal(A.REFRESH_MS, 600000);

console.log("almanac.test.js: all assertions passed");
