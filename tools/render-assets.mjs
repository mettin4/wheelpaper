// Renders assets/og.png (1200x630) and favicon-32.png from the site itself, in headless Chrome.
// The OG wheel is the hero's own SVG (#wheel-svg), serialized with its computed colours and drawn to a canvas.
// Usage: serve the site on 127.0.0.1:8765, then: node tools/render-assets.mjs
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = process.env.WP_URL || "http://127.0.0.1:8765/index.html";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9361;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.error("render-assets: timed out"); process.exit(2); }, 60000).unref();

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, "--no-first-run",
  `--user-data-dir=${join(tmpdir(), "wp-assets-" + Date.now())}`, "about:blank"], { stdio: "ignore" });
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  try { const p = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page"); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
  await sleep(200);
}
if (ws.readyState !== WebSocket.OPEN) await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
};

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: URL_ });
await sleep(1500);

const render = `(async () => {
  await Promise.all(['600 100px "Barlow Condensed"', '300 40px "Barlow Condensed"', '400 18px "IBM Plex Mono"'].map((f) => document.fonts.load(f)));
  const css = getComputedStyle(document.documentElement), v = (n) => css.getPropertyValue(n).trim();
  const toImg = (svgText) => new Promise((res, rej) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
    const im = new Image(); im.onload = () => { URL.revokeObjectURL(url); res(im); }; im.onerror = rej; im.src = url;
  });

  // the hero wheel, frozen at rest (magnet under the sensor), every shape carrying its computed fill and opacity
  const src = document.getElementById("wheel-svg"), clone = src.cloneNode(true);
  const a = src.querySelectorAll("circle, rect"), b = clone.querySelectorAll("circle, rect");
  a.forEach((el, i) => { const s = getComputedStyle(el); b[i].setAttribute("fill", s.fill); b[i].setAttribute("opacity", s.opacity); b[i].removeAttribute("class"); });
  clone.querySelectorAll("g").forEach((g) => { g.removeAttribute("class"); g.removeAttribute("style"); g.removeAttribute("transform"); });
  clone.querySelector("title")?.remove();
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "400"); clone.setAttribute("height", "440");
  const wheel = await toImg(new XMLSerializer().serializeToString(clone));

  const W = 1200, H = 630, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = v("--bg"); ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = v("--grid-dot");
  for (let x = 9; x < W; x += 18) for (let y = 9; y < H; y += 18) { ctx.beginPath(); ctx.arc(x, y, 1.25, 0, Math.PI * 2); ctx.fill(); }

  const wh = 480, ww = wh * 400 / 440;
  ctx.drawImage(wheel, 72, (H - wh) / 2 - 8, ww, wh);

  const X = 600, maxW = W - X - 72;
  let size = 120; ctx.font = '600 ' + size + 'px "Barlow Condensed"';
  const tw = ctx.measureText("THE WHEELPAPER").width; if (tw > maxW) { size = Math.floor(size * maxW / tw); ctx.font = '600 ' + size + 'px "Barlow Condensed"'; }
  const titleY = 268;
  const grad = ctx.createLinearGradient(0, titleY - size * 0.75, 0, titleY);
  grad.addColorStop(0, v("--gold-hi")); grad.addColorStop(1, v("--gold"));
  ctx.fillStyle = grad; ctx.textBaseline = "alphabetic"; ctx.fillText("THE WHEELPAPER", X, titleY);

  ctx.font = '300 44px "Barlow Condensed"'; ctx.fillStyle = v("--text");
  // one line if it fits, otherwise break at the comma
  const sub = "The Squeekchain whitepaper, made playable.";
  const lines = ctx.measureText(sub).width <= maxW ? [sub] : ["The Squeekchain whitepaper,", "made playable."];
  lines.forEach((l, i) => ctx.fillText(l, X, titleY + 72 + i * 50));

  ctx.font = '400 18px "IBM Plex Mono"'; ctx.fillStyle = v("--muted");
  ctx.letterSpacing = "3px"; ctx.fillText("UNOFFICIAL", X, H - 64); ctx.letterSpacing = "0px";
  const og = cv.toDataURL("image/png");

  const fav = await toImg(await (await fetch("favicon.svg")).text());
  const fc = document.createElement("canvas"); fc.width = 32; fc.height = 32;
  fc.getContext("2d").drawImage(fav, 0, 0, 32, 32);
  return { og, fav: fc.toDataURL("image/png"), titleSize: size, lines: lines.length };
})()`;

const r = await ev(render);
const png = (d) => Buffer.from(d.split(",")[1], "base64");
writeFileSync(join(ROOT, "assets", "og.png"), png(r.og));
writeFileSync(join(ROOT, "favicon-32.png"), png(r.fav));
console.log(`og.png 1200x630 (title ${r.titleSize}px, subtitle ${r.lines} lines), favicon-32.png written`);
ws.close(); chrome.kill(); process.exit(0);
