/* The Wheelpaper, THE PROOF. Replays the whitepaper's integer rule against SqueekCore's own round records. */
(function () {
  "use strict";

  /* ---------- where the chain's numbers come from ----------
     SqueekCore emits RoundRecorded(uint64 indexed roundId, uint64 work, uint64 cumulativeWork,
     uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks, bytes32 dataHash) once per active round;
     workPerThousandBlocks there is the difficulty AFTER that round steered. The Squeekchain API exposes only
     the current difficulty, so the round records are read from the Sepolia explorer's public log index:
     one GET returns the newest 50, with transaction hash and block time. The raw log data is decoded here;
     the explorer's own decoding is not trusted. */
  // The address changes when the testnet is redeployed; /v1/core names the current one, so a reset heals itself.
  // CORE is only the starting point (checked by hand 2026-11-05), used until that answer arrives or if it cannot be read.
  var CORE = "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4";
  var CORE_API = "https://api.squeekchain.com/v1/core";
  var CORE_EVERY_MS = 600000;
  var SEPOLIA = "11155111"; // the log index below is Sepolia's, so an address from any other chain is not used
  var TOPIC = "0x6f7efb5b00900843c192802a77e52da9f18fee1daa04089fc4bf159963c7968c"; // keccak256 of the event signature
  function logsUrl(core) { return "https://eth-sepolia.blockscout.com/api/v2/addresses/" + core + "/logs?topic=" + TOPIC; }
  var TX_URL = "https://eth-sepolia.blockscout.com/tx/";
  var ROWS = 8;
  var TIMEOUT_MS = 8000;

  /* ---------- the whitepaper's rule (same integers as app.js stepRound) ----------
     units  = floor(w * 10^12 / D)                                 price first, at the difficulty before the round
     D_next = floor((29 * D + floor(w * 1000 / 40)) / 30), >= 1,000  then steer, only when w >= 40 */
  function stepRound(D, w) {
    var units = (w * 1000000000000n) / D;
    var next = D;
    if (w >= 40n) {
      next = (29n * D + (w * 1000n) / 40n) / 30n;
      if (next < 1000n) next = 1000n;
    }
    return { units: units, next: next };
  }

  var HEX64 = /^0x[0-9a-fA-F]{64}$/;
  function word(data, i) { return BigInt("0x" + data.slice(2 + 64 * i, 2 + 64 * (i + 1))); }

  // /v1/core -> the current core address, lowercase, or null if the response does not name a Sepolia one.
  function readCore(json) {
    if (!json || json.status !== "available" || !json.chain || json.chain.chainId !== SEPOLIA || !json.identities) return null;
    var a = json.identities.core;
    return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : null;
  }

  // One explorer log -> one round, or null if it is not a well-formed RoundRecorded from SqueekCore.
  function decodeLog(log, core) {
    if (!log || typeof log !== "object") return null;
    var addr = log.address && (typeof log.address === "string" ? log.address : log.address.hash);
    var t = log.topics, data = log.data;
    if (typeof addr !== "string" || addr.toLowerCase() !== (core || CORE)) return null;
    if (!Array.isArray(t) || t[0] !== TOPIC || typeof t[1] !== "string" || !HEX64.test(t[1])) return null;
    if (typeof data !== "string" || !/^0x[0-9a-fA-F]{320}$/.test(data)) return null;
    if (typeof log.transaction_hash !== "string" || !HEX64.test(log.transaction_hash)) return null;
    var at = Date.parse(log.block_timestamp);
    if (!isFinite(at)) return null;
    return { roundId: BigInt(t[1]), work: word(data, 0), cumulativeWork: word(data, 1), cumulativeBlockUnits: word(data, 2),
             difficulty: word(data, 3), tx: log.transaction_hash.toLowerCase(), at: at };
  }

  // Explorer response -> rounds in round order, or null if nothing usable came back.
  function readLogs(json, core) {
    if (!json || !Array.isArray(json.items)) return null;
    var rounds = [], seen = {};
    for (var i = 0; i < json.items.length; i++) {
      var r = decodeLog(json.items[i], core);
      if (r && !seen[r.roundId]) { seen[r.roundId] = true; rounds.push(r); }
    }
    rounds.sort(function (a, b) { return a.roundId < b.roundId ? -1 : a.roundId > b.roundId ? 1 : 0; });
    return rounds.length >= 2 ? rounds : null;
  }

  /* One row per settlement (one transaction). The replay starts from the chain's position just before the
     settlement's first round, applies the rule round by round, and compares where it lands with where the
     chain recorded it landed. Rounds must be consecutive records for the starting position to be known, so
     the oldest settlement in the window is only a starting point, never a row. */
  function replay(rounds) {
    if (!rounds || rounds.length < 2) return [];
    var groups = [];
    for (var i = 0; i < rounds.length; i++) {
      var g = groups[groups.length - 1];
      if (g && g.tx === rounds[i].tx) g.rounds.push(rounds[i]);
      else groups.push({ tx: rounds[i].tx, at: rounds[i].at, rounds: [rounds[i]] });
    }
    var rows = [];
    for (var k = 1; k < groups.length; k++) {
      var prev = groups[k - 1].rounds[groups[k - 1].rounds.length - 1];
      var D = prev.difficulty, U = prev.cumulativeBlockUnits, W = prev.cumulativeWork, work = 0n, contiguous = true;
      var rs = groups[k].rounds;
      for (var j = 0; j < rs.length; j++) {
        if (rs[j].cumulativeWork - W !== rs[j].work) contiguous = false; // a round is missing from the window
        var st = stepRound(D, rs[j].work);
        U += st.units; W += rs[j].work; work += rs[j].work; D = st.next;
      }
      if (!contiguous) continue;
      var last = rs[rs.length - 1];
      var blocksPaper = U / 1000000000n - prev.cumulativeBlockUnits / 1000000000n;
      var blocksChain = last.cumulativeBlockUnits / 1000000000n - prev.cumulativeBlockUnits / 1000000000n;
      var diff = D > last.difficulty ? D - last.difficulty : last.difficulty - D;
      rows.push({ tx: groups[k].tx, at: groups[k].at, work: work, before: prev.difficulty, paper: D, chain: last.difficulty,
                  blocksPaper: blocksPaper, blocksChain: blocksChain, unitsMatch: U === last.cumulativeBlockUnits,
                  matches: diff === 0n && U === last.cumulativeBlockUnits, offBy: diff });
    }
    return rows;
  }

  // A good answer with almost nothing in it: a young chain, not an outage. Logs that fail to decode never count here.
  function tooFew(json, core) {
    if (!json || !Array.isArray(json.items) || json.items.length >= 2) return false;
    return json.items.every(function (log) { return decodeLog(log, core) !== null; });
  }

  // Newest first, at most ROWS of them.
  function latestRows(rows, n) { return rows.slice(-(n || ROWS)).reverse(); }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtWhen(ms) {
    var d = new Date(ms), p = function (x) { return (x < 10 ? "0" : "") + x; };
    return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ", " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate();
  }
  var fmtBig = function (n) { return n.toLocaleString("en-US"); };
  // n is the difficulty gap; if difficulty agrees but block progress does not, it is the gap in blocks.
  function verdictText(row) {
    if (row.matches) return "matches";
    var blocks = row.blocksPaper > row.blocksChain ? row.blocksPaper - row.blocksChain : row.blocksChain - row.blocksPaper;
    return "off by " + fmtBig(row.offBy !== 0n ? row.offBy : blocks);
  }

  var STAMP_ALL = "EVERY SETTLEMENT ON THIS PAGE MATCHES THE PAPER.";
  var STAMP_SOME = "Some settlements differ from what the paper's rule predicts. Follow the links and check the chain yourself.";
  var LINE_DOWN = "Live settlements unreachable. The rest of the page works without them.";
  var LINE_FEW = "Too few settlements on this chain to replay yet. The rest of the page works without them.";

  // What the section shows, given the newest fetch result, the last good one and whether the chain is too young.
  function view(rows, last, few) {
    if (rows && rows.length) return { state: "live", rows: rows, stamp: rows.every(function (r) { return r.matches; }) ? "all" : "some" };
    if (few) return { state: "few", rows: [], stamp: null };
    if (last) return last;
    return { state: "unreachable", rows: [], stamp: null };
  }

  /* Blocks SqueekCore completed since `since` (ms), for THE NIGHT SHIFT's comparison line: whole blocks in the
     newest record minus whole blocks in the last record before `since`. null when the window does not reach back
     that far, since then the count would be short. No active round since then is a real answer: 0. */
  function blocksSince(rounds, since) {
    if (!rounds || !rounds.length) return null;
    var start = null;
    for (var i = 0; i < rounds.length; i++) if (rounds[i].at < since) start = rounds[i];
    if (!start) return null;
    var end = rounds[rounds.length - 1];
    return end.cumulativeBlockUnits / 1000000000n - start.cumulativeBlockUnits / 1000000000n;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { stepRound: stepRound, decodeLog: decodeLog, readLogs: readLogs, replay: replay, latestRows: latestRows,
                       blocksSince: blocksSince,
                       view: view, fmtWhen: fmtWhen, verdictText: verdictText, logsUrl: logsUrl, TX_URL: TX_URL,
                       readCore: readCore, tooFew: tooFew, CORE_API: CORE_API, CORE_EVERY_MS: CORE_EVERY_MS,
                       STAMP_ALL: STAMP_ALL, STAMP_SOME: STAMP_SOME, LINE_DOWN: LINE_DOWN, LINE_FEW: LINE_FEW, CORE: CORE, TOPIC: TOPIC };
  }
  if (typeof document === "undefined") return;

  /* ---------- dot-matrix numerals: the site's glyphs ---------- */
  var GLYPHS = {
    "0": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."]
  };
  function digitGroup(text) {
    var P = 10, R = 4, R_OFF = 1.6, x0 = 0, parts = [];
    for (var i = 0; i < text.length; i++) {
      var g = GLYPHS[text[i]];
      if (!g) continue;
      for (var row = 0; row < 7; row++) {
        for (var col = 0; col < g[row].length; col++) {
          var on = g[row][col] === "#";
          parts.push('<circle class="' + (on ? "on" : "off") + '" cx="' + (x0 + col * P + P / 2) + '" cy="' + (row * P + P / 2) + '" r="' + (on ? R : R_OFF) + '"/>');
        }
      }
      x0 += g[0].length * P + P;
    }
    var w = Math.max(P, x0 - P);
    return '<svg viewBox="0 0 ' + w + " " + 7 * P + '" aria-hidden="true" focusable="false">' + parts.join("") + "</svg>";
  }
  function dmHTML(text) {
    return '<span class="dm dm--xs" role="img" aria-label="' + text + '">' +
      text.split(",").map(digitGroup).join('<span class="dm__sep" aria-hidden="true">,</span>') + "</span>";
  }

  /* ---------- the section ---------- */
  var root = document.getElementById("settlements");
  if (!root) return;
  var body = document.getElementById("proof-rows");
  var stamp = document.getElementById("proof-stamp");
  var down = document.getElementById("proof-down");
  var last = null, inFlight = false, core = CORE, coreAt = -Infinity;

  function render(v) {
    root.setAttribute("data-state", v.state);
    down.textContent = v.state === "unreachable" ? LINE_DOWN : v.state === "few" ? LINE_FEW : "";
    if (v.state !== "live") { stamp.textContent = ""; stamp.removeAttribute("data-stamp"); return; }
    var trs = body.querySelectorAll("tr");
    for (var i = 0; i < trs.length; i++) {
      var r = v.rows[i], tds = trs[i].querySelectorAll("td");
      if (!r) { for (var j = 0; j < tds.length; j++) tds[j].innerHTML = ""; trs[i].removeAttribute("data-verdict"); continue; }
      trs[i].setAttribute("data-verdict", r.matches ? "match" : "off");
      tds[0].innerHTML = '<a class="proof__when" href="' + TX_URL + r.tx + '" target="_blank" rel="noopener">' + fmtWhen(r.at) + "</a>";
      tds[1].innerHTML = dmHTML(fmtBig(r.work));
      tds[2].innerHTML = dmHTML(fmtBig(r.paper));
      tds[3].innerHTML = dmHTML(fmtBig(r.chain));
      tds[4].innerHTML = '<span class="proof__verdict"><span class="proof__mark" aria-hidden="true"></span>' + verdictText(r) + "</span>";
    }
    stamp.setAttribute("data-stamp", v.stamp);
    stamp.textContent = v.stamp === "all" ? STAMP_ALL : STAMP_SOME;
  }

  function getJSON(url) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var killer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    var request = fetch(url, { method: "GET", mode: "cors", credentials: "omit", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    var deadline = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, TIMEOUT_MS + 50); });
    return Promise.race([request, deadline]).then(function (json) { clearTimeout(killer); return json; },
                                                  function () { clearTimeout(killer); return null; });
  }

  // The address only changes on a redeploy, so it is asked for every 10 minutes and not on every poll. On a new
  // address the rows on show are dropped: they belong to the previous chain. A failed ask is retried on the next poll.
  function resolveCore() {
    if (Date.now() - coreAt < CORE_EVERY_MS) return Promise.resolve();
    return getJSON(CORE_API).then(function (json) {
      var a = readCore(json);
      if (!a) return;
      coreAt = Date.now();
      if (a !== core) { core = a; last = null; }
    });
  }

  function fetchRounds() {
    return resolveCore().then(function () { return getJSON(logsUrl(core)); }).then(function (json) {
      try { return { rounds: readLogs(json, core), few: tooFew(json, core) }; } catch (e) { return { rounds: null, few: false }; }
    });
  }

  // Rides the TONIGHT poller: one extra fetch per cycle, none while the previous one is still out.
  // The same decoded rounds go out to THE NIGHT SHIFT as the last 24 hours' block count; no second fetch.
  function cycle() {
    if (inFlight) return;
    inFlight = true;
    fetchRounds().then(function (got) {
      inFlight = false;
      var rounds = got.rounds, rows = null;
      try { rows = rounds ? latestRows(replay(rounds)) : null; } catch (e) { rows = null; }
      var v = view(rows, last, got.few || (!!rows && !rows.length)); // records, but none replayable yet
      if (v.state === "live") last = v;
      render(v);
      var day = null;
      try { day = blocksSince(rounds, Date.now() - 86400000); } catch (e) { day = null; }
      document.dispatchEvent(new CustomEvent("wheelpaper:rounds", { detail: { blocks24h: day } }));
    });
  }
  document.addEventListener("wheelpaper:live", cycle);
})();
