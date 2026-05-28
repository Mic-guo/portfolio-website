import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { isGeneric } from "../core/manifest";

// Dev-only floating panel that describes the currently selected Object3D.
// Renders outside the R3F Canvas; positioned in the corner of the viewport.

const PANEL_STYLE = {
  position: "fixed",
  bottom: 16,
  right: 16,
  width: 360,
  maxHeight: "75vh",
  overflow: "auto",
  zIndex: 9999,
  padding: "12px 14px",
  borderRadius: 8,
  background: "rgba(15, 17, 22, 0.92)",
  color: "#e6edf3",
  font: '12px/1.45 ui-monospace, "SF Mono", Menlo, monospace',
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  border: "1px solid rgba(0, 229, 255, 0.4)",
  backdropFilter: "blur(8px)",
};

const HEADER_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 10,
};

const TITLE_STYLE = {
  margin: 0,
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#00e5ff",
};

const BUTTON_STYLE = {
  background: "transparent",
  border: "1px solid rgba(230,237,243,0.3)",
  color: "#e6edf3",
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
  fontSize: 11,
};

const ROW = { display: "flex", gap: 8, margin: "2px 0" };
const LABEL = { color: "#8b949e", minWidth: 78 };
const VALUE = { color: "#e6edf3" };
const SECTION_LABEL = { color: "#8b949e", marginBottom: 4, marginTop: 8 };
const SNIPPET = {
  marginTop: 10,
  padding: 8,
  background: "#0a0c10",
  borderRadius: 4,
  fontSize: 11,
  color: "#7ee787",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};

const fmt = (n) => (Number.isFinite(n) ? n.toFixed(2) : "—");

// Walk from `origin` up to the scene root, returning the chain in
// general → specific order (root first, leaf last). Includes `origin`
// itself even if its name is generic, so the click target is always
// reachable. Generic ancestors are filtered out.
function buildChain(origin) {
  if (!origin) return [];
  const upward = [origin];
  let cur = origin.parent;
  while (cur) {
    if (!isGeneric(cur.name) && cur.parent) upward.push(cur);
    cur = cur.parent;
  }
  return upward.reverse();
}

