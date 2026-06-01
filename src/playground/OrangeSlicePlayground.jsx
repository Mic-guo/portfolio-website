import { useEffect, useMemo, useRef, useState } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  COLUMNS,
  DISCOVERY_PROMPT,
  INDUSTRY_STYLES,
  ROWS,
  STEPS,
} from "./orangeSliceData";
import OrangeSliceStage from "./OrangeSliceStage";
import { T, inPromptGap } from "./orangeSliceTimeline";

import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const seg = (p, start, end) =>
  end <= start ? (p >= start ? 1 : 0) : clamp((p - start) / (end - start), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;

function runPhase(p, range) {
  const t = seg(p, range[0], range[1]);
  if (t <= 0) return "idle";
  if (t < 0.35) return "hover";
  if (t < 0.55) return "pressed";
  return "thinking";
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffled row chunks — deterministic per column, scrub-safe. */
function buildChunkFillSchedule(seedKey) {
  const rng = mulberry32(hashStr(seedKey));
  const indices = ROWS.map((_, i) => i);

  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const events = [];
  let cursor = 0;
  let time = 0;

  while (cursor < indices.length) {
    const chunkSize = 2 + Math.floor(rng() * 3);
    const chunk = indices.slice(cursor, cursor + chunkSize);
    cursor += chunkSize;

    const genStart = time;
    const genLead = 0.045 + rng() * 0.025;

    chunk.forEach((rowIdx, j) => {
      const fillStart = genStart + genLead + j * (0.008 + rng() * 0.012);
      events.push({ rowIdx, genStart, fillStart });
    });

    time += 0.11 + rng() * 0.07;
  }

  const end = time + 0.08;
  return events.map((e) => ({
    rowIdx: e.rowIdx,
    genStart: e.genStart / end,
    fillStart: e.fillStart / end,
  }));
}

const FILL_SCHEDULES = Object.fromEntries(
  STEPS.map((step) => [step.key, buildChunkFillSchedule(step.key)]),
);

/** Website column reveal during discovery — company is pre-filled from t=0. */
const WEBSITE_REVEAL_SCHEDULE = buildChunkFillSchedule("website");

function initialRowVisibility(p, revealRange) {
  const t = seg(p, revealRange[0], revealRange[1]);
  const company = {};
  const website = {};

  ROWS.forEach((_, rowIdx) => {
    company[rowIdx] = 1;
  });

  ROWS.forEach((_, rowIdx) => {
    website[rowIdx] = 0;
  });

  for (const { rowIdx, genStart, fillStart } of WEBSITE_REVEAL_SCHEDULE) {
    if (t < genStart) website[rowIdx] = 0;
    else if (t < fillStart) website[rowIdx] = seg(t, genStart, fillStart);
    else website[rowIdx] = 1;
  }

  return { company, website };
}

function columnFillStates(p, fillRange, colKey) {
  const t = seg(p, fillRange[0], fillRange[1]);
  const states = {};

  ROWS.forEach((_, rowIdx) => {
    states[`${rowIdx}-${colKey}`] = "empty";
  });

  for (const { rowIdx, genStart, fillStart } of FILL_SCHEDULES[colKey]) {
    const key = `${rowIdx}-${colKey}`;
    if (t < genStart) states[key] = "empty";
    else if (t < fillStart) states[key] = "generating";
    else states[key] = "filled";
  }

  return states;
}

function deriveScene(progress) {
  const barIn = seg(progress, T.barIn[0], T.barIn[1]);
  const discoveryRun = runPhase(progress, T.runDiscovery);
  const rowVisible = initialRowVisibility(progress, T.revealRows);

  const stepPrompts = [
    { prompt: T.step1Prompt, run: T.step1Run, reveal: T.step1Reveal, fill: T.step1Fill, text: STEPS[0].prompt, key: "industry" },
    { prompt: T.step2Prompt, run: T.step2Run, reveal: T.step2Reveal, fill: T.step2Fill, text: STEPS[1].prompt, key: "ceo" },
    { prompt: T.step3Prompt, run: T.step3Run, reveal: T.step3Reveal, fill: T.step3Fill, text: STEPS[2].prompt, key: "jobs" },
  ];

  let promptText = "";
  let showPlaceholder = progress < T.discoveryPrompt[0];
  let runState = "idle";
  let barFlash = false;
  let thinking = false;

  if (inPromptGap(progress)) {
    showPlaceholder = true;
  } else if (progress >= T.discoveryPrompt[0] && progress < T.runDiscovery[1]) {
    promptText = DISCOVERY_PROMPT;
    showPlaceholder = false;
    if (progress >= T.runDiscovery[0]) {
      runState = discoveryRun;
      thinking = discoveryRun === "thinking";
      if (progress < T.runDiscovery[0] + 0.006) barFlash = true;
    }
  }

  const columnVisible = { industry: false, ceo: false, jobs: false };
  const columnReveal = { industry: 0, ceo: 0, jobs: 0 };
  let cellStates = {};

  for (const step of stepPrompts) {
    const runT = runPhase(progress, step.run);
    const revealT = seg(progress, step.reveal[0], step.reveal[1]);

    if (!inPromptGap(progress) && progress >= step.prompt[0] && progress < step.run[1]) {
      promptText = step.text;
      showPlaceholder = false;
      if (progress >= step.run[0]) {
        runState = runT;
        thinking = runT === "thinking";
        if (progress < step.run[0] + 0.006) barFlash = true;
      }
    }

    if (progress >= step.reveal[0]) {
      columnVisible[step.key] = true;
      columnReveal[step.key] = revealT;
    }
    if (progress >= step.fill[0]) {
      cellStates = { ...cellStates, ...columnFillStates(progress, step.fill, step.key) };
    }
  }

  return {
    barIn,
    rowVisible,
    promptText,
    showPlaceholder,
    runState,
    barFlash,
    thinking,
    columnVisible,
    columnReveal,
    cellStates,
  };
}

function SparkleIcon({ spinning }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={spinning ? styles.iconSpin : undefined}>
      <path
        d="M8 1.5l1.1 3.4 3.4 1.1-3.4 1.1L8 10.5 6.9 7.1 3.5 6l3.4-1.1L8 1.5z"
        fill="currentColor"
      />
      <path
        d="M12.5 2l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}

function CommandBar({ scene }) {
  const { promptText, showPlaceholder, runState, barFlash, thinking, barIn } = scene;

  return (
    <div style={{ ...styles.commandBar, opacity: barIn }}>
      <div style={{ ...styles.commandInner, ...(barFlash ? styles.commandFlash : {}) }}>
        <div style={{ ...styles.cmdIcon, ...(thinking ? styles.cmdIconThinking : {}) }}>
          <SparkleIcon spinning={thinking} />
        </div>
        <div style={styles.cmdBody}>
          {showPlaceholder && <span style={styles.cmdPlaceholder}>Ask anything…</span>}
          <span style={styles.cmdText}>{promptText}</span>
        </div>
        <span style={styles.cmdShortcut}>⌘ ⏎</span>
        <button
          type="button"
          style={{
            ...styles.cmdBtn,
            ...(runState === "hover" ? styles.cmdBtnHover : {}),
            ...(runState === "pressed" ? styles.cmdBtnPressed : {}),
          }}
        >
          <span>Run</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6h5M6.5 4l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CompanyLogo({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return <span style={styles.logoFallback}>{alt?.charAt(0)?.toUpperCase() ?? "?"}</span>;
  }
  return (
    <img
      src={src}
      alt=""
      width={20}
      height={20}
      style={styles.logo}
      onError={() => setFailed(true)}
    />
  );
}

function CellContent({ colKey, row, value, state }) {
  if (state === "generating") {
    return (
      <div style={styles.generating}>
        <span style={styles.generatingLabel}>Generating...</span>
      </div>
    );
  }

  if (state === "empty") return null;

  if (colKey === "company") {
    return (
      <div style={styles.cellRow}>
        <CompanyLogo src={row.logo} alt={row.company} />
        <span style={styles.cellText}>{value}</span>
      </div>
    );
  }

  if (colKey === "website") {
    return (
      <a href={value} style={styles.websiteLink} target="_blank" rel="noreferrer">
        <CompanyLogo src={row.logo} alt={row.company} />
        <span style={styles.websiteText}>{value}</span>
      </a>
    );
  }

  if (colKey === "industry") {
    const pill = INDUSTRY_STYLES[value] ?? { bg: "#f3f4f6", color: "#374151" };
    return (
      <span style={{ ...styles.industryPill, backgroundColor: pill.bg, color: pill.color }}>
        {value}
      </span>
    );
  }

  if (colKey === "ceo") {
    return (
      <a href={value} style={styles.websiteLink} target="_blank" rel="noreferrer">
        <CompanyLogo src={row.ceoAvatar} alt={row.company} />
        <span style={styles.websiteText}>{value}</span>
      </a>
    );
  }

  if (colKey === "jobs") {
    const match = value.match(/^(✅)\s*(.*)$/);
    if (match) {
      return (
        <span style={styles.cellText}>
          <span style={styles.jobsCheck}>{match[1]}</span> {match[2]}
        </span>
      );
    }
    return <span style={styles.cellText}>{value}</span>;
  }

  return <span style={styles.cellText}>{value}</span>;
}

function Cell({ colKey, row, value, state, reveal = 1 }) {
  const hidden = reveal <= 0;
  return (
    <td
      style={{
        ...styles.cell,
        opacity: hidden ? 0 : 1,
        transform: hidden ? "translateX(6px)" : `translateX(${lerp(6, 0, reveal)}px)`,
      }}
    >
      <CellContent colKey={colKey} row={row} value={value} state={state} />
    </td>
  );
}

function ScreenApp({ scene }) {
  return (
    <div style={styles.screenApp}>
      <SpreadsheetUI scene={scene} />
      <CommandBar scene={scene} />
    </div>
  );
}

function SpreadsheetUI({ scene }) {
  const { rowVisible, columnVisible, columnReveal, cellStates } = scene;
  const visibleColumns = COLUMNS.filter(
    (col) => col.initial || columnVisible[col.key],
  );

  return (
    <div style={styles.sheetWrap}>
      <div style={styles.sheetToolbar}>
        <div style={styles.sheetTitle}>
          <span style={styles.sheetDot} />
          Startup Discovery
        </div>
        <span style={styles.sheetMeta}>{ROWS.length} companies</span>
      </div>
      <div style={styles.sheetScroll}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.rowNumHead}>#</th>
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    ...styles.headCell,
                    width: col.width,
                    minWidth: col.width,
                    opacity: col.initial ? 1 : columnReveal[col.key],
                    transform: `translateX(${lerp(6, 0, col.initial ? 1 : columnReveal[col.key])}px)`,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, rowIdx) => {
              const companyVis = rowVisible.company[rowIdx] ?? 0;
              const websiteVis = rowVisible.website[rowIdx] ?? 0;
              const rowNumVis = Math.max(companyVis, websiteVis);

              return (
                <tr key={row.company} style={styles.row}>
                  <td style={{ ...styles.rowNum, opacity: rowNumVis }}>{rowIdx + 1}</td>
                  {visibleColumns.map((col) => {
                    const key = `${rowIdx}-${col.key}`;
                    const state = col.initial ? "filled" : cellStates[key] ?? "empty";
                    const initialVis =
                      col.key === "company" ? companyVis :
                      col.key === "website" ? websiteVis :
                      1;
                    const reveal = col.initial ? initialVis : columnReveal[col.key];
                    return (
                      <Cell
                        key={col.key}
                        colKey={col.key}
                        row={row}
                        value={row[col.key]}
                        state={col.initial ? (initialVis > 0 ? state : "empty") : state}
                        reveal={reveal}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OrangeSlicePlayground() {
  const scrollRef = useRef(null);
  const pinRef = useRef(null);
  const [progress, setProgress] = useState(0);

  const scene = useMemo(() => deriveScene(progress), [progress]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const pinEl = pinRef.current;
    if (!scrollEl || !pinEl) return;

    const lenis = new Lenis({
      autoRaf: false,
      duration: 1.1,
      smoothWheel: true,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const lenisRaf = (time) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(lenisRaf);
    gsap.ticker.lagSmoothing(0);

    const onLenisRefresh = () => lenis.resize();
    ScrollTrigger.addEventListener("refresh", onLenisRefresh);

    const trigger = ScrollTrigger.create({
      trigger: scrollEl,
      start: "top top",
      end: "+=10000",
      pin: pinEl,
      scrub: 0.8,
      invalidateOnRefresh: true,
      onUpdate: (self) => setProgress(self.progress),
    });

    requestAnimationFrame(() => {
      lenis.resize();
      ScrollTrigger.refresh();
    });

    const onKey = (e) => {
      if (e.key === "Escape") {
        lenis.scrollTo(0, { immediate: true });
        setProgress(0);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      ScrollTrigger.removeEventListener("refresh", onLenisRefresh);
      trigger.kill();
      gsap.ticker.remove(lenisRaf);
      lenis.destroy();
    };
  }, []);

  return (
    <>
      <style>{keyframes}</style>
      <div ref={scrollRef} style={styles.scrollHost}>
        <div ref={pinRef} style={styles.viewport}>
          <OrangeSliceStage progress={progress}>
            <ScreenApp scene={scene} />
          </OrangeSliceStage>

          <header style={styles.header}>
            <span style={styles.badge}>#orangeslice playground</span>
            <span style={styles.hint}>Scroll to scrub the demo · Esc resets</span>
          </header>

          <div style={styles.progressRail}>
            <div style={{ ...styles.progressFill, width: `${progress * 100}%` }} />
          </div>
          <div style={styles.scrollCue}>
            <span style={{ opacity: progress > 0.02 ? 0.35 : 1 }}>scroll</span>
          </div>
        </div>
      </div>
    </>
  );
}

const keyframes = `
@keyframes os-gen-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes os-icon-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

const styles = {
  scrollHost: {
    height: "1000vh",
    background: "#070708",
  },
  viewport: {
    position: "relative",
    height: "100vh",
    overflow: "hidden",
    background: "#070708",
    overscrollBehavior: "none",
  },
  header: {
    position: "absolute",
    top: 18,
    left: 24,
    right: 24,
    zIndex: 5,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    pointerEvents: "none",
  },
  badge: {
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  hint: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
  },
  screenApp: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#fafafa",
    pointerEvents: "none",
  },
  sheetWrap: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#fff",
  },
  sheetToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid #e5e5e5",
    background: "#fafafa",
  },
  sheetTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
  },
  sheetDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#f97316",
  },
  sheetMeta: {
    fontSize: 12,
    color: "rgba(23,23,23,0.45)",
  },
  sheetScroll: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  },
  rowNumHead: {
    width: 42,
    padding: "8px 6px",
    fontSize: 11,
    fontWeight: 500,
    color: "#737373",
    textAlign: "center",
    borderRight: "1px solid #e5e5e5",
    borderBottom: "1px solid #e5e5e5",
    background: "#fafafa",
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  headCell: {
    padding: "8px 10px",
    fontSize: 11,
    fontWeight: 600,
    color: "#525252",
    textAlign: "left",
    borderRight: "1px solid #e5e5e5",
    borderBottom: "1px solid #e5e5e5",
    background: "#fafafa",
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  row: {},
  rowNum: {
    padding: "0 6px",
    fontSize: 11,
    color: "#a3a3a3",
    textAlign: "center",
    borderRight: "1px solid #e5e5e5",
    borderBottom: "1px solid #e5e5e5",
    background: "#fff",
  },
  cell: {
    position: "relative",
    padding: "0 6px",
    height: 33,
    fontSize: 12,
    color: "#171717",
    background: "#fff",
    borderRight: "1px solid #e5e5e5",
    borderBottom: "1px solid #e5e5e5",
    verticalAlign: "middle",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cellRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: "100%",
    overflow: "hidden",
  },
  cellText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  logo: {
    width: 20,
    height: 20,
    borderRadius: 4,
    flexShrink: 0,
    objectFit: "contain",
  },
  logoFallback: {
    width: 20,
    height: 20,
    borderRadius: 4,
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    fontSize: 10,
    fontWeight: 700,
    background: "#f3f4f6",
    color: "#6b7280",
  },
  websiteLink: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: "100%",
    color: "#2563eb",
    textDecoration: "none",
    overflow: "hidden",
  },
  websiteText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  industryPill: {
    display: "inline-block",
    padding: "2px 6px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.3,
  },
  jobsCheck: {
    color: "#16a34a",
  },
  link: {
    color: "#2563eb",
    textDecoration: "none",
  },
  generating: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    backgroundImage:
      "linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0.16) 50%, rgba(37,99,235,0.06) 100%)",
    backgroundSize: "200% 100%",
    animation: "os-gen-shimmer 1.2s linear infinite",
  },
  generatingLabel: {
    fontSize: 11,
    color: "rgba(37,99,235,0.75)",
    fontWeight: 500,
  },
  commandBar: {
    flexShrink: 0,
    width: "100%",
    padding: "8px 10px",
    boxSizing: "border-box",
    background: "#fafafa",
    borderTop: "1px solid #e5e5e5",
    pointerEvents: "none",
  },
  commandInner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    height: 52,
    padding: "0 10px 0 14px",
    borderRadius: 0,
    background: "#ffffff",
    border: "1px solid rgba(0, 0, 0, 0.12)",
    boxShadow: "none",
    transition: "box-shadow 0.15s ease",
  },
  commandFlash: {
    boxShadow:
      "0 12px 40px rgba(37,99,235,0.18), 0 0 0 2px rgba(37,99,235,0.25), 0 0 0 1px rgba(255,255,255,0.6) inset",
  },
  cmdIcon: {
    width: 24,
    height: 24,
    display: "grid",
    placeItems: "center",
    color: "#2563eb",
    flexShrink: 0,
  },
  cmdIconThinking: {
    animation: "os-icon-spin 1.4s linear infinite",
  },
  iconSpin: {
    transformOrigin: "center",
  },
  cmdBody: {
    flex: 1,
    minWidth: 0,
    position: "relative",
    fontSize: 14,
    lineHeight: 1,
    letterSpacing: "-0.005em",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  cmdPlaceholder: {
    color: "#9ca3af",
  },
  cmdText: {
    color: "#111827",
  },
  cmdShortcut: {
    fontSize: 11,
    letterSpacing: "0.02em",
    color: "#9ca3af",
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    padding: "3px 7px",
    borderRadius: 4,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    flexShrink: 0,
  },
  cmdBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 34,
    padding: "0 12px",
    borderRadius: 0,
    border: "1px solid #1d4ed8",
    background: "#2563eb",
    color: "#fff",
    fontSize: 13,
    fontWeight: 500,
    flexShrink: 0,
    transition: "transform 80ms ease-out, background 120ms linear, box-shadow 120ms linear",
  },
  cmdBtnHover: {
    background: "#1d4ed8",
    boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.18)",
  },
  cmdBtnPressed: {
    transform: "scale(0.95)",
  },
  progressRail: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 10,
    height: 3,
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    zIndex: 5,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #f97316, #2563eb)",
  },
  scrollCue: {
    position: "absolute",
    right: 32,
    bottom: 18,
    fontSize: 10,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.28)",
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    zIndex: 5,
  },
};
