"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { ChromeBlob } from "./ChromeBlob";

/**
 * Neutral studio HDRI for the reflections — the clean product-shot chrome look
 * (soft boxes + graded room), no colour cast. Chrome has no colour of its own,
 * so the environment is what makes it read as true polished metal.
 * (Loaded from the drei asset CDN; self-host via `files="/hdri/..."` for prod.)
 */
function ChromeStudio() {
  return <Environment preset="studio" environmentIntensity={3.8} />;
}

type Props = {
  distort?: number;
  speed?: number;
  scale?: number;
  /** softly follow global scroll for spin intensity */
  reactToScroll?: boolean;
};

export function ChromeCanvas({
  distort,
  speed,
  scale,
  reactToScroll = true,
}: Props) {
  const scroll = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const click = useRef({ fire: false, strength: 0, ripple: 0 });
  const [reduced, setReduced] = useState(false);
  const [dpr, setDpr] = useState<[number, number]>([1, 1.75]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);

    // lighter GPU load on small screens
    if (window.innerWidth < 768) setDpr([1, 1.4]);

    let ticking = false;
    const onScroll = () => {
      if (!reactToScroll || ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        scroll.current = max > 0 ? window.scrollY / max : 0;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Global pointer → normalized -1..1, steers the blob from anywhere.
    const onPointer = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // Click anywhere → shockwave ripple through the metal.
    const onDown = () => {
      click.current.fire = true;
    };
    window.addEventListener("pointerdown", onDown);

    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [reactToScroll]);

  return (
    <div aria-hidden style={{ width: "100%", height: "100%" }}>
      <Canvas
        dpr={dpr}
        gl={{ antialias: true, alpha: true, toneMappingExposure: 1.15 }}
        camera={{ position: [0, 0, 10], fov: 42 }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          {/* No scene background → canvas stays transparent so the chrome form
              floats on the page's void. Glow is done in CSS behind the canvas. */}
          <ambientLight intensity={0.35} />
          <ChromeStudio />
          <ChromeBlob
            scroll={scroll}
            pointer={pointer}
            click={click}
            reduced={reduced}
            distort={distort}
            speed={speed}
            scale={scale}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
