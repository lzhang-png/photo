import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cr2Path = path.join(__dirname, "../test-fixtures/sample.cr2");
const baseUrl = process.env.BASE_URL ?? "http://localhost:5173";

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") console.log(`[console error]`, msg.text());
});
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto(baseUrl, { waitUntil: "networkidle" });

const isolated = await page.evaluate(() => ({
  crossOriginIsolated: window.crossOriginIsolated,
  sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
}));
console.log("Environment:", isolated);

async function importCr2(label) {
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Open…" }).click(),
  ]);
  await fileChooser.setFiles(cr2Path);
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);
    const toast = (await page.locator(".toast").textContent().catch(() => "")) ?? "";
    if (toast.includes("Failed")) {
      console.log(`${label}: FAIL —`, toast);
      return false;
    }
    if (/\d+\s*×\s*\d+/.test(toast) && !toast.includes("Decoding")) {
      console.log(`${label}: OK —`, toast);
      return true;
    }
  }
  console.log(`${label}: TIMEOUT`);
  return false;
}

const first = await importCr2("first import");
const second = await importCr2("second import (reuse libraw)");

const hasCanvas = await page.evaluate(() => {
  const canvas = document.querySelector(".viewport canvas");
  const gl = canvas?.getContext("webgl");
  if (!gl) return false;
  const pixels = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels.some((v) => v > 0);
});
console.log("Canvas has image:", hasCanvas);

await browser.close();
process.exit(first && second && hasCanvas ? 0 : 1);
