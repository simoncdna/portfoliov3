"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3 } from "three";
import type { LineSegments } from "three";
import { blobTweak, SPIN_RATE, TIME_RATE, DISTORT_MAX, FORM_RADIUS } from "@/lib/blobTweak";
import { SNOISE, FORM_DISPLACE } from "@/lib/formField";

type Props = {
  about?: React.MutableRefObject<number>;
  scroll?: React.MutableRefObject<number>;
  reduced?: boolean;
};

const SPHERE_R = FORM_RADIUS; // shared with the liquid's BR and the cluster radius
/**
 * Grid resolution. LONGS is kept at roughly 2x LATS on purpose: a lat/long cell
 * spans half as much arc in longitude as in latitude for a given step count, so
 * that ratio is what makes the cells read as squares around the equator rather
 * than as tall slots.
 */
const LATS = 40; // parallels
const LONGS = 80; // meridians
const RING_SEG = 96; // subdivisions per line — smoothness, not cell count

const HELIX_R = 0.8;
const HELIX_H = 3.8;
const HELIX_TURNS = 1.0;
const TUBE_R = 0.14;
const RUNG_R = 0.09;
const RUNGS = 5;
// a strand runs ~6.3 units and its tube ~0.88 around, so these two counts keep
// the helix cells square too
const TUBE_SEG = 128; // steps along a strand
const TUBE_RADIAL = 16; // ring resolution around a tube
const RUNG_RADIAL = 10; // ring resolution around a rung
const RUNG_STEPS = 6; // rings along a rung
const DOCK_X = -3.6;

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
 * A line-segment builder that carries an explicit outward direction per vertex.
 *
 * Both the displacement and the shading need to know which way the surface
 * faces. A sphere could derive that from the position, but a tube cannot — its
 * outward direction follows the tube's own frame, not the distance from the
 * origin. Storing it as an attribute lets one shader serve every piece.
 */
class WireBuilder {
  pos: number[] = [];
  nrm: number[] = [];

  segment(a: Vector3, an: Vector3, b: Vector3, bn: Vector3) {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    this.nrm.push(an.x, an.y, an.z, bn.x, bn.y, bn.z);
  }

  /** Connects a closed ring of points, and optionally to the previous ring. */
  ring(points: Vector3[], normals: Vector3[], prev?: { points: Vector3[]; normals: Vector3[] }) {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.segment(points[i], normals[i], points[j], normals[j]);
      if (prev) this.segment(prev.points[i], prev.normals[i], points[i], normals[i]);
    }
  }

  build(): BufferGeometry {
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute("aNormal", new BufferAttribute(new Float32Array(this.nrm), 3));
    return geo;
  }
}

/** Clean lat/long wireframe globe (meridians + parallels), no triangulation. */
function buildGridSphere(r: number): BufferGeometry {
  const b = new WireBuilder();
  const TAU = Math.PI * 2;
  const at = (phi: number, th: number) => {
    const n = new Vector3(
      Math.sin(phi) * Math.cos(th),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(th)
    );
    return { p: n.clone().multiplyScalar(r), n };
  };

  for (let i = 1; i < LATS; i++) {
    const phi = (Math.PI * i) / LATS;
    for (let s = 0; s < RING_SEG; s++) {
      const A = at(phi, (TAU * s) / RING_SEG);
      const B = at(phi, (TAU * (s + 1)) / RING_SEG);
      b.segment(A.p, A.n, B.p, B.n);
    }
  }
  for (let j = 0; j < LONGS; j++) {
    const th = (TAU * j) / LONGS;
    for (let s = 0; s < RING_SEG; s++) {
      const A = at((Math.PI * s) / RING_SEG, th);
      const B = at((Math.PI * (s + 1)) / RING_SEG, th);
      b.segment(A.p, A.n, B.p, B.n);
    }
  }
  return b.build();
}

