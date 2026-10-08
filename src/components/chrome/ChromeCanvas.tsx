"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import type { Group } from "three";
import type { BlobShape } from "./ChromeBlob";
import { FormDriver } from "./FormDriver";
import { ChromeTableau } from "./ChromeTableau";
import { PixelTunnel } from "./PixelTunnel";
import { TheatrePieces } from "./TheatrePieces";
import { LiquidDna } from "./LiquidDna";
import { ChromeSkull } from "./ChromeSkull";
import { DnaParticles } from "./DnaParticles";
import { StageWarmup } from "./StageWarmup";
import { stageLoad, useStageLoad } from "@/lib/stageLoad";
import { useBlobArmed } from "@/lib/blobTweak";
import { ENV_FILE } from "@/lib/formField";

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

/* -------------------------------------------------------------------------- */
/* resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * THE STAGE'S RESOLUTION CEILING — and it is the display's, deliberately.
 *
 * A DEAD END, KEPT HERE SO IT IS NOT RE-TRIED. The Hero costs per pixel and
 * nothing else (LiquidDna is one draw call of two triangles; see MARCH_STEPS
 * there), and it scales dead linear in them — 4.02 Mpx at 25–33 ms, ~6 ms per
 * megapixel on an M3 Pro. So dropping this ceiling to 1.25 halves the pixel count
 * and halves the frame time, which makes it the cheapest win on the whole page on
 * paper. It was tried, and it is wrong.
 *
 * Compared at 1:1 device pixels, 1.75 against 1.25: the specular liseré on the
 * chrome goes visibly chunky. The reasoning that justified it — "a mirror-smooth
 * blob has no high-frequency detail to resolve" — has it exactly backwards. On a
 * mirror the REFLECTIONS are the detail: thin bright edges one or two pixels wide,
 * which is precisely what resolution buys and precisely what this material is
 * made of. There is no text on the stage, but there is plenty to resolve.
 *
 * So the frame rate comes from the cost per pixel instead (MARCH_STEPS, 96 → 64,
 * for the same 2x at full resolution), and this stays at the display's.
 *
 * The floor below is only where PerformanceMonitor may take it on hardware that
 * still cannot cope — a soft blob moving is better than a sharp one stuttering.
 * That trade is worth making when the alternative is 15 fps; it is not worth
 * making pre-emptively on machines that were fine.
 */
const DPR_CEIL = 1.75;
/**
 * Phones get a shade less. Not because their screens are short of pixels — a 3x
 * phone screen has plenty — but because their fill rate is an order of magnitude
 * under a desktop GPU's, and this shader is pure fill.
 */
const DPR_CEIL_SMALL = 1.4;
const DPR_FLOOR = 0.75;

/** Resolution changes reallocate the drawing buffer, so they are quantised. */
const dprStep = (v: number) => Math.round(v * 20) / 20;

/* -------------------------------------------------------------------------- */
/* cadence                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * L'INTERVALLE MINIMUM ENTRE DEUX IMAGES pendant qu'un plan plein écran se lève — voir
 * stageLoad pour ce que cet état achète et pourquoi il existe.
 *
 * En millisecondes et non en nombre d'images sautées : « une sur trois » vaut 40 Hz sur
 * l'écran 120 Hz où ce chiffre a été réglé, et 20 Hz sur un écran 60 Hz, où c'est trop peu.
 * Un intervalle donne la même cadence partout.
 */
const CHEAP_FRAME_MS = 25;

/**
 * Le pilote de la cadence réduite : sous `frameloop="demand"`, r3f ne dessine que sur
 * `invalidate()`, et c'est cette boucle qui décide quand.
 *
 * SA BOUCLE EST UN requestAnimationFrame À ELLE, pas un useFrame — un useFrame ne
 * s'exécuterait que sur les images rendues, donc il ne pourrait pas cadencer celles qui
 * ne le sont pas. Il lui faut battre au rythme de l'écran pour n'en retenir qu'une partie.
 */
function CheapCadence({ active }: { active: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = -Infinity;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < CHEAP_FRAME_MS) return;
      last = t;
      invalidate();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, invalidate]);
  return null;
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
  /** reflection environment */
  envMode?: "clean" | "studio";
  /** rotate the HDRI to spin unwanted features out of view (radians) */
  envRotationY?: number;
};

