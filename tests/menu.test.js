// Run: node tests/menu.test.js
"use strict";
const assert = require("node:assert/strict");
const { activeIndex, LINE_MARGIN } = require("../menu.js");

const line = 48 + LINE_MARGIN; // bar height + margin
assert.equal(line, 56);

// top of the page: nothing has reached the line, the first section is active
assert.equal(activeIndex([120, 900, 1800], line, false), 0);
// a heading flips the highlight exactly when it reaches the line, not before
assert.equal(activeIndex([-800, 57, 900], line, false), 0, "1px below the line: not yet");
assert.equal(activeIndex([-800, 56, 900], line, false), 1, "on the line: active");
assert.equal(activeIndex([-800, -10, 900], line, false), 1);
// a click lands a heading 120px from the top (64px scroll margin + 56px padding): still short of the line;
// the page pins that case in menu.js rather than widening the line
assert.equal(activeIndex([-900, -300, 120], line, false), 1);
// bottom of the page: the lowest section wins even if its heading never reached the line
assert.equal(activeIndex([-1200, -400, 300], line, true), 2);
// list order does not matter: positions decide
assert.equal(activeIndex([900, -10, -800], line, false), 1, "reversed list");
assert.equal(activeIndex([-10, -800, 900], line, true), 2, "bottom picks the lowest on the page, not the last in the list");

console.log("menu.test.js: all assertions passed");
