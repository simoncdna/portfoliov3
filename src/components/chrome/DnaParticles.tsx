"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Box3, BufferGeometry, BufferAttribute, Color, Euler, Matrix3, Matrix4, Quaternion, ShaderMaterial, Vector3, Vector4 } from "three";
import type { Mesh, Points } from "three";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { blobTweak, useBlobTweak, DISTORT_MAX, FORM_RADIUS } from "@/lib/blobTweak";
import { formState } from "@/lib/formClock";
import { SHAPE_SDF } from "@/lib/formShapes";

type Props = {
  reduced?: boolean;
};

const HOME_R = FORM_RADIUS; // rest cluster radius — shared with the liquid's BR
const GROUP_SCALE = 1.0;
const SPIN_AXIS = new Vector3(0, 1, 0); // Y = turntable; (1,0,0) = X tumble
// baked skull base orientation (found via the dev menu): X=30° Y=10° Z=−5°
const ROT_X = 0.524;
const ROT_Y = 0.175;
const ROT_Z = -0.087;
const BASE_Q = new Quaternion().setFromEuler(new Euler(ROT_X, ROT_Y, ROT_Z));
const _qSpin = new Quaternion();

const SNOISE = /* glsl */ `
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
`;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uAbout;
uniform float uDistort;   // panel: displaces the whole cloud (living deform)
uniform float uFreq;      // panel: noise scale
uniform vec3  uStretch;   // hovered project: silhouette proportions
uniform float uMoodD;     // hovered project: x amplitude
uniform float uMoodF;     // hovered project: x lump size
uniform vec4  uShape;     // hovered project: gavel / camera / burger / vase
attribute vec3 aTarget;
attribute float aSeed;
varying float vSeed;
const float FORM_R = ${FORM_RADIUS.toFixed(2)};  // shared, see blobTweak
${SNOISE}
${SHAPE_SDF}
// same 2-octave mix as the liquid's fbm
float fbm(vec3 p){ return snoise(p) * 0.7 + snoise(p * 2.1) * 0.3; }
void main(){
  // staggered per-particle assembly → they don't all arrive at once
  float p = clamp((uAbout - aSeed * 0.22) / 0.78, 0.0, 1.0);
  p = p * p * (3.0 - 2.0 * p);
  vec3 pos = mix(position, aTarget, p);
  // flight turbulence, strongest mid-way (particles swirl as they travel)
  float fly = sin(p * 3.14159265);
  vec3 nz = vec3(
    snoise(pos * 1.3 + vec3(0.0, uTime * 0.3, aSeed * 12.0)),
    snoise(pos * 1.3 + vec3(5.2, uTime * 0.25, aSeed * 12.0)),
    snoise(pos * 1.3 + vec3(9.1, uTime * 0.2, aSeed * 12.0))
  );
  pos += nz * fly * 0.2;

  // The hovered project's object (Work). The cloud lands ON the field's surface
  // rather than being deformed toward it: at amount 0 that field IS the resting
  // sphere these particles already sit on, so this costs nothing until a row is
  // hovered, and the same GLSL serves the liquid — see formShapes.
  float shaped = max(max(uShape.x, uShape.y), max(uShape.z, uShape.w));
  if (shaped > 0.001) pos = shapeProject(pos, uShape);

  // Anisotropic stretch, from the same mood.
  pos *= uStretch;

  // Panel distort — the SAME field as the liquid's sdBlob, so both forms wear
  // the same lumps: domain-warped fbm, domain normalised by the shared radius so
  // uFreq means one feature size everywhere, amplitude a fraction of that radius,
  // pushed along the radial direction (the liquid displaces its sphere radially).
  // The mood's multipliers ride on top, exactly as they do in the liquid.
  vec3 sp = (pos / FORM_R) * uFreq * uMoodF;
  vec3 wrp = sp + vec3(snoise(sp + vec3(0.0, uTime * 0.30, 0.0)),
                       snoise(sp + vec3(3.1, 1.7, uTime * 0.18)),
                       snoise(sp + vec3(9.2, 5.3, uTime * 0.12))) * 0.9;
  vec3 rdir = normalize(pos + vec3(1e-4));
  // Damped while a shape is held: the lumps are the blob's own texture, and at full
  // amplitude they eat the edges the objects are recognised by.
  pos += rdir * (fbm(wrp) * uDistort * uMoodD * FORM_R * (1.0 - 0.75 * shaped));
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = (1.6 + uAbout * 0.7) * (15.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uFade;
uniform float uRough;     // panel: 0 = mirror bead, 1 = fully matte
uniform vec3 uLo;
uniform vec3 uHi;
varying float vSeed;
void main(){
  // treat each sprite as a tiny sphere → reconstruct its surface normal
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d2 = dot(uv, uv);
  if (d2 > 0.25) discard; // round mask
  vec3 nrm = normalize(vec3(uv * 2.0, sqrt(max(0.0, 1.0 - 4.0 * d2))));
  // fake chrome: vertical env gradient (bright top / dark bottom) + key diffuse
  // + a hot specular glint → each particle reads as a polished metal bead.
  // Roughness mirrors the liquid's semantics rather than its formula (different
  // lighting model): the glint broadens then dies, and the env gradient
  // flattens to a single mid tone, so 1.0 is a matte bead with no metal left.
  float mirror = 1.0 - uRough;
  vec3 L = normalize(vec3(0.5, 0.85, 0.65));
  float diff = clamp(dot(nrm, L), 0.0, 1.0);
  float spec = pow(clamp(reflect(-L, nrm).z, 0.0, 1.0), mix(4.0, 32.0, mirror));
  float env = 0.5 + 0.5 * nrm.y;
  vec3 base = mix(uLo, uHi, mix(0.5, env, mirror));
  vec3 col = base * (0.3 + 0.8 * diff) + vec3(1.0) * spec * (0.9 + 0.5 * vSeed) * mirror;
  float a = smoothstep(0.25, 0.14, d2) * uFade;
  if (a < 0.02) discard;
  gl_FragColor = vec4(col, a);
}
`;

/**
 * DNA as a particle ensemble. ~3600 soft chrome-silver sprites rest in a sphere
 * (≈ the blob); as the About section arrives they fly out — with per-particle
 * stagger and turbulence — to trace two helical strands + ladder rungs. Reads as
 * particles assembling into a double helix, then docks left and spins on scroll.
 */
export function DnaParticles({ reduced }: Props) {
  const points = useRef<Points>(null);
  const appear = useRef(0); // load-in fade
  const modeVis = useRef(0); // eased visibility for the "particles" form mode
  const colScratch = useMemo(() => new Color(), []);

  // panel "Particles" slider (8..72) → particle count (density)
  const { particleDetail } = useBlobTweak();
  const N = Math.max(8000, Math.round(particleDetail * 900));

  // head model → the particles form a face (sampled on its surface).
  // facecap.glb ships KTX2-compressed textures → wire up a KTX2 transcoder so
  // the loader doesn't choke (we only need the geometry, but it parses the file).
  const gl = useThree((s) => s.gl);
  const { scene: headScene } = useGLTF("/models/skull.glb", true, true, (loader) => {
    const ktx2 = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(gl);
    (loader as unknown as { setKTX2Loader: (k: unknown) => void }).setKTX2Loader(ktx2);
  });
  const headMesh = useMemo<Mesh | null>(() => {
    const meshes: Mesh[] = [];
    headScene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) meshes.push(m);
    });
    return meshes[0] ?? null;
  }, [headScene]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uAbout: { value: 0 },
          uFade: { value: 0 },
          uRough: { value: 0.1 },
          uDistort: { value: 0.25 },
          uFreq: { value: 0.5 },
          uStretch: { value: new Vector3(1, 1, 1) },
          uMoodD: { value: 1 },
          uMoodF: { value: 1 },
          uShape: { value: new Vector4() },
          uLo: { value: new Color(0.45, 0.48, 0.54) },
          uHi: { value: new Color(0.95, 0.97, 1.0) },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
      }),
    []
  );

  const geometry = useMemo(() => {
    const home = new Float32Array(N * 3);
    const target = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const rnd = () => Math.random();

    // sample the head surface → particle target positions (the face)
    const center = new Vector3();
    let scale = 1;
    let sampler: MeshSurfaceSampler | null = null;
    const worldMat = new Matrix4();
    const normalMat = new Matrix3();
    if (headMesh) {
      // respect the glTF node transform (the model is stored lying down; its node
      // rotation stands it up) → sample local, then push to world space
      headMesh.updateWorldMatrix(true, false);
      worldMat.copy(headMesh.matrixWorld);
      normalMat.getNormalMatrix(worldMat);
      sampler = new MeshSurfaceSampler(headMesh).build();
      headMesh.geometry.computeBoundingBox();
      const lb = headMesh.geometry.boundingBox;
      if (lb) {
        const wb = new Box3().copy(lb).applyMatrix4(worldMat);
        wb.getCenter(center);
        const size = new Vector3();
        wb.getSize(size);
        scale = 3.6 / Math.max(size.x, size.y, size.z);
      }
    }
    const tp = new Vector3();
    const tn = new Vector3();

    for (let i = 0; i < N; i++) {
      // Golden-angle spiral, then a grain of jitter. The spiral alone is a perfect
      // lattice, and a perfect lattice moirés the moment it is projected onto a
      // curved surface — which is exactly what the hovered project's shape does to
      // this cloud (see shapeProject). The jitter is far too small to soften the
      // resting sphere and just enough to decorrelate the interference.
      const y = 1 - (i / (N - 1)) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i;
      const j = 0.035 * HOME_R;
      home[i * 3] = Math.cos(th) * rad * HOME_R + (Math.random() - 0.5) * j;
      home[i * 3 + 1] = y * HOME_R + (Math.random() - 0.5) * j;
      home[i * 3 + 2] = Math.sin(th) * rad * HOME_R + (Math.random() - 0.5) * j;

      if (sampler) {
        // sample the whole surface → the complete skull (no front-facing filter)
        sampler.sample(tp, tn);
        tp.applyMatrix4(worldMat).sub(center).multiplyScalar(scale); // → world, centred
        tn.applyMatrix3(normalMat).normalize();
        // dust: push a fraction of particles out along the normal (soft cloud edge)
        if (rnd() < 0.05) tp.addScaledVector(tn, rnd() * 0.2);
        // fine jitter so it isn't a perfectly tight shell
        tp.x += (rnd() - 0.5) * 0.03;
        tp.y += (rnd() - 0.5) * 0.03;
        tp.z += (rnd() - 0.5) * 0.03;
        // orientation is now applied live from the dev menu (skullDev) on the
        // points object, so we leave the baked target in raw (world) orientation
        target[i * 3] = tp.x;
        target[i * 3 + 1] = tp.y;
        target[i * 3 + 2] = tp.z;
      }
      seed[i] = rnd();
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(home, 3));
    geometry.setAttribute("aTarget", new BufferAttribute(target, 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seed, 1));
    return geometry;
  }, [N, headMesh]);

  useFrame((_, delta) => {
    const pts = points.current;
    if (!pts) return;
    const tw = blobTweak.get();
    // shared clock/turntable/scroll position — see formClock
    const s = formState();

    // visible from the hero (as the central sphere), only in "particles" mode
    appear.current += (1 - appear.current) * (1 - Math.pow(0.04, delta));
    const modeTarget = tw.mode === "particles" ? 1 : 0;
    modeVis.current += (modeTarget - modeVis.current) * (1 - Math.pow(0.06, delta));
    const fade = (reduced ? 1 : appear.current) * modeVis.current;

    const u = material.uniforms;
    u.uFade.value = fade;
    const on = fade > 0.004;
    pts.visible = on;
    if (!on) return;

    // scroll assembles the cluster (sphere) → skull + docks left, like the liquid.
    // No baseline term on the clock: Speed 0 must freeze this form too.
    u.uTime.value = s.time;
    u.uAbout.value = s.pres;

    // colour from the panel
    colScratch.set(tw.color);
    (u.uHi.value as Color).setRGB(colScratch.r, colScratch.g, colScratch.b);
    (u.uLo.value as Color).setRGB(colScratch.r * 0.5, colScratch.g * 0.5, colScratch.b * 0.5);
    u.uRough.value = tw.roughness;
    u.uDistort.value = tw.distort * DISTORT_MAX; // fraction of FORM_R, as the liquid
    u.uFreq.value = tw.freq;
    // hovered project → the same silhouette the liquid gets (see workHover)
    (u.uStretch.value as Vector3).set(s.mood.sx, s.mood.sy, s.mood.sz);
    u.uMoodD.value = s.mood.distort;
    u.uMoodF.value = s.mood.freq;
    const sh = s.mood.shapes;
    (u.uShape.value as Vector4).set(sh.gavel, sh.camera, sh.burger, sh.vase);

    pts.position.setX(s.dock);
    pts.scale.setScalar(GROUP_SCALE * s.scale);
    // baked base orientation + the shared turntable (around SPIN_AXIS)
    _qSpin.setFromAxisAngle(SPIN_AXIS, s.spin);
    pts.quaternion.copy(_qSpin).multiply(BASE_Q);
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} visible={false} />;
}
