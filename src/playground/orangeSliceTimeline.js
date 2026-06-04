/** Scroll timeline 0→1 — deterministic, scrubbable both directions. */
export const T = {
  barIn: [0, 0.02],
  discoveryPrompt: [0.02, 0.08],
  runDiscovery: [0.08, 0.12],
  revealRows: [0.12, 0.28],
  gap1: [0.28, 0.3],
  step1Prompt: [0.3, 0.36],
  step1Run: [0.36, 0.4],
  step1Reveal: [0.4, 0.42],
  step1Fill: [0.42, 0.54],
  gap2: [0.54, 0.56],
  step2Prompt: [0.56, 0.62],
  step2Run: [0.62, 0.66],
  step2Reveal: [0.66, 0.68],
  step2Fill: [0.68, 0.78],
  gap3: [0.78, 0.8],
  step3Prompt: [0.8, 0.84],
  step3Run: [0.84, 0.87],
  step3Reveal: [0.87, 0.88],
  step3Fill: [0.88, 0.9],
};

/** Sheet content is fully filled by this progress; camera reset follows. */
export const SHEET_COMPLETE = T.step3Fill[1];
export const CAMERA_RESET = [SHEET_COMPLETE, 1];

export function inPromptGap(p) {
  return (
    (p >= T.gap1[0] && p < T.gap1[1]) ||
    (p >= T.gap2[0] && p < T.gap2[1]) ||
    (p >= T.gap3[0] && p < T.gap3[1])
  );
}