/**
 * The double helix as a quad-grid wireframe: rings around each strand plus
 * longitudinals along it.
 *
 * This replaces a TubeGeometry drawn with `wireframe: true`, which traced the
 * edges of the *triangles* — every quad crossed by a diagonal, which is what
 * made the form read as a debug view rather than a drawing. Generating the lines
 * from the tube's own parameterisation gives clean quads.
 */
function buildHelixWire(): BufferGeometry {
  const b = new WireBuilder();
  const TAU = Math.PI * 2;
  const twist = HELIX_TURNS * TAU;

  const strand = (phase: number) => {
    let prev: { points: Vector3[]; normals: Vector3[] } | undefined;
    for (let i = 0; i <= TUBE_SEG; i++) {
      const t = i / TUBE_SEG;
      const a = t * twist + phase;
      const centre = new Vector3(Math.cos(a) * HELIX_R, (t - 0.5) * HELIX_H, Math.sin(a) * HELIX_R);
      // A stable frame rather than a Frenet one: the radial direction in XZ is
      // never degenerate here, and it keeps the rings from twisting along the run.
      const radial = new Vector3(Math.cos(a), 0, Math.sin(a));
      const tangent = new Vector3(-Math.sin(a) * HELIX_R * twist, HELIX_H, Math.cos(a) * HELIX_R * twist).normalize();
      const bi = new Vector3().crossVectors(tangent, radial).normalize();

      const points: Vector3[] = [];
      const normals: Vector3[] = [];
      for (let k = 0; k < TUBE_RADIAL; k++) {
        const th = (TAU * k) / TUBE_RADIAL;
        const dir = radial
          .clone()
          .multiplyScalar(Math.cos(th))
          .addScaledVector(bi, Math.sin(th))
          .normalize();
        normals.push(dir);
        points.push(centre.clone().addScaledVector(dir, TUBE_R));
      }
      b.ring(points, normals, prev);
      prev = { points, normals };
    }
  };
  strand(0);
  strand(Math.PI);

  // rungs: short tubes bridging the two strands
  const up = new Vector3(0, 1, 0);
  for (let j = 0; j < RUNGS; j++) {
    const t = (j + 0.5) / RUNGS;
    const a = t * twist;
    const y = (t - 0.5) * HELIX_H;
    const A = new Vector3(Math.cos(a) * HELIX_R, y, Math.sin(a) * HELIX_R);
    const B = new Vector3(Math.cos(a + Math.PI) * HELIX_R, y, Math.sin(a + Math.PI) * HELIX_R);
    const axis = B.clone().sub(A).normalize();
    const u = new Vector3().crossVectors(axis, up).normalize();
    const v = new Vector3().crossVectors(axis, u).normalize();

    let prev: { points: Vector3[]; normals: Vector3[] } | undefined;
    for (let i = 0; i <= RUNG_STEPS; i++) {
      const centre = A.clone().lerp(B, i / RUNG_STEPS);
      const points: Vector3[] = [];
      const normals: Vector3[] = [];
      for (let k = 0; k < RUNG_RADIAL; k++) {
        const th = (TAU * k) / RUNG_RADIAL;
        const dir = u.clone().multiplyScalar(Math.cos(th)).addScaledVector(v, Math.sin(th)).normalize();
        normals.push(dir);
        points.push(centre.clone().addScaledVector(dir, RUNG_R));
      }
      b.ring(points, normals, prev);
      prev = { points, normals };
    }
  }

  return b.build();
}

/* -------------------------------------------------------------------------- */
/* material                                                                   */
/* -------------------------------------------------------------------------- */

