"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEnvironment, useGLTF } from "@react-three/drei";
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DoubleSide,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  TextureLoader,
  Vector3,
} from "three";
import type { Texture } from "three";
import { blobTweak, DISTORT_MAX, FORM_RADIUS } from "@/lib/blobTweak";
import { SNOISE, FORM_DISPLACE, CHROME_SHADE, ENV_FILE, ENV_INTENSITY, ENV_ROT_Y } from "@/lib/formField";
import { FRAME_OUT, FRAME_T, FRAME_W, LINER_W, PHOTO_SHADE, PLATE_ASP0, PLATE_H, PLATE_T } from "@/lib/formPhoto";
import { PLATE_LOOK } from "@/lib/plateLook";
import { toileTweak, useToileTweak } from "@/lib/toileTweak";
import { formState } from "@/lib/formClock";
import { works } from "@/data/site";

type Props = {
  reduced?: boolean;
};

/**
 * The WORK, as a mesh — the skull's technique applied whole: canvas AND moulding are
 * real vertices, each paired with a home on the resting sphere, so the roll-out is a
 * vertex morph and the raymarcher never marches a plate again. In Work the field only
 * ever draws the travelling blob, hands the frame over inside the first few percent of
 * the morph — where this mesh is still wearing the same noise-displaced sphere — and
 * goes dark. Everything after that is rasterised: the entrance's cost stops scaling
 * with pixels-times-steps and becomes a vertex program.
 *
 * The same shared field (formOffset) lumps the disguised sphere, so the crossfade has
 * nothing to show — and its flow term stays alive at full presence, which is what
 * keeps the settled canvas breathing without a line of extra code.
 *
 * The moulding's carving is REAL GEOMETRY here: the drawn trim (frame-trim.png)
 * displaces the bars' front faces at build time, normals recomputed — chrome shows
 * sculpture through normals, and a mesh pays for its detail once.
 *
 * The photograph rides the canvas's own UVs through the same PHOTO_SHADE pipeline the
 * field used (developer grain, exposure coming up, the hover's colour) — addressed by
 * the same worn slot (mood.car), developed by the same mood.dev.
 */

/** Assembly staggering — the canvas gathers first, the moulding is raised last. */
const CANVAS_SEED = 0.45;
/** Swirl amplitude while vertices are in flight (world units, peaks mid-morph). */
const FLY = 0.22;
/*
 * THE HOVER DOES NOT STEP FORWARD. A 10% grow on mood.hover (mirroring PLATE_GROW
 * in LiquidDna) was tried and removed: a framed work hanging on a wall does not
 * lean toward the reader. What answers the hover is the PICTURE — the colour
 * fading in (uColour below) — not the object's size.
 */
/** How far the picture may fill the room the dock leaves it — mirrors PLATE_FILL. */
const FILL = 0.92;

/* -------------------------------------------------------------------------- */
/* shaders                                                                    */
/* -------------------------------------------------------------------------- */

