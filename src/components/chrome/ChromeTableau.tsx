"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEnvironment } from "@react-three/drei";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DoubleSide,
  Group,
  ShaderMaterial,
  TextureLoader,
  Vector3,
} from "three";
import type { Texture } from "three";
import { blobTweak, DISTORT_MAX, FORM_RADIUS } from "@/lib/blobTweak";
import { SNOISE, FORM_DISPLACE, CHROME_SHADE, ENV_FILE, ENV_INTENSITY, ENV_ROT_Y } from "@/lib/formField";
import { FRAME_OUT, FRAME_T, FRAME_W, LINER_W, PHOTO_SHADE, PLATE_ASP0, PLATE_H, PLATE_T } from "@/lib/formPhoto";
import { PLATE_LOOK } from "@/lib/plateLook";
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
/** The hover's step forward — mirrors PLATE_GROW in LiquidDna. */
const GROW = 0.1;
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
  vec3 d = normalize(home + vec3(1e-4));
  float fly = sin(w * PI);
  vec3 nz = vec3(snoise(d * 1.1 + vec3(0.0, uTime * 0.25, 0.0)),
                 snoise(d * 1.1 + vec3(4.7, uTime * 0.20, 1.3)),
                 snoise(d * 1.1 + vec3(8.3, uTime * 0.15, 2.6)));
  return p + nz * fly * uFly;
}

