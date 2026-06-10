import { useCallback, useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSceneMetrics } from "../core/SceneContext";

// Notion-style cartoon desktop rendered onto the laptop glass in desk.glb.
// The UI is drawn into a 2D canvas and mapped onto a plane glued to the screen
// mesh ("laptop/Rectangle 2"), so it lives in the model's transform chain and
// stays locked to the glass through the whole scroll camera move.
//
// Placement is derived from the *runtime* manifest (same source CompanionModel
// anchors use) rather than offline GLB measurements — the runtime root bounds
// differ slightly from a raw vertex pass, which is enough to bury a hardcoded
// plane inside the lid. Only the glass's intrinsic shape constants live here.
const SCREEN = {
  node: "rectangle_2", // laptop glass mesh id in the desk manifest
  tilt: THREE.MathUtils.degToRad(10.45), // lean-back angle of the glass
  thickness: 0.008, // glass slab depth in normalized world units
  // Overscan past the glass so its black surround is fully covered (the UI
  // runs right up to the bezel); lift floats the UI just off the glass so it
  // never z-fights the model's screen mesh.
  overscan: 1.0,
  cornerRadius: 0.035, // corner roundness as a fraction of screen width
  lift: 0.006,
};

// Texture resolution: ~1000 px per world unit of the glass (16:10).
const W = 1648;
const H = 1024;

// Notion-ish flat palette: warm paper, soft ink, manila folders.
const INK = "#37352f";
const INK_SOFT = "rgba(55,53,47,0.6)";
const PAPER = "#f7f6f2";
const FOLDER_FILL = "#f8d878";
const FOLDER_TAB = "#f0c95c";

const FOLDER_W = 130;
const FOLDER_H = FOLDER_W * 0.72;

// Desktop folders: two stacked in the top-left, one vertically centered on
// the right edge. `hit` is the clickable rect in canvas pixels (matches the
// hover pill drawn behind the icon + label).
const FOLDERS = [
  { id: "photos", label: "Photos", cx: 140, y: 120 },
  { id: "misc", label: "Misc", cx: 140, y: 340 },
  { id: "projects", label: "Projects", cx: W - 140, y: 440 },
].map((folder) => ({
  ...folder,
  hit: {
    x: folder.cx - FOLDER_W / 2 - 16,
    y: folder.y - 14,
    w: FOLDER_W + 32,
    h: FOLDER_H + 64,
  },
}));

// Plane UVs run 0..1 left→right / bottom→top; canvas y runs top→down.
function folderAtUv(uv) {
  if (!uv) return null;
  const px = uv.x * W;
  const py = (1 - uv.y) * H;
  return (
    FOLDERS.find(
      ({ hit }) =>
        px >= hit.x &&
        px <= hit.x + hit.w &&
        py >= hit.y &&
        py <= hit.y + hit.h,
    ) ?? null
  );
}

