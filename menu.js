/* The Wheelpaper: sticky section menu, and the widget section's copy button. */
(function () {
  "use strict";

  /* ---------- scroll-spy rule (pure, testable) ----------
     Active = the section whose heading has most recently reached the bar's line (bar height + a small margin):
     of the headings at or above the line, the lowest one. At the very bottom of the page the lowest section on
     the page wins, since it may never reach the line. Works from positions alone, whatever order the list is in. */
  var LINE_MARGIN = 8;
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
  if (typeof module !== "undefined" && module.exports) module.exports = { activeIndex: activeIndex, LINE_MARGIN: LINE_MARGIN };
  if (typeof document === "undefined") return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- sticky menu: shows once the hero has scrolled away ---------- */
  var menu = document.getElementById("menu");
  var hero = document.getElementById("wheel");
  if (menu && hero) {
    var track = menu.querySelector(".menu__track");
    var links = Array.prototype.slice.call(menu.querySelectorAll(".menu__link"));
    var secs = links.map(function (l) { return document.querySelector(l.getAttribute("href")); });
    var heads = secs.map(function (s) { return s && (s.querySelector("h1, h2") || s); });
    // the right-edge dots list the same sections in the same order; one rule lights both
    var dots = Array.prototype.slice.call(document.querySelectorAll(".secnav__dot"));
    var active = -1, queued = false, pinned = null;

    function show(on) {
      menu.setAttribute("data-show", on ? "true" : "false");
      menu.toggleAttribute("inert", !on); // hidden links stay out of the tab order
    }
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { show(!es[0].isIntersecting); }).observe(hero);
    else show(true);

    // A click lands its heading 16px below the bar (scroll-margin), which is short of the line, so the clicked
    // section is pinned as active until the reader scrolls by hand.
    function update() {
      queued = false;
      var now = pinned;
      if (now === null) {
        var tops = heads.map(function (h) { return h ? h.getBoundingClientRect().top : Infinity; });
        var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        now = activeIndex(tops, menu.offsetHeight + LINE_MARGIN, atBottom);
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
    links.forEach(function (l, i) {
      l.addEventListener("click", function (e) {
        if (!secs[i]) return;
        e.preventDefault();
        secs[i].scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        if (history.replaceState) history.replaceState(null, "", l.getAttribute("href"));
        pin(i);
      });
    });
    // app.js scrolls on a dot click; this only records which section was asked for
    dots.forEach(function (d, i) { d.addEventListener("click", function () { pin(i); }); });
    update();
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
