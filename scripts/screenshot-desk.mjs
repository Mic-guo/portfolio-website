// Debug helper: screenshot the desk scene at a given scroll progress.
// Usage: npx -y -p puppeteer-core node scripts/screenshot-desk.mjs [t] [out.png]
import puppeteer from "puppeteer-core";

const t = Number(process.argv[2] ?? 1);
const out = process.argv[3] ?? "/tmp/desk-shot.png";

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--hide-scrollbars", "--force-device-scale-factor=1"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
page.on("console", (msg) => console.log("[page]", msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
await page.goto("http://localhost:8000/", {
  waitUntil: "networkidle0",
  timeout: 60000,
});
// Let the GLB decode and the first frames render.
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate((progress) => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  document.documentElement.style.scrollBehavior = "auto";
  window.scrollTo(0, max * progress);
}, t);
// Let the camera spring settle.
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: out });
await browser.close();
console.log("saved", out);
