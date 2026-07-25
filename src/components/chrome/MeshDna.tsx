"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, ShaderMaterial } from "three";
import type { LineSegments } from "three";
// the form's radius arrives through FORM_DISPLACE's FORM_R, on the GLSL side
import { blobTweak, DISTORT_MAX } from "@/lib/blobTweak";
import { SNOISE, FORM_DISPLACE } from "@/lib/formField";
import { formState } from "@/lib/formClock";

type Props = {
  reduced?: boolean;
};

/**
 * Grid resolution. LONGS is kept at roughly 2x LATS on purpose: a lat/long cell
 * spans half as much arc in longitude as in latitude for a given step count, so
 * that ratio is what makes the cells read as squares around the equator rather
 * than as tall slots.
 */
const LATS = 40; // parallels
const LONGS = 80; // meridians
const RING_SEG = 96; // subdivisions per line — smoothness, not cell count

/**
 * How visible the far side is. 0 makes the form an opaque shell and it loses its
 * wireframe character; past ~0.45 the depth cue collapses and it reads as a flat
 * tangle again. This is the value we settled on by eye.
 */
const BACK_SIDE = 0.28;

/* -------------------------------------------------------------------------- */
/* geometry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Lat/long wireframe globe, stored as UNIT sphere directions rather than as
 * points at the form's radius.
 *
 * The direction is the datum the morph needs: the DNA mapping takes a point on
 * the unit sphere and remaps it, so scaling to the form's radius belongs in the
 * shader, on the sphere side of the blend only.
 */