export function ChromeCanvas({
  reactToScroll = true,
  lights = DEFAULT_LIGHTS,
  envMode = "studio",
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
  /** The ceiling this device is allowed (see DPR_CEIL), and where we currently are. */
  const ceil = useRef(DPR_CEIL);
  const [dpr, setDpr] = useState(DPR_CEIL);
  /** Whether the barcode's panel has been reached for — see below. */
  const armed = useBlobArmed();
  /**
   * Degrade under load, recover when it lifts. Quantised and clamped to this
   * device's ceiling, so a machine that copes simply sits at the ceiling and this
   * never fires at all.
   *
   * SOURD TANT QUE LA SCÈNE N'EST PAS EN RÉGIME LIBRE, et c'est indispensable depuis que
   * "cheap" bride la CADENCE plutôt que la résolution : PerformanceMonitor échantillonne
   * dans un useFrame, sa borne basse vaut 60 images/s au-dessus de 100 Hz (voir `bounds`
   * dans drei), et CHEAP_FRAME_MS en vise 40. Il lirait donc une chute là où il n'y a
   * qu'un plafond posé exprès, et dégraderait la résolution pour la durée qui suit — en
   * réallouant le tampon de dessin au pire moment, celui que tout ceci sert à protéger.
   * Le compteur interne de drei continue de tourner ; c'est l'ÉCRITURE qu'on refuse.
   */
  const onPerf = useCallback(({ factor }: { factor: number }) => {
    if (stageLoad.get() !== "live") return;
    setDpr(dprStep(DPR_FLOOR + factor * (ceil.current - DPR_FLOOR)));
  }, []);
  /** How hard this stage may work right now. The section menu turns it down while its
   *  full-screen curtain is over the page: a canvas repainting at full resolution under a
   *  moving full-screen layer starves the compositor — see stageLoad. */
  const load = useStageLoad();

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);

    // lighter GPU load on small screens
    if (window.innerWidth < 768) {
      ceil.current = DPR_CEIL_SMALL;
      setDpr(DPR_CEIL_SMALL);
    }

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
        /*
         * "never" stops the loop without unmounting anything: the scene, the geometry and
         * every uniform survive, and drawing resumes from exactly where it stopped.
         *
         * "demand" ne dessine que sur `invalidate()`, et c'est CheapCadence qui le cadence :
         * la boucle reste vivante sous le plan qui se lève, à pleine résolution, mais elle
         * cesse de produire une texture neuve à chaque image de l'écran — ce qui est
         * exactement la cause décrite dans stageLoad, et donc ce qu'il faut relâcher.
         */
        frameloop={load === "paused" ? "never" : load === "cheap" ? "demand" : "always"}
        /*
         * LA RÉSOLUTION NE DÉPEND PLUS DE `load`. Elle l'a fait, et c'était une mitigation
         * de performance qui touchait à L'IMAGE : la salle convertit des unités monde en
         * pixels pour la taille de ses grains (voir uScale dans TheatrePieces), donc un
         * changement de résolution changeait la surface additionnée du nuage et la salle
         * s'allumait le temps de la levée. Le ratio y est désormais lu sur le renderer, ce
         * qui ferme cette porte-là ; la marge se prend sur la cadence, où l'œil ne la voit
         * pas — voir CHEAP_FRAME_MS.
         */
        dpr={dpr}
        /*
         * toneMappingExposure : 0.3, DEPUIS 1.15 — et c'est un réglage GLOBAL, réglé sur
         * une seule section. Trouvé au panneau du poste (dev/poste) pendant l'étalonnage
         * du téléviseur, avec le passage de sa peau en sRGB, une désaturation à 0.36 et un
         * vernis à 1.3 : le poste demandait un quart de la lumière d'avant.
         *
         * MAIS LE BLOB DU HERO ET LE CRÂNE D'ABOUT LE SUBISSENT AUSSI — c'est le renderer,
         * pas un matériau. Si l'une de ces deux sections a l'air éteinte, c'est ici qu'il
         * faut regarder d'abord, et la sortie sera de leur donner leur propre échelle
         * (uEnvInt est déjà par-forme) plutôt que de remonter ce nombre.
         */
        gl={{ antialias: true, alpha: true, toneMappingExposure: 0.3 }}
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
        {/* Watches the real frame rate and walks the resolution down if this GPU
            cannot hold the budget — see DPR_CEIL. factor starts at 1 so a capable
            machine opens at full quality rather than climbing to it; flipflops
            stops a borderline device oscillating for ever and pins it at the
            floor instead. */}
        <PerformanceMonitor factor={1} flipflops={3} onChange={onPerf} onFallback={onPerf} />
        <CheapCadence active={load === "cheap"} />
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
              files={ENV_FILE}
              environmentIntensity={lights.streaks * 2.4}
              environmentRotation={[0, envRotationY, 0]}
            />
          ) : (
            <ChromeClean intensity={lights.streaks} />
          )}
          {/* The central form, in 2 panel-selectable representations (Form
              switch): liquid / particles — plus the skull mesh the liquid hands the
              frame to. The scroll choreography they all follow is integrated ONCE,
              here, and only read by the forms: see formClock. */}
          {/*
            FORMDRIVER MUST STAY FIRST AMONG THESE SIBLINGS. It does not just advance the
            clock, it WRITES THE CAMERA (see FormDriver), and the forms below read that
            camera in their own useFrame — LiquidDna copies it into uCamPos, ChromeTableau
            derives pxPerWorld from its z. Written after being read, they would all be a
            frame behind.

            The ordering is a real guarantee, not a hope, but it rests on THIS LINE'S
            POSITION: useFrame subscribes in a layout effect, so siblings subscribe in JSX
            order; r3f then sorts subscribers by priority, and Array.sort is stable, so
            equal priorities keep their insertion order. Every one of these uses the
            default priority 0. Move this line below a form and the camera silently lags.

            AND DO NOT REACH FOR `priority` TO MAKE THAT EXPLICIT — it is the obvious fix
            and it is a trap. r3f counts any subscription with priority > 0 as taking
            rendering into its own hands: it increments an internal flag and then skips
            `gl.render` entirely while that flag is positive. A priority here would not
            reorder the callbacks, it would black out the scene.
          */}
          <FormDriver about={about} work={work} scroll={scroll} reduced={reduced} />
          <LiquidDna reduced={reduced} />
          {/* The WORK — canvas and moulding as one morphing mesh (the skull's
              technique, applied whole): it takes the baton from the skull's reformed
              sphere and the raymarcher goes dark for the corridor. Its own boundary,
              like the skull's: it suspends on the frame's 3.5 MB glb, and inside the
              outer one it would hold the liquid off the screen until the file lands. */}
          <Suspense fallback={null}>
            <ChromeTableau reduced={reduced} />
          </Suspense>
          {/* LE CORRIDOR DE PHOSPHORE — la suite du poste, pas une forme indépendante :
              il partage le canvas du tube (voir tubeScreen.ts) et ne se montre que
              pendant la plongée (formState().dive), qu'il lit lui-même. Aucun glb, aucune
              texture chargée : rien à suspendre, donc pas de boundary à lui — un
              InstancedMesh construit sur un BoxGeometry(1,1,1) est prêt dès le premier
              rendu. */}
          <PixelTunnel />
          {/* LA SALLE, après la plongée. Elle se monte inconditionnellement, comme le
              tunnel juste au-dessus et pour la même raison : sa géométrie est calculée
              (aucun glb, aucune texture), donc rien à suspendre, et elle se cache
              elle-même tant que sa présence est nulle — un montage conditionnel
              paierait la construction de ses nuages au moment précis où le lecteur
              arrive, c'est-à-dire à l'image la plus chargée de la page. */}
          <TheatrePieces reduced={reduced} />
          {/* The skull mesh — the About section's form, so always present. */}
          {/* Its glb is ~1 MB, so it keeps its own boundary: inside the outer one it
              would hold the liquid (which needs nothing but a shader) off the
              screen until the model landed. */}
          <Suspense fallback={null}>
            <ChromeSkull reduced={reduced} />
          </Suspense>
          {/*
            THE ALTERNATIVE REPRESENTATION — particles — exists only for the barcode
            panel's Form switch, and it is MOUNTED only once that panel has been
            reached for (see blobTweak.arm).

            It would draw nothing without this gate — it bails on `fade <= 0.004` in
            its first frame — but it would pay its construction on every single page
            load, for an easter egg most visitors never open: DnaParticles runs a
            MeshSurfaceSampler over the whole skull, ~60 ms on the main thread, which
            was one of the page's two long tasks.

            Arming happens on the barcode's HOVER, i.e. a beat before the panel can
            possibly be open, so the construction lands while the cascade plays
            rather than in the middle of a form crossfade. Nothing is lost: with the
            panel unreachable, `mode` can never leave "blob".
          */}
          {armed && (
            <Suspense fallback={null}>
              <DnaParticles reduced={reduced} />
            </Suspense>
          )}
          {/* Compiles and draws once, out of sight, every form that is still hidden — so
              that no transition pays its first frame. See StageWarmup. */}
          <StageWarmup />
        </Suspense>
      </Canvas>
    </div>
  );
}
