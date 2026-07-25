"use client";

import { Component, Suspense, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useFBX } from "@react-three/drei";
import { Vector3, Quaternion, Color, DoubleSide } from "three";
import { blobTweak } from "@/lib/blobTweak";
import type {
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  WebGLProgramParametersWithUniforms,
} from "three";

type Vec2Ref = React.MutableRefObject<{ x: number; y: number }>;
type ClickRef = React.MutableRefObject<{
  fire: boolean;
  strength: number;
  ripple: number;
}>;

export type BlobShape = {
  distort: number;
  speed: number;
  freq: number;
  scale: number;
  roughness: number;
  envMapIntensity: number;
  color: string;
  pointerStrength: number;
  /** how much fast mouse movement makes the metal slosh/wobble */
  slosh: number;
  /** how much a click punches holes in the metal (0 = off) */
  clickHoles: number;
  geometry: "torusKnot" | "glb";
  glbUrl?: string;
};

type Props = {
  scroll: React.MutableRefObject<number>;
  pointer: Vec2Ref;
  click: ClickRef;
  reduced: boolean;
  /** 0 = solid blob, 1 = fully dissolved (handed over to the particle blob) */
  hover?: React.MutableRefObject<number>;
  /** share this group's transform so the particle blob can overlay it exactly */
  groupRef?: React.MutableRefObject<Group | null>;
  /** publish the live shape params so the particle blob matches the surface */
  shapeOut?: React.MutableRefObject<{ flow: number; distort: number; freq: number }>;
} & Partial<BlobShape>;

/* GLSL injected into MeshStandardMaterial's vertex program. Keeps PBR chrome
   reflections (envMap) while displacing the surface with flowing simplex noise,
   a cursor-facing bulge, and a travelling click ripple. Normals are recomputed
   from neighbour samples so reflections stay correct on the deformed skin. */
