// 5C.1 performance profile of the interactive workspace against the real solver API.
//   uv run uvicorn app.main:app --app-dir apps/api --port 8000
//   (cd apps/web && API_BASE_URL=http://127.0.0.1:8000 npx next start --port 3004)
//   node scripts/profile_workspace.mjs http://127.0.0.1:3004
// Measures: three-scenario recalculation after a slider edit (request round trip and input-to-redraw,
// against the plan's 300 ms median / 700 ms p95 targets), playback frame rate, and JS heap growth
// over repeated edits. Writes work/5C.1/performance.json. Numbers describe this machine only.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://127.0.0.1:3004";
const EDITS = Number(process.env.EDITS ?? 30);
const pct = (values, p) => { const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const stats = values => ({ n: values.length, median_ms: Math.round(pct(values, 0.5)), p95_ms: Math.round(pct(values, 0.95)), max_ms: Math.round(Math.max(...values)) });

const browser = await chromium.launch({ args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.locator("#plot-occupancy .main-svg").first().waitFor({ timeout: 30000 });
await page.waitForFunction(() => /up to date/i.test(document.querySelector(".calculation-status")?.textContent ?? ""), null, { timeout: 30000 });

const heap = () => page.evaluate(() => { globalThis.gc?.(); return performance.memory?.usedJSHeapSize ?? null; });
const heapBefore = await heap();

// Alternate the half-life slider between two positions; each edit is a full three-scenario solve.
const slider = page.locator("#experiment-conditions input[type=range]").nth(1);
const inputToRedraw = [];
for (let i = 0; i < EDITS; i++) {
  const started = await slider.evaluate((el, i) => {
    const min = Number(el.min), max = Number(el.max), value = min + (max - min) * (i % 2 ? 0.35 : 0.65);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    return performance.now();
  }, i);
  await page.waitForFunction(() => /up to date/i.test(document.querySelector(".calculation-status")?.textContent ?? ""), null, { timeout: 30000 });
  // Wait for the plot to repaint, then measure from the input event.
  const done = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())))));
  inputToRedraw.push(done - started);
}
const heapAfter = await heap();

// Playback: count animation frames for 5 s while the shared timeline plays.
await page.getByRole("button", { name: "Play simulation" }).click();
const fps = await page.evaluate(() => new Promise(resolve => {
  let frames = 0, worst = 0, last = performance.now(); const start = last;
  const tick = now => { frames++; worst = Math.max(worst, now - last); last = now; if (now - start < 5000) requestAnimationFrame(tick); else resolve({ fps: frames / ((now - start) / 1000), worst_frame_ms: worst }); };
  requestAnimationFrame(tick);
}));
await browser.close();

const debounce = 150;
const report = {
  base, machine_note: "Cloud container, headless Chromium; re-run on the demonstration laptop before rehearsal.",
  edits: EDITS, debounce_ms: debounce,
  input_to_redraw_including_debounce: stats(inputToRedraw),
  input_to_redraw_excluding_debounce: stats(inputToRedraw.map(v => v - debounce)),
  targets: { median_ms: 300, p95_ms: 700, measured_on: "input_to_redraw_excluding_debounce" },
  playback: { fps: Math.round(fps.fps * 10) / 10, worst_frame_ms: Math.round(fps.worst_frame_ms) },
  js_heap_mb: { before: heapBefore && +(heapBefore / 1e6).toFixed(1), after_edits: heapAfter && +(heapAfter / 1e6).toFixed(1) },
};
const r = report.input_to_redraw_excluding_debounce;
report.meets_targets = r.median_ms <= 300 && r.p95_ms <= 700;
mkdirSync("work/5C.1", { recursive: true });
writeFileSync("work/5C.1/performance.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
