/* The Wheelpaper: sticky section menu, and the widget section's copy button. */
(function () {
  "use strict";

  /* ---------- scroll-spy rule (pure, testable) ----------
     Active = the section whose heading has most recently entered the top quarter of the viewport, so the label
     matches what the reader is looking at: of the headings at or above that line, the lowest one. At the very
     bottom of the page the lowest section on the page wins, since it may never reach the line. Works from
     positions alone, whatever order the list is in. */
  var LINE_FRACTION = 0.25;
  function spyLine(viewportHeight) { return viewportHeight * LINE_FRACTION; }
  function activeIndex(headingTops, line, atBottom) {
    var a = -1, best = -Infinity, low = 0;
    for (var i = 0; i < headingTops.length; i++) {
      var t = headingTops[i];
      if (t <= line && t > best) { best = t; a = i; }
      if (t > headingTops[low]) low = i;
    }
    if (atBottom) return low;
    if (a >= 0) return a;
    // nothing has reached the line yet (top of the page): the highest section
    var top = 0;
    for (var j = 1; j < headingTops.length; j++) if (headingTops[j] < headingTops[top]) top = j;
    return top;
  }

  /* ---------- deep links (pure, testable) ----------
     Every hash is a real element id, so the browser lands them itself. These three are the ids those sections had
     before the cover: older links to them still land, but only through this script. */
  var ALIASES = { "rounds-and-blocks": "rounds", proof: "settlements", "night-shift": "nightshift" };
  function isAlias(hash) { return Object.prototype.hasOwnProperty.call(ALIASES, String(hash || "").replace(/^#/, "")); }
  function sectionId(hash) {
    var h = String(hash || "").replace(/^#/, "");
    return isAlias(h) ? ALIASES[h] : h;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { activeIndex: activeIndex, spyLine: spyLine, LINE_FRACTION: LINE_FRACTION, sectionId: sectionId, isAlias: isAlias, ALIASES: ALIASES };
  if (typeof document === "undefined") return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- sticky menu: shows once the hero has scrolled away ---------- */
  var menu = document.getElementById("menu");
  var hero = document.getElementById("wheel");
  if (menu && hero) {
    var track = menu.querySelector(".menu__track");
    var links = Array.prototype.slice.call(menu.querySelectorAll(".menu__link"));
    var secs = links.map(function (l) { return document.getElementById(sectionId(l.getAttribute("href"))); });
    var heads = secs.map(function (s) { return s && (s.querySelector("h1, h2") || s); });
    // the right-edge dots list the same sections in the same order; one rule lights both
    var dots = Array.prototype.slice.call(document.querySelectorAll(".secnav__dot"));
    var cards = Array.prototype.slice.call(document.querySelectorAll(".contents__card"));
    var active = -1, queued = false, pinned = null;

    function show(on) {
      menu.setAttribute("data-show", on ? "true" : "false");
      menu.toggleAttribute("inert", !on); // hidden links stay out of the tab order
    }
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { show(!es[0].isIntersecting); }).observe(hero);
    else show(true);

    // A click near the end of the page can land short of the line, so the clicked section is pinned as active
    // until the reader scrolls by hand.
    function update() {
      queued = false;
      var now = pinned;
      if (now === null) {
        var tops = heads.map(function (h) { return h ? h.getBoundingClientRect().top : Infinity; });
        var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        now = activeIndex(tops, spyLine(window.innerHeight), atBottom);
      }
      if (now === active) return;
      active = now;
      links.forEach(function (l, i) { if (i === now) l.setAttribute("aria-current", "true"); else l.removeAttribute("aria-current"); });
      dots.forEach(function (d, i) { d.setAttribute("aria-current", String(i === now)); });
      // keep the active name in view inside the bar; scrolls the bar only, never the page
      var a = links[now];
      if (track.scrollWidth > track.clientWidth) {
        var left = a.offsetLeft - (track.clientWidth - a.offsetWidth) / 2;
        track.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? "auto" : "smooth" });
      }
    }
    window.addEventListener("scroll", function () { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener("resize", update);
    // a reader's own scroll releases a pin
    var unpin = function () { if (pinned !== null) { pinned = null; update(); } };
    ["wheel", "touchstart", "mousedown"].forEach(function (t) { window.addEventListener(t, unpin, { passive: true }); });
    window.addEventListener("keydown", function (e) { if (/^(Arrow|Page|Home|End| )/.test(e.key)) unpin(); });
    function pin(i) { pinned = i; update(); }
    function indexOfHash(hash) { return secs.indexOf(document.getElementById(sectionId(hash))); }

    // Menu, dots and cards share one path. The hash changes only here, on a click, never while scrolling.
    links.concat(dots, cards).forEach(function (a) {
      var href = a.getAttribute("href"), i = indexOfHash(href);
      a.addEventListener("click", function (e) {
        if (i < 0 || e.metaKey || e.ctrlKey || e.shiftKey) return; // a new tab or window keeps the plain link
        e.preventDefault();
        secs[i].scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        if (history.replaceState) history.replaceState(null, "", href);
        pin(i);
      });
    });
    update();

    // Opened with a hash, or the hash edited by hand. The browser has already gone to a real id, so only the active
    // section is marked; an alias has no element to go to, so it lands here. Fonts and live data can still move the
    // page, so land again whenever its height changes in the first seconds, unless the reader has gone elsewhere.
    function land(i) { secs[i].scrollIntoView({ behavior: "auto", block: "start" }); pin(i); }
    function arrive() {
      var i = location.hash ? indexOfHash(location.hash) : -1;
      if (i >= 0) { if (isAlias(location.hash)) land(i); else pin(i); }
      return i;
    }
    window.addEventListener("hashchange", arrive);
    var cold = arrive();
    if (cold >= 0) {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      var settle = function () { if (pinned === cold) land(cold); };
      window.addEventListener("load", settle);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
      if ("ResizeObserver" in window) {
        var watch = new ResizeObserver(settle);
        watch.observe(document.querySelector("main"));
        setTimeout(function () { watch.disconnect(); }, 5000);
      }
    }
  }

  /* ---------- THE WIDGET: copy embed ---------- */
  var btn = document.getElementById("copy-embed"), code = document.getElementById("embed-code");
  if (btn && code) {
    var label = btn.textContent, timer = null;
    function fallback(t) {
      var ta = document.createElement("textarea");
      ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) { /* nothing else to try */ }
      document.body.removeChild(ta);
    }
    btn.addEventListener("click", function () {
      var t = code.textContent;
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).catch(function () { fallback(t); });
      else fallback(t);
      btn.textContent = "Copied.";
      btn.classList.add("is-done");
      clearTimeout(timer);
      timer = setTimeout(function () { btn.textContent = label; btn.classList.remove("is-done"); }, 1000);
    });
  }
})();
