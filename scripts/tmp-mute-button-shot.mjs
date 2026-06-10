// Debug helper: fine-grained frames of the bars→line mute morph.
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--hide-scrollbars", "--force-device-scale-factor=2"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
await page.goto("http://localhost:8000/", {
  waitUntil: "networkidle0",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 3000));

// Sample the middle bar's computed transform every ~16ms after clicking mute,
// from inside the page so screenshot latency doesn't distort timing.
const samples = await page.evaluate(async () => {
  const bar = document.querySelector(".mute-wave i:nth-child(2)");
  const side = document.querySelector(".mute-wave i:nth-child(1)");
  const btn = document.querySelector('button[aria-label="Mute sounds"]');
  const out = [];
  const t0 = performance.now();
  const tick = () => {
    out.push({
      t: Math.round(performance.now() - t0),
      mid: getComputedStyle(bar).transform,
      side: getComputedStyle(side).transform,
    });
  };
  tick();
  btn.click();
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => requestAnimationFrame(r));
    tick();
  }
  return out;
});
for (const s of samples) console.log(s.t, "|", s.mid, "|", s.side);

await browser.close();
