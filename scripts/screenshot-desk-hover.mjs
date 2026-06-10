// Debug helper: screenshot the desk scene at scroll 0 while hovering the
// desk, so the hover-gated spotlight/ambient lighting is on.
// Usage: npx -y -p puppeteer-core node scripts/screenshot-desk-hover.mjs [out.png]
import puppeteer from "puppeteer-core";

const out = process.argv[2] ?? "/tmp/desk-hover-shot.png";

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--hide-scrollbars", "--force-device-scale-factor=1"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
await page.goto("http://localhost:8000/", {
  waitUntil: "networkidle0",
  timeout: 60000,
});
// Let the GLB decode and the first frames render.
await new Promise((r) => setTimeout(r, 4000));
// Hover the desk so the spotlight fades on and the ambient lifts.
// (The desk is framed right-of-center since the start camera recompose.)
await page.mouse.move(980, 600);
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: out });
await browser.close();
console.log("saved", out);
