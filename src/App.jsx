import { useRef, useEffect } from "react";
import CameraDecompositionScene from "./three/CameraDecompositionScene";
import Hero from "./sections/Hero";

export default function App() {
  const scrollProgressRef = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      const t = maxScroll > 0 ? Math.min(window.scrollY / maxScroll, 1) : 0;
      scrollProgressRef.current = t;

      document.documentElement.style.setProperty(
        "--c-text-color",
        "rgb(240,240,240)",
      );
      document.documentElement.style.setProperty(
        "--c-muted-color",
        "rgb(165,170,180)",
      );
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <CameraDecompositionScene
        scrollProgressRef={scrollProgressRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <main
        style={{
          position: "relative",
          zIndex: 10,
        }}
      >
        <Hero />
        <div className="scene-scroll-tail" aria-hidden="true" />
      </main>
    </>
  );
}
