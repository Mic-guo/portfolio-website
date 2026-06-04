export default function OrangeSliceStage({ monitorRef, panRef, children }) {
  return (
    <div style={s.stage}>
      <div style={s.vignette} aria-hidden />
      <div ref={monitorRef} style={s.monitor}>
        <div ref={panRef} style={s.panLayer}>
          <div style={s.bezel}>
            <div style={s.screen}>{children}</div>
          </div>
          <div style={s.chin} />
        </div>
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
    perspective: "1100px",
    perspectiveOrigin: "50% 48%",
    background:
      "radial-gradient(ellipse 85% 65% at 50% 50%, rgba(40, 44, 58, 0.4) 0%, transparent 75%), #070708",
    overflow: "hidden",
    pointerEvents: "none",
  },
  vignette: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 32%, transparent 68%, rgba(0,0,0,0.4) 100%)",
    pointerEvents: "none",
  },
  monitor: {
    width: "min(94vw, 1180px)",
    height: "min(82vh, 740px)",
    maxHeight: "calc(100vh - 72px)",
    transformStyle: "preserve-3d",
    transformOrigin: "50% 100%",
    willChange: "transform",
  },
  panLayer: {
    width: "100%",
    height: "100%",
    transformStyle: "preserve-3d",
    willChange: "transform",
  },
  bezel: {
    width: "100%",
    height: "calc(100% - 14px)",
    padding: 8,
    boxSizing: "border-box",
    borderRadius: 10,
    background: "linear-gradient(165deg, #1c1c1c 0%, #0a0a0a 100%)",
    boxShadow:
      "0 36px 100px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 2px 0 rgba(255,255,255,0.04) inset",
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