const PRELUDE = /* glsl */ `
uniform float uTime;
uniform float uFlow;
uniform float uDistort;
uniform float uFreq;
uniform float uMorph;   // 0..3 : blend across radically different shape modes
uniform float uWobble;  // slosh/kick extra
uniform vec3  uPointerDir;
uniform float uPointerStrength;
uniform vec3  uClickDir;
uniform float uRipple;
uniform float uClickStrength;
uniform float uHoleAmount;
varying float vBand;

vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 pp0 = vec3(a0.xy, h.x);
  vec3 pp1 = vec3(a0.zw, h.y);
  vec3 pp2 = vec3(a1.xy, h.z);
  vec3 pp3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(pp0,pp0), dot(pp1,pp1), dot(pp2,pp2), dot(pp3,pp3)));
  pp0 *= norm.x; pp1 *= norm.y; pp2 *= norm.z; pp3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(pp0,x0), dot(pp1,x1), dot(pp2,x2), dot(pp3,x3)));
}

vec3 vDispPos;

float fbm(vec3 p){ return snoise(p) * 0.7 + snoise(p * 2.1) * 0.3; }

// expanding ring mask around the click point (0..1), sharp enough to punch holes
float holeMask(vec3 nrm){
  float ang = acos(clamp(dot(normalize(nrm), uClickDir), -1.0, 1.0));
  return exp(-pow(ang * 3.0 - uRipple, 2.0) * 3.0);
}

// Radically different shape MODES on a unit-sphere vertex bp, blended by uMorph.
// Each mode moves the vertex differently (not just noise amplitude).
vec3 shapeBase(vec3 bp){
  vec3 n = normalize(bp);
  float fl = uFlow;

  // 0 — smooth flowing blob (domain-warped fbm)
  vec3 sp = bp * uFreq;
  vec3 wrp = sp + vec3(snoise(sp + vec3(0.0, fl, 0.0)),
                       snoise(sp + vec3(3.1, 1.7, fl * 0.6)),
                       snoise(sp + vec3(9.2, 5.3, fl * 0.4))) * 0.9;
  vec3 m0 = bp + n * (fbm(wrp) * uDistort);

  // 1 — TWIST / stretch (taffy): rotate around Y by height, elongate
  float ang = bp.y * 3.4 + fl * 0.5;
  float ca = cos(ang), sa = sin(ang);
  vec3 tw = vec3(bp.x * ca - bp.z * sa, bp.y * 1.4, bp.x * sa + bp.z * ca);
  vec3 m1 = tw + n * (fbm(bp * 1.6 + fl) * 0.16);

  // 2 — SPIKES (urchin): sharp radial thorns from thresholded noise
  float sp2 = pow(max(snoise(bp * 3.4 + vec3(fl)), 0.0), 3.0);
  vec3 m2 = bp * 0.9 + n * (0.1 + sp2 * 1.3);

  // 3 — MELT: big, low-freq, stretched-down smooth mass
  vec3 md = bp * 1.2;
  md.y -= smoothstep(0.0, -1.0, bp.y) * 0.35;
  vec3 m3 = md + n * (snoise(bp * 0.7 + vec3(0.0, fl * 0.5, 0.0)) * 0.14);

  vec3 r;
  if (uMorph < 1.0) r = mix(m0, m1, smoothstep(0.0, 1.0, uMorph));
  else if (uMorph < 2.0) r = mix(m1, m2, smoothstep(0.0, 1.0, uMorph - 1.0));
  else r = mix(m2, m3, smoothstep(0.0, 1.0, uMorph - 2.0));
  return r;
}

// pointer bulge + click ripple + slosh, added along the base normal
float extraDisp(vec3 nrm){
  float d = 0.0;
  float aim = max(dot(normalize(nrm), uPointerDir), 0.0);
  d += pow(aim, 3.0) * uPointerStrength;
  if (uClickStrength > 0.001) {
    float ang = acos(clamp(dot(normalize(nrm), uClickDir), -1.0, 1.0));
    d += exp(-pow(ang * 3.0 - uRipple, 2.0) * 2.5) * uClickStrength * 0.5;
  }
  d += fbm(nrm * 1.5 + vec3(uFlow)) * uWobble;
  return d;
}
`;

const NORMAL_BLOCK = /* glsl */ `
vec3 objectNormal = vec3(normal);
{
  vec3 n0 = normalize(position);
  vec3 p0 = shapeBase(position);
  vec3 tang = normalize(cross(n0, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
  vec3 bitang = normalize(cross(n0, tang));
  float e = 0.05;
  vec3 da = shapeBase(normalize(position + tang * e));
  vec3 db = shapeBase(normalize(position + bitang * e));
  vec3 nn = normalize(cross(da - p0, db - p0));
  if(dot(nn, n0) < 0.0) nn = -nn;
  vDispPos = p0 + n0 * extraDisp(n0);
  objectNormal = nn;
  vBand = holeMask(n0) * uClickStrength * uHoleAmount;
}
`;