function buildGridSphere(): BufferGeometry {
  const pos: number[] = [];
  const TAU = Math.PI * 2;
  const push = (phi: number, th: number) => {
    pos.push(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
  };

  for (let i = 1; i < LATS; i++) {
    const phi = (Math.PI * i) / LATS;
    for (let s = 0; s < RING_SEG; s++) {
      push(phi, (TAU * s) / RING_SEG);
      push(phi, (TAU * (s + 1)) / RING_SEG);
    }
  }
  for (let j = 0; j < LONGS; j++) {
    const th = (TAU * j) / LONGS;
    for (let s = 0; s < RING_SEG; s++) {
      push((Math.PI * s) / RING_SEG, th);
      push((Math.PI * (s + 1)) / RING_SEG, th);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  return geo;
}

/* -------------------------------------------------------------------------- */
/* material                                                                   */
/* -------------------------------------------------------------------------- */

const VERT = /* glsl */ `
uniform float uTime;
uniform float uDistort;
uniform float uFreq;
uniform float uPres;
varying float vNz;
varying float vGlint;
varying float vDepth;
${SNOISE}
${FORM_DISPLACE}

const float PI = 3.14159265359;
// Matched to the liquid's sdDna so the wireframe docks at the same size: the
// helix reaches ~1.04 from its axis and stands 3.8 tall.
const float DNA_XZ = 2.15;
const float DNA_Y  = 1.9;
const float TURNS  = 1.0;
const float RUNGS  = 5.0;

/**
 * Remaps a point on the unit sphere onto a double-helix silhouette, keeping the
 * grid's connectivity intact — which is the whole reason this form can morph at
 * all. A mesh has edges, so unlike the liquid's implicit surface or the free
 * particles it cannot change topology; the DNA has to be reachable by moving
 * vertices only.
 *
 * The cross-section radius is modulated by angle so it bulges into two lobes
 * 180 degrees apart (the strands) with a thin waist between them, and the lobe
 * angle winds with height so the bulges spiral. Periodic pulses fill the waist
 * into the rungs. Ported from the original vertex-displaced blob.
 *
 * The strands stay joined by that thin waist rather than being separate tubes —
 * the price of preserving topology, and visible as a faint web between them.
 */
vec3 dnaShape(vec3 bp){
  float y = clamp(bp.y, -1.0, 1.0);
  float theta = atan(bp.z, bp.x);
  float tw = theta - TURNS * y * PI + uTime * 0.2;
  float lobe = pow(abs(cos(tw)), 1.3);
  float R = 0.14 + 0.34 * lobe;
  float rung = pow(0.5 + 0.5 * cos(y * PI * RUNGS), 22.0);
  R += rung * 0.16;
  R *= 1.0 - smoothstep(0.72, 1.0, abs(y));   // taper both ends to a point
  vec2 dir = normalize(vec2(bp.x, bp.z) + vec2(1e-4));
  return vec3(dir.x * R * DNA_XZ, y * DNA_Y, dir.y * R * DNA_XZ);
}

/** The base surface, before the shared noise displacement. */
vec3 morph(vec3 bp){
  return mix(bp * FORM_R, dnaShape(bp), uPres);
}

void main(){
  vec3 bp = normalize(position);

  // The stored sphere direction stops being the surface normal the moment the
  // DNA mapping kicks in, and the normal is what drives the front/back occlusion
  // that carries this whole form — so it is rebuilt from the mapping itself, by
  // differencing two tangential samples. dnaShape is analytic, so this is cheap.
  vec3 axis = abs(bp.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t1 = normalize(cross(bp, axis));
  vec3 t2 = cross(bp, t1);
  float e = 0.02;
  vec3 p0 = morph(bp);
  vec3 p1 = morph(normalize(bp + t1 * e));
  vec3 p2 = morph(normalize(bp + t2 * e));
  vec3 nrm = cross(p1 - p0, p2 - p0);
  nrm = length(nrm) > 1e-9 ? normalize(nrm) : bp;
  if (dot(nrm, bp) < 0.0) nrm = -nrm;         // keep it pointing outward

  vec3 pos = p0 + nrm * formOffset(p0);

  vec3 nView = normalize(normalMatrix * nrm);
  vNz = nView.z;
  // edge-on lines catch the light, lines facing the camera stay dim — the same
  // fresnel the liquid uses, expressed in a stroke
  vGlint = pow(1.0 - abs(nView.z), 2.0);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uFade;
uniform float uRough;
uniform float uBack;
uniform float uCamDist;
uniform vec3 uLo;
uniform vec3 uHi;
varying float vNz;
varying float vGlint;
varying float vDepth;
void main(){
  // Occlusion without a depth buffer. These are line segments, so there are no
  // faces to depth-test against — but every vertex knows which way it faces, so
  // the far side can simply be attenuated. Softened across the silhouette so the
  // transition does not snap as the form turns.
  float front = smoothstep(-0.12, 0.12, vNz);
  float occl = mix(uBack, 1.0, front);
  // depth grading, which is what turns a tangle of lines into a volume
  float near = clamp((uCamDist + 2.6 - vDepth) / 5.2, 0.0, 1.0);
  float mirror = 1.0 - uRough;
  vec3 col = mix(uLo, uHi, mix(0.65, vGlint, mirror)) * (0.45 + 0.55 * near);
  float a = uFade * occl
          * (0.32 + 0.68 * near)
          * mix(0.9, 0.45 + 0.55 * vGlint, mirror);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;

/**
 * Wireframe form: a lat/long globe that winds itself into a double helix as
 * About arrives — one geometry throughout, morphed rather than cross-faded, so
 * it behaves like the liquid and the particles instead of dissolving between two
 * separate objects. Shares the displacement field, dock and spin with them.
 */
export function MeshDna({ reduced }: Props) {
  const lines = useRef<LineSegments>(null);
  const appear = useRef(0);
  const modeVis = useRef(0);
  const colScratch = useMemo(() => new Color(), []);

  const { geometry, material } = useMemo(
    () => ({
      geometry: buildGridSphere(),
      material: new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDistort: { value: 0 },
          uFreq: { value: 0.5 },
          uPres: { value: 0 },
          uFade: { value: 0 },
          uRough: { value: 0.1 },
          uBack: { value: BACK_SIDE },
          uCamDist: { value: 10 },
          uLo: { value: new Color(0.45, 0.45, 0.5) },
          uHi: { value: new Color(0.9, 0.9, 0.9) },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    }),
    []
  );

  useFrame(({ camera }, delta) => {
    const l = lines.current;
    if (!l) return;
    const tw = blobTweak.get();
    const u = material.uniforms;
    // shared clock/turntable/scroll position — see formClock
    const s = formState();

    appear.current += (1 - appear.current) * (1 - Math.pow(0.04, delta));
    const modeTarget = tw.mode === "wire" ? 1 : 0;
    modeVis.current += (modeTarget - modeVis.current) * (1 - Math.pow(0.06, delta));
    const fade = (reduced ? 1 : appear.current) * modeVis.current;
    u.uFade.value = fade;
    l.visible = fade > 0.004;
    if (fade <= 0.004) return;

    u.uTime.value = s.time;
    u.uDistort.value = tw.distort * DISTORT_MAX;
    u.uFreq.value = tw.freq;
    u.uPres.value = s.pres;
    u.uRough.value = tw.roughness;
    u.uCamDist.value = camera.position.length();

    colScratch.set(tw.color);
    (u.uHi.value as Color).setRGB(colScratch.r, colScratch.g, colScratch.b);
    (u.uLo.value as Color).setRGB(colScratch.r * 0.45, colScratch.g * 0.45, colScratch.b * 0.5);

    l.position.setX(s.dock);
    l.scale.setScalar(s.scale);
    l.rotation.set(0, s.spin, 0);
  });

  return (
    <lineSegments
      ref={lines}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      visible={false}
    />
  );
}