const VERT = /* glsl */ `
uniform float uTime;
uniform float uDistort;
uniform float uFreq;
uniform float uPres;
uniform float uFly;
uniform float uAspX;
uniform float uSeatK;
uniform float uFit;
attribute vec3 aTarget;
attribute float aSeed;
varying vec3 vNrm;
varying vec3 vWPos;
varying vec2 vUv;
${SNOISE}
${FORM_DISPLACE}

const float PI = 3.14159265359;

/** Between the sphere home and the seat on the work — the seat wears the current
    aspect and the size cap (uniforms), so the geometry is built ONCE at a reference
    aspect and resizes without a rebuild. Swirl as the skull does it: sampled on the
    home direction at low frequency, so the shell stretches rather than tears. */
vec3 baseAt(vec3 home, vec3 seat, float w){
  vec3 p = mix(home, seat, w);
  // In flight only — see ChromeSkull's baseAt: zero at both ends of the morph, and
  // the settled tableau (most of Work's screen time) skips the three fetches on
  // every vertex of the carved frame.
  float fly = sin(w * PI) * uFly;
  if (fly > 1e-4) {
    vec3 d = normalize(home + vec3(1e-4));
    vec3 nz = vec3(snoise(d * 1.1 + vec3(0.0, uTime * 0.25, 0.0)),
                   snoise(d * 1.1 + vec3(4.7, uTime * 0.20, 1.3)),
                   snoise(d * 1.1 + vec3(8.3, uTime * 0.15, 2.6)));
    p += nz * fly;
  }
  return p;
}

void main(){
  // Staggered arrival on the built-in key: canvas first, moulding last (see the
  // seeds in the geometry builders) — the frame is RAISED out of an already-forming
  // sheet, which is the whole read of the entrance.
  float w = clamp((uPres - aSeed * 0.35) / 0.65, 0.0, 1.0);
  w = w * w * (3.0 - 2.0 * w);

  // uFit: the dev panel's "collée" — grows the CANVAS's seat only (the frame's
  // material keeps it at 1), walking the picture's edge across the liner band
  // toward the moulding.
  vec3 seat = aTarget * vec3(uAspX, 1.0, 1.0) * uSeatK * uFit;
  vec3 p0 = baseAt(position, seat, w);
  vec3 nrm = normalize(mix(normalize(position + vec3(1e-4)), normal, w));

  // The shared lump/flow field, exactly as the skull samples it — twice, one
  // fixed-point step, so the disguised sphere wears the liquid's lumps in the same
  // places and the handover has nothing to show.
  float f = formOffset(p0);
  f = formOffset(p0 + nrm * f);
  vec3 ps = p0 + nrm * f;

  float e = 0.06;
  vec3 grad = (vec3(formOffset(ps + vec3(e, 0.0, 0.0)),
                    formOffset(ps + vec3(0.0, e, 0.0)),
                    formOffset(ps + vec3(0.0, 0.0, e))) - f) / e;
  vec3 nOut = normalize(nrm - (grad - nrm * dot(grad, nrm)));

  vec4 wp = modelMatrix * vec4(ps, 1.0);
  vWPos = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * nOut);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG_FRAME = /* glsl */ `
