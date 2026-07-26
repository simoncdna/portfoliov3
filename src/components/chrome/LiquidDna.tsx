"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEnvironment } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Color, Matrix3, ShaderMaterial, Vector2, Vector3, Vector4 } from "three";
import type { Mesh } from "three";
import { blobTweak, DISTORT_MAX, FORM_RADIUS } from "@/lib/blobTweak";
import { CHROME_SHADE, ENV_INTENSITY, ENV_ROT_Y } from "@/lib/formField";
import { SHAPE_SDF } from "@/lib/formShapes";
import { formState } from "@/lib/formClock";

type Props = {
  reduced?: boolean;
};

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3  uCamPos;
uniform mat3  uCamRot;
uniform vec2  uTanHalf;   // tan(fov/2) * (aspect, 1)
uniform float uTime;
uniform float uPres;      // 0..1 blob → DNA
uniform float uSpin;      // helix rotation (rad)
uniform float uDock;      // world x offset
uniform float uScale;     // global grow/shrink (section exit choreography)
uniform float uFade;
uniform float uRough;     // 0 = mirror, higher = duller (panel)
uniform float uDistort;   // living-noise amplitude (panel)
uniform float uFreq;      // living-noise frequency (panel)
uniform vec3  uStretch;   // hovered project: silhouette proportions
uniform float uMoodD;     // hovered project: x amplitude
uniform float uMoodF;     // hovered project: x lump size
uniform float uSpike;     // hovered project: radial thorns
uniform vec4  uShape;     // hovered project: how much of each bespoke field is
                          // mixed in — gavel / camera / burger / vase, in SHAPES order
uniform sampler2D uEnv;
uniform float uEnvInt;
uniform float uEnvRot;
uniform vec3 uLo;
uniform vec3 uHi;

// ---------- noise (simplex) ----------
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

// 2 octaves — same mix as the old vertex-displaced blob, so the surface reads
// with detail at two scales instead of one smooth simplex lobe.
float fbm(vec3 p){ return snoise(p) * 0.7 + snoise(p * 2.1) * 0.3; }

// ---------- shape constants ----------
const float BR = ${FORM_RADIUS.toFixed(2)};  // blob radius (shared, see blobTweak)

${SHAPE_SDF}

// Domain-warped fbm, ported from the old vertex-displaced blob: the noise field
// is itself displaced by noise (offsets larger than the domain), which is what
// produced the stringy asymmetric "liquid" lobes rather than regular bumps.
// Dividing p by BR renormalises to the old unit-sphere noise space so uFreq maps
// to the same feature size, and the amplitude scales with BR so uDistort stays a
// fraction of the radius (it used to be an absolute world offset → 4x weaker).
//
// uStretch / uMoodD / uMoodF / uSpike are the hovered project's silhouette (see
// workHover): the field is scaled anisotropically, its lumps are scaled in
// amplitude and in size, and it can grow thorns. Every project is therefore the
// SAME blob with its parameters moved, which is what lets one melt into the next
// instead of cutting to it — and the multipliers multiply the panel's values
// rather than replacing them, so the panel still governs the base look.
float sdBlob(vec3 p){
  // Anisotropic scaling is not an isometry, so the field it returns is no longer a
  // true distance — it overestimates by at most the largest scale factor. Dividing
  // the result by that factor (i.e. multiplying by the smallest reciprocal) keeps
  // it conservative, which is all the raymarcher needs.
  vec3 q = p / uStretch;
  float lip = min(1.0, min(uStretch.x, min(uStretch.y, uStretch.z)));
  float amp = uDistort * uMoodD;
  vec3 sp = (q / BR) * uFreq * uMoodF;
  vec3 wrp = sp + vec3(snoise(sp + vec3(0.0, uTime * 0.30, 0.0)),
                       snoise(sp + vec3(3.1, 1.7, uTime * 0.18)),
                       snoise(sp + vec3(9.2, 5.3, uTime * 0.12))) * 0.9;
  float d = length(q) - (BR + fbm(wrp) * amp * BR);
  // Thorns: thresholded noise, so it is smooth almost everywhere and spikes only
  // where the noise crests. Skipped entirely when the dial is down — it is a
  // uniform, so the branch is coherent across the whole draw.
  if (uSpike > 0.001) {
    float th = pow(max(snoise(q * (2.6 / BR) + vec3(uTime * 0.22)), 0.0), 3.0);
    d -= th * uSpike * BR;
  }
  return d * lip;
}

