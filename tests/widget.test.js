// Run: node tests/widget.test.js
"use strict";
const assert = require("node:assert/strict");
const W = require("../widget.js");
const { readStatus, wheelPlan } = require("../live.js");

const status = (m = {}) => ({
  generatedAt: "2026-11-04T22:10:01.000Z",
  measurement: Object.assign({ freshness: "online", observedAt: "2026-11-04T22:10:00.000Z", staleAfterSeconds: 120,
    cumulativeWorkUnits: "93000", distanceMm: 120000, rpmMilli: 45300 }, m),
  builder: { anchor: { blockHeight: "8430" } }
});
const detail = (json) => { const d = readStatus(json); return { state: d ? (d.stale ? "sleeping" : "live") : "unreachable", data: d, wheel: wheelPlan(d) }; };

// theme
assert.equal(W.themeFrom(""), "dark");
assert.equal(W.themeFrom("?theme=transparent"), "transparent");
assert.equal(W.themeFrom("?x=1&theme=transparent"), "transparent");
assert.equal(W.themeFrom("?theme=dark"), "dark");
assert.equal(W.themeFrom("?theme=neon"), "dark", "unknown themes fall back to dark");

// live: height and pace
assert.equal(W.lineFor(detail(status())), "8,430 blocks · 45 RPM");
assert.equal(W.lineFor(detail(status({ rpmMilli: 4300 }))), "8,430 blocks · 4.3 RPM");
// sleeping: wheel stopped, or the reading is stale
assert.equal(W.lineFor(detail(status({ rpmMilli: 0 }))), "Squeektoshi is sleeping");
assert.equal(W.lineFor(detail(status({ freshness: "stale" }))), "Squeektoshi is sleeping");
// unreachable: decorative spin, no line
assert.equal(W.lineFor(detail(null)), null);
assert.equal(W.lineFor(undefined), null);

console.log("widget.test.js: all assertions passed");
