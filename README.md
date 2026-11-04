# The Wheelpaper

The Squeekchain whitepaper as an interactive page: its integer formulas implemented in the browser and checked against the live Sepolia test.

Live: https://wheelpaper.online

Unofficial. Not affiliated with Squeekchain. Built by @0xmeto_

## What it does

Each section names where its numbers come from: the whitepaper (formulas run in the browser), the public Squeekchain API (`api.squeekchain.com`), or the Sepolia block explorer.

**The wheel.** A pixel hamster wheel with a magnet and a sensor; each revolution counts one work unit. It turns at the hamster's measured speed and winds down to a stop when he is idle. A strip under it (TONIGHT) shows Squeek block height, work units counted and lifetime distance run. Source: live API, `/v1/status` and `/v1/measurement/stats`.

**Rounds and blocks.** Three animated clocks: 10-minute measurement rounds, Squeek blocks filled by work, Ethereum blocks every ~12 seconds. Illustrative, not to scale. Source: whitepaper.

**Difficulty.** A slider sets work units per round; the page runs one night of 48 rounds with the whitepaper's integer difficulty rule and shows blocks completed, difficulty at dawn and a per-round chart. The night starts from the launch value (10,875), or from the testnet's current difficulty when the live feed is available. Source: whitepaper, with the optional starting value from the live API.

**The money (supply clock).** A slider sets completed blocks; the page shows SQK minted by blocks (6,900 per block), total supply including the 210,000,000 premine, and what is left to the 2,100,000,000 cap, which block 273,914 reaches. A line under it applies the same arithmetic to the testnet's current block height. Source: whitepaper, with the block height from the live API.

**The settlements.** The last 8 settlements, each replayed with the whitepaper's rule and compared with the difficulty SqueekCore recorded on chain; every row links to its transaction. Source: whitepaper formula, against SqueekCore's `RoundRecorded` events read from the Sepolia explorer (`eth-sepolia.blockscout.com`).

**The squeeks.** The level pyramid: power and merge cooldown per level, and how many Level 1 Squeeks a level costs and burns. Source: whitepaper.

**The almanac.** Seven days of work in half-hour cells, with the week's total, the busiest half hour and the number of active days. Source: live API, `/v1/measurement/stats?range=7d`.

**The widget.** The live wheel at 320 x 200 for embedding in other sites and stream overlays (below). Source: live API, `/v1/status`.

**The trust.** What the system proves (an accepted magnet pass, which key signed it) and what it does not (which animal ran, whether the measurement is true). Source: whitepaper.

## The settlements check

Each active round is priced at the difficulty in force before it, then steers the difficulty, using the whitepaper's integer arithmetic exactly. The page replays every round of a settlement in order, starting from the position SqueekCore recorded just before it, and compares the result with the difficulty and block units SqueekCore recorded after it. A row reads "matches" only when both are equal; otherwise it shows the difference.

```text
units  = floor(w * 10^12 / D)                             price first, at the difficulty before the round
blocks = floor(cumulativeUnits / 10^9)
D_next = floor((29 * D + floor(w * 1000 / 40)) / 30)      steer, only when w >= 40; never below 1,000
```

Match record as of 2026-11-04: 49 of 49 settlements in the explorer window matched, difficulty and block count. 20 of them were also checked independently against `SqueekCore.roundPage()` read directly from Sepolia; 20 of 20 matched. The testnet started at difficulty 10,000 rather than the whitepaper's launch value of 10,875; the rule itself is the same.

## The widget

```html
<iframe src="https://wheelpaper.online/widget" width="320" height="200" frameborder="0"></iframe>
```

It shows "{block height} blocks · {RPM} RPM" while the hamster runs and "Squeektoshi is sleeping" when he stops. Add `?theme=transparent` to the URL for stream overlays (for example an OBS browser source): the background is then fully transparent.

## Run it locally

```sh
python -m http.server 8765
```

Then open http://127.0.0.1:8765/. Locally the widget is at `/widget.html`; the `/widget` path (and the preview on the main page) comes from `cleanUrls` in `vercel.json`, which a plain static server does not apply.

Tests (Node 18 or later, no dependencies):

```sh
for f in tests/*.test.js; do node "$f"; done
```

- `tests/sim.test.js`: difficulty rule and the 48-round night
- `tests/money.test.js`: supply arithmetic, cap block and level costs
- `tests/live.test.js`: reading `/v1/status`, live and fallback states, lifetime distance
- `tests/proof.test.js`: settlement replay against recorded explorer and contract data in `tests/fixtures/`
- `tests/almanac.test.js`: half-hour scaling, day labels and readouts from a recorded 7-day response
- `tests/widget.test.js`: widget line and theme for live, sleeping and unreachable
- `tests/menu.test.js`: which section the menu marks active

## Stack

Plain HTML, CSS and JavaScript: no frameworks, no build step, no packages; the only external files are two Google Fonts (Barlow Condensed, IBM Plex Mono). One poll every 60 seconds (`live.js`, paused while the tab is hidden) fetches `/v1/status` and `/v1/measurement/stats` and shares both with every live feature on the page; the settlements section adds one explorer request per cycle. Every live feature has a fallback, and the whitepaper sections work without any network access.

squeekchain-project: 7a32da48-3951-4f13-b444-f7953aec6e7e
