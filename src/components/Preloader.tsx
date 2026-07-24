"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ChromeCounter = dynamic(
  () => import("./chrome/ChromeCounter").then((m) => m.ChromeCounter),
  { ssr: false }
);

/**
 * Editorial preloader. Drives loadStore.progress 0→1 while the hero blob
 * assembles from particles (raised above the black bg during the intro), then
 * wipes upward — bg (z190, below the blob) + UI (z220, above the blob) lift
 * together, leaving THE SAME blob in place. Plays once per session, skipped
 * under reduced motion.
 */
export function Preloader() {
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<"load" | "wipe" | "done">("load");

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // prod: once per session; dev: replay on every reload so it's testable
    const seen =
      process.env.NODE_ENV === "production" &&
      sessionStorage.getItem("introShown");
    if (reduced || seen) {
      setPhase("done");
      return;
    }
    sessionStorage.setItem("introShown", "1");
    document.body.style.overflow = "hidden";

    const DUR = 4000;
    let raf = 0;
    let start = 0;
    // gentler ease (cubic) so the assembly stays visible across the whole 4s
    // instead of snapping to 100 early like expo did
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / DUR, 1);
      setCount(Math.round(easeOut(p) * 100));
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setPhase("wipe");
        window.setTimeout(() => {
          setPhase("done");
          document.body.style.overflow = "";
        }, 1000);
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = "";
    };
  }, []);

  if (phase === "done") return null;

  const lift = phase === "wipe" ? "translateY(-101%)" : "translateY(0)";
  const ease = "transform 1s cubic-bezier(0.76, 0, 0.24, 1)";

  return (
    <>
      {/* black bg — below the blob (z190), hides the page during load */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 190,
          background: "var(--void)",
          transform: lift,
          transition: ease,
          willChange: "transform",
        }}
      />
      {/* UI — above the blob (z220): counter, progress, meta */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 220,
          pointerEvents: "none",
          transform: lift,
          transition: ease,
          willChange: "transform",
        }}
      >
        <div className="shell relative flex h-full flex-col justify-between py-8">
          <div className="flex items-start justify-end">
            <span className="font-mono-label">[ Loading ]</span>
          </div>

          <div className="flex items-center justify-end">
            <div
              style={{
                width: "min(64vw, 600px)",
                height: "min(46vh, 400px)",
              }}
            >
              <ChromeCounter value={count} />
            </div>
          </div>

          <div>
            <div
              className="h-px w-full origin-left"
              style={{
                background: "var(--chrome)",
                transform: `scaleX(${count / 100})`,
                transition: "transform 0.1s linear",
              }}
            />
            <div className="mt-4 flex items-center">
              <span className="font-mono-label">[ PORTFOLIO ]</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