// full scene SDF (the resting blob + living flow)
float map(vec3 wp){
  // into local space: undock + unspin
  vec3 p = wp - vec3(uDock, 0.0, 0.0);
  float c = cos(uSpin), s = sin(uSpin);
  p = vec3(c*p.x - s*p.z, p.y, s*p.x + c*p.z);
  p /= uScale;                 // global grow/shrink for the section exit
  // The blob, with the hovered project's object mixed into it — see shapeField.
  float d = shapeField(p, uShape, sdBlob(p));
  // living surface flow (ripples), stronger once assembled. The 0.55 keeps this
  // term at its previous absolute amplitude now that uDistort is no longer
  // pre-scaled on the JS side.
  float flow = snoise(p * 1.6 + vec3(uTime * 0.5, uTime * 0.35, 0.0)) * uDistort * 0.55 * (0.25 + 0.35 * uPres);
  d -= flow;
  return d * uScale;
}
// 4-tap tetrahedron gradient instead of 6-tap central differences: same normal
// quality, two fewer map() evaluations (i.e. 12 fewer noise fetches per pixel).
vec3 calcNormal(vec3 p){
  vec2 k = vec2(1.0, -1.0);
  float e = 0.0015;
  return normalize(k.xyy * map(p + k.xyy*e) +
                   k.yyx * map(p + k.yyx*e) +
                   k.yxy * map(p + k.yxy*e) +
                   k.xxx * map(p + k.xxx*e));
}
${CHROME_SHADE}

void main(){
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamRot * vec3(ndc * uTanHalf, -1.0));
  vec3 ro = uCamPos;

  // Analytic bounding sphere first. The quad is fullscreen but the form covers a
  // fraction of it, so without this the majority of pixels marched through empty
  // space — paying full noise cost — only to miss. Rays that cannot reach the
  // form now discard before a single noise fetch, and rays that can start at the
  // sphere instead of creeping there from the camera. The margin covers the flow
  // ripple on top of the noise-displaced radius.
  // The margin now also has to cover the silhouette: the widest stretch axis, the
  // hovered project's lump amplitude and its thorns. Under-covering it would clip
  // the form's outline against an invisible sphere.
  // …and, when a project's object is mixed in, whichever of the two reaches
  // further: the shapes are scaled to read at a similar size, which puts their
  // tips past the noise-displaced blob's own radius.
  float wide = max(uStretch.x, max(uStretch.y, uStretch.z));
  float shaped = max(max(uShape.x, uShape.y), max(uShape.z, uShape.w));
  float bRad = uScale * max(BR * wide * (1.0 + uDistort * uMoodD + uSpike) + 0.6,
                            shaped * (SHAPE_REACH + 0.5));
  vec3  bc  = vec3(uDock, 0.0, 0.0) - ro;
  float tca = dot(bc, rd);
  float dc2 = dot(bc, bc) - tca * tca;
  float r2  = bRad * bRad;
  if (dc2 > r2) discard;
  float thc  = sqrt(r2 - dc2);
  float t    = max(tca - thc, 0.0);
  float tMax = tca + thc;

  // The warped-fbm displacement makes map() overestimate the true distance (a
  // subtracted noise is not a distance field), so the step needs a safety factor
  // or rays punch through the surface and speckle it. Rather than guess one,
  // derive it from a bound on the field's gradient: the radial term contributes
  // 1.0, and the noise term contributes amplitude (uDistort*BR) x fbm slope
  // (≈2.7) x warp slope (≈2.8) x domain scale (uFreq/BR) — the BR cancels, so
  // it collapses to uDistort * 7.5 * uFreq. Both are uniforms, so this costs
  // nothing and adapts: gentle settings march in big strides while a maxed-out
  // dial automatically creeps (~0.2) instead of speckling. The +1.1 is the flow
  // ripple, whose frequency is fixed rather than tied to uFreq — without it,
  // uFreq at 0 would wrongly look like a clean sphere and step straight through.
  // The hovered silhouette enters the same bound: its multipliers scale both the
  // amplitude and the domain, and thorns are steep by construction (a cubed
  // threshold), so they get a term of their own — a spiky project marches in
  // smaller strides rather than speckling.
  float stepK = 1.0 / (1.0 + uDistort * uMoodD * (7.5 * uFreq * uMoodF + 1.1) + uSpike * 9.0);
  float d = 0.0;
  bool hit = false;
  for (int i = 0; i < 96; i++){
    d = map(ro + rd * t);
    if (d < 0.0015) { hit = true; break; }
    t += d * stepK;
    if (t > tMax) break;
  }
  if (!hit) discard;

  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  gl_FragColor = vec4(chromeShade(n, rd), uFade);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;

