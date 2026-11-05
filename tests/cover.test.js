// Run: node tests/cover.test.js
// The contents grid and the deep links, read from the page's own files.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { sectionId, isAlias, ALIASES } = require("../menu.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const html = read("index.html"), css = read("styles.css");

const CARDS = [
  ["wheel", "THE WHEEL", "A real wheel, one work unit per pass."],
  ["rounds", "ROUNDS AND BLOCKS", "Three clocks, none waiting."],
  ["difficulty", "DIFFICULTY", "Run a night, watch the rule react."],
  ["money", "THE MONEY", "6,900 SQK a block, capped."],
  ["settlements", "THE SETTLEMENTS", "The paper, checked against the chain."],
  ["squeeks", "THE SQUEEKS", "9,999, merging and burning."],
  ["almanac", "THE ALMANAC", "Seven nights, half an hour at a time."],
  ["widget", "THE WIDGET", "The wheel, embeddable."],
  ["nightshift", "THE NIGHT SHIFT", "Play it. Match the hamster's pace."],
  ["trust", "THE TRUST", "What is proven, what is not."],
];
const HASHES = CARDS.map((c) => c[0]);

// the grid: ten cards, in page order, with one PLAY tag
const cards = [...html.matchAll(/<a class="contents__card[^"]*" href="#([^"]+)">([\s\S]*?)<\/a>/g)];
assert.equal(cards.length, 10);
cards.forEach((m, i) => {
  assert.equal(m[1], CARDS[i][0]);
  assert.equal(m[2].match(/class="contents__name">([^<]+)</)[1], CARDS[i][1]);
  assert.equal(m[2].match(/class="contents__line">([^<]+)</)[1], CARDS[i][2]);
  assert.match(m[2], /<svg class="contents__glyph"[^>]*aria-hidden="true"/);
});
assert.deepEqual(cards.filter((m) => m[2].includes("contents__tag")).map((m) => m[1]), ["nightshift"]);
assert.equal(new Set(cards.map((m) => m[2].match(/<svg[\s\S]*<\/svg>/)[0])).size, 10, "ten different glyphs");

// menu, dots and cards link the same ten hashes
const hrefs = (cls) => [...html.matchAll(new RegExp('class="' + cls + '[^"]*" href="#([^"]+)"', "g"))].map((m) => m[1]);
for (const cls of ["menu__link", "secnav__dot", "contents__card"]) assert.deepEqual(hrefs(cls), HASHES, cls);

// every hash is a real section id, so the browser can land it with no script; page order; the grid sits above ROUNDS
const order = HASHES.map((id) => html.search(new RegExp('<section class="[^"]*" id="' + id + '"')));
assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), "every section exists, in that order");
assert.ok(html.indexOf('id="tonight"') < html.indexOf('id="contents"') && html.indexOf('id="contents"') < order[1]);
for (const h of HASHES) { assert.equal(sectionId("#" + h), h); assert.equal(isAlias("#" + h), false); }

// the older ids are aliases only: nothing on the page carries or looks up those ids any more
assert.deepEqual(ALIASES, { "rounds-and-blocks": "rounds", proof: "settlements", "night-shift": "nightshift" });
for (const [old, now] of Object.entries(ALIASES)) {
  assert.equal(sectionId("#" + old), now); assert.equal(sectionId(old), now); assert.equal(isAlias("#" + old), true);
  assert.ok(!html.includes(' id="' + old + '"'), old);
  assert.ok(!css.includes("#" + old), old);
  for (const f of ["app.js", "live.js", "proof.js", "almanac.js", "nightshift.js"]) assert.ok(!read(f).includes('getElementById("' + old + '")'), f + " " + old);
}
assert.equal(sectionId(""), ""); assert.equal(sectionId("#constructor"), "constructor", "not a key of the map"); assert.equal(isAlias("#constructor"), false);

// the CONTENTS label is a heading, in the weight the page actually loads
assert.match(html, /<h2 class="contents__label" id="t-contents">CONTENTS<\/h2>/);
assert.match(html, /Barlow\+Condensed:wght@[\d;]*\b700\b/);

// the strip reserves its sentence in the markup, hidden until data arrives, so its content never re-centres
assert.ok(html.includes('<p class="tonight__line" id="tn-line">' + require("../live.js").LINE_LIVE + "</p>"));

// the vertical scale: one rule for all nine sections, no section setting its own padding, one heading gap
assert.match(css, /:root \{ --section-y: 60px; --head-gap: var\(--s4\); \}/);
assert.match(css, /:root \{ --section-y: 36px; \}/);
assert.match(css, /\.s-clocks, \.s-diff, \.s-money, \.s-squeeks, \.s-proof, \.s-almanac, \.s-widget, \.s-night, \.s-trust \{ padding-top: var\(--section-y\); padding-bottom: var\(--section-y\); \}/);
for (const r of css.match(/^\s*\.s-(clocks|diff|money|squeeks|proof|almanac|widget|night|trust)\b[^{]*\{[^}]*\}/gm) || []) if (!/section-y/.test(r)) assert.ok(!/\bpadding(-top|-bottom)?:/.test(r), r.trim());
assert.ok(!/\.s-[a-z]+ \.h2 \{[^}]*margin-bottom/.test(css), "no section sets its own heading gap");

// the first screen, and the strip's reserved height at both ends
// the first paint may come before the parser finishes the hero: the cover's rows and the grid hold the final height
assert.match(css, /\.cover \{ display: grid; grid-template-columns: minmax\(0, 1fr\); grid-template-rows: 1fr minmax\(var\(--tn-h\), auto\); min-height: 100vh; min-height: 100svh; \}/);
assert.match(css, /min-height: calc\(var\(--hero-fig\) \+ min\(var\(--hero-col\), var\(--wheel-max\)\) \* 1\.1\);/);
assert.match(css, /\.counter \{ align-self: stretch;/);
assert.match(css, /grid-template-rows: auto auto 1fr minmax\(49\.6px, auto\);/);
assert.match(css, /grid-template-rows: auto auto minmax\(calc\(var\(--hero-fig\) \+ var\(--wheel-h\)\), auto\) auto auto;/);
assert.match(css, /--font-head: "Barlow Condensed", "Barlow Condensed Fallback",/);
assert.match(css, /--font-mono: "IBM Plex Mono", "IBM Plex Mono Fallback",/);
assert.ok(!/\.s-wheel \{ flex:/.test(css), "the cover's rows set the hero's height, not flex");
assert.match(html, /<div class="cover">\s+<section class="s-wheel" id="wheel"/);
assert.match(css, /\.cover \{ --tn-h: 144px; \}/);
assert.match(css, /\.cover \{ --tn-h: 344px; \}/);

console.log("cover.test.js: all assertions passed");
