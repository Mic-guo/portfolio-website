import { CAMERA_RESET, SHEET_COMPLETE, T } from "./orangeSliceTimeline";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const seg = (p, start, end) =>
  end <= start
    ? p >= start
      ? 1
      : 0
    : clamp((p - start) / (end - start), 0, 1);

const RAD = 180 / Math.PI;

/** Tilt finishes as discovery rows finish revealing. */
const TILT_END = T.revealRows[1];

/** Top-left / bottom-right pan anchors on the screen plane. */
const PAN_TL = { x: 300, y: 250 };
const PAN_BR = { x: -150, y: 100 };

/** Peak rig at full tilt; rest pose when recentered after the sheet completes. */
const PEAK = {
  tiltX: 0.58,
  tiltY: 0.05,
  scale: 1.26,
  translateZ: 240,
};
const REST = {
  tiltX: 0.06,
  tiltY: 0,
  scale: 0.94,
  translateZ: 50,
  panX: 0,
  panY: 0,
};

/**
 * Phase 1: dolly in + tilt, pan eases toward top-left.
 * Phase 2: hold tilt, pan top-left → bottom-right (through sheet animation).
 * Phase 3: after sheet completes — recenter pan and unwind tilt.
 */
export function computeScreenMotion(progress) {
  const p = clamp(progress, 0, 1);
  const tiltT = smooth(easeInOut(seg(p, 0, TILT_END)));
  const sweepT = smooth(easeInOut(seg(p, TILT_END, SHEET_COMPLETE)));
  const settleT = smooth(easeInOut(seg(p, CAMERA_RESET[0], CAMERA_RESET[1])));

  let tiltX;
  let tiltY;
  let scale;
  let translateZ;
  let panX;
  let panY;

  if (p < TILT_END) {
    panX = lerp(0, PAN_TL.x, tiltT);
    panY = lerp(0, PAN_TL.y, tiltT);
    tiltX = lerp(0.04, PEAK.tiltX, tiltT);
    tiltY = lerp(-0.03, PEAK.tiltY, tiltT);
    scale = lerp(0.8, PEAK.scale, tiltT);
    translateZ = lerp(-60, PEAK.translateZ, tiltT);
  } else if (p < SHEET_COMPLETE) {
    panX = lerp(PAN_TL.x, PAN_BR.x, sweepT);
    panY = lerp(PAN_TL.y, PAN_BR.y, sweepT);
    tiltX = PEAK.tiltX;
    tiltY = PEAK.tiltY;
    scale = PEAK.scale;
    translateZ = PEAK.translateZ;
  } else {
    panX = lerp(PAN_BR.x, REST.panX, settleT);
    panY = lerp(PAN_BR.y, REST.panY, settleT);
    tiltX = lerp(PEAK.tiltX, REST.tiltX, settleT);
    tiltY = lerp(PEAK.tiltY, REST.tiltY, settleT);
    scale = lerp(PEAK.scale, REST.scale, settleT);
    translateZ = lerp(PEAK.translateZ, REST.translateZ, settleT);
  }

  return {
    rotation: [tiltX, tiltY, 0],
    position: [panX, panY, translateZ],
    scale,
  };
}

/** Rig = tilt + dolly. Pan = 2D drift on the screen plane (child layer). */
export function buildCameraTransforms(progress) {
  const { rotation, position, scale } = computeScreenMotion(progress);
  const [rx, ry, rz] = rotation.map((r) => r * RAD);
  const [panX, panY, tz] = position;

  return {
    rig: [
      `rotateX(${rx}deg)`,
      `rotateY(${ry}deg)`,
      `rotateZ(${rz}deg)`,
      `translate3d(0px, 0px, ${tz}px)`,
      `scale(${scale})`,
    ].join(" "),
    pan: `translate3d(${panX}px, ${panY}px, 0px)`,
  };
}

/** @deprecated use buildCameraTransforms */
export function buildMonitorTransform(progress) {
  const { rig, pan } = buildCameraTransforms(progress);
  return `${rig} ${pan}`;
}

export function applyCameraTransforms(monitorEl, panEl, progress) {
  if (!monitorEl) return;
  const { rig, pan } = buildCameraTransforms(progress);
  monitorEl.style.transform = rig;
  if (panEl) panEl.style.transform = pan;
}
