// Run: node tests/proof.test.js
"use strict";
const assert = require("node:assert/strict");
const P = require("../proof.js");
const { stepRound } = require("../app.js");

// Fixtures, both captured 2026-11-04:
//   roundrecorded: the 50 newest RoundRecorded logs from the Sepolia explorer (what the page fetches)
//   replay-rpc:    step 0's go/no-go, 20 settlements replayed against SqueekCore.roundPage() over eth_call
const logs = require("./fixtures/roundrecorded-2026-11-04.json");
const rpc = require("./fixtures/replay-rpc-2026-11-04.json");

// the section's rule is the page's rule
for (const [D, w] of [[10875n, 0n], [10875n, 39n], [10875n, 40n], [10217n, 443n], [10000n, 10000n], [1000n, 40n], [10438n, 112n]]) {
  const a = P.stepRound(D, w), b = stepRound(D, w);
  assert.equal(a.units, b.units); assert.equal(a.next, b.next);
}
// whitepaper worked example: D = 10,000, w = 80 -> 8e9 units, D 9,733
assert.deepEqual(P.stepRound(10000n, 80n), { units: 8000000000n, next: 9733n });

// decoding: raw log data, not the explorer's decoded copy
const rounds = P.readLogs(logs);
assert.equal(rounds.length, 50);
for (let i = 1; i < rounds.length; i++) assert.ok(rounds[i].roundId > rounds[i - 1].roundId, "round order");
const r1246 = rounds.find((r) => r.roundId === 1246n);
assert.deepEqual([r1246.work, r1246.cumulativeWork, r1246.cumulativeBlockUnits, r1246.difficulty], [443n, 92730n, 8430478838171n, 10245n]);

// every settlement in the window matches the paper
const rows = P.replay(rounds);
assert.equal(rows.length, 49, "the oldest log is only the starting point");
assert.ok(rows.every((r) => r.matches), "all 49 match");

// ...and agrees with step 0's independent replay over eth_call, row for row
const byTx = new Map(rows.map((r) => [r.tx, r]));
for (const e of rpc) {
  const r = byTx.get(e.tx);
  assert.ok(r, "settlement " + e.tx + " is in the explorer window");
  assert.deepEqual([String(r.work), String(r.before), String(r.paper), String(r.chain), String(r.blocksPaper), String(r.blocksChain)],
                   [e.work, e.dBefore, e.dPaper, e.dChain, e.blocksPaper, e.blocksChain], e.when);
}

// the table: newest 8, newest first
const top = P.latestRows(rows);
assert.equal(top.length, 8);
assert.equal(top[0].tx, "0x29eeb5ef5189f1e0824adaeba2572eb1d84c9114e76fe3b416281c611b13af9e");
assert.equal(P.fmtWhen(top[0].at), "05:30, Nov 4");
assert.equal(P.verdictText(top[0]), "matches");
assert.equal(P.view(top, null).stamp, "all");

// a chain record that disagrees: the row says by how much, the stamp changes
{
  const bent = rounds.map((r) => ({ ...r }));
  const i = bent.findIndex((r) => r.roundId === 1246n);
  bent[i].difficulty += 7n;
  const t = P.latestRows(P.replay(bent));
  assert.equal(t[0].matches, false); assert.equal(P.verdictText(t[0]), "off by 7");
  assert.equal(P.view(t, null).stamp, "some");
  // block units off while difficulty agrees: the gap is reported in blocks
  const bent2 = rounds.map((r) => ({ ...r }));
  bent2[i].cumulativeBlockUnits += 3000000000n;
  const t2 = P.latestRows(P.replay(bent2));
  assert.equal(P.verdictText(t2[0]), "off by 3");
}

// a missing round inside the window never becomes a fake row
{
  const gap = rounds.filter((r) => r.roundId !== 1245n);
  const ids = P.replay(gap).map((r) => r.tx);
  assert.ok(!ids.includes(rounds.find((r) => r.roundId === 1246n).tx), "row after the gap is dropped");
}

// anything malformed is "no data", never a crash
for (const bad of [null, "x", {}, { items: null }, { items: [] }, { items: [{}] }, { items: logs.items.slice(0, 1) }]) {
  assert.equal(P.readLogs(bad), null);
}
assert.equal(P.decodeLog({ ...logs.items[0], address: { hash: "0x0000000000000000000000000000000000000001" } }), null, "other contract");
assert.equal(P.decodeLog({ ...logs.items[0], topics: ["0x" + "00".repeat(32)] }), null, "other event");
assert.equal(P.decodeLog({ ...logs.items[0], data: "0x1234" }), null, "short data");
assert.deepEqual(P.replay(null), []);

// states: live, unreachable with no history, a failed refresh after a good one keeps the good one
assert.equal(P.view(null, null).state, "unreachable");
assert.equal(P.view([], null).state, "unreachable");
const good = P.view(top, null);
assert.equal(P.view(null, good), good);

console.log("proof.test.js: all assertions passed");
