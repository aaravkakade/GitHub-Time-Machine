import { chromium } from "@playwright/test";

const base = "http://localhost:3002";
const out = process.env.OUT_DIR ?? ".";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(String(err)));

const targets = process.argv.slice(2);
for (const t of targets) {
  const [path, name, waitMs = "2500"] = t.split("::");
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => console.log("goto err", e.message));
  await page.waitForTimeout(Number(waitMs));
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  console.log("shot", name);
}
if (errors.length) {
  console.log("CONSOLE ERRORS:");
  for (const e of errors.slice(0, 20)) console.log(" -", e.slice(0, 300));
} else {
  console.log("no console errors");
}
await browser.close();
