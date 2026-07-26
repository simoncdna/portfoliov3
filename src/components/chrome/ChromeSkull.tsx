"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useEnvironment, useGLTF } from "@react-three/drei";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Matrix3,
  Matrix4,
  ShaderMaterial,
  Vector3,
} from "three";
import type { Mesh } from "three";
import { blobTweak, DISTORT_MAX, FORM_RADIUS } from "@/lib/blobTweak";
import { SNOISE, FORM_DISPLACE, CHROME_SHADE, ENV_INTENSITY, ENV_ROT_Y } from "@/lib/formField";
import { formState } from "@/lib/formClock";

type Props = {
  reduced?: boolean;
};

const MODEL = "/models/skull.glb";

/** Longest axis in world units — the same framing the particle skull uses. */
const SKULL_SPAN = 3.6;

/**
 * Baked base orientation, found by eye and shared with the particle skull.
 * Applied to the vertices rather than to the object, so the object's own rotation
 * stays a pure Y turntable — which is what the liquid does, and the two have to
 * spin alike to hand over to one another.
 */
const TILT = new Euler(0.524, 0.175, -0.087);

/**
 * The resting sphere has to be the *same* sphere the liquid raymarches, because
 * the two cross-fade on top of one another — so it cannot simply be a sphere of
 * the right radius, it has to be one that deviates nowhere the eye can check.
 *
 * Flattening the skull onto an exact sphere would stack its inner surfaces
 * (cranial cavity, sinuses, the far side of the jaw) exactly on top of its outer
 * ones and z-fight across the whole silhouette. So the deep vertices tuck *inward*
 * instead: everything from TUCK_FROM of the mean radius outward — i.e. everything
 * that can reach the silhouette — sits at exactly FORM_RADIUS, and only what is
 * hidden inside moves. An outward version of this (which is what the first pass
 * did) costs ~3% of the radius on the silhouette: 8 px on screen, and visible at
 * the handover.
 */
const TUCK = 0.14;
const TUCK_FROM = 0.8;

/** Swirl amplitude while the vertices are in flight (world units, peaks mid-morph). */
const FLY = 0.26;

/* -------------------------------------------------------------------------- */
/* material                                                                   */
/* -------------------------------------------------------------------------- */

const VERT = /* glsl */ `
uniform float uTime;
uniform float uDistort;
uniform float uFreq;
uniform float uPres;
uniform float uFly;
attribute vec3 aTarget;
attribute float aSeed;
varying vec3 vNrm;
varying vec3 vWPos;
${SNOISE}
${FORM_DISPLACE}

const float PI = 3.14159265359;

/**
 * Where the vertex sits before the surface noise: somewhere between its home on
 * the sphere and its seat on the skull, plus a swirl while it travels.
 *
 * The swirl is sampled on the home *direction* at low frequency, so neighbouring
 * vertices are pushed the same way and the shell stretches rather than tears —
 * this is a connected surface, not a particle cloud.
 */
vec3 baseAt(vec3 home, float w){
  vec3 p = mix(home, aTarget, w);
  vec3 d = normalize(home + vec3(1e-4));
  float fly = sin(w * PI);
  vec3 nz = vec3(snoise(d * 1.1 + vec3(0.0, uTime * 0.25, 0.0)),
                 snoise(d * 1.1 + vec3(4.7, uTime * 0.20, 1.3)),
                 snoise(d * 1.1 + vec3(8.3, uTime * 0.15, 2.6)));
  return p + nz * fly * uFly;
}

void main(){
  // Staggered arrival on a spatially coherent key: the form assembles in waves
  // (jaw first, cranium last) instead of scaling up as one piece. Coherent so
  // neighbours stay neighbours — see baseAt.
  float w = clamp((uPres - aSeed * 0.25) / 0.75, 0.0, 1.0);
  w = w * w * (3.0 - 2.0 * w);

  vec3 p0 = baseAt(position, w);
  // Morph-target normal: the normal attribute is the skull's, normalize(position)
  // is the sphere's, and the surface in between is close enough to their blend.
  vec3 nrm = normalize(mix(normalize(position + vec3(1e-4)), normal, w));

  // The shared lump/flow field. Sampled twice, because the liquid's surface is the
  // one where the field is evaluated ON the surface — its SDF marches until
  // |p| = R + noise(p) — while a single sample here would evaluate it on the sphere
  // *underneath* the surface. That is a domain offset of up to the lump amplitude,
  // so the two spheres end up wearing the same lumps in slightly different places:
  // the other half of why the handover used to show. One fixed-point step lands
  // close enough that the difference is under a pixel.
  float f = formOffset(p0);
  f = formOffset(p0 + nrm * f);
  vec3 ps = p0 + nrm * f;

  // Its gradient too, because a mirror shows normals rather than positions:
  // displacing without re-normalling would leave the metal looking like a smooth
  // sphere with a lumpy outline.
  float e = 0.06;
  vec3 grad = (vec3(formOffset(ps + vec3(e, 0.0, 0.0)),
                    formOffset(ps + vec3(0.0, e, 0.0)),
                    formOffset(ps + vec3(0.0, 0.0, e))) - f) / e;
  vec3 nOut = normalize(nrm - (grad - nrm * dot(grad, nrm)));

  vec4 wp = modelMatrix * vec4(ps, 1.0);
  vWPos = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * nOut);   // uniform scale → normalize suffices
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
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
${CHROME_SHADE}
void main(){
  vec3 rd = normalize(vWPos - uCamPos);
  vec3 n = normalize(vNrm);
  // Faces we are looking at from behind: the skull's inner surfaces seen through
  // the sockets, and the folds the sphere state necessarily has (a skull is not
  // star-shaped, so flattening it onto a sphere turns some of it inside out).
  // Reflecting off a back-facing normal would read as a hole in the metal.
  if (dot(n, rd) > 0.0) n = -n;
  gl_FragColor = vec4(chromeShade(n, rd), uFade);
}
`;