const VERT = /* glsl */ `
uniform float uTime;
uniform float uDistort;
uniform float uFreq;
uniform float uPres;
attribute vec3 aNormal;
varying float vNz;
varying float vGlint;
varying float vDepth;
${SNOISE}
${FORM_DISPLACE}
void main(){
  // the outward direction doubles as the displacement axis and the shading normal
  vec3 pos = position + aNormal * formOffset(position);
  vec3 nView = normalize(normalMatrix * aNormal);
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
uniform float uGate;     // crossfade weight for this piece (sphere vs helix)
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
  float a = uFade * uGate * occl
          * (0.32 + 0.68 * near)
          * mix(0.9, 0.45 + 0.55 * vGlint, mirror);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;

/**
 * Wireframe form: a lat/long globe at the hero, cross-dissolving into a
 * wireframe double helix toward About — same shared displacement field, dock and
 * spin as the liquid and the particles.
 *
 * The two pieces share one shader and one set of field uniforms; only `uGate`
 * differs, which is what drives the crossfade.
 */
export function MeshDna({ about, scroll, reduced }: Props) {
  const sphereRef = useRef<LineSegments>(null);
  const helixRef = useRef<LineSegments>(null);
  const pres = useRef(0);
  const spin = useRef(0);
  const appear = useRef(0);
  const modeVis = useRef(0);
  const colScratch = useMemo(() => new Color(), []);

  const built = useMemo(() => {
    const makeMat = () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDistort: { value: 0 },
          uFreq: { value: 0.5 },
          uPres: { value: 0 },
          uFade: { value: 0 },
          uGate: { value: 0 },
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
      });

    return {
      sphereGeo: buildGridSphere(SPHERE_R),
      helixGeo: buildHelixWire(),
      sphereMat: makeMat(),
      helixMat: makeMat(),
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const tw = blobTweak.get();
    appear.current += (1 - appear.current) * (1 - Math.pow(0.04, delta));
    const modeTarget = tw.mode === "wire" ? 1 : 0;
    modeVis.current += (modeTarget - modeVis.current) * (1 - Math.pow(0.06, delta));
    const fade = (reduced ? 1 : appear.current) * modeVis.current;

    const on = fade > 0.004;
    if (sphereRef.current) sphereRef.current.visible = on;
    if (helixRef.current) helixRef.current.visible = on;
    if (!on) return;

    const target = reduced ? 0 : Math.max(0, Math.min(1, about?.current ?? 0));
    pres.current += (target - pres.current) * (reduced ? 1 : 1 - Math.pow(0.05, delta));
    const v = pres.current;

    spin.current += delta * tw.speed * SPIN_RATE;
    const rot = spin.current + (scroll?.current ?? 0) * Math.PI * 3.0;
    const dock = DOCK_X * v;
    const camDist = camera.position.length();

    colScratch.set(tw.color);
    for (const [mat, gate] of [
      [built.sphereMat, 1 - v],
      [built.helixMat, v],
    ] as const) {
      const u = mat.uniforms;
      u.uTime.value += delta * tw.speed * TIME_RATE;
      u.uDistort.value = tw.distort * DISTORT_MAX;
      u.uFreq.value = tw.freq;
      u.uPres.value = v;
      u.uFade.value = fade;
      u.uGate.value = gate;
      u.uRough.value = tw.roughness;
      u.uCamDist.value = camDist;
      (u.uHi.value as Color).setRGB(colScratch.r, colScratch.g, colScratch.b);
      (u.uLo.value as Color).setRGB(colScratch.r * 0.45, colScratch.g * 0.45, colScratch.b * 0.5);
    }

    for (const ref of [sphereRef, helixRef]) {
      const o = ref.current;
      if (!o) continue;
      o.position.setX(dock);
      o.rotation.set(0, rot, 0);
    }
    // nothing to draw once a piece has fully handed over
    if (sphereRef.current) sphereRef.current.visible = 1 - v > 0.004;
    if (helixRef.current) helixRef.current.visible = v > 0.004;
  });

  return (
    <>
      <lineSegments
        ref={sphereRef}
        geometry={built.sphereGeo}
        material={built.sphereMat}
        frustumCulled={false}
        visible={false}
      />
      <lineSegments
        ref={helixRef}
        geometry={built.helixGeo}
        material={built.helixMat}
        frustumCulled={false}
        visible={false}
      />
    </>
  );
}
