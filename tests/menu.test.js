// Run: node tests/menu.test.js
"use strict";
const assert = require("node:assert/strict");
const { activeIndex, spyLine, LINE_FRACTION } = require("../menu.js");

// the line sits a quarter of the way down the viewport
assert.equal(LINE_FRACTION, 0.25);
assert.equal(spyLine(900), 225);
assert.equal(spyLine(812), 203);
const line = spyLine(900);

// top of the page: nothing has reached the line, the first section is active
assert.equal(activeIndex([300, 900, 1800], line, false), 0);
// a heading takes over exactly when it enters the top quarter, not before
assert.equal(activeIndex([-800, 226, 900], line, false), 0, "1px below the line: not yet");
assert.equal(activeIndex([-800, 225, 900], line, false), 1, "on the line: active");
assert.equal(activeIndex([-800, -10, 900], line, false), 1);
// the old rule waited for the heading to reach the bar (56px); at 120px it is already the section in view
assert.equal(activeIndex([-900, -300, 120], line, false), 2, "a heading 120px from the top is active");
// two headings in the top quarter: the lower one is the one just entered
assert.equal(activeIndex([40, 180, 900], line, false), 1);
// bottom of the page: the lowest section wins even if its heading never reached the line
assert.equal(activeIndex([-1200, -400, 300], line, true), 2);
// list order does not matter: positions decide
assert.equal(activeIndex([900, -10, -800], line, false), 1, "reversed list");
assert.equal(activeIndex([-10, -800, 900], line, true), 2, "bottom picks the lowest on the page, not the last in the list");

console.log("menu.test.js: all assertions passed");