/* -------------------------------------------------------------------------- */
/* geometry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The skull's own vertices, each paired with a home on the resting sphere.
 *
 * Radial pairing (home = the vertex's own direction from the centre) is what makes
 * the morph read as the metal flowing outward into a face rather than as one
 * object dissolving into another: every vertex travels along its own radius.
 */
function buildMorphGeometry(src: Mesh): BufferGeometry {
  src.updateWorldMatrix(true, false);

  // The glTF node carries a translation, so sample in world space; then centre and
  // normalise to SKULL_SPAN, then tilt — the same normalisation as the particles,
  // so the two representations occupy exactly the same volume.
  const wb = new Box3()
    .setFromBufferAttribute(src.geometry.getAttribute("position") as BufferAttribute)
    .applyMatrix4(src.matrixWorld);
  const centre = wb.getCenter(new Vector3());
  const span = wb.getSize(new Vector3());
  const s = SKULL_SPAN / Math.max(span.x, span.y, span.z);

  const toForm = new Matrix4()
    .makeRotationFromEuler(TILT)
    .multiply(new Matrix4().makeScale(s, s, s))
    .multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
    .multiply(src.matrixWorld);
  const toFormNrm = new Matrix3().getNormalMatrix(toForm);

  const srcPos = src.geometry.getAttribute("position");
  const srcNrm = src.geometry.getAttribute("normal");
  const n = srcPos.count;

  const home = new Float32Array(n * 3);
  const target = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const seed = new Float32Array(n);

  const p = new Vector3();
  const nrm = new Vector3();

  // mean radius first — the shell offset is measured against it, so the sphere
  // keeps FORM_RADIUS on average whatever the model's proportions are
  let meanR = 0;
  for (let i = 0; i < n; i++) {
    meanR += p.fromBufferAttribute(srcPos, i).applyMatrix4(toForm).length();
  }
  meanR /= n || 1;

  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(srcPos, i).applyMatrix4(toForm);
    target[i * 3] = p.x;
    target[i * 3 + 1] = p.y;
    target[i * 3 + 2] = p.z;

    const r = p.length() || 1e-4;
    const deep = Math.max(0, 1 - r / (meanR * TUCK_FROM));
    const k = (FORM_RADIUS * (1 - deep * TUCK)) / r;
    home[i * 3] = p.x * k;
    home[i * 3 + 1] = p.y * k;
    home[i * 3 + 2] = p.z * k;

    nrm.fromBufferAttribute(srcNrm, i).applyMatrix3(toFormNrm).normalize();
    normal[i * 3] = nrm.x;
    normal[i * 3 + 1] = nrm.y;
    normal[i * 3 + 2] = nrm.z;

    // assembly key: bottom-up, with a touch of jitter so the wave has a grain.
    // Kept small enough that neighbours still arrive together.
    seed[i] = Math.min(1, Math.max(0, 0.5 + (0.5 * p.y) / (SKULL_SPAN * 0.5) + (Math.random() - 0.5) * 0.06));
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(home, 3));
  geo.setAttribute("normal", new BufferAttribute(normal, 3));
  geo.setAttribute("aTarget", new BufferAttribute(target, 3));
  geo.setAttribute("aSeed", new BufferAttribute(seed, 1));
  if (src.geometry.index) geo.setIndex(src.geometry.index);
  return geo;
}

