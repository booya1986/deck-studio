import { chromium } from "playwright";
const [url, out, stageLabel] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
const errors: string[] = [];
p.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await p.goto(url, { waitUntil: "networkidle" });
if (stageLabel) { await p.getByRole("button", { name: new RegExp(stageLabel) }).first().click(); await p.waitForTimeout(1500); }
await p.waitForTimeout(1500);
await p.screenshot({ path: out, fullPage: true });
const info = await p.evaluate(() => ({
  scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  logLines: document.querySelectorAll("main .max-h-72 > div").length,
  cards: document.querySelectorAll("main section.card").length,
}));
console.log(JSON.stringify({ ...info, errors }));
await b.close();
