import { useMemo } from "react";
import { computeScreenMotion } from "./orangeSliceMotion";

const RAD = 180 / Math.PI;

export default function OrangeSliceStage({ progress, children }) {
  const transform = useMemo(() => {
    const { rotation, position } = computeScreenMotion(progress);
    const [rx, ry, rz] = rotation.map((r) => r * RAD);
    const [tx, ty] = position;
    return `
      translate3d(${tx * 60}px, ${ty * 60}px, 0)
      rotateX(${rx}deg)
      rotateY(${ry}deg)
      rotateZ(${rz}deg)
    `;
  }, [progress]);

  return (
    <div style={s.stage}>
      <div style={{ ...s.monitor, transform }}>
        <div style={s.bezel}>
          <div style={s.screen}>{children}</div>
        </div>
        <div style={s.chin} />
      </div>
    </div>
  );
}

const s = {
  stage: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    perspective: "1400px",
    perspectiveOrigin: "50% 46%",
    background:
      "radial-gradient(ellipse 80% 60% at 50% 42%, rgba(40, 44, 58, 0.45) 0%, transparent 70%), #070708",
    overflow: "hidden",
    pointerEvents: "none",
  },
  monitor: {
    width: "min(94vw, 1180px)",
    height: "min(82vh, 740px)",
    maxHeight: "calc(100vh - 72px)",
    transformStyle: "preserve-3d",
    willChange: "transform",
  },
  bezel: {
    width: "100%",
    height: "calc(100% - 14px)",
    padding: 10,
    boxSizing: "border-box",
    borderRadius: 10,
    background: "linear-gradient(165deg, #1c1c1c 0%, #0a0a0a 100%)",
    boxShadow:
      "0 28px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 2px 0 rgba(255,255,255,0.04) inset",
  },
  screen: {
    width: "100%",
    height: "100%",
    borderRadius: 4,
    overflow: "hidden",
    background: "#fafafa",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.35) inset",
    display: "flex",
    flexDirection: "column",
  },
  chin: {
    width: "28%",
    height: 8,
    margin: "6px auto 0",
    borderRadius: 2,
    background: "linear-gradient(180deg, #141414, #0a0a0a)",
  },
};
