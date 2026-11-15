// 5C.1 browser check of the demo path. Not a live-provider test.
//
// Run against a web server whose API_BASE_URL points at the synthetic acceptance backend:
//   uv run python scripts/serve_investigation_ui_checks.py --complete-research      # port 8101
//   (cd apps/web && API_BASE_URL=http://127.0.0.1:8101 npx next start --port 3002)
//   node scripts/check_demo_browser.mjs http://127.0.0.1:3002
//
// The backend runs the real LangChain graph, persistence, solver and structure tools with clearly
// synthetic literature and a scripted model. Pass --offline-url <url> to also check a web server whose
// API is down (saved demo must still load). Writes work/5C.1/browser-check.json.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const args = process.argv.slice(2);
const base = args.find(a => !a.startsWith("--")) ?? "http://127.0.0.1:3002";
const offlineIndex = args.indexOf("--offline-url");
const offline = offlineIndex >= 0 ? args[offlineIndex + 1] : null;
const PRIMARY = "Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?";

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try { const detail = await fn(); results.push({ name, status: "passed", ms: Date.now() - started, detail }); console.log(`ok   ${name}`); }
  catch (error) { results.push({ name, status: "failed", ms: Date.now() - started, detail: String(error).slice(0, 400) }); console.log(`FAIL ${name}: ${String(error).slice(0, 200)}`); }
}
function expect(condition, message) { if (!condition) throw new Error(message); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

await step("workspace loads with simulated curves", async () => {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#plot-occupancy .main-svg").first().waitFor({ timeout: 30000 });
  const cards = await page.locator(".outcome-card").count();
  expect(cards === 3, `expected 3 scenario cards, saw ${cards}`);
  return { cards };
});

await step("research job runs and records tool outcomes", async () => {
  await page.locator("summary", { hasText: "Edit hypothesis" }).click();
  await page.locator("textarea").fill(PRIMARY);
  await page.getByRole("button", { name: /Research hypothesis/ }).click();
  await page.locator("#investigation .investigation-stages").waitFor({ timeout: 30000 });
  await page.locator("#answer").waitFor({ timeout: 120000 });
  const title = await page.locator("#investigation strong").first().textContent();
  expect(/complete/i.test(title ?? ""), `investigation title was "${title}"`);
  const stages = await page.locator(".investigation-stages li[data-state]").evaluateAll(items => items.map(i => i.getAttribute("data-state")));
  return { title, stages };
});

await step("grounded answer cites solver values and a structure measurement", async () => {
  const answer = page.locator("#answer");
  const text = await answer.innerText();
  expect(/62\.9/.test(text) && /99\.8/.test(text), "answer lacks solver endpoint values");
  expect(/2\.417/.test(text), "answer lacks the 2.417 Å structural measurement");
  return { verdictBadge: (await answer.locator(".answer-verdict").first().textContent().catch(() => null))?.trim() };
});

await step("Show in structure opens the viewer on the measured pair", async () => {
  await page.locator("#answer").getByRole("button", { name: /Show in structure/ }).first().click();
  await page.locator("#view-structure canvas").first().waitFor({ timeout: 30000 });
  await page.waitForFunction(() => /2\.417/.test(document.querySelector("#view-structure")?.textContent ?? ""), null, { timeout: 30000 });
  const selected = await page.getByRole("tab", { name: /Molecular structure/ }).getAttribute("aria-selected");
  expect(selected === "true", "structure tab not selected");
  return { distance: "2.417 Å" };
});

await step("follow-up proposal runs and history records two steps", async () => {
  const card = page.locator("article, li, div").filter({ hasText: /^Raise the occupancy threshold to 95%/ }).first();
  const button = page.getByRole("button", { name: /Run this experiment/ }).nth(1);
  await (await card.count() ? card.getByRole("button", { name: /Run this experiment/ }) : button).click();
  await page.locator("#history").waitFor({ timeout: 120000 });
  const steps = await page.locator(".history-steps>li").count();
  expect(steps >= 2, `history shows ${steps} steps`);
  return { steps };
});

await step("reload restores the displayed result and history", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#history").waitFor({ timeout: 60000 });
  const steps = await page.locator(".history-steps>li").count();
  expect(steps >= 2, `history after reload shows ${steps} steps`);
  return { steps };
});

await step("saved demo loads and is labeled as saved", async () => {
  await page.getByRole("button", { name: "Load saved demo" }).click();
  await page.waitForFunction(() => /Saved reviewed demo|Saved reference results/.test(document.body.innerText), null, { timeout: 15000 });
  return {};
});

await step("phone width has no horizontal scroll", async () => {
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(base, { waitUntil: "networkidle" });
  const width = await phone.evaluate(() => document.documentElement.scrollWidth);
  await phone.close();
  expect(width <= 390, `scrollWidth ${width}`);
  return { width };
});

if (offline) await step("saved demo works with the scientific API unavailable", async () => {
  const p = await browser.newPage();
  await p.goto(offline, { waitUntil: "networkidle" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Load saved demo" }).click();
  await p.locator("#plot-occupancy .main-svg").first().waitFor({ timeout: 30000 });
  await p.close();
  return {};
});

await step("no uncaught page errors", async () => {
  const relevant = errors.filter(e => !/Failed to load resource/.test(e));
  expect(!relevant.length, relevant.join(" | "));
  return { ignoredNetworkErrors: errors.length - relevant.length };
});

await browser.close();
mkdirSync("work/5C.1", { recursive: true });
const report = { base, offline, synthetic_backend: true, passed: results.filter(r => r.status === "passed").length,
  failed: results.filter(r => r.status === "failed").length, results };
writeFileSync("work/5C.1/browser-check.json", JSON.stringify(report, null, 2) + "\n");
console.log(`${report.passed} passed, ${report.failed} failed`);
process.exit(report.failed ? 1 : 0);
