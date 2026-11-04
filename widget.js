/* The Wheelpaper widget: the live wheel at 320 x 200, for iframes and stream overlays. Data comes from live.js. */
(function () {
  "use strict";

  /* ---------- pure, testable ---------- */
  // ?theme=transparent drops the background (OBS browser sources); anything else is the dark default.
  function themeFrom(search) {
    var m = /[?&]theme=([^&#]*)/.exec(search || "");
    return m && decodeURIComponent(m[1]) === "transparent" ? "transparent" : "dark";
  }
  function fmtRpm(rpm) { return rpm < 10 ? (Math.round(rpm * 10) / 10).toString() : String(Math.round(rpm)); }

  // The one line under the wheel, from the poller's detail: null means no line (decorative spin).
  function lineFor(detail) {
    if (!detail || !detail.data || !detail.wheel || detail.wheel.mode === "decorative") return null;
    if (detail.wheel.mode === "sleeping") return "Squeektoshi is sleeping";
    return detail.data.height.toLocaleString("en-US") + " blocks · " + fmtRpm(detail.data.rpm) + " RPM";
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { themeFrom: themeFrom, lineFor: lineFor, fmtRpm: fmtRpm };
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute("data-theme", themeFrom(location.search));

  /* ---------- the wheel: the hero's geometry (app.js buildWheel), same 400 x 440 drawing ---------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  function add(parent, tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, typeof attrs[k] === "number" ? attrs[k].toFixed(2) : attrs[k]);
    parent.appendChild(el);
  }
  var cx = 200, cy = 200, i, a, t;
  var stand = document.getElementById("w-stand"), rot = document.getElementById("w-rot"), hub = document.getElementById("w-hub"), sensor = document.getElementById("w-sensor");
  for (t = 0; t < 6; t++) {
    add(stand, "rect", { x: cx - 19 - t * 8, y: 372 + t * 8, width: 6, height: 6, class: "px-stand" });
    add(stand, "rect", { x: cx + 13 + t * 8, y: 372 + t * 8, width: 6, height: 6, class: "px-stand" });
  }
  for (var x = cx - 83; x <= cx + 77; x += 8) add(stand, "rect", { x: x, y: 420, width: 6, height: 6, class: "px-stand" });
  for (i = 0; i < 72; i++) { a = (i / 72) * Math.PI * 2; add(rot, "circle", { cx: cx + 164 * Math.sin(a), cy: cy - 164 * Math.cos(a), r: 4.2, class: "px" }); }
  for (i = 0; i < 60; i++) { a = (i / 60) * Math.PI * 2; add(rot, "circle", { cx: cx + 136 * Math.sin(a), cy: cy - 136 * Math.cos(a), r: 3.4, class: "px" }); }
  for (i = 1; i < 24; i++) { a = (i / 24) * Math.PI * 2; add(rot, "circle", { cx: cx + 150 * Math.sin(a), cy: cy - 150 * Math.cos(a), r: 2.6, class: "px-dim" }); }
  for (i = 0; i < 6; i++) {
    a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    for (var r = 28; r <= 124; r += 12) add(rot, "circle", { cx: cx + r * Math.sin(a), cy: cy - r * Math.cos(a), r: 3, class: "px" });
  }
  add(rot, "rect", { x: cx - 8, y: cy - 158, width: 16, height: 16, class: "magnet" });
  for (var hx = -1; hx <= 1; hx++) for (var hy = -1; hy <= 1; hy++) add(hub, "rect", { x: cx + hx * 9 - 3.5, y: cy + hy * 9 - 3.5, width: 7, height: 7, class: "px" });
  [[-12, 6], [-4, 6], [4, 6], [-12, -2], [4, -2]].forEach(function (p) { add(sensor, "rect", { x: cx + p[0], y: 6 + p[1], width: 8, height: 8, class: "px" }); });

  /* ---------- live: same behaviour as the hero (app.js runWheel) ----------
     decorative: the CSS spin; running: a frame loop eases to the real pace; sleeping: winds down over 1 s and stops. */
  var line = document.getElementById("w-line");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var driven = false, angle = 0, speed = 0, target = 0, stopFrom = null, stopAt = 0, raf = 0, lastT = 0;
  function cssAngle() {
    var m = /matrix\(([^)]+)\)/.exec(getComputedStyle(rot).transform || "");
    if (!m) return 0;
    var p = m[1].split(",").map(Number);
    return (Math.atan2(p[1], p[0]) * 180 / Math.PI + 360) % 360;
  }
  function frame(now) {
    var dt = Math.min(64, Math.max(0, now - lastT)) / 1000; lastT = now;
    if (stopFrom !== null) speed = Math.max(0, stopFrom * (1 - (now - stopAt) / 1000));
    else speed += (target - speed) * Math.min(1, dt / 0.6);
    angle += speed * dt;
    rot.style.transform = "rotate(" + (angle % 360).toFixed(2) + "deg)";
    raf = stopFrom !== null && speed === 0 ? 0 : requestAnimationFrame(frame);
  }
  document.addEventListener("wheelpaper:live", function (e) {
    var d = e.detail, text = lineFor(d);
    line.textContent = text || "";
    document.body.setAttribute("data-state", text === null ? "decorative" : d.wheel.mode);
    if (text === null || reduceMotion) return; // no data yet: the CSS spin stays as it was
    if (!driven) {
      driven = true;
      angle = cssAngle(); speed = 180;
      rot.style.animation = "none";
      rot.style.transform = "rotate(" + angle.toFixed(2) + "deg)";
    }
    if (d.wheel.mode === "running") { target = 360 / d.wheel.duration; stopFrom = null; }
    else if (stopFrom === null) { stopFrom = speed; stopAt = performance.now(); }
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
  });
})();
