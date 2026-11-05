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
const OLD_CORE = "0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44"; // the 2026-11-04 fixtures predate the redeploy
const rounds = P.readLogs(logs, OLD_CORE);
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
assert.equal(P.decodeLog({ ...logs.items[0], address: { hash: "0x0000000000000000000000000000000000000001" } }, OLD_CORE), null, "other contract");
assert.equal(P.decodeLog({ ...logs.items[0], topics: ["0x" + "00".repeat(32)] }, OLD_CORE), null, "other event");
assert.equal(P.decodeLog({ ...logs.items[0], data: "0x1234" }, OLD_CORE), null, "short data");
assert.equal(P.decodeLog(logs.items[0]), null, "the old chain's logs are not the current core's");
assert.deepEqual(P.replay(null), []);

// states: live, unreachable with no history, a failed refresh after a good one keeps the good one
assert.equal(P.view(null, null).state, "unreachable");
assert.equal(P.view([], null).state, "unreachable");
const good = P.view(top, null);
assert.equal(P.view(null, good), good);

// ---- the chain after the 2026-11-04 redeploy, both responses recorded 2026-11-05 ----
{
  const coreResp = require("./fixtures/core-2026-11-05.json");
  const newLogs = require("./fixtures/roundrecorded-new-core-2026-11-05.json");
  const CORE = "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4";

  // the address comes from the API, lowercased, checksummed or not
  assert.equal(P.readCore(coreResp), CORE);
  assert.equal(P.readCore({ ...coreResp, identities: { core: "0xFD6C166D4B8E2962E65746a13e5a0797CD4dE0c4" } }), CORE);
  assert.equal(P.CORE, CORE, "the starting constant is the current chain");
  assert.equal(P.logsUrl(CORE), "https://eth-sepolia.blockscout.com/api/v2/addresses/" + CORE + "/logs?topic=" + P.TOPIC);
  // anything else leaves the address alone: it ends up in a URL
  for (const bad of [null, undefined, "x", {}, { ...coreResp, status: "unavailable" }, { ...coreResp, chain: { chainId: "1" } }, { ...coreResp, identities: null },
                     { ...coreResp, identities: { core: "0x1234" } }, { ...coreResp, identities: { core: CORE + "/../x" } }, { ...coreResp, identities: { core: 5 } }]) assert.equal(P.readCore(bad), null);

  // same event, same layout: 5 words, and the explorer's verified source names the same fields
  const fresh = P.readLogs(newLogs, CORE);
  assert.equal(fresh.length, 14);
  assert.ok(newLogs.items.every((l) => l.topics[0] === P.TOPIC && l.data.length === 322));
  assert.ok(newLogs.items.every((l) => l.decoded.method_call === "RoundRecorded(uint64 indexed roundId, uint64 work, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks, bytes32 dataHash)"));
  const r200 = fresh.find((r) => r.roundId === 200n);
  assert.deepEqual([r200.work, r200.cumulativeWork, r200.cumulativeBlockUnits, r200.difficulty], [136n, 1993n, 185872387507n, 10382n]);

  // all of it replays from launch: nothing from the chain goes in but the work
  let D = 10875n, U = 0n;
  for (const r of fresh) { const s = stepRound(D, r.work); U += s.units; D = s.next; assert.deepEqual([D, U], [r.difficulty, r.cumulativeBlockUnits], String(r.roundId)); }
  assert.deepEqual([String(D), String(U)], [coreResp.core.workPerThousandBlocks, coreResp.core.cumulativeBlockUnits], "lands where /v1/core says");

  const newRows = P.replay(fresh);
  assert.equal(newRows.length, 13, "the oldest log is only the starting point");
  assert.ok(newRows.every((r) => r.matches));
  const shown = P.latestRows(newRows);
  assert.equal(shown.length, 8);
  assert.equal(shown[0].chain, 9546n); assert.equal(P.view(shown, null).stamp, "all");

  // the old chain's logs say nothing about this address
  assert.equal(P.readLogs(logs, CORE), null);

  // a young chain is not an outage; a broken response still is
  const empty = { items: [], next_page_params: null };
  assert.equal(P.tooFew(empty, CORE), true);
  assert.equal(P.tooFew({ items: newLogs.items.slice(0, 1) }, CORE), true);
  assert.equal(P.tooFew(newLogs, CORE), false);
  for (const bad of [null, {}, { items: null }, { items: [{}] }, { items: [{ ...newLogs.items[0], data: "0x1234" }] }]) assert.equal(P.tooFew(bad, CORE), false);
  const f = P.view(null, null, true);
  assert.deepEqual([f.state, f.rows.length, f.stamp], ["few", 0, null]);
  assert.notEqual(P.LINE_FEW, P.LINE_DOWN); assert.ok(!/unreachable/i.test(P.LINE_FEW));
  assert.equal(P.view(shown, null, true).state, "live", "rows win");
  assert.equal(P.view(null, good, false), good, "a failed refresh still keeps the last rows");
}

console.log("proof.test.js: all assertions passed");