export function ChromeBlob({
  scroll,
  pointer,
  click,
  reduced,
  hover,
  groupRef,
  shapeOut,
  distort = 0.3,
  speed = 0.5,
  scale = 1.7,
  freq = 0.4,
  roughness = 0.12,
  envMapIntensity = 1.05,
  color = "#cbccca",
  pointerStrength = 0.24,
  slosh = 0.4,
  clickHoles = 0.7,
  geometry = "torusKnot",
  glbUrl,
}: Props) {
  const internalGroup = useRef<Group>(null);
  const group = groupRef ?? internalGroup;
  const mat = useRef<MeshStandardMaterial>(null);
  const wireMat = useRef<MeshStandardMaterial>(null);
  const fillMesh = useRef<Mesh>(null);
  const wireMesh = useRef<Mesh>(null);
  const surfaceP = useRef(1); // eased presence of the surface (blob + wire share it)
  const wireMix = useRef(0); // eased 0 = filled, 1 = wireframe
  const rot = useRef({ x: 0, y: 0 });
  const kick = useRef(0);
  const lastColor = useRef("");
  const prevP = useRef({ x: 0, y: 0 });
  const sloshV = useRef(0);
  const flowV = useRef(0); // continuous flow phase (never modulate time*speed)
  const morphV = useRef(0); // eased 0..3 shape-mode position (scroll-scrubbed)

  // uniforms object is stable; values are mutated live in useFrame
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDistort: { value: distort },
      uFreq: { value: freq },
      uFlow: { value: 0 },
      uMorph: { value: 0 },
      uWobble: { value: 0 },
      uPointerDir: { value: new Vector3(0, 0, 1) },
      uPointerStrength: { value: 0 },
      uClickDir: { value: new Vector3(0, 0, 1) },
      uRipple: { value: 0 },
      uClickStrength: { value: 0 },
      uHoleAmount: { value: 0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // scratch objects (never allocate in the frame loop)
  const scratch = useMemo(
    () => ({ wp: new Vector3(), op: new Vector3(), q: new Quaternion() }),
    []
  );

  const onBeforeCompile = useMemo(
    () => (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${PRELUDE}`)
        .replace("#include <beginnormal_vertex>", NORMAL_BLOCK)
        .replace("#include <begin_vertex>", "vec3 transformed = vDispPos;");
      // fragment: punch holes where the click ring passes
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vBand;")
        .replace(
          "#include <clipping_planes_fragment>",
          "#include <clipping_planes_fragment>\n  if (vBand > 0.4) discard;"
        );
    },
    [uniforms]
  );

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    uniforms.uTime.value = t;
    uniforms.uHoleAmount.value = reduced ? 0 : clickHoles;
    // live overrides from the custom control panel (see ControlPanel / blobTweak)
    const tw = blobTweak.get();

    // ---- scroll-scrubbed shape MODE (0..3): smooth → twist → spikes → melt ----
    const sp = Math.max(0, Math.min(1, scroll.current));
    const morphTarget = sp * 3; // 4 modes
    const ms = reduced ? 1 : 1 - Math.pow(0.1, delta);
    morphV.current += (morphTarget - morphV.current) * ms;
    uniforms.uMorph.value = morphV.current;
    uniforms.uFreq.value = tw.freq;
    uniforms.uDistort.value = tw.distort;

    // live material tuning (dev controls + custom panel)
    if (mat.current) {
      mat.current.envMapIntensity = envMapIntensity;
      if (tw.color !== lastColor.current) {
        mat.current.color = new Color(tw.color);
        if (wireMat.current) wireMat.current.color = new Color(tw.color);
        lastColor.current = tw.color;
      }
    }
    if (wireMat.current) wireMat.current.envMapIntensity = envMapIntensity;

    // ---- fluid blob ↔ wireframe (+ particles handled in ParticleBlob) ----
    // The surface is shared between blob & wire; `wireMix` cross-dissolves its
    // render style in TWO PHASES so it never ghosts: the wireframe emerges over
    // the filled surface first, then the fill melts away (and the reverse).
    const hv = hover ? hover.current : 0;
    const surfaceTarget =
      tw.mode === "particles" ? 0 : tw.mode === "blob" ? 1 - hv : 1;
    const wireTarget = tw.mode === "wire" ? 1 : 0;
    const er = reduced ? 1 : 1 - Math.pow(0.02, delta); // smoother settle
    surfaceP.current += (surfaceTarget - surfaceP.current) * er;
    wireMix.current += (wireTarget - wireMix.current) * er;
    const ss = (e0: number, e1: number, x: number) => {
      const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return u * u * (3 - 2 * u);
    };
    const fp = surfaceP.current * (1 - ss(0.35, 1, wireMix.current));
    const wp = surfaceP.current * ss(0, 0.65, wireMix.current);
    if (mat.current) {
      mat.current.opacity = fp;
      mat.current.depthWrite = true; // stable (no mid-fade flip → no flash)
    }
    if (wireMat.current) {
      wireMat.current.opacity = wp;
      wireMat.current.depthWrite = false;
    }
    if (fillMesh.current) fillMesh.current.visible = fp > 0.003;
    if (wireMesh.current) wireMesh.current.visible = wp > 0.003;

    if (reduced) {
      g.rotation.set(0.2, 0.7, -0.15);
      // flow not advanced → frozen
      uniforms.uWobble.value = 0;
      uniforms.uPointerStrength.value = 0;
      uniforms.uClickStrength.value = 0;
      g.scale.setScalar(scale);
      if (mat.current) mat.current.roughness = tw.roughness;
      if (wireMat.current) wireMat.current.roughness = tw.roughness;
      if (shapeOut) {
        shapeOut.current.flow = flowV.current;
        shapeOut.current.distort = distort;
        shapeOut.current.freq = freq;
      }
      return;
    }

    const s = scroll.current;
    const p = pointer.current;

    // ---- mouse velocity → slosh (the liquid reacts to being shaken) ----
    const dx = p.x - prevP.current.x;
    const dy = p.y - prevP.current.y;
    prevP.current.x = p.x;
    prevP.current.y = p.y;
    const mvel = Math.min(Math.hypot(dx, dy) / Math.max(delta, 0.001), 6);
    const sloshTarget = Math.min(mvel * 0.09, 1);
    // quick (but not instant) attack, slow release (settles)
    const sRate =
      sloshTarget > sloshV.current
        ? 1 - Math.pow(0.02, delta)
        : 1 - Math.pow(0.25, delta);
    sloshV.current += (sloshTarget - sloshV.current) * sRate;
    const sl = sloshV.current * slosh;
    // advance a CONTINUOUS flow phase — never modulate time*speed (phase jumps)
    flowV.current += delta * (tw.speed + sl * 2.0);
    uniforms.uFlow.value = flowV.current;
    uniforms.uWobble.value = sl * 0.3 + kick.current * 0.2;
    if (shapeOut) {
      shapeOut.current.flow = flowV.current;
      shapeOut.current.distort = tw.distort;
      shapeOut.current.freq = tw.freq;
    }

    // ---- rotation: idle drift + pointer steer + strong scroll-scrub spin ----
    const targetY = t * 0.08 + p.x * 0.5 + s * Math.PI * 1.6;
    const targetX = Math.sin(t * 0.14) * 0.1 - p.y * 0.35 - s * 0.9;
    const k = 1 - Math.pow(0.0018, delta);
    rot.current.y += (targetY - rot.current.y) * k;
    rot.current.x += (targetX - rot.current.x) * k;
    g.rotation.set(rot.current.x, rot.current.y, Math.cos(t * 0.1) * 0.05);

    // ---- pointer bulge: world dir -> object space (anchored to screen) ----
    scratch.wp.set(p.x, -p.y, 1.1).normalize();
    scratch.q.copy(g.quaternion).invert();
    scratch.op.copy(scratch.wp).applyQuaternion(scratch.q);
    uniforms.uPointerDir.value.copy(scratch.op);
    uniforms.uPointerStrength.value +=
      (pointerStrength + sl * 0.15 - uniforms.uPointerStrength.value) *
      (1 - Math.pow(0.02, delta));

    // ---- click ripple + scale kick ----
    const c = click.current;
    if (c.fire) {
      c.fire = false;
      c.strength = 1;
      c.ripple = 0;
      uniforms.uClickDir.value.copy(uniforms.uPointerDir.value);
      kick.current = 1;
    }
    if (c.strength > 0.001) {
      c.ripple += delta * 7;
      c.strength *= Math.exp(-delta * 2.1);
      uniforms.uRipple.value = c.ripple;
      uniforms.uClickStrength.value = c.strength;
    } else {
      uniforms.uClickStrength.value = 0;
    }

    // scale kick eases back to 1; brief roughness dip = spec flash
    kick.current *= Math.exp(-delta * 4.5);
    const sc = scale * (1 + kick.current * 0.06);
    g.scale.setScalar(sc);
    // brief sharpen (spec flash) on click
    const rgh = Math.max(0.01, tw.roughness - kick.current * 0.05);
    if (mat.current) mat.current.roughness = rgh;
    if (wireMat.current) wireMat.current.roughness = rgh;
  });

  // solid fill material (used for the mesh + any GLB geometry)
  const material = (
    <meshStandardMaterial
      ref={mat}
      metalness={1}
      roughness={roughness}
      envMapIntensity={envMapIntensity}
      color={color}
      side={DoubleSide}
      transparent
      onBeforeCompile={onBeforeCompile}
    />
  );

  // Two overlaid meshes sharing the same displacement (same onBeforeCompile →
  // same uniforms): a solid fill and a wireframe. Crossfading their opacities
  // gives a fluid fill ↔ wireframe transition (a boolean can't be tweened).
  const knot = (
    <>
      <mesh ref={fillMesh} frustumCulled={false}>
        <icosahedronGeometry args={[1, 64]} />
        {material}
      </mesh>
      {/* slightly larger so it sits just outside the fill → no z-fighting */}
      <mesh ref={wireMesh} scale={1.004} frustumCulled={false} visible={false}>
        <icosahedronGeometry args={[1, 64]} />
        <meshStandardMaterial
          ref={wireMat}
          metalness={0.6}
          roughness={0.35}
          envMapIntensity={envMapIntensity}
          color={color}
          emissive="#565a63"
          emissiveIntensity={0.14}
          side={DoubleSide}
          transparent
          wireframe
          opacity={0}
          onBeforeCompile={onBeforeCompile}
        />
      </mesh>
    </>
  );

  return (
    <group ref={group} scale={scale}>
      {geometry === "glb" && glbUrl ? (
        <GlbErrorBoundary fallback={knot}>
          <Suspense fallback={knot}>
            <ModelGeometry url={glbUrl}>{material}</ModelGeometry>
          </Suspense>
        </GlbErrorBoundary>
      ) : (
        knot
      )}
    </group>
  );
}

/** Normalise any object3D's first mesh geometry to unit radius. */
function normalizeGeometry(root: {
  traverse: (cb: (o: object) => void) => void;
}): BufferGeometry | null {
  let found: BufferGeometry | null = null;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!found && m.isMesh && m.geometry) found = m.geometry as BufferGeometry;
  });
  if (!found) return null;
  const g = (found as BufferGeometry).clone();
  g.center();
  g.computeBoundingSphere();
  const r = g.boundingSphere?.radius || 1;
  g.scale(1 / r, 1 / r, 1 / r);
  g.computeVertexNormals();
  return g;
}

/** Dispatch by extension: .fbx → FBXLoader (like the CodePen), else glTF. */
function ModelGeometry({ url, children }: { url: string; children: ReactNode }) {
  const isFbx = /\.fbx(\?|$)/i.test(url);
  return isFbx ? (
    <FbxGeometry url={url}>{children}</FbxGeometry>
  ) : (
    <GltfGeometry url={url}>{children}</GltfGeometry>
  );
}

function GltfGeometry({ url, children }: { url: string; children: ReactNode }) {
  const { scene } = useGLTF(url);
  const geo = useMemo(() => normalizeGeometry(scene), [scene]);
  if (!geo) return null;
  return (
    <mesh geometry={geo} frustumCulled={false}>
      {children}
    </mesh>
  );
}

function FbxGeometry({ url, children }: { url: string; children: ReactNode }) {
  const fbx = useFBX(url);
  const geo = useMemo(() => normalizeGeometry(fbx), [fbx]);
  if (!geo) return null;
  return (
    <mesh geometry={geo} frustumCulled={false}>
      {children}
    </mesh>
  );
}

/** Falls back to the procedural knot if the .glb is missing or fails to load. */
class GlbErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
