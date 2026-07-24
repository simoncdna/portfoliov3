"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { ChromeBlob } from "./ChromeBlob";
import type { BlobShape } from "./ChromeBlob";

/**
 * Dark "lights" rig (no studio wash) — a near-black environment with a few
 * bright light bars/points that the mirror metal reflects as sharp streaks and
 * hotspots on a dark body. The dramatic, high-contrast chrome look.
 * Fully self-contained (no external HDRI).
 */
function ChromeLights({ intensity = 1.2 }: { intensity?: number }) {
  const k = intensity;
  return (
    <Environment resolution={256}>
      {/* dark-grey base so unlit areas read as silver-grey, not pure black */}
      <color attach="background" args={["#191a1d"]} />
      {/* broad soft fill — the base sheen across the whole body */}
      <Lightformer
        form="rect"
        intensity={1.1 * k}
        color="#c8ccd6"
        position={[0, 1, 7]}
        scale={[16, 12, 1]}
      />
      {/* KEY reflection — the big bright soft box that sweeps across the metal
          (the main light you actually see mirrored). */}
      <Lightformer
        form="rect"
        intensity={4.5 * k}
        color="#ffffff"
        position={[-1.6, 2.4, 5]}
        rotation={[0.1, 0.2, 0]}
        scale={[5.5, 4.5, 1]}
      />
      {/* long specular streaks */}
      <Lightformer
        form="rect"
        intensity={6 * k}
        color="#ffffff"
        position={[-3.5, 2, 3]}
        rotation={[0, Math.PI / 3, 0]}
        scale={[0.5, 7, 1]}
      />
      <Lightformer
        form="rect"
        intensity={5 * k}
        color="#dfe8ff"
        position={[3.6, -1, 3]}
        rotation={[0, -Math.PI / 3, 0]}
        scale={[0.5, 7, 1]}
      />
      {/* bright key hotspot + cool accent */}
      <Lightformer
        form="circle"
        intensity={8 * k}
        color="#ffffff"
        position={[1, 3, 4]}
        scale={[1.4, 1.4, 1]}
      />
      <Lightformer
        form="circle"
        intensity={3.5 * k}
        color="#9fc0ff"
        position={[-4, -2.5, 2]}
        scale={[1.2, 1.2, 1]}
      />
    </Environment>
  );
}

type Vec3 = [number, number, number];
type Lamp = { intensity: number; color: string; position: Vec3 };
export type LightsConfig = {
  ambient: number;
  streaks: number;
  key: Lamp;
  fill: Lamp;
  rim: Lamp;
};

export const DEFAULT_LIGHTS: LightsConfig = {
  ambient: 0.35,
  streaks: 1.6,
  key: { intensity: 160, color: "#ffffff", position: [5, 6, 5] },
  fill: { intensity: 60, color: "#8fb4ff", position: [-6, -2, 4] },
  rim: { intensity: 40, color: "#ffffff", position: [4, -5, 3] },
};

type Props = Partial<BlobShape> & {
  /** softly follow global scroll for spin intensity */
  reactToScroll?: boolean;
  lights?: LightsConfig;
  /** "studio" = rich HDRI reflections; "lights" = dark custom rig */
  envMode?: "studio" | "lights";
};

export function ChromeCanvas({
  reactToScroll = true,
  lights = DEFAULT_LIGHTS,
  envMode = "studio",
  ...shape
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
          <ambientLight intensity={lights.ambient} />
          {/* direct lights = crisp specular sparkle on the mirror metal */}
          <spotLight
            position={lights.key.position}
            angle={0.5}
            penumbra={1}
            intensity={lights.key.intensity}
            color={lights.key.color}
            distance={40}
          />
          <pointLight
            position={lights.fill.position}
            intensity={lights.fill.intensity}
            color={lights.fill.color}
            distance={40}
          />
          <pointLight
            position={lights.rim.position}
            intensity={lights.rim.intensity}
            color={lights.rim.color}
            distance={40}
          />
          {envMode === "studio" ? (
            <Environment preset="studio" environmentIntensity={lights.streaks * 2.4} />
          ) : (
            <ChromeLights intensity={lights.streaks} />
          )}
          <ChromeBlob
            scroll={scroll}
            pointer={pointer}
            click={click}
            reduced={reduced}
            {...shape}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