export default function InspectorPanel({
  selection,
  manifest,
  onClose,
  onSelectInChain,
}) {
  const chain = useMemo(
    () => buildChain(selection?.origin ?? null),
    [selection?.origin],
  );

  // Keyboard shortcuts: [ goes one step toward the leaf, ] one step toward
  // the root. Wraps within the chain length.
  useEffect(() => {
    if (!selection || chain.length < 2) return;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key !== "[" && e.key !== "]") return;
      const idx = chain.indexOf(selection.current);
      if (idx === -1) return;
      const next =
        e.key === "["
          ? Math.min(chain.length - 1, idx + 1)
          : Math.max(0, idx - 1);
      if (next !== idx) onSelectInChain(chain[next]);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, chain, onSelectInChain]);

  // Recompute world-space AABB every time the selection changes. World coords
  // already account for every transform between the object and the scene root.
  const info = useMemo(() => {
    const object = selection?.current;
    if (!object) return null;
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const manifestNode = manifest?.findByRef(object);
    return {
      name: object.name || "(unnamed)",
      type: object.type,
      manifestNode,
      worldMin: box.min,
      worldMax: box.max,
      worldCenter: center,
      worldSize: size,
    };
  }, [selection?.current, manifest]);

  if (!info) {
    return (
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}>
          <h3 style={TITLE_STYLE}>Scene Inspector</h3>
        </div>
        <div style={{ color: "#8b949e" }}>
          Click any part of the model to inspect it.
        </div>
        <div style={{ color: "#8b949e", marginTop: 8, fontSize: 11 }}>
          <kbd style={{ color: "#00e5ff" }}>I</kbd> toggles ·{" "}
          <kbd style={{ color: "#00e5ff" }}>Esc</kbd> exits ·{" "}
          <kbd style={{ color: "#00e5ff" }}>[</kbd>
          <kbd style={{ color: "#00e5ff" }}>]</kbd> walk hierarchy
        </div>
      </div>
    );
  }

  const { name, type, manifestNode, worldMin, worldMax, worldCenter, worldSize } =
    info;
  const heading = manifestNode ? manifestNode.id : name;

  const minHorizontal = Math.min(worldSize.x, worldSize.z);
  const slabLike = worldSize.y < minHorizontal * 0.3;
  const suggestedHeight = slabLike ? minHorizontal * 0.12 : worldSize.y * 0.5;

  const snippet = manifestNode
    ? `anchor={{ node: "${manifestNode.id}", face: "top", offset: [0, 0, 0] }}\n` +
      `targetHeight={${fmt(suggestedHeight)}}`
    : `position={[${fmt(worldCenter.x)}, ${fmt(worldMax.y)}, ${fmt(worldCenter.z)}]}\n` +
      `targetHeight={${fmt(suggestedHeight)}}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {}
  };

  return (
    <div style={PANEL_STYLE}>
      <div style={HEADER_STYLE}>
        <h3 style={TITLE_STYLE}>{heading}</h3>
        <button style={BUTTON_STYLE} onClick={onClose}>
          ×
        </button>
      </div>

      {chain.length > 1 && (
        <Breadcrumb
          chain={chain}
          current={selection.current}
          onSelectInChain={onSelectInChain}
        />
      )}

      <div style={ROW}>
        <span style={LABEL}>name</span>
        <span style={VALUE}>{name}</span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>type</span>
        <span style={VALUE}>{type}</span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>in manifest</span>
        <span style={VALUE}>
          {manifestNode ? `yes — id "${manifestNode.id}"` : "no"}
        </span>
      </div>

      <div style={SECTION_LABEL}>WORLD-SPACE BOUNDS</div>
      <div style={ROW}>
        <span style={LABEL}>size</span>
        <span style={VALUE}>
          {fmt(worldSize.x)} × {fmt(worldSize.y)} × {fmt(worldSize.z)}
        </span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>center</span>
        <span style={VALUE}>
          ({fmt(worldCenter.x)}, {fmt(worldCenter.y)}, {fmt(worldCenter.z)})
        </span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>top Y</span>
        <span style={VALUE}>{fmt(worldMax.y)}</span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>bottom Y</span>
        <span style={VALUE}>{fmt(worldMin.y)}</span>
      </div>

      <div style={SECTION_LABEL}>
        {manifestNode ? "ANCHOR SNIPPET" : "POSITION SNIPPET"}
      </div>
      <div style={SNIPPET}>{snippet}</div>
      <button
        style={{ ...BUTTON_STYLE, marginTop: 6, width: "100%" }}
        onClick={copy}
      >
        copy CompanionModel snippet
      </button>
    </div>
  );
}

function Breadcrumb({ chain, current, onSelectInChain }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 4,
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: "1px dashed rgba(230,237,243,0.15)",
      }}
    >
      <span style={{ color: "#8b949e", marginRight: 4, fontSize: 11 }}>
        chain:
      </span>
      {chain.map((obj, i) => {
        const isActive = obj === current;
        const label = obj.name?.trim() || `(${obj.type})`;
        return (
          <span
            key={obj.uuid}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <button
              type="button"
              onClick={() => onSelectInChain(obj)}
              style={{
                background: isActive ? "rgba(0,229,255,0.2)" : "transparent",
                color: isActive ? "#00e5ff" : "#8b949e",
                border:
                  "1px solid " +
                  (isActive
                    ? "rgba(0,229,255,0.5)"
                    : "rgba(230,237,243,0.2)"),
                borderRadius: 3,
                padding: "1px 6px",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {label}
            </button>
            {i < chain.length - 1 && (
              <span style={{ color: "#3a4250", fontSize: 11 }}>›</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
