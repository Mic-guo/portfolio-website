import { useState, useReducer } from "react";
import { isGeneric } from "../core/manifest";

// Dev-only scene-graph outliner. Renders the live Three.js hierarchy as a
// collapsible folder tree on the left edge of the viewport. Clicking a row
// selects that exact object (highlight + panel follow it).

const PANEL_STYLE = {
  position: "fixed",
  top: 16,
  left: 16,
  width: 300,
  maxHeight: "82vh",
  display: "flex",
  flexDirection: "column",
  zIndex: 9999,
  borderRadius: 8,
  background: "rgba(15, 17, 22, 0.92)",
  color: "#e6edf3",
  font: '12px/1.4 ui-monospace, "SF Mono", Menlo, monospace',
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  border: "1px solid rgba(0, 229, 255, 0.4)",
  backdropFilter: "blur(8px)",
  overflow: "hidden",
};

const HEADER_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 12px",
  borderBottom: "1px solid rgba(230,237,243,0.12)",
};

const TITLE_STYLE = {
  margin: 0,
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#00e5ff",
};

const TOGGLE_STYLE = (active) => ({
  background: active ? "rgba(0,229,255,0.18)" : "transparent",
  color: active ? "#00e5ff" : "#8b949e",
  border:
    "1px solid " + (active ? "rgba(0,229,255,0.5)" : "rgba(230,237,243,0.2)"),
  borderRadius: 4,
  padding: "2px 7px",
  cursor: "pointer",
  fontSize: 10,
  fontFamily: "inherit",
});

const BODY_STYLE = { overflow: "auto", padding: "6px 0" };

// Objects that add noise to the outliner rather than structure.
function isSkipped(obj) {
  if (obj.isLight || obj.isCamera) return true;
  if (/Helper$/.test(obj.type)) return true; // BoxHelper highlight, grid, etc.
  // Empty Object3D leaves — e.g. light targets added imperatively.
  if (obj.type === "Object3D" && obj.children.length === 0 && !obj.name?.trim())
    return true;
  return false;
}

// A node "kept" in named-only mode: meshes, or anything with a real name.
function isKept(obj) {
  return obj.isMesh || !isGeneric(obj.name);
}

// Children to display under `obj`. In named-only mode, generic pass-through
// groups are flattened away — their kept descendants are pulled up in place.
function displayChildren(obj, namedOnly) {
  const out = [];
  for (const child of obj.children) {
    if (isSkipped(child)) continue;
    if (!namedOnly || isKept(child)) out.push(child);
    else out.push(...displayChildren(child, namedOnly));
  }
  return out;
}

export default function SceneTree({ root, selected, manifest, onSelect }) {
  const [namedOnly, setNamedOnly] = useState(true);
  // Scene children load asynchronously (GLTF, companions). Force a re-walk on
  // demand since the graph structure isn't a React dependency.
  const [, rescan] = useReducer((n) => n + 1, 0);

  if (!root) return null;

  const roots = displayChildren(root, namedOnly);

  return (
    <div style={PANEL_STYLE}>
      <div style={HEADER_STYLE}>
        <h3 style={TITLE_STYLE}>Scene Tree</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            style={TOGGLE_STYLE(namedOnly)}
            onClick={() => setNamedOnly((v) => !v)}
            title="Hide generic pass-through groups"
          >
            named only
          </button>
          <button
            style={TOGGLE_STYLE(false)}
            onClick={rescan}
            title="Re-scan the scene graph"
          >
            ⟳
          </button>
        </div>
      </div>
      <div style={BODY_STYLE}>
        {roots.map((child) => (
          <TreeNode
            key={child.uuid}
            object={child}
            depth={0}
            namedOnly={namedOnly}
            selected={selected}
            manifest={manifest}
            onSelect={onSelect}
          />
        ))}
        {roots.length === 0 && (
          <div style={{ color: "#8b949e", padding: "6px 12px" }}>
            (empty)
          </div>
        )}
      </div>
    </div>
  );
}

function TreeNode({ object, depth, namedOnly, selected, manifest, onSelect }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = displayChildren(object, namedOnly);
  const hasChildren = children.length > 0;

  const isSelected = object === selected;
  const manifestNode = manifest?.findByRef(object);
  const name = object.name?.trim();
  const label = name || `<${object.type}>`;

  const labelColor = isSelected
    ? "#00e5ff"
    : object.isMesh
      ? "#e6edf3"
      : name
        ? "#c9d1d9"
        : "#6b7280";

  return (
    <div>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelect(object);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          paddingLeft: 8 + depth * 14,
          cursor: "pointer",
          background: isSelected ? "rgba(0,229,255,0.16)" : "transparent",
          borderLeft: isSelected
            ? "2px solid #00e5ff"
            : "2px solid transparent",
          whiteSpace: "nowrap",
        }}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setExpanded((v) => !v);
          }}
          style={{
            width: 12,
            flexShrink: 0,
            color: "#8b949e",
            textAlign: "center",
            cursor: hasChildren ? "pointer" : "default",
          }}
        >
          {hasChildren ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span style={{ flexShrink: 0 }}>
          {object.isMesh ? "◆" : hasChildren ? "▸" : "·"}
        </span>
        <span
          style={{
            color: labelColor,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
        {manifestNode && (
          <span
            title={`manifest id: ${manifestNode.id}`}
            style={{
              flexShrink: 0,
              fontSize: 9,
              color: "#7ee787",
              border: "1px solid rgba(126,231,135,0.4)",
              borderRadius: 3,
              padding: "0 4px",
              marginLeft: 2,
            }}
          >
            {manifestNode.id}
          </span>
        )}
      </div>
      {expanded &&
        children.map((child) => (
          <TreeNode
            key={child.uuid}
            object={child}
            depth={depth + 1}
            namedOnly={namedOnly}
            selected={selected}
            manifest={manifest}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}