uniform sampler2D uEnv;
uniform float uEnvInt;
uniform float uEnvRot;
uniform float uRough;
uniform float uFade;
uniform vec3 uLo;
uniform vec3 uHi;
uniform vec3 uCamPos;
varying vec3 vNrm;
varying vec3 vWPos;
varying vec2 vUv;
${CHROME_SHADE}
void main(){
  vec3 rd = normalize(vWPos - uCamPos);
  vec3 n = normalize(vNrm);
  if (dot(n, rd) > 0.0) n = -n;
  gl_FragColor = vec4(chromeShade(n, rd), uFade);
}
`;

const FRAG_CANVAS = /* glsl */ `
uniform sampler2D uEnv;
uniform float uEnvInt;
uniform float uEnvRot;
uniform float uRough;
uniform float uFade;
uniform vec3 uLo;
uniform vec3 uHi;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uCar;
uniform float uDevZoom;
uniform float uDevDim;
varying vec3 vNrm;
varying vec3 vWPos;
varying vec2 vUv;
${SNOISE}
float fbm(vec3 p){ return snoise(p) * 0.7 + snoise(p * 2.1) * 0.3; }
${CHROME_SHADE}
${PHOTO_SHADE}
void main(){
  vec3 rd = normalize(vWPos - uCamPos);
  vec3 n = normalize(vNrm);
  if (dot(n, rd) > 0.0) n = -n;
  vec3 col = chromeShade(n, rd);
  // The photograph, on the canvas's own uv. The ARRIVAL is dialled from the CPU
  // (see toileTweak + the useFrame below): uPhotoOn carries the shaped density,
  // uDevZoom an optional approach-from-behind (1 = none — the default; it was
  // tried baked-in and rejected), uDevDim an optional frame's-shadow dim (1 =
  // none). All three are scalars per frame, so trying looks costs no recompile.
  // Faces only: the print's edge stays bare metal.
  if (uPhotoOn > 0.002 && abs(vNrm.z) > 0.0) {
    float slot = floor(uCar + 0.5);
    if (photoHas(slot) > 0.5) {
      vec2 tuv = (vUv - 0.5) * uDevZoom + 0.5;
      if (max(abs(tuv.x - 0.5), abs(tuv.y - 0.5)) <= 0.5) {
        col = photoShade(col, normalize(vNrm), tuv, uDevDim, photoTone(slot, tuv, uColour));
      }
    }
  }
  gl_FragColor = vec4(col, uFade);
}
`;

/* -------------------------------------------------------------------------- */
/* geometry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Pair every vertex of a built geometry with its home on the resting sphere — the
 * skull's radial pairing, with the same inward tuck for anything that cannot reach
 * the silhouette (here: the sheet's back half, which would otherwise stack on its
 * front at the sphere state and z-fight through the crossfade).
 */
function toMorph(geo: BufferGeometry, seedOf: (x: number, y: number, z: number) => number): BufferGeometry {
  const pos = geo.getAttribute("position");
  const n = pos.count;
  const home = new Float32Array(n * 3);
  const target = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    target[i * 3] = x;
    target[i * 3 + 1] = y;
    target[i * 3 + 2] = z;
    const r = Math.hypot(x, y, z) || 1e-4;
    const back = z < 0 ? 0.96 : 1;
    const k = (FORM_RADIUS * back) / r;
    home[i * 3] = x * k;
    home[i * 3 + 1] = y * k;
    home[i * 3 + 2] = z * k;
    seed[i] = seedOf(x, y, z);
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new BufferAttribute(home, 3));
  out.setAttribute("normal", geo.getAttribute("normal").clone());
  out.setAttribute("uv", geo.getAttribute("uv").clone());
  out.setAttribute("aTarget", new BufferAttribute(target, 3));
  out.setAttribute("aSeed", new BufferAttribute(seed, 1));
  if (geo.index) out.setIndex(geo.index.clone());
  return out;
}

/** The canvas — a tessellated slab at the reference aspect (1:1; uAspX resizes). */
function buildCanvas(): BufferGeometry {
  const g = new BoxGeometry(2 * PLATE_H, 2 * PLATE_H, 2 * PLATE_T, 48, 48, 1);
  const rMax = Math.hypot(PLATE_H, PLATE_H);
  return toMorph(g, (x, y) => (Math.hypot(x, y) / rMax) * CANVAS_SEED);
}

/**
 * The moulding is a DOWNLOADED SCULPTURE now — "Ornate Gold Vintage Frame" by
 * journeyk (Sketchfab, CC Attribution 4.0 — see ATTRIBUTIONS.md), 574k triangles of
 * real carved ornament, meshopt-compressed to 3.5 MB with its gold textures
 * neutralised: the chrome is ours. Normalised the way the
 * skull is (centre, fit, bake node transforms into the vertices), non-uniformly to
 * the REFERENCE SQUARE — the model is landscape, the reference is aspect 1, and
 * uAspX then wears each photograph's aspect on top. A carved frame stretched off its
 * native proportions distorts its ornament; between our photos' aspects it stays
 * within what a gallery eye forgives, and real frames do not resize at all.
 */
const FRAME_SRC = "/models/frame.glb";

/**
 * @param cadre the dev panel's moulding-width factor (toileTweak.cadre): scales the
 * band the sculpture spans past the canvas, so the toile/frame PROPORTION is dialled
 * — the size cap then refits the whole work, so fatter frame reads as smaller toile.
 */
function buildFrameFrom(src: Mesh, cadre: number): BufferGeometry {
  src.updateWorldMatrix(true, false);
  // The work's outer size at the reference aspect: canvas + liner + the band.
  const frameRef = 2 * (PLATE_H + LINER_W + 2 * FRAME_W * cadre);
  const srcPos = src.geometry.getAttribute("position") as BufferAttribute;
  const srcNrm = src.geometry.getAttribute("normal") as BufferAttribute;
  const wb = new Box3().setFromBufferAttribute(srcPos).applyMatrix4(src.matrixWorld);
  const centre = wb.getCenter(new Vector3());
  const span = wb.getSize(new Vector3());
  const sx = frameRef / (span.x || 1);
  const sy = frameRef / (span.y || 1);
  // Depth follows the HEIGHT's scale: squashing z with x would pancake the relief
  // exactly on the photographs that stretch the least.
  const toForm = new Matrix4()
    .makeScale(sx, sy, sy)
    .multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
    .multiply(src.matrixWorld);
  const toFormNrm = new Matrix3().getNormalMatrix(toForm);

  const n = srcPos.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const p = new Vector3();
  const v = new Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(srcPos, i).applyMatrix4(toForm);
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    v.fromBufferAttribute(srcNrm, i).applyMatrix3(toFormNrm).normalize();
    nrm[i * 3] = v.x;
    nrm[i * 3 + 1] = v.y;
    nrm[i * 3 + 2] = v.z;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new BufferAttribute(nrm, 3));
  const srcUv = src.geometry.getAttribute("uv");
  g.setAttribute(
    "uv",
    srcUv ? (srcUv.clone() as BufferAttribute) : new BufferAttribute(new Float32Array(n * 2), 2)
  );
  if (src.geometry.index) g.setIndex(src.geometry.index.clone());

  const inr = PLATE_H + LINER_W + FRAME_W * cadre;
  return toMorph(g, (x, y) => 0.55 + 0.45 * Math.min(1, (Math.abs(x) + Math.abs(y)) / (2 * inr)));
}

/**
 * THE LINING. The disguise's sphere is a SHELL of projected homes — the canvas's
 * faces and the moulding's band — and radial projection leaves the cap behind them
 * bare: seen alone (the corridor, where the raymarcher stays dark on purpose), the
 * resting "sphere" read as a glass bauble with its back missing. The liquid used to
 * hide this by accident, at fullscreen-march price, whenever its fade leaked back in.
 *
 * So the frame carries a lining: a real sphere, HALF A PERCENT under the homes so
 * the shell always wins the depth test where it exists, filling the holes where it
 * does not. Its seats tuck it inside the canvas slab — an ellipsoid the closed box
 * hides at every aspect — so the settled work carries no trace of it, and its seeds
 * sit with the moulding's crowd: the sheets pour OUT of a mass that is still whole,
 * and the mass itself drains into the work behind them.
 */
const LINING_R = 0.995;

function withLining(geo: BufferGeometry): BufferGeometry {
  const sph = new SphereGeometry(FORM_RADIUS * LINING_R, 96, 64);
  const sp = sph.getAttribute("position") as BufferAttribute;
  const gp = geo.getAttribute("position") as BufferAttribute;
  const gn = geo.getAttribute("normal") as BufferAttribute;
  const gu = geo.getAttribute("uv") as BufferAttribute;
  const gt = geo.getAttribute("aTarget") as BufferAttribute;
  const gs = geo.getAttribute("aSeed") as BufferAttribute;
  const n0 = gp.count;
  const n1 = sp.count;
  const n = n0 + n1;

  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const tgt = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  // Copied by accessor, not by buffer: the glb's attributes are quantized
  // (KHR_mesh_quantization) and a raw concat would splice int16 into float32.
  for (let i = 0; i < n0; i++) {
    pos[i * 3] = gp.getX(i);
    pos[i * 3 + 1] = gp.getY(i);
    pos[i * 3 + 2] = gp.getZ(i);
    nrm[i * 3] = gn.getX(i);
    nrm[i * 3 + 1] = gn.getY(i);
    nrm[i * 3 + 2] = gn.getZ(i);
    uv[i * 2] = gu.getX(i);
    uv[i * 2 + 1] = gu.getY(i);
    tgt[i * 3] = gt.getX(i);
    tgt[i * 3 + 1] = gt.getY(i);
    tgt[i * 3 + 2] = gt.getZ(i);
    seed[i] = gs.getX(i);
  }
  for (let i = 0; i < n1; i++) {
    const j = n0 + i;
    const x = sp.getX(i);
    const y = sp.getY(i);
    const z = sp.getZ(i);
    const r = Math.hypot(x, y, z) || 1e-4;
    pos[j * 3] = x;
    pos[j * 3 + 1] = y;
    pos[j * 3 + 2] = z;
    // A sphere's normal is its own direction — true at the home AND at the seat.
    nrm[j * 3] = x / r;
    nrm[j * 3 + 1] = y / r;
    nrm[j * 3 + 2] = z / r;
    // The seat: an ellipsoid tucked inside the canvas slab. x rides uAspX in the
    // shader exactly as the slab's own width does, so it fits at every aspect.
    tgt[j * 3] = (x / r) * PLATE_H * 0.7;
    tgt[j * 3 + 1] = (y / r) * PLATE_H * 0.7;
    tgt[j * 3 + 2] = (z / r) * PLATE_T * 0.5;
    seed[j] = 0.55 + 0.3 * Math.min(1, Math.max(0, 0.5 + y / (2 * FORM_RADIUS)));
  }

  const gi = geo.index;
  const si = sph.index!;
  const giCount = gi ? gi.count : n0;
  const idx = new Uint32Array(giCount + si.count);
  if (gi) for (let i = 0; i < giCount; i++) idx[i] = gi.getX(i);
  else for (let i = 0; i < n0; i++) idx[i] = i;
  for (let i = 0; i < si.count; i++) idx[giCount + i] = n0 + si.getX(i);
  sph.dispose();

  const out = new BufferGeometry();
  out.setAttribute("position", new BufferAttribute(pos, 3));
  out.setAttribute("normal", new BufferAttribute(nrm, 3));
  out.setAttribute("uv", new BufferAttribute(uv, 2));
  out.setAttribute("aTarget", new BufferAttribute(tgt, 3));
  out.setAttribute("aSeed", new BufferAttribute(seed, 1));
  out.setIndex(new BufferAttribute(idx, 1));
  return out;
}

/* -------------------------------------------------------------------------- */

export function ChromeTableau({ reduced }: Props) {
  const group = useRef<Group>(null);
  const { camera, size } = useThree();
  const envMap = useEnvironment({ files: ENV_FILE });
  const appear = useRef(0);
  const modeVis = useRef(0);
  const colScratch = useMemo(() => new Color(), []);
  const aspNow = useRef(PLATE_ASP0);
  const sizeNow = useRef(1);
  const frameBox = useRef({ w: 0, h: 0, cx: 0 });

  const canvasGeo = useMemo(() => buildCanvas(), []);

  // meshopt-compressed glb (EXT_meshopt_compression) — the decoder ships with drei.
  const { scene: frameScene } = useGLTF(FRAME_SRC, false, true);
  const frameSrc = useMemo<Mesh | null>(() => {
    let found: Mesh | null = null;
    frameScene.traverse((o) => {
      const m = o as Mesh;
      if (!found && m.isMesh && m.geometry) found = m;
    });
    return found;
  }, [frameScene]);
  // The moulding factor rebuilds 132k vertices — debounced, so dragging the Cadre
  // bar re-carves the frame at rest points rather than on every segment.
  const cadreLive = useToileTweak().cadre;
  const [cadre, setCadre] = useState(cadreLive);
  useEffect(() => {
    const id = window.setTimeout(() => setCadre(cadreLive), 150);
    return () => window.clearTimeout(id);
  }, [cadreLive]);
  const frameGeo = useMemo(
    () => (frameSrc ? withLining(buildFrameFrom(frameSrc, cadre)) : null),
    [frameSrc, cadre]
  );
  // A swapped-out frame geometry is not auto-disposed: R3F frees on unmount, and
  // this mesh never unmounts — without this, every Cadre notch leaks 132k verts.
  useEffect(() => () => frameGeo?.dispose(), [frameGeo]);

  const { canvasMat, frameMat } = useMemo(() => {
    const blank = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    blank.needsUpdate = true;
    const shared = () => ({
      uTime: { value: 0 },
      uDistort: { value: 0.25 },
      uFreq: { value: 0.5 },
      uPres: { value: 0 },
      uFly: { value: FLY },
      uAspX: { value: 1 },
      uSeatK: { value: 1 },
      uFit: { value: 1 },
      uFade: { value: 0 },
      uRough: { value: 0.12 },
      uEnv: { value: null as Texture | null },
      uEnvInt: { value: ENV_INTENSITY },
      uEnvRot: { value: ENV_ROT_Y },
      uLo: { value: new Color(0.5, 0.5, 0.5) },
      uHi: { value: new Color(0.98, 0.98, 0.95) },
      uCamPos: { value: new Vector3() },
    });
    const canvasMat = new ShaderMaterial({
      uniforms: {
        ...shared(),
        uCar: { value: 0 },
        uPhotoOn: { value: 0 },
        uDevZoom: { value: 1 },
        uDevDim: { value: 1 },
        uPrint: { value: new Vector3(PLATE_LOOK.exposure, PLATE_LOOK.sheen, PLATE_LOOK.gloss) },
        uContrast: { value: PLATE_LOOK.contrast },
        uShade: { value: PLATE_LOOK.shade },
        uColour: { value: 0 },
        uGrain: { value: PLATE_LOOK.grain },
        uAber: { value: PLATE_LOOK.aber },
        uWarp: { value: 0 },
        uPhotoReady: { value: works.map(() => 0) },
        ...Object.fromEntries(works.map((_, i) => [`uPhoto${i}`, { value: blank }])),
      },
      vertexShader: VERT,
      fragmentShader: FRAG_CANVAS,
      transparent: true,
      side: DoubleSide,
    });
    const frameMat = new ShaderMaterial({
      uniforms: shared(),
      vertexShader: VERT,
      fragmentShader: FRAG_FRAME,
      transparent: true,
      side: DoubleSide,
    });
    return { canvasMat, frameMat };
  }, []);

  /** The photographs and their aspects — this mesh owns them now (the field's copies
   *  go dark in Work); the trim carves the moulding the moment its pixels land. */
  const asps = useRef(works.map(() => PLATE_ASP0));
  useEffect(() => {
    const loader = new TextureLoader();
    const loaded: Texture[] = [];
    works.forEach((w, i) => {
      if (!w.image) return;
      loader.load(w.image, (t) => {
        t.wrapS = ClampToEdgeWrapping;
        t.wrapT = ClampToEdgeWrapping;
        asps.current[i] = t.image.width / t.image.height;
        canvasMat.uniforms[`uPhoto${i}`].value = t;
        (canvasMat.uniforms.uPhotoReady.value as number[])[i] = 1;
        loaded.push(t);
      });
    });
    return () => loaded.forEach((t) => t.dispose());
  }, [canvasMat]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const s = formState();
    const tw = blobTweak.get();
    const tt = toileTweak.get();

    appear.current += (1 - appear.current) * (1 - Math.pow(0.04, delta));
    const modeTarget = tw.mode === "blob" ? 1 : 0;
    modeVis.current += (modeTarget - modeVis.current) * (1 - Math.pow(0.06, delta));

    // On for the whole corridor (see tableauOn in formClock): the baton passes MESH TO
    // MESH — the skull reforms its sphere at About's end and this mesh, wearing its own
    // sphere disguise, takes the stage from there. It TRAVELS as that sphere (the dock
    // below is the clock's), and only unrolls where the roll-out scrub says so.
    const workOn = reduced ? (s.tableauOn > 0.5 ? 1 : 0) : s.tableauOn;
    const fade = (reduced ? 1 : appear.current) * modeVis.current * workOn;
    const on = fade > 0.004;
    g.visible = on;
    if (!on) return;

    // The size cap — the room the dock leaves the work, the same sum the field used.
    const fov = (camera as { fov?: number }).fov ?? 42;
    const tanHalf = Math.tan((fov * Math.PI) / 180 / 2);
    const halfWorld = tanHalf * (size.width / size.height) * camera.position.z;
    const halfLocal = halfWorld / Math.max(0.01, s.scale);
    const dockXl = Math.abs(s.dockX) / Math.max(0.01, s.scale);
    const roomLocal = Math.max(0.5, halfLocal - dockXl);
    let widest = 0;
    // FRAME_OUT wears the dev panel's moulding factor, so the size cap counts the
    // frame the geometry actually has this frame.
    const frameOut = LINER_W + 2 * FRAME_W * tt.cadre;
    for (const a of asps.current) widest = Math.max(widest, PLATE_H * a + frameOut);
    const k = Math.min(1, (roomLocal * FILL) / widest);

    // The worn aspect AND the worn hanging size glide to the worn slot's — the swap
    // happens edge-on (see formClock), never under a readable print. Size is per-work
    // (plateScale in the data): a gallery does not hang everything at one gabarit.
    const slot = Math.max(0, Math.min(asps.current.length - 1, Math.round(s.mood.car)));
    const ease = 1 - Math.pow(1e-3, delta);
    aspNow.current += (asps.current[slot] - aspNow.current) * ease;
    sizeNow.current += ((works[slot].plateScale ?? 1) - sizeNow.current) * ease;

    const setShared = (m: ShaderMaterial) => {
      const u = m.uniforms;
      u.uTime.value = s.time;
      u.uPres.value = s.mood.flat;
      u.uDistort.value = tw.distort * DISTORT_MAX;
      u.uFreq.value = tw.freq;
      u.uRough.value = tw.roughness;
      u.uFly.value = reduced ? 0 : FLY;
      u.uAspX.value = aspNow.current;
      u.uSeatK.value = k * sizeNow.current;
      u.uFade.value = fade;
      u.uEnv.value = envMap;
      (u.uCamPos.value as Vector3).copy(camera.position);
      colScratch.set(tw.color);
      (u.uHi.value as Color).setRGB(colScratch.r, colScratch.g, colScratch.b);
      (u.uLo.value as Color).setRGB(colScratch.r * 0.5, colScratch.g * 0.5, colScratch.b * 0.5);
    };
    setShared(canvasMat);
    setShared(frameMat);
    const cu = canvasMat.uniforms;
    cu.uCar.value = s.mood.car;
    // The arrival, shaped by the dev panel (toileTweak): density reaches 1 at
    // `ramp` of dev (smoothstepped so neither end pops), the optional recul and
    // ombre ride the RAW dev — the travel keeps going while the density holds.
    const dRaw = s.mood.dev;
    const dR = Math.min(1, dRaw / Math.max(0.05, tt.ramp));
    cu.uPhotoOn.value = dR * dR * (3 - 2 * dR);
    cu.uDevZoom.value = 1 + tt.recul * (1 - dRaw);
    cu.uDevDim.value = 1 - tt.ombre * (1 - dRaw);
    cu.uFit.value = tt.fit;
    cu.uColour.value = s.mood.hover * PLATE_LOOK.colour;

    g.position.set(s.dockX, s.dockY, 0);
    // tt.turn: the dev panel's manual turntable, for inspecting the work at an angle.
    g.rotation.set(0, s.spin + (tt.turn * Math.PI) / 180, 0);
    g.scale.setScalar(s.scale);

    // The DOM's hit link, published from here now — the field goes dark in Work and
    // stale numbers would park the link on the wrong rectangle.
    const pxPerWorld = size.height / (2 * tanHalf * (camera.position.z - PLATE_T * s.scale));
    const kk = k * sizeNow.current;
    const h = 2 * (PLATE_H + frameOut) * kk * s.scale * pxPerWorld;
    const w = 2 * (PLATE_H * aspNow.current + frameOut) * kk * s.scale * pxPerWorld;
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

      // …et le relèvement du mobilier, dérivé de la MÊME source que le reste.
      //
      // Il était en dur dans le CSS (0.0912 · --form-dim), calculé à la main depuis un
      // DOCK_Y_WORK de 0.7 qui vaut 0 depuis l'index — le token disait donc de relever le
      // mobilier de ~108px au-dessus d'une forme qui est à plomb au centre. Son propre
      // commentaire disait « MOVE THIS WITH DOCK_Y_WORK, never on its own », et ça n'a pas
      // été fait. Écrit ici, il ne peut plus mentir : il est une fonction de la position
      // réelle de la forme et du pxPerWorld vivant, donc il suit aussi la caméra.
      // Négatif parce que dockY monte en y-monde et que `top` descend en pixels.
      root.setProperty("--form-lift", `${(-s.dockY * pxPerWorld).toFixed(1)}px`);
    }
  });

  if (!frameGeo) return null;
  return (
    <group ref={group} visible={false}>
      <mesh geometry={canvasGeo} material={canvasMat} frustumCulled={false} />
      <mesh geometry={frameGeo} material={frameMat} frustumCulled={false} />
    </group>
  );
}

useGLTF.preload(FRAME_SRC, false, true);