export default function LaptopScreen({ onFolderClick }) {
  const gl = useThree((s) => s.gl);
  const { manifest, scaleFactor } = useSceneMetrics();

  const { position, quaternion, width, height } = useMemo(() => {
    const node = manifest.getNode(SCREEN.node);
    const root = manifest.root.bounds.center;
    const min = node.bounds.min.clone().sub(root).multiplyScalar(scaleFactor);
    const max = node.bounds.max.clone().sub(root).multiplyScalar(scaleFactor);

    // Screen-right is world +z (viewer sits at -x looking toward +x),
    // screen-up leans back by the tilt, and the normal faces the viewer.
    const sin = Math.sin(SCREEN.tilt);
    const cos = Math.cos(SCREEN.tilt);
    const right = new THREE.Vector3(0, 0, 1);
    const up = new THREE.Vector3(sin, cos, 0);
    const normal = new THREE.Vector3().crossVectors(right, up);

    // The glass's bounding box folds the lean into its x/y extents:
    //   bboxY = H·cos(tilt) + T·sin(tilt)  →  recover the true face height H.
    const width = max.z - min.z;
    const height = (max.y - min.y - SCREEN.thickness * sin) / cos;

    // bbox min.x lies on the front face's bottom edge (the slab's frontmost
    // points); walk halfway up the face, then lift off the glass.
    const position = new THREE.Vector3(
      min.x,
      min.y + SCREEN.thickness * sin,
      (min.z + max.z) / 2,
    )
      .addScaledVector(up, height / 2)
      .addScaledVector(normal, SCREEN.lift);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, normal),
    );
    return { position, quaternion, width, height };
  }, [manifest, scaleFactor]);

  // Rounded-rect screen face, like a modern MacBook panel. ShapeGeometry UVs
  // come out in shape coordinates, so remap them to 0..1 across the face.
  const geometry = useMemo(() => {
    const w = width * SCREEN.overscan;
    const h = height * SCREEN.overscan;
    const r = w * SCREEN.cornerRadius;
    const hw = w / 2;
    const hh = h / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0);
    shape.lineTo(hw, hh - r);
    shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2);
    shape.lineTo(-hw + r, hh);
    shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI);
    shape.lineTo(-hw, -hh + r);
    shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5);

    const geo = new THREE.ShapeGeometry(shape, 12);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
    }
    return geo;
  }, [width, height]);

  // Hover lives in a ref (not state) so pointer-moves repaint the canvas
  // without re-rendering the React tree.
  const hoveredRef = useRef(null);

  const { texture, redraw } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    const redraw = () => {
      drawDesktop(ctx, { hoveredId: hoveredRef.current, now: new Date() });
      texture.needsUpdate = true;
    };
    redraw();
    return { texture, redraw };
  }, [gl]);

  // Keep the clock live: repaint right after each minute boundary, in the
  // user's local timezone (toLocale* below picks it up automatically).
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      const now = new Date();
      const msToNextMinute =
        60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      timer = setTimeout(() => {
        redraw();
        schedule();
      }, msToNextMinute + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [redraw]);

  const setHovered = useCallback(
    (id) => {
      if (hoveredRef.current === id) return;
      hoveredRef.current = id;
      document.body.style.cursor = id ? "pointer" : "";
      redraw();
    },
    [redraw],
  );

  useEffect(
    () => () => {
      if (hoveredRef.current) document.body.style.cursor = "";
    },
    [],
  );

  return (
    <mesh
      geometry={geometry}
      position={position}
      quaternion={quaternion}
      onPointerMove={(e) => setHovered(folderAtUv(e.uv)?.id ?? null)}
      onPointerOut={() => setHovered(null)}
      onClick={(e) => {
        const folder = folderAtUv(e.uv);
        if (!folder) return;
        // Folder clicks shouldn't also trigger the desk's click-to-explore.
        e.stopPropagation();
        onFolderClick?.(folder.id);
      }}
    >
      {/* Self-lit: the display should glow regardless of scene lighting. */}
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

function drawDesktop(ctx, { hoveredId, now }) {
  drawWallpaper(ctx);
  drawClock(ctx, now);
  FOLDERS.forEach((folder) =>
    drawFolder(ctx, folder, folder.id === hoveredId),
  );
  drawDock(ctx);
}

function drawWallpaper(ctx) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // Subtle dot grid so the flat paper doesn't read as a blank rectangle.
  ctx.fillStyle = "rgba(55,53,47,0.055)";
  const spacing = 64;
  for (let x = spacing / 2; x < W; x += spacing) {
    for (let y = spacing / 2; y < H; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Date + time in the user's locale/timezone, top-right so it stays clear of
// the folder column on the left.
function drawClock(ctx, now) {
  const time = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const date = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = `700 52px ${FONT}`;
  ctx.fillText(time, W - 56, 110);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(date, W - 58, 150);
}

// Flat manila folder with a bold ink outline — Notion-icon energy rather
// than a glossy macOS render.
function drawFolder(ctx, folder, hovered) {
  const { cx, y, label, hit } = folder;
  const w = FOLDER_W;
  const x = cx - w / 2;
  const h = FOLDER_H;

  // Notion-style hover: soft gray pill behind the icon + label.
  if (hovered) {
    ctx.fillStyle = "rgba(55,53,47,0.08)";
    rr(ctx, hit.x, hit.y, hit.w, hit.h, 14);
    ctx.fill();
  }

  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.lineJoin = "round";

  // Tab peeking above the body.
  ctx.fillStyle = FOLDER_TAB;
  rr(ctx, x, y, w * 0.46, 34, 10);
  ctx.fill();
  ctx.stroke();

  // Body.
  ctx.fillStyle = FOLDER_FILL;
  rr(ctx, x, y + 14, w, h - 14, 12);
  ctx.fill();
  ctx.stroke();

  ctx.font = `600 26px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.fillText(label, cx, y + h + 38);
}

// Bottom dock in the same flat ink-outline style: a paper pill holding a few
// cartoon app tiles. Decorative for now — only the folders are interactive.
const DOCK_ICON = 76;
const DOCK_GAP = 26;

function drawDock(ctx) {
  const icons = [drawBrowserIcon, drawMailIcon, drawNotesIcon, drawTerminalIcon];
  const pad = 22;
  const innerW = icons.length * DOCK_ICON + (icons.length - 1) * DOCK_GAP;
  const barW = innerW + pad * 2;
  const barH = DOCK_ICON + pad * 2;
  const barX = (W - barW) / 2;
  const barY = H - barH - 26;

  ctx.fillStyle = "#ffffff";
  rr(ctx, barX, barY, barW, barH, 28);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.lineJoin = "round";
  rr(ctx, barX, barY, barW, barH, 28);
  ctx.stroke();

  let x = barX + pad;
  const y = barY + pad;
  icons.forEach((draw) => {
    draw(ctx, x, y, DOCK_ICON);
    x += DOCK_ICON + DOCK_GAP;
  });
}

// Rounded app tile with a flat fill and ink outline; glyphs draw on top.
function dockTile(ctx, x, y, s, fill) {
  ctx.fillStyle = fill;
  rr(ctx, x, y, s, s, s * 0.24);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  rr(ctx, x, y, s, s, s * 0.24);
  ctx.stroke();
}

function drawBrowserIcon(ctx, x, y, s) {
  dockTile(ctx, x, y, s, "#bcd9f5");
  // Simple ink globe: circle, equator, and a meridian ellipse.
  const cx = x + s / 2;
  const cy = y + s / 2;
  const R = s * 0.28;
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx + R, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, R * 0.45, R, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMailIcon(ctx, x, y, s) {
  dockTile(ctx, x, y, s, "#f5c6c0");
  const ex = x + s * 0.2;
  const ey = y + s * 0.3;
  const ew = s * 0.6;
  const eh = s * 0.4;
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  rr(ctx, ex, ey, ew, eh, s * 0.05);
  ctx.fill();
  ctx.stroke();
  // Envelope flap.
  ctx.beginPath();
  ctx.moveTo(ex, ey + 2);
  ctx.lineTo(ex + ew / 2, ey + eh * 0.55);
  ctx.lineTo(ex + ew, ey + 2);
  ctx.stroke();
}

function drawNotesIcon(ctx, x, y, s) {
  dockTile(ctx, x, y, s, "#ffffff");
  // Yellow header strip, clipped to the tile's rounded top.
  ctx.save();
  rr(ctx, x, y, s, s, s * 0.24);
  ctx.clip();
  ctx.fillStyle = "#f8d878";
  ctx.fillRect(x, y, s, s * 0.26);
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  rr(ctx, x, y, s, s, s * 0.24);
  ctx.stroke();
  // Ruled lines.
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    const ly = y + s * (0.45 + i * 0.16);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.18, ly);
    ctx.lineTo(x + s * (i === 2 ? 0.58 : 0.82), ly);
    ctx.stroke();
  }
}

function drawTerminalIcon(ctx, x, y, s) {
  dockTile(ctx, x, y, s, INK);
  ctx.fillStyle = PAPER;
  ctx.font = `700 ${s * 0.4}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(">_", x + s * 0.18, y + s * 0.55);
}

function rr(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
