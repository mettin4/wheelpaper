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

console.log("live.test.js: all assertions passed");