/* -------------------------------------------------------------------------- */

/**
 * The blob's assembled form: a chrome skull the resting sphere flows into as the
 * About section arrives.
 *
 * It exists as a separate object from the liquid because the liquid is a
 * raymarched SDF and this is 98k real vertices — there is no morphing one into the
 * other. They cross-fade instead, inside the first few percent of the morph where
 * both are still drawing the same noise-displaced sphere (see HANDOVER_* in
 * formChoreo): same radius, same field, same clock, so the swap has nothing to
 * show. Everything after that point is this mesh.
 */
export function ChromeSkull({ reduced }: Props) {
  const meshRef = useRef<Mesh>(null);
  const envMap = useEnvironment({ preset: "studio" });
  const appear = useRef(0);
  const modeVis = useRef(0);
  const colScratch = useMemo(() => new Color(), []);

  const { scene } = useGLTF(MODEL);
  const source = useMemo<Mesh | null>(() => {
    let found: Mesh | null = null;
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!found && m.isMesh && m.geometry) found = m;
    });
    return found;
  }, [scene]);

  const geometry = useMemo(() => (source ? buildMorphGeometry(source) : null), [source]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDistort: { value: 0.25 },
          uFreq: { value: 0.5 },
          uPres: { value: 0 },
          uFly: { value: FLY },
          uFade: { value: 0 },
          uRough: { value: 0.12 },
          uEnv: { value: null },
          uEnvInt: { value: ENV_INTENSITY },
          uEnvRot: { value: ENV_ROT_Y },
          uLo: { value: new Color(0.5, 0.5, 0.5) },
          uHi: { value: new Color(0.98, 0.98, 0.95) },
          uCamPos: { value: new Vector3() },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        side: DoubleSide,
      }),
    []
  );

  useFrame(({ camera }, delta) => {
    const m = meshRef.current;
    if (!m) return;
    const tw = blobTweak.get();
    const u = material.uniforms;

    // Clock, turntable and scroll position come from the shared form clock. This
    // form mounts late (it suspends on a 8.9 MB glb) and is hidden for the whole
    // Hero, so any state of its own would start and stop at moments that have
    // nothing to do with the liquid's — and it has to be drawing the same instant
    // of the same field, in the same place, to take the frame over invisibly.
    const s = formState();

    appear.current += (1 - appear.current) * (1 - Math.pow(0.04, delta));
    const modeTarget = tw.mode === "blob" ? 1 : 0;
    modeVis.current += (modeTarget - modeVis.current) * (1 - Math.pow(0.06, delta));

    const fade = (reduced ? 1 : appear.current) * modeVis.current * s.skullOn;
    u.uFade.value = fade;
    const on = fade > 0.004;
    m.visible = on;
    if (!on) return;

    u.uTime.value = s.time;
    u.uPres.value = s.pres;
    u.uDistort.value = tw.distort * DISTORT_MAX;
    u.uFreq.value = tw.freq;
    u.uRough.value = tw.roughness;
    u.uFly.value = reduced ? 0 : FLY;
    u.uEnv.value = envMap;
    (u.uCamPos.value as Vector3).copy(camera.position);

    colScratch.set(tw.color);
    (u.uHi.value as Color).setRGB(colScratch.r, colScratch.g, colScratch.b);
    (u.uLo.value as Color).setRGB(colScratch.r * 0.5, colScratch.g * 0.5, colScratch.b * 0.5);

    m.position.set(s.dockX, s.dockY, 0);
    m.scale.setScalar(s.scale);
    m.rotation.set(0, s.spin, 0);
  });

  if (!geometry) return null;
  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      visible={false}
    />
  );
}

useGLTF.preload(MODEL);
