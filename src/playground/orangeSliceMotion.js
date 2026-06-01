import { T } from "./orangeSliceTimeline";

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

function runPulse(p) {
  if (p >= T.runDiscovery[0] && p < T.runDiscovery[1]) return 1;
  for (const run of [T.step1Run, T.step2Run, T.step3Run]) {
    if (p >= run[0] && p < run[1]) return 1;
  }
  return 0;
}

/** Slow cinematic drift — scrub-safe, minimal shake on Run beats only. */
export function computeScreenMotion(progress) {
  const p = smooth(Math.min(1, Math.max(0, progress)));
  const pulse = runPulse(progress);
  const t = progress * 12;

  const amp = pulse * 0.0025;

  return {
    rotation: [
      lerp(-0.04, 0.06, p) + Math.sin(t * 2.1) * amp,
      lerp(-0.1, 0.14, p) + Math.cos(t * 1.7) * amp * 0.8,
      lerp(0.012, -0.018, p),
    ],
    position: [
      Math.sin(t * 1.5) * amp * 0.5,
      lerp(0, -0.04, p) + Math.cos(t * 1.9) * amp * 0.35,
      0,
    ],
  };
}