export function LiquidDna({ reduced }: Props) {
  const { camera, size } = useThree();
  const envMap = useEnvironment({ preset: "studio" });
  const meshRef = useRef<Mesh>(null);
  const appear = useRef(0); // load-in fade (the liquid is the permanent hero form)
  const modeVis = useRef(1); // eased visibility for the "blob" (liquid) form mode
  const colScratch = useMemo(() => new Color(), []);

  const { geometry, material } = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3)
    );
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const material = new ShaderMaterial({
      uniforms: {
        uCamPos: { value: new Vector3() },
        uCamRot: { value: new Matrix3() },
        uTanHalf: { value: new Vector2() },
        uTime: { value: 0 },
        uPres: { value: 0 },
        uSpin: { value: 0 },
        uDock: { value: 0 },
        uScale: { value: 1 },
        uFade: { value: 0 },
        uRough: { value: 0.12 },
        uDistort: { value: 0.25 },
        uFreq: { value: 0.5 },
        uStretch: { value: new Vector3(1, 1, 1) },
        uMoodD: { value: 1 },
        uMoodF: { value: 1 },
        uSpike: { value: 0 },
        uShape: { value: new Vector4() },
        uEnv: { value: null },
        uEnvInt: { value: ENV_INTENSITY },
        uEnvRot: { value: ENV_ROT_Y },
        uLo: { value: new Vector3(0.5, 0.5, 0.5) },
        uHi: { value: new Vector3(0.98, 0.98, 0.95) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    return { geometry, material };
  }, []);

  useFrame((_, delta) => {
    const u = material.uniforms;
    const tw = blobTweak.get();

    // clock, turntable and scroll position all come from the shared form clock —
    // the liquid keeps no animation state of its own, so it cannot drift out of
    // phase with the skull mesh it hands the frame over to.
    const s = formState();

    // fade in on load; only visible while the panel's Form is "blob" (liquid)
    appear.current += (1 - appear.current) * (1 - Math.pow(0.04, delta));
    const modeTarget = tw.mode === "blob" ? 1 : 0;
    modeVis.current += (modeTarget - modeVis.current) * (1 - Math.pow(0.06, delta));

    // The liquid is the resting form only: as About arrives it hands the frame to
    // ChromeSkull (which is still drawing this same sphere at that point) and
    // fades out. It comes back when About recedes, or when the exit choreography
    // dips the form back to a sphere on the way to Work.
    const fade = (reduced ? 1 : appear.current) * modeVis.current * (1 - s.handover);
    u.uFade.value = fade;
    if (meshRef.current) meshRef.current.visible = fade > 0.004;
    if (fade <= 0.004) return;

    u.uTime.value = s.time;
    u.uPres.value = s.pres;
    u.uDock.value = s.dock;
    u.uScale.value = s.scale;
    u.uSpin.value = s.spin;

    // panel-driven material: colour → tint, roughness, distort/freq → living noise
    colScratch.set(tw.color);
    (u.uHi.value as Vector3).set(colScratch.r, colScratch.g, colScratch.b);
    (u.uLo.value as Vector3).set(colScratch.r * 0.5, colScratch.g * 0.5, colScratch.b * 0.5);
    u.uRough.value = tw.roughness;
    // panel 0..1 → 0..DISTORT_MAX, a fraction of the radius (sdBlob scales it by
    // BR itself) like the old blob did. 0 in the panel → perfectly smooth.
    u.uDistort.value = tw.distort * DISTORT_MAX;
    u.uFreq.value = tw.freq;
    // hovered project → silhouette (eased in the shared clock, see workHover)
    (u.uStretch.value as Vector3).set(s.mood.sx, s.mood.sy, s.mood.sz);
    u.uMoodD.value = s.mood.distort;
    u.uMoodF.value = s.mood.freq;
    u.uSpike.value = s.mood.spike;
    const sh = s.mood.shapes;
    (u.uShape.value as Vector4).set(sh.gavel, sh.camera, sh.burger, sh.vase);
    u.uEnv.value = envMap;

    const fov = (camera as { fov?: number }).fov ?? 42;
    const tanHalf = Math.tan((fov * Math.PI) / 180 / 2);
    (u.uTanHalf.value as Vector2).set(tanHalf * (size.width / size.height), tanHalf);
    (u.uCamPos.value as Vector3).copy(camera.position);
    (u.uCamRot.value as Matrix3).setFromMatrix4(camera.matrixWorld);
  });

  return <mesh ref={meshRef} frustumCulled={false} renderOrder={999} geometry={geometry} material={material} visible={false} />;
}
