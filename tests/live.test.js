// Run: node tests/live.test.js
"use strict";
const assert = require("node:assert/strict");
const { readStatus, view, fmtKm, utcHHMM, LINE_LIVE, LINE_DOWN } = require("../live.js");

// Shape of GET https://api.squeekchain.com/v1/status (trimmed to the fields the strip reads).
const status = (over = {}) => ({
  generatedAt: "2026-10-29T04:56:12.000Z",
  measurement: Object.assign({
    freshness: "online", observedAt: "2026-10-29T04:56:11.279Z", staleAfterSeconds: 120,
    cumulativeWorkUnits: "32660", distanceMm: 9295386
  }, over.measurement),
  builder: { anchor: Object.assign({ blockHeight: "2994" }, over.anchor) }
});

// live reading
{
  const r = readStatus(status());
  assert.deepEqual([r.height, r.work, r.mm, r.stale], [2994, 32660, 9295386, false]);
  const v = view(r, null);
  assert.equal(v.state, "live"); assert.equal(v.dot, "on"); assert.equal(v.line, LINE_LIVE);
}

// stale: by the API's flag, or by age against the API's own clock
{
  assert.equal(readStatus(status({ measurement: { freshness: "stale" } })).stale, true);
  const old = status({ measurement: { observedAt: "2026-10-29T04:50:00.000Z" } }); // 372 s before generatedAt
  assert.equal(readStatus(old).stale, true);
  const v = view(readStatus(old), null);
  assert.equal(v.state, "sleeping"); assert.equal(v.dot, "off");
  assert.equal(v.line, "Squeektoshi is sleeping. Last reading 04:50 UTC.");
}

// anything malformed is "no data", never a crash
for (const bad of [null, "x", {}, { measurement: {} }, status({ anchor: { blockHeight: "-1" } }),
                   status({ measurement: { distanceMm: "abc" } }), status({ measurement: { observedAt: "nope" } })]) {
  assert.equal(readStatus(bad), null);
}

// unreachable with no history; a failed refresh after a good one keeps values and mutes the dot
{
  const down = view(null, null);
  assert.equal(down.state, "unreachable"); assert.equal(down.data, null); assert.equal(down.line, LINE_DOWN);
  const r = readStatus(status());
  const keep = view(null, { data: r, view: view(r, null) });
  assert.equal(keep.state, "live"); assert.equal(keep.dot, "off"); assert.equal(keep.data, r);
}

// formatting
assert.equal(fmtKm(9295386), "9.30");
assert.equal(fmtKm(0), "0.00");
assert.equal(fmtKm(1234567890), "1,234.57");
assert.equal(utcHHMM(Date.parse("2026-10-29T23:05:59Z")), "23:05");

/* ---------- phase 2: wheel, money line, start toggle ---------- */
const { wheelDuration, wheelPlan } = require("../live.js");
const { moneyLine, simulateNight, START_D } = require("../app.js");

// rpm -> seconds per revolution, clamped to 0.4 .. 10
const durations = [[1, 10], [60, 1], [300, 0.4], [10000, 0.4], [6, 10], [150, 0.4], [30, 2]];
for (const [rpm, sec] of durations) assert.equal(wheelDuration(rpm), sec, `rpm ${rpm}`);

// wheel modes
{
  const fresh = readStatus(status({ measurement: { rpmMilli: 45000 } }));
  assert.equal(fresh.rpm, 45);
  assert.deepEqual(wheelPlan(fresh), { mode: "running", duration: 60 / 45 });
  assert.equal(wheelPlan(readStatus(status({ measurement: { rpmMilli: 0 } }))).mode, "sleeping");
  assert.equal(wheelPlan(readStatus(status({ measurement: { rpmMilli: 45000, freshness: "stale" } }))).mode, "sleeping");
  assert.equal(wheelPlan(readStatus(status())).mode, "sleeping", "rpm missing counts as not running");
  assert.equal(wheelPlan(null).mode, "decorative");
}

// difficulty field
assert.equal(readStatus(status({ anchor: { workPerThousandBlocks: 11246 } })).difficulty, 11246);
assert.equal(readStatus(status()).difficulty, null, "no difficulty -> toggle stays off");

// money line at X = 2,994: 2,994 x 6,900 = 20,658,600
assert.equal(moneyLine(2994), "Sepolia has completed 2,994 blocks so far. At launch values that would be 20,658,600 SQK minted.");

// toggle starts feed the sim: same work, 48 rounds, launch vs tonight
{
  const launch = simulateNight(2000, 48, START_D);
  const tonight = simulateNight(2000, 48, 11246);
  assert.equal(launch.before, 10875n); assert.equal(tonight.before, 11246n);
  assert.notEqual(launch.after, tonight.after);
  assert.notEqual(launch.blocks, tonight.blocks);
  assert.deepEqual(simulateNight(2000), launch, "default start is still the launch value");
}

console.log("live.test.js: all assertions passed");
