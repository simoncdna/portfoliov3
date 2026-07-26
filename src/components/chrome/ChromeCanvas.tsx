"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import type { Group } from "three";
import type { BlobShape } from "./ChromeBlob";
import { FormDriver } from "./FormDriver";
import { LiquidDna } from "./LiquidDna";
import { ChromeSkull } from "./ChromeSkull";
import { DnaParticles } from "./DnaParticles";
import { MeshDna } from "./MeshDna";

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Drives `hover` (0..1) from the cursor's proximity to screen centre (the blob). */
function HoverDriver({
  pointer,
  hover,
}: {
  pointer: React.MutableRefObject<{ x: number; y: number }>;
  hover: React.MutableRefObject<number>;
}) {
  useFrame((_, dt) => {
    const p = pointer.current;
    const d = Math.hypot(p.x, p.y);
    const target = 1 - smoothstep(0.32, 0.82, d);
    hover.current += (target - hover.current) * (1 - Math.pow(0.01, dt));
  });
  return null;
}

/**
 * Clean procedural environment — a smooth dark→light gradient plus ONE big soft
 * key light. No photographed studio, so no tripods / light stands reflected in
 * the metal: just a clean silver gradient and a single dominant highlight.
 * Fully self-contained (no external HDRI).
 */
function ChromeClean({ intensity = 1.2 }: { intensity?: number }) {
  const k = intensity;
  return (
    <Environment resolution={512}>
      {/* dark base → the lower/darker half of the vertical gradient */}
      <color attach="background" args={["#0e0f13"]} />
      {/* ceiling wash: smooth bright-top → dark-bottom silver gradient */}
      <Lightformer
        form="rect"
        intensity={1.3 * k}
        color="#eef0f6"
        position={[0, 7, 1]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[28, 28, 1]}
      />
      {/* two big soft key boxes (angled) — the rich silver body + main highlights,
          large & soft so they read as clean gradients, not hard shapes */}
      <Lightformer
        form="rect"
        intensity={3 * k}
        color="#ffffff"
        position={[-3, 2, 5]}
        rotation={[0, 0.5, 0]}
        scale={[5, 6, 1]}
      />
      <Lightformer
        form="rect"
        intensity={2.2 * k}
        color="#eaf0ff"
        position={[3.5, 0.5, 5]}
        rotation={[0, -0.5, 0]}
        scale={[4, 6, 1]}
      />
      {/* broad cool floor fill → graded horizon under the form */}
      <Lightformer
        form="rect"
        intensity={0.6 * k}
        color="#aab0c0"
        position={[0, -5, 4]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[22, 22, 1]}
      />
      {/* subtle back rim for depth */}
      <Lightformer
        form="rect"
        intensity={1.2 * k}
        color="#c6cede"
        position={[0, 1, -6]}
        scale={[12, 12, 1]}
      />
    </Environment>
  );
}

export type HdriPreset =
  | "apartment"
  | "city"
  | "dawn"
  | "forest"
  | "lobby"
  | "night"
  | "park"
  | "studio"
  | "sunset"
  | "warehouse";

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
  /** reflection environment */
  envMode?: "clean" | "studio";
  /** which drei HDRI preset to reflect (studio mode) */
  hdriPreset?: HdriPreset;
  /** rotate the HDRI to spin unwanted features out of view (radians) */
  envRotationY?: number;
};

export function ChromeCanvas({
  reactToScroll = true,
  lights = DEFAULT_LIGHTS,
  envMode = "studio",
  hdriPreset = "studio",
  envRotationY = 2.4,
  ...shape
}: Props) {
  const scroll = useRef(0);
  // 0..1 presence of the About section → drives the blob→skull morph + left dock
  const about = useRef(0);
  // 0..1 presence of the Work section → settles the form centre stage as the piece
  const work = useRef(0);
  // start off-screen so the blob loads SOLID (cursor not over it yet)
  const pointer = useRef({ x: 2, y: 2 });
  const hover = useRef(0);
  const click = useRef({ fire: false, strength: 0, ripple: 0 });
  // shared so the particle blob overlays the solid one exactly
  const blobGroup = useRef<Group | null>(null);
  const shapeRef = useRef({ flow: 0, distort: 0.3, freq: 0.4 });
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
        // About presence: rises early — as soon as the section's top peeks in
        // from the bottom — then PERSISTS at 1 once formed. For now the helix
        // stays docked (it does NOT morph into the next section); continued
        // scroll just keeps spinning it.
        const vh = window.innerHeight;
        const ab = document.getElementById("about");
        about.current = ab ? smoothstep(vh * 1.0, vh * 0.35, ab.getBoundingClientRect().top) : 0;
        // Work presence → centre stage, at display size. The section's own arrival
        // is a fair thing to read off its position; the About *exit* is not, which
        // is why that one is scrubbed by the pinned timeline instead (see
        // formChoreo). Work is a tall band with a sticky screen, so its top passing
        // is the section STARTING, and its bottom passing is the last plate leaving.
        const wk = document.getElementById("work");
        if (wk) {
          const r = wk.getBoundingClientRect();
          work.current = smoothstep(vh * 0.95, vh * 0.45, r.top);
        } else {
          work.current = 0;
        }
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

    // cursor leaves the window → push it far away so the blob re-solidifies
    const onLeave = () => {
      pointer.current.x = 2;
      pointer.current.y = 2;
    };
    document.addEventListener("mouseleave", onLeave);

    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [reactToScroll]);

  return (
    <div aria-hidden style={{ width: "100%", height: "100%" }}>
      <Canvas
        dpr={dpr}
        gl={{ antialias: true, alpha: true, toneMappingExposure: 1.15 }}
        camera={{ position: [0, 0, 10], fov: 42 }}
        // pointerEvents: none is NOT redundant with the pointer-events-none on the
        // wrapper. R3F's own container div sets pointer-events: auto on itself,
        // which breaks the inheritance from the stage above it — and since this
        // canvas is fixed, full-width and ~viewport-tall, it was swallowing every
        // pointer event on the page: no hover on the Work rows, no clicks on links,
        // no text selection in About. Nothing in this scene is interactive (the
        // cursor is tracked by a window-level listener, not by R3F events), so the
        // canvas has no business receiving them.
        style={{ background: "transparent", pointerEvents: "none" }}
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
            <Environment
              preset={hdriPreset}
              environmentIntensity={lights.streaks * 2.4}
              environmentRotation={[0, envRotationY, 0]}
            />
          ) : (
            <ChromeClean intensity={lights.streaks} />
          )}
          {/* The central form, in 3 panel-selectable representations (Form
              switch): liquid / particles / wireframe mesh — plus the skull mesh the
              liquid hands the frame to. The scroll choreography they all follow is
              integrated ONCE, here, and only read by the forms: see formClock. */}
          <FormDriver about={about} work={work} scroll={scroll} reduced={reduced} />
          <LiquidDna reduced={reduced} />
          <MeshDna reduced={reduced} />
          {/* The two skull-sampling forms wait on an 8.9 MB glb, so they get their
              own boundary — inside the outer one they would hold the liquid (which
              needs nothing but a shader) off the screen until the model landed. */}
          <Suspense fallback={null}>
            <ChromeSkull reduced={reduced} />
            <DnaParticles reduced={reduced} />
          </Suspense>
        </Suspense>
      </Canvas>
    </div>
  );
}