void main(){
  // Staggered arrival on the built-in key: canvas first, moulding last (see the
  // seeds in the geometry builders) — the frame is RAISED out of an already-forming
  // sheet, which is the whole read of the entrance.
  float w = clamp((uPres - aSeed * 0.35) / 0.65, 0.0, 1.0);
  w = w * w * (3.0 - 2.0 * w);

  vec3 seat = aTarget * vec3(uAspX, 1.0, 1.0) * uSeatK;
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
  // The photograph, on the canvas's own uv — same pipeline the field used: the
  // developer's grain, the exposure coming up, the hover's colour. Faces only:
  // the print's edge stays bare metal.
  if (uPhotoOn > 0.002 && abs(vNrm.z) > 0.0) {
    float slot = floor(uCar + 0.5);
    if (photoHas(slot) > 0.5) {
      col = photoShade(col, normalize(vNrm), vUv, 1.0, photoTone(slot, vUv, uColour));
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
 * The moulding's cross-section — a REAL museum profile as a polyline: (u across the
 * band, z height). It rises from the liner's step, over an ogee to the crown just
 * outside the centreline, and falls to the outer edge — the silhouette a raking light
 * actually models. Sweeping THIS is what buried the box-bar look: chrome flows along
 * a profile, it only glints on arrises.
 */
const PROFILE: [number, number][] = [
  [-FRAME_W, -0.06],
  [-FRAME_W, 0.1],
  [-FRAME_W * 0.72, 0.14],
  [-FRAME_W * 0.5, 0.3],
  [-FRAME_W * 0.28, 0.24],
  [-FRAME_W * 0.02, 0.36],
  [FRAME_W * 0.26, 0.38],
  [FRAME_W * 0.52, 0.28],
  [FRAME_W * 0.74, 0.32],
  [FRAME_W * 0.9, 0.16],
  [FRAME_W, 0.08],
  [FRAME_W, -0.06],
];

/** Path samples around the ring, and the trim cells laid along it. */
const SWEEP_N = 480;
const TRIM_CELL = 1.3;

/** The rounded-rectangle centreline the profile sweeps along, plus arc-length. */
function sweepPath(): { pts: [number, number][]; nrm: [number, number][]; len: number[] } {
  const inr = PLATE_H + LINER_W + FRAME_W;
  const r = FRAME_W * 0.9;
  const seg = (a: number) => {
    // rounded-rect param: four straights and four arcs, walked by angle bookkeeping
    const straight = 2 * (inr - r);
    const arc = (Math.PI / 2) * r;
    const P = 4 * (straight + arc);
    let d = ((a % 1) + 1) % 1 * P;
    const sides: Array<[number, number, number, number, number, number]> = [
      // [dirX, dirY, startX, startY, cornerCX, cornerCY] — top, right, bottom, left
      [1, 0, -(inr - r), inr, inr - r, inr - r],
      [0, -1, inr, inr - r, inr - r, -(inr - r)],
      [-1, 0, inr - r, -inr, -(inr - r), -(inr - r)],
      [0, 1, -inr, -(inr - r), -(inr - r), inr - r],
    ];
    for (let sIdx = 0; sIdx < 4; sIdx++) {
      const [dx, dy, sx, sy, cx, cy] = sides[sIdx];
      if (d <= straight) {
        const px = sx + dx * d;
        const py = sy + dy * d;
        // outward normal of each side: top→+y, right→+x, bottom→−y, left→−x
        const nx = sIdx === 1 ? 1 : sIdx === 3 ? -1 : 0;
        const ny = sIdx === 0 ? 1 : sIdx === 2 ? -1 : 0;
        return { px, py, nx, ny };
      }
      d -= straight;
      if (d <= arc) {
        const a0 = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][sIdx];
        const ang = a0 - d / r;
        return {
          px: cx + Math.cos(ang) * r,
          py: cy + Math.sin(ang) * r,
          nx: Math.cos(ang),
          ny: Math.sin(ang),
        };
      }
      d -= arc;
    }
    return { px: 0, py: 0, nx: 0, ny: 1 };
  };
  const pts: [number, number][] = [];
  const nrm: [number, number][] = [];
  const len: number[] = [];
  const straight = 2 * (inr - r);
  const P = 4 * (straight + (Math.PI / 2) * r);
  for (let i = 0; i < SWEEP_N; i++) {
    const { px, py, nx, ny } = seg(i / SWEEP_N);
    pts.push([px, py]);
    nrm.push([nx, ny]);
    len.push((i / SWEEP_N) * P);
  }
  return { pts, nrm, len };
}

/**
 * The moulding — the PROFILE swept along the rounded rectangle: one continuous
 * surface, mitre-free (the corners are arcs the profile flows around), which is what
 * a frame IS. Built smooth; the drawn trim carves it when its pixels land (carveFrame
 * displaces the crest along z, keyed by arc-length so the pattern closes seamlessly —
 * a whole number of cells around the ring).
 */
function buildFrame(): { geo: BufferGeometry; arc: Float32Array } {
  const { pts, nrm, len } = sweepPath();
  const M = PROFILE.length;
  const count = SWEEP_N * M;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const arc = new Float32Array(count);
  for (let i = 0; i < SWEEP_N; i++) {
    const [px, py] = pts[i];
    const [nx, ny] = nrm[i];
    for (let j = 0; j < M; j++) {
      const [u, z] = PROFILE[j];
      const idx = i * M + j;
      pos[idx * 3] = px + nx * u;
      pos[idx * 3 + 1] = py + ny * u;
      pos[idx * 3 + 2] = z * (FRAME_T / 0.34);
      uv[idx * 2] = len[i];
      uv[idx * 2 + 1] = j / (M - 1);
      arc[idx] = len[i];
    }
  }
  const index: number[] = [];
  for (let i = 0; i < SWEEP_N; i++) {
    const i2 = (i + 1) % SWEEP_N;
    for (let j = 0; j < M - 1; j++) {
      const a = i * M + j;
      const b = i2 * M + j;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const inr = PLATE_H + LINER_W + FRAME_W;
  const geo = toMorph(g, (x, y) => 0.55 + 0.45 * Math.min(1, (Math.abs(x) + Math.abs(y)) / (2 * inr)));
  return { geo, arc };
}

/**
 * Carve the drawn trim into the swept moulding — REAL geometry: the height displaces
 * the profile's crest along z, keyed by arc-length (a whole number of cells around
 * the ring, so the pattern closes on itself), weighted to the crown of the profile so
 * the plinth and the liner's step stay clean. Applied to aTarget: the sphere homes
 * stay a sphere. Normals recomputed from the carved seats, as the skull's are.
 */
function carveFrame(geo: BufferGeometry, arc: Float32Array, img: HTMLImageElement) {
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const tgt = geo.getAttribute("aTarget") as BufferAttribute;
  const uv = geo.getAttribute("uv") as BufferAttribute;
  const inr = PLATE_H + LINER_W + FRAME_W;
  const perim = arc.length ? 4 * (2 * (inr - FRAME_W * 0.9) + (Math.PI / 2) * FRAME_W * 0.9) : 1;
  const cells = Math.max(1, Math.round(perim / TRIM_CELL));
  for (let i = 0; i < tgt.count; i++) {
    const t = arc[i] / perim;
    const v = uv.getY(i);
    // The crown carries the carving; the edges of the band stay architecture.
    const wgt = Math.sin(Math.min(1, Math.max(0, (v - 0.12) / 0.76)) * Math.PI);
    if (wgt <= 0.01) continue;
    const u = ((t * cells) % 1) * img.width;
    const row = Math.min(0.999, 1 - v) * img.height;
    const h = data[((row | 0) * img.width + (u | 0)) * 4] / 255;
    tgt.setZ(i, tgt.getZ(i) + h * 0.16 * wgt);
  }
  tgt.needsUpdate = true;
  const tmp = new BufferGeometry();
  tmp.setAttribute("position", tgt.clone());
  if (geo.index) tmp.setIndex(geo.index.clone());
  tmp.computeVertexNormals();
  (geo.getAttribute("normal") as BufferAttribute).copyArray(
    (tmp.getAttribute("normal") as BufferAttribute).array
  );
  (geo.getAttribute("normal") as BufferAttribute).needsUpdate = true;
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
  const frameBox = useRef({ w: 0, h: 0, cx: 0 });

  const canvasGeo = useMemo(() => buildCanvas(), []);
  const frame = useMemo(() => buildFrame(), []);

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
        uPrint: { value: new Vector3(PLATE_LOOK.exposure, PLATE_LOOK.sheen, PLATE_LOOK.gloss) },
        uContrast: { value: PLATE_LOOK.contrast },
        uShade: { value: PLATE_LOOK.shade },
        uColour: { value: 0 },
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
    const img = new Image();
    img.onload = () => carveFrame(frame.geo, frame.arc, img);
    img.src = "/textures/frame-trim.png";
    return () => loaded.forEach((t) => t.dispose());
  }, [canvasMat, frame]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const s = formState();
    const tw = blobTweak.get();

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
    for (const a of asps.current) widest = Math.max(widest, PLATE_H * a + FRAME_OUT);
    const k = Math.min(1, (roomLocal * FILL) / widest);

    // The worn aspect glides to the worn slot's photograph — the swap happens either
    // on bare chrome or edge-on (see formClock), never under a readable print.
    const slot = Math.max(0, Math.min(asps.current.length - 1, Math.round(s.mood.car)));
    aspNow.current += (asps.current[slot] - aspNow.current) * (1 - Math.pow(1e-3, delta));

    const setShared = (m: ShaderMaterial) => {
      const u = m.uniforms;
      u.uTime.value = s.time;
      u.uPres.value = s.mood.flat;
      u.uDistort.value = tw.distort * DISTORT_MAX;
      u.uFreq.value = tw.freq;
      u.uRough.value = tw.roughness;
      u.uFly.value = reduced ? 0 : FLY;
      u.uAspX.value = aspNow.current;
      u.uSeatK.value = k;
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
    cu.uPhotoOn.value = s.mood.dev;
    cu.uColour.value = s.mood.hover * PLATE_LOOK.colour;

    const grow = 1 + GROW * s.mood.hover;
    g.position.set(s.dockX, s.dockY, 0);
    g.rotation.set(0, s.spin, 0);
    g.scale.setScalar(s.scale * grow);

    // The DOM's hit link, published from here now — the field goes dark in Work and
    // stale numbers would park the link on the wrong rectangle.
    const pxPerWorld = size.height / (2 * tanHalf * (camera.position.z - PLATE_T * s.scale));
    const h = 2 * (PLATE_H + FRAME_OUT) * k * s.scale * grow * pxPerWorld;
    const w = 2 * (PLATE_H * aspNow.current + FRAME_OUT) * k * s.scale * grow * pxPerWorld;
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
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={canvasGeo} material={canvasMat} frustumCulled={false} />
      <mesh geometry={frame.geo} material={frameMat} frustumCulled={false} />
    </group>
  );
}
