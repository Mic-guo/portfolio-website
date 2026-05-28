import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import RaymarchBlob, { createRaymarchUniforms } from "../three/RaymarchBlob";

function Slider({ label, min, max, step, value, onChange }) {
  return (
    <label style={styles.row}>
      <span style={styles.label}>
        {label}
        <span style={styles.value}>{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={styles.range}
      />
    </label>
  );
}

function ColorInput({ label, value, onChange }) {
  return (
    <label style={styles.row}>
      <span style={styles.label}>{label}</span>
      <input
        type="color"
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.color}
      />
    </label>
  );
}

export default function BlobPlayground() {
  const uniforms = useMemo(() => createRaymarchUniforms(), []);
  const [rotationSpeed, setRotationSpeed] = useState(0.0);
  const [hovered, setHovered] = useState(false);

  return (
    <div style={styles.page}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 40 }}
        gl={{ antialias: true }}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={["#050605"]} />
        <RaymarchBlob
          uniforms={uniforms}
          sway={rotationSpeed}
          active={hovered}
          onHover={setHovered}
        />
        <OrbitControls enablePan={false} minDistance={3.5} maxDistance={11} />
      </Canvas>

      <div style={styles.panel}>
        <div style={styles.title}>Blob playground</div>

        <Slider
          label="Amplitude"
          min={0}
          max={0.8}
          step={0.01}
          value={uniforms.uAmplitude.value}
          onChange={(v) => (uniforms.uAmplitude.value = v)}
        />
        <Slider
          label="Frequency"
          min={0.5}
          max={6}
          step={0.1}
          value={uniforms.uFrequency.value}
          onChange={(v) => (uniforms.uFrequency.value = v)}
        />
        <Slider
          label="Roughness"
          min={0.2}
          max={0.85}
          step={0.01}
          value={uniforms.uRoughness.value}
          onChange={(v) => (uniforms.uRoughness.value = v)}
        />
        <Slider
          label="Morph speed"
          min={0}
          max={1.2}
          step={0.01}
          value={uniforms.uSpeed.value}
          onChange={(v) => (uniforms.uSpeed.value = v)}
        />
        <Slider
          label="Idle sway"
          min={0}
          max={0.3}
          step={0.01}
          value={rotationSpeed}
          onChange={setRotationSpeed}
        />
        <Slider
          label="Hover bulge"
          min={0}
          max={1}
          step={0.01}
          value={uniforms.uBulge.value}
          onChange={(v) => (uniforms.uBulge.value = v)}
        />
        <Slider
          label="Merge"
          min={0.05}
          max={1}
          step={0.01}
          value={uniforms.uMergeK.value}
          onChange={(v) => (uniforms.uMergeK.value = v)}
        />
        <Slider
          label="Belt"
          min={0}
          max={0.25}
          step={0.005}
          value={uniforms.uBelt.value}
          onChange={(v) => (uniforms.uBelt.value = v)}
        />
        <Slider
          label="Label"
          min={0}
          max={1}
          step={0.01}
          value={uniforms.uLabelStrength.value}
          onChange={(v) => (uniforms.uLabelStrength.value = v)}
        />
        <Slider
          label="Slab width"
          min={1}
          max={3.5}
          step={0.05}
          value={uniforms.uSlabWidth.value}
          onChange={(v) => (uniforms.uSlabWidth.value = v)}
        />
        <Slider
          label="Slab height"
          min={0.6}
          max={2.5}
          step={0.05}
          value={uniforms.uSlabHeight.value}
          onChange={(v) => (uniforms.uSlabHeight.value = v)}
        />
        <Slider
          label="Slab translucency"
          min={0}
          max={1}
          step={0.01}
          value={uniforms.uSlabTranslucency.value}
          onChange={(v) => (uniforms.uSlabTranslucency.value = v)}
        />
        <Slider
          label="Protrusion"
          min={0}
          max={0.8}
          step={0.01}
          value={uniforms.uProtrude.value}
          onChange={(v) => (uniforms.uProtrude.value = v)}
        />
        <Slider
          label="Plate follow"
          min={0}
          max={0.8}
          step={0.01}
          value={uniforms.uPlateFollow.value}
          onChange={(v) => (uniforms.uPlateFollow.value = v)}
        />
        <Slider
          label="Edge melt"
          min={0}
          max={1}
          step={0.01}
          value={uniforms.uEdgeAmount.value}
          onChange={(v) => (uniforms.uEdgeAmount.value = v)}
        />
        <Slider
          label="Edge asymmetry"
          min={0}
          max={6}
          step={0.1}
          value={uniforms.uEdgeFreq.value}
          onChange={(v) => (uniforms.uEdgeFreq.value = v)}
        />
        <Slider
          label="Edge morph rate"
          min={0}
          max={8}
          step={0.1}
          value={uniforms.uEdgeRate.value}
          onChange={(v) => (uniforms.uEdgeRate.value = v)}
        />
        <Slider
          label="Rim power"
          min={0.5}
          max={6}
          step={0.1}
          value={uniforms.uFresnelPower.value}
          onChange={(v) => (uniforms.uFresnelPower.value = v)}
        />
        <Slider
          label="Rim strength"
          min={0}
          max={2}
          step={0.05}
          value={uniforms.uRimStrength.value}
          onChange={(v) => (uniforms.uRimStrength.value = v)}
        />

        <ColorInput
          label="Base color"
          value="#0c1512"
          onChange={(hex) => uniforms.uBaseColor.value.set(hex)}
        />
        <ColorInput
          label="Rim color"
          value="#9fb8ad"
          onChange={(hex) => uniforms.uRimColor.value.set(hex)}
        />

        <div style={styles.hint}>hover the blob · drag to orbit</div>
      </div>
    </div>
  );
}

const styles = {
  page: { position: "fixed", inset: 0, background: "#050605" },
  panel: {
    position: "fixed",
    top: 20,
    right: 20,
    width: 240,
    padding: "16px 18px",
    borderRadius: 12,
    background: "rgba(12,14,13,0.78)",
    border: "1px solid rgba(159,184,173,0.15)",
    backdropFilter: "blur(10px)",
    color: "#cdd8d3",
    font: '12px ui-monospace, "SF Mono", Menlo, monospace',
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  title: {
    fontSize: 13,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#9fb8ad",
    marginBottom: 2,
  },
  row: { display: "flex", flexDirection: "column", gap: 5 },
  label: {
    display: "flex",
    justifyContent: "space-between",
    color: "rgba(205,216,211,0.8)",
  },
  value: { color: "#9fb8ad" },
  range: { width: "100%", accentColor: "#9fb8ad", cursor: "pointer" },
  color: {
    width: "100%",
    height: 26,
    background: "none",
    border: "none",
    cursor: "pointer",
  },
  hint: {
    marginTop: 4,
    fontSize: 10,
    letterSpacing: "0.08em",
    color: "rgba(205,216,211,0.4)",
  },
};
