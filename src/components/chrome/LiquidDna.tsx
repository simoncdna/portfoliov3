"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEnvironment } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  Matrix3,
  ShaderMaterial,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import type { Mesh, Texture } from "three";
import { blobTweak, DISTORT_MAX, FORM_RADIUS } from "@/lib/blobTweak";
import { CHROME_SHADE, ENV_FILE, ENV_INTENSITY, ENV_ROT_Y } from "@/lib/formField";
import { SHAPE_SDF } from "@/lib/formShapes";
import { PHOTO_SHADE, PLATE_ASP0, PLATE_H, PLATE_SDF, PLATE_T } from "@/lib/formPhoto";
import { PLATE_LOOK } from "@/lib/plateLook";
import { formState } from "@/lib/formClock";
import { works } from "@/data/site";

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
uniform vec2  uDock;      // world x/y offset
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
uniform float uFlat;      // 0 = the sphere, 1 = the flat 16:9 photographic plate
uniform float uRelief;    // how hard the flattened sheet undulates (world units)
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
${PLATE_SDF}

/** Where slot i's centre is in WORLD space — for its bounding sphere. Undoes exactly
    what toLocal does: scale, then the turntable's rotation the other way, then the dock. */
vec3 slotWorld(float i){
  vec3 v = plateSlot(i) * uScale;
  float c = cos(uSpin), s = sin(uSpin);
  return vec3(uDock, 0.0) + vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

/**
 * Grow the march's [t0, t1] interval by a bounding sphere, if this ray meets it.
 *
 * The form is no longer ONE object — a flattened strip is several sheets a screen apart —
 * so the analytic bound has to be a union of spheres rather than a single one. t1 < 0
 * means "nothing bounded yet", which is also the caller's discard test: a ray that meets
 * none of the spheres has not paid for a single noise fetch.
 */
void span(vec3 c, float rad, vec3 ro, vec3 rd, inout float t0, inout float t1){
  vec3 bc = c - ro;
  float tca = dot(bc, rd);
  float dc2 = dot(bc, bc) - tca * tca;
  float r2 = rad * rad;
  if (dc2 > r2) return;
  float thc = sqrt(r2 - dc2);
  float b = tca + thc;
  if (b <= 0.0) return;                  // wholly behind the camera
  float a = max(tca - thc, 0.0);
  if (t1 < 0.0) { t0 = a; t1 = b; return; }
  t0 = min(t0, a);
  t1 = max(t1, b);
}

// Domain-warped fbm, ported from the old vertex-displaced blob: the noise field
// is itself displaced by noise (offsets larger than the domain), which is what
// produced the stringy asymmetric "liquid" lobes rather than regular bumps.
// Dividing p by BR renormalises to the old unit-sphere noise space so uFreq maps
// to the same feature size, and the amplitude scales with BR so uDistort stays a
// fraction of the radius (it used to be an absolute world offset → 4x weaker).
//
// uStretch / uMoodD / uMoodF / uSpike are the hovered project's silhouette (see
// workPlate): the field is scaled anisotropically, its lumps are scaled in
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

// World → the form's own space: undock, unspin, unscale. Factored out of map()
// because the shading needs it too — the photograph's UV is read off the LOCAL hit
// point, so the picture is carried by the surface the marcher actually found.
vec3 toLocal(vec3 wp){
  vec3 p = wp - vec3(uDock, 0.0);
  float c = cos(uSpin), s = sin(uSpin);
  p = vec3(c*p.x - s*p.z, p.y, s*p.x + c*p.z);
  return p / uScale;           // global grow/shrink for the section exit
}
/** Same rotation, no translation or scale — for directions (the surface normal). */
vec3 dirToLocal(vec3 v){
  float c = cos(uSpin), s = sin(uSpin);
  return vec3(c*v.x - s*v.z, v.y, s*v.x + c*v.z);
}

// full scene SDF (the resting blob + living flow)
//
// Every branch below is on a UNIFORM, so it is coherent across the whole draw — the GPU
// takes one side for every pixel of the frame, and the skipped work costs nothing at all.
// That matters here more than anywhere else in the file: this function runs up to 96 times
// per pixel for the march, then four more for the normal.
float map(vec3 wp){
  vec3 p = toLocal(wp);
  // Once the metal is fully rolled out, the blob is mixed out of the result entirely —
  // and it was still being evaluated, at five noise fetches a step, for a contribution of
  // zero. That is the whole steady state of the Work section, which is where the section
  // spends nearly all of its time.
  if (uFlat > 0.999) return plateStrip(p, uRelief) * uScale;

  // The blob, with the hovered project's object mixed into it — see shapeField…
  float d = shapeField(p, uShape, sdBlob(p));
  // …and flattened toward the photographic plate, which is the Work section's whole
  // subject. Last, so the plate wins over both: at uFlat = 1 the field IS the sheet.
  d = plateField(p, uFlat, uRelief, d);
  // Living surface flow (ripples), stronger once assembled. The 0.55 keeps this term at
  // its previous absolute amplitude now that uDistort is no longer pre-scaled on the JS
  // side. Faded out as the plate flattens: on a sheet carrying a photograph this is one
  // more thing deforming the picture, and the wave is supposed to be the only one.
  float flow = snoise(p * 1.6 + vec3(uTime * 0.5, uTime * 0.35, 0.0))
             * uDistort * 0.55 * (0.25 + 0.35 * uPres) * (1.0 - uFlat);
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
${PHOTO_SHADE}

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
  float t = 0.0, tMax = -1.0;
  span(vec3(uDock, 0.0), bRad, ro, rd, t, tMax);

  // Once the metal flattens, the plate gets a sphere of its own — ONE: a single sheet
  // exists now (see plateStrip), so a single bound covers it, and rays that meet neither
  // it nor the blob's sphere still discard before a noise fetch.
  if (uFlat > 0.001) {
    float i = plateNear();
    float pRad = uScale * uFlat * (length(slotHalf(i)) * slotScale(i) + 0.4);
    span(slotWorld(i), pRad, ro, rd, t, tMax);
  }
  if (tMax < 0.0) discard;

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
  // The plate's relief is subtracted from an otherwise exact box, so it enters the
  // same bound on its own terms: amplitude (uRelief) x fbm slope (~2.7) x warp slope
  // (~2.8) x its domain scale (1.6 uFreq) ≈ uRelief * 12 * uFreq, plus a constant
  // for the fixed-frequency flow. A boiling changeover therefore creeps and a settled
  // plate strides, without a dial to keep in sync.
  // …and the cloth is a domain shift in depth, which over-reports by its own gradient —
  // proportional to the wave's amplitude, hence uFlagAmp in the bound rather than a constant:
  // a sheet that has been calmed flat (the hover) marches in full strides again, and the
  // figure follows the dev panel's dial instead of having to be kept in sync with it.
  float stepK = 1.0 / (1.0 + uDistort * uMoodD * (7.5 * uFreq * uMoodF + 1.1) + uSpike * 9.0
                           + uFlat * (uRelief * (12.0 * uFreq + 1.2) * (1.0 - uFlag)
                                      + uFlag * uFlagAmp * 4.0));
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
  vec3 col = chromeShade(n, rd);

  // THE MIRROR: the photograph lives IN the metal. No plate — the picture is sampled
  // off the surface's own normals (matcap mapping, in the camera's frame: the camera
  // is axis-aligned, so world xy IS view xy), which is what makes it swim with the
  // living noise and turn with the turntable's light: the blob does not display the
  // photograph, it REFLECTS it. Held to the form's face and fading to bare chrome at
  // the rim, where the fresnel belongs — the picture floats in the metal, the metal
  // keeps its edges.
  if (uPhotoOn > 0.002) {
    float slot = floor(uCar + 0.5);
    if (photoHas(slot) > 0.5) {
      // Cover-fit into the normal's disc: the shorter axis of the photograph maps the
      // whole ±1 of the normal, the longer is centre-cropped — no stretch either way.
      float asp = max(0.01, uAspNow);
      vec2 fit = asp >= 1.0 ? vec2(1.0 / asp, 1.0) : vec2(1.0, asp);
      vec2 uv = 0.5 + (n.xy * 0.62) * fit;
      float facing = smoothstep(0.05, 0.55, n.z);
      // photoShade brings the whole print pipeline with it — the developer's grain,
      // the exposure coming up, the hover's colour (uColour is already the hover) —
      // and the facing term keeps the blend inside the face.
      col = mix(col, photoShade(col, n, uv, 1.0, photoTone(slot, uv, uColour)), facing);
    }
  }

  gl_FragColor = vec4(col, uFade);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;

/**
 * The widest the WIDEST picture may get, as a fraction of the half-width the camera can see.
 *
 * Only ever a CEILING (see uPlateK): on any landscape window the plate's own size binds first
 * and this does nothing. It exists for the portrait case, where the visible world width
 * collapses and the plate would otherwise be cropped by the edges of the screen. 0.92 leaves a
 * little air rather than bleeding to the edge, since the notches still have to sit somewhere.
 */
const PLATE_FILL = 0.92;

/**
 * How much the picture being read steps forward while its name is pointed at.
 *
 * A tenth: enough to feel answered, and well inside the gap the strip is packed with, so the
 * picture grows into its own air rather than into its neighbour's.
 */
const PLATE_GROW = 0.1;

/*
 * THERE IS NO FLATNESS WINDOW FOR THE PICTURE ANY MORE. It used to open at 20% of
 * flatness — "the blob literally becomes the photograph" — and that was the confusion the
 * redesign removed: the image surfaced while the matter was still raging, two events on
 * top of each other, neither readable. The photograph now rises on the clock's own `dev`
 * (see formClock), which does not start until the plate is EXACTLY flat: the metal
 * settles, chrome and still, then the print comes up like a tirage in the developer.
 */

/**
 * How hard the roll-out's peak overloads the silhouette: the pulse (flat·(1−flat)·4, see
 * formClock) multiplies the project's distort and adds thorns at its crest. The burst
 * spec's grammar, at entrance scale — enough that the mid-roll is a visible unleashing,
 * shy of the full burst's ×3, which owns the click.
 */
const PULSE_DISTORT = 2.0;
const PULSE_SPIKE = 0.45;

/**
 * How deep the wave swings while the strip travels (local units, on top of the resting
 * flagAmp — which is ZERO by tuning, so this is additive or it is nothing). The changeover
 * keeps its doctrine (a translation, two real sheets on screen); this is its breath.
 */
const SLIDE_AMP = 1.9;

/*
 * THE NEIGHBOURS ARE OFF SCREEN — the index (the left column of names) is what says
 * "there are four", so the strip no longer shows slivers of the next plate: the slots
 * sit a full screen apart, and a changeover is one photograph leaving the right margin
 * while the next crosses into it. (The gallery-wall variant — a third of each neighbour
 * in the frame — lives in the git history if the index does not survive the tryout.)
 */

export function LiquidDna({ reduced }: Props) {
  const { camera, size } = useThree();
  const envMap = useEnvironment({ files: ENV_FILE });
  const meshRef = useRef<Mesh>(null);
  const appear = useRef(0); // load-in fade (the liquid is the permanent hero form)
  const modeVis = useRef(1); // eased visibility for the "blob" (liquid) form mode
  const colScratch = useMemo(() => new Color(), []);
  /** Last published on-screen box of the shown picture, so the CSS vars are written on change
   *  rather than every frame — see the write at the end of the frame loop. */
  const frameBox = useRef({ w: 0, h: 0, cx: 0 });

  const { geometry, material } = useMemo(() => {
    const blank = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    blank.needsUpdate = true;
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
        uDock: { value: new Vector2() },
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
        // the strip of plates, and the photographs printed on them (see formPhoto)
        uFlat: { value: 0 },
        uRelief: { value: 0 },
        uPhotoOn: { value: 0 },
        uWarp: { value: 0 },
        uCar: { value: 0 },
        uCarX: { value: 0 },
        uSlotX: { value: works.map(() => 0) },
        // JS-side store only — the shader reads the EASED uAspNow below; this array is
        // where the decoded files' true aspects live (see the loader effect).
        uPhotoAsp: { value: works.map(() => PLATE_ASP0) },
        uAspNow: { value: PLATE_ASP0 },
        uPlateK: { value: 1 },
        uShrink: { value: 0.45 },
        uGrow: { value: 0 },
        uFlag: { value: 0 },
        // These mirror PLATE_LOOK: the frame loop overwrites them immediately,
        // but a material built with the panel's *old* values would flash for one frame.
        uFlagAmp: { value: 2 },
        uWind: { value: 0.4 },
        uPrint: { value: new Vector3(0.89, 0, 0) },
        uContrast: { value: 1.03 },
        uShade: { value: 0.27 },
        uWave: { value: 0 },
        uColour: { value: 0 },
        uAber: { value: 0.006 },
        uPhotoReady: { value: works.map(() => 0) },
        // Every sampler is bound from the start, to a 1×1 grey: an unbound sampler2D is
        // undefined behaviour that some drivers answer with a warning per draw call. The
        // placeholder is never SEEN — uPhotoReady gates each slot — it is only there to
        // keep every texture unit legal while the files are in flight.
        ...Object.fromEntries(works.map((_, i) => [`uPhoto${i}`, { value: blank }])),
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

  // The photographs, loaded imperatively rather than through drei's useTexture: that
  // one suspends, and the liquid is the form that must never wait — it is what the
  // page draws from the first frame, and it needs nothing but a shader. Same reason
  // the skull sits in its own Suspense boundary (see ChromeCanvas).
  useEffect(() => {
    const loader = new TextureLoader();
    const loaded: Texture[] = [];
    works.forEach((w, i) => {
      if (!w.image) return;
      loader.load(w.image, (t) => {
        // The uv is warped past the edges by the relief, so it must clamp: repeating
        // would wrap the sky onto the grass along the top of the plate.
        t.wrapS = ClampToEdgeWrapping;
        t.wrapT = ClampToEdgeWrapping;
        // Left in the texture's own colour space on purpose — this material writes
        // straight to the framebuffer with no conversion appended, so the file's
        // display-space values are already what the screen wants (see formPhoto).
        //
        // The PLATE is cut to the photograph, not the other way round: its aspect goes to the
        // shader and the sheet takes that shape, so nothing is cropped and nothing stretched.
        // (It used to cover-crop every file to one 16:9 box, which of a portrait keeps a
        // central band — a third of the picture.)
        (material.uniforms.uPhotoAsp.value as number[])[i] = t.image.width / t.image.height;
        material.uniforms[`uPhoto${i}`].value = t;
        (material.uniforms.uPhotoReady.value as number[])[i] = 1;
        loaded.push(t);
      });
    });
    return () => loaded.forEach((t) => t.dispose());
  }, [material]);

  useFrame((_, delta) => {
    const u = material.uniforms;
    const tw = blobTweak.get();
    // The plates' look — one documented set of numbers (see plateLook), read through a local so
    // the whole surface of the thing stays in one place.
    const pt = PLATE_LOOK;

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
    (u.uDock.value as Vector2).set(s.dockX, s.dockY);
    u.uScale.value = s.scale;
    u.uSpin.value = s.spin;

    // The camera, first: the strip's pitch below is a function of how wide the frame is.
    const fov = (camera as { fov?: number }).fov ?? 42;
    const tanHalf = Math.tan((fov * Math.PI) / 180 / 2);
    const aspect = size.width / size.height;
    (u.uTanHalf.value as Vector2).set(tanHalf * aspect, tanHalf);
    (u.uCamPos.value as Vector3).copy(camera.position);
    (u.uCamRot.value as Matrix3).setFromMatrix4(camera.matrixWorld);

    // panel-driven material: colour → tint, roughness, distort/freq → living noise
    colScratch.set(tw.color);
    (u.uHi.value as Vector3).set(colScratch.r, colScratch.g, colScratch.b);
    (u.uLo.value as Vector3).set(colScratch.r * 0.5, colScratch.g * 0.5, colScratch.b * 0.5);
    u.uRough.value = tw.roughness;
    // panel 0..1 → 0..DISTORT_MAX, a fraction of the radius (sdBlob scales it by
    // BR itself) like the old blob did. 0 in the panel → perfectly smooth.
    //
    // THE DEVELOPER CALMS THE METAL. A photograph sampled off a boiling surface reads
    // as mud — you cannot even see that it IS distorted. So as the image comes up in
    // the chrome, the living noise settles (to a quarter of itself, not to zero: dead
    // still would read as a decal, and the residual swim is what says "in the metal"),
    // and it boils back up between prints, when the metal is bare and allowed to.
    // Same grammar as the hover stilling the wave — attention quiets the matter.
    const still = 1 - 0.75 * s.mood.dev;
    u.uDistort.value = tw.distort * DISTORT_MAX * still;
    u.uFreq.value = tw.freq;
    // the shown plate → silhouette (eased in the shared clock, see workPlate), overloaded
    // by the roll-out's peak: the pulse is composed at READ time, never written back into
    // the mood (whose fields are the next frame's easing base — see formClock).
    (u.uStretch.value as Vector3).set(s.mood.sx, s.mood.sy, s.mood.sz);
    u.uMoodD.value = s.mood.distort * (1 + PULSE_DISTORT * s.pulse);
    u.uMoodF.value = s.mood.freq;
    // Thorns calm with the developer too — a spike through a photograph is a tear, not
    // a silhouette — but only by half: the project's identity should survive its print.
    u.uSpike.value = (s.mood.spike + PULSE_SPIKE * s.pulse) * (1 - 0.5 * s.mood.dev);
    const sh = s.mood.shapes;
    (u.uShape.value as Vector4).set(sh.gavel, sh.camera, sh.burger, sh.vase);

    // …and the strip. Two numbers out of the clock: how flat the metal is, and where the
    // strip has slid to.
    u.uFlat.value = s.mood.flat;
    u.uCar.value = s.mood.car;
    // Liquid → cloth happens ONCE, as the ball is rolled out (hence the flatness factor).
    // It is deliberately NOT undone while a plate crosses the screen: a sheet that
    // liquefied for the trip, or that picked up an extra ripple on the way, deformed the
    // photograph exactly when the reader was being handed it. The changeover is a
    // translation and nothing else — same wave, same shading, moved sideways.
    //
    // `cloth` only SCALES that crossing (1 = the section decides), so the dev panel can
    // pin the sheet to liquid metal without the choreography losing track of where it is.
    u.uFlag.value = s.mood.flat * pt.cloth;
    // The hover takes BOTH deformations to zero — the wave's depth and the liquid's lumps —
    // so what is held under the reader's attention is a clean, still, flat print. Both,
    // because they are alternatives: cutting only the wave would hand the sheet back to the
    // liquid term (it is weighted by 1 - uFlag), i.e. swap one deformation for another. And
    // scaled rather than switched, so it is a transition and not a cut: about a third of a
    // second, the same ease that brings the colour up (see HOVER_RATE).
    const calm = 1 - s.mood.hover;
    // The slide's breath rides on TOP of the resting amplitude (which is zero by tuning):
    // the wave swings while the strip travels and settles as the plate arrives. Amplitude
    // and the wave's clock only — never uWind, which multiplies the accumulated phase.
    u.uFlagAmp.value = (pt.flagAmp + SLIDE_AMP * s.mood.slide) * calm;
    u.uWind.value = pt.wind;
    u.uRelief.value = pt.relief * calm;
    u.uWarp.value = pt.warp;
    (u.uPrint.value as Vector3).set(pt.exposure, pt.sheen, pt.gloss);
    u.uContrast.value = pt.contrast;
    u.uShade.value = pt.shade;
    // The developer, straight from the clock: it does not start until the plate is
    // EXACTLY flat, which is the whole three-beat sequence (see formClock's mood.dev).
    u.uPhotoOn.value = s.mood.dev;
    // The wave's clock and the hover's colour. Both come from the shared clock, so the
    // picture is never coloured by a wind that has not stopped, or the other way round.
    u.uWave.value = s.wave;
    u.uColour.value = s.mood.hover * pt.colour;
    u.uAber.value = pt.aber;
    u.uShrink.value = pt.shrink;
    // The hover's step forward, on the shown slot alone (see slotScale). It used to go through
    // the form's global scale, which grew the whole gallery.
    u.uGrow.value = PLATE_GROW * s.mood.hover;
    // The size ceiling. The plate no longer sits at the middle of the screen — the form is
    // DOCKED (right margin, beside the index) — so the room a photograph actually has is
    // the distance from the dock to the NEARER screen edge, not the full half-width. The
    // cap reads the dock off the same clock the dock comes from, so moving DOCK_X_WORK
    // cannot strand it. Local units, hence the division by the choreography's scale.
    const halfWorld = tanHalf * aspect * camera.position.z;
    const halfLocal = halfWorld / Math.max(0.01, s.scale);
    const dockXl = Math.abs(s.dockX) / Math.max(0.01, s.scale);
    const roomLocal = Math.max(0.5, halfLocal - dockXl);
    const asp = u.uPhotoAsp.value as number[];
    let widest = 0;
    for (let i = 0; i < asp.length; i++) widest = Math.max(widest, PLATE_H * asp[i]);
    u.uPlateK.value = Math.min(1, (roomLocal * PLATE_FILL) / widest);

    // The strip's slots sit a FULL SCREEN apart: the neighbours are entirely off screen
    // (the index is what says "there are four"), and a changeover is one photograph
    // leaving the margin while the next crosses into it.
    const slotX = u.uSlotX.value as number[];
    for (let i = 0; i < slotX.length; i++) {
      slotX[i] = i === 0 ? 0 : slotX[i - 1] + 2 * halfLocal;
    }
    // …and where the reader is along it: between two slots, interpolated by the same fraction
    // the carousel is between them, so a slide covers the real distance rather than a nominal
    // one. Both numbers come from mood.car, so they cannot disagree.
    const car = Math.max(0, Math.min(slotX.length - 1, s.mood.car));
    const i0 = Math.floor(car);
    const i1 = Math.min(slotX.length - 1, i0 + 1);
    u.uCarX.value = slotX[i0] + (slotX[i1] - slotX[i0]) * (car - i0);
    u.uCar.value = car;
    // The sheet's proportions GLIDE to the worn photograph's aspect — the swap happens on
    // bare chrome (dev 0, see formClock), so the glide never stretches a visible print.
    const aspTarget = asp[Math.max(0, Math.min(asp.length - 1, Math.round(car)))];
    u.uAspNow.value += (aspTarget - u.uAspNow.value) * (1 - Math.pow(1e-3, delta));

    // The notch frame is DOM, and the picture it marks is not — so the picture's on-screen box
    // has to be published for the CSS to use (see .plate-frame). Written only when it actually
    // moves: this is a style write on an element above a full-screen WebGL canvas, and doing it
    // every frame is the compositor stall this codebase has already been bitten by twice.
    // Measured at the picture's FACE, not at z = 0: the print sits PLATE_T in front of the
    // plate's centre, which a perspective camera magnifies by about a percent — some 7px, i.e.
    // a quarter of the notches' stand-off. Enough to see them sit inside the picture's edge.
    const pxPerWorld = size.height / (2 * tanHalf * (camera.position.z - PLATE_T * s.scale));
    // The hit box covers the BLOB now — the picture lives in the metal, so the link's
    // rectangle is the form's face: the radius plus the room its lumps breathe in.
    const h = 2 * FORM_RADIUS * 1.15 * s.scale * pxPerWorld;
    const w = h;
    // …and where the picture's CENTRE is, horizontally: the piece is docked now, no longer
    // at the middle of the screen, and the DOM's hit link (.plate-hit) has to land on it.
    const cx = s.dockX * pxPerWorld;
    if (
      Math.abs(w - frameBox.current.w) > 0.75 ||
      Math.abs(h - frameBox.current.h) > 0.75 ||
      Math.abs(cx - frameBox.current.cx) > 0.75
    ) {
      frameBox.current = { w, h, cx };
      const root = document.documentElement.style;
      root.setProperty("--plate-px-w", `${w.toFixed(1)}px`);
      root.setProperty("--plate-px-h", `${h.toFixed(1)}px`);
      root.setProperty("--plate-px-cx", `${cx.toFixed(1)}px`);
    }
    u.uEnv.value = envMap;
  });

  return <mesh ref={meshRef} frustumCulled={false} renderOrder={999} geometry={geometry} material={material} visible={false} />;
}
