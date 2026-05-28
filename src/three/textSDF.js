import * as THREE from "three";

// Renders `text` to a 2D canvas (white glyphs on a transparent background) and
// wraps it in a CanvasTexture. The glyph coverage lives in both the luminance
// (rgb) and the alpha channel, so the shader can read either. Built synchronously
// so it can be part of the material's uniforms from the very first frame.
export function makeTextSDF(
  text,
  { fontSize = 240, worldHalfWidth = 1.0 } = {},
) {
  const pad = Math.round(fontSize * 0.35);
  const fontStack = `500 ${fontSize}px Inter, system-ui, -apple-system, sans-serif`;

  const measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = fontStack;
  const textW = Math.max(1, Math.ceil(measureCtx.measureText(text).width));

  const w = textW + pad * 2;
  const h = fontSize + pad * 2;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Transparent background; opaque white glyphs.
  ctx.clearRect(0, 0, w, h);
  ctx.font = fontStack;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const half = new THREE.Vector2(worldHalfWidth, worldHalfWidth * (h / w));
  return { texture, half, range: 0.2 };
}
