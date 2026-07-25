"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
} from "three";
import type { LineSegments } from "three";
import { blobTweak, DISTORT_MAX, TIME_RATE, SPIN_RATE, FORM_RADIUS } from "@/lib/blobTweak";
import { SNOISE, FORM_DISPLACE } from "@/lib/formField";

type Props = {
  about?: React.MutableRefObject<number>;
  scroll?: React.MutableRefObject<number>;
  reduced?: boolean;
};

const DOCK_X = -3.6;
/** Contour planes per strand set. Doubled for the two sets → 2x this many rings. */
const RINGS = 15;
/** Segments per closed ring. High enough that the lumps read as smooth curves. */
const SEG = 128;
/** Helix geometry, matching the liquid's sdDna. */
const HELIX_R = 0.8;
const HELIX_H = 3.8;
const HELIX_TURNS = 1.0;
/** Radius of a slice taken through a strand tube. */
const SLICE_R = 0.3;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uDistort;
uniform float uFreq;
uniform float uPres;
attribute vec2 aBlob;    // (height, base radius) of the blob-state contour plane
attribute vec3 aHelix;   // (height, centre x, centre z) of the helix-state slice
varying float vGlint;
varying float vDepth;
${SNOISE}
${FORM_DISPLACE}
void main(){
  // the position attribute carries a unit circle in XZ — the ring's parameterisation
  vec3 dir = position;

  // ---- blob state: a planar contour of the lumpy sphere ----------------------
  // The offset is applied HORIZONTALLY only, so the ring stays in its plane —
  // that planarity is the whole point of the look. Pushing along the true 3D
  // radial would lift vertices out of the slice and it would read as a wobbly
  // cage rather than a section. Clamped so a deep trough cannot invert the ring
  // through the axis on the small rings near the poles.
  vec3 pb = vec3(dir.x * aBlob.y, aBlob.x, dir.z * aBlob.y);
  float rB = max(aBlob.y + formOffset(pb), 0.04);
  vec3 pBlob = vec3(dir.x * rB, aBlob.x, dir.z * rB);

  // ---- helix state: a small ring threaded onto one strand --------------------
  // Slicing a tilted tube analytically would give an ellipse; a circle is within
  // a pixel of it at this scale and keeps the vertex program branch-free.
  vec3 ph = vec3(aHelix.y + dir.x * ${SLICE_R.toFixed(2)}, aHelix.x, aHelix.z + dir.z * ${SLICE_R.toFixed(2)});
  vec3 pHel = ph + dir * (formOffset(ph) * 0.35);

  vec3 pos = mix(pBlob, pHel, uPres);

  // A line has no normal, but the ring's outward direction is a good stand-in.
  // Edge-on rings (the silhouette) glint; rings facing the camera stay dim —
  // the same fresnel logic the liquid uses, expressed in a stroke.
  vec3 nView = normalize(normalMatrix * vec3(dir.x, 0.0, dir.z));
  vGlint = pow(1.0 - abs(nView.z), 2.5);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uFade;
uniform float uRough;
uniform vec3 uLo;
uniform vec3 uHi;
uniform float uCamDist;
varying float vGlint;
varying float vDepth;
void main(){
  // Depth cue: far rings recede. Without it the stack reads as a flat tangle —
  // this is what supplies the volume, since the contours deliberately do not
  // occlude one another.
  float near = clamp((uCamDist + 2.6 - vDepth) / 5.2, 0.0, 1.0);
  float mirror = 1.0 - uRough;
  // rough flattens the glint and the depth grading toward an even, matte stroke
  float shade = mix(0.55, 0.25 + 0.75 * near, mirror);
  vec3 col = mix(uLo, uHi, mix(0.6, vGlint, mirror)) * shade;
  float a = uFade * mix(0.5, 0.28 + 0.72 * near, mirror) * (0.55 + 0.45 * vGlint);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;

/**
 * The form MEASURED: a stack of horizontal sections. Where the liquid gives you
 * the material and hides the geometry, the contours give you the geometry and
 * drop the material — each ring's radius reads the shared displacement field at
 * its height, so the lumps are legible from the curves alone.
 *
 * Two interleaved ring sets. In the blob state they alternate heights up the
 * sphere and read as one continuous stack; as About arrives they separate, each
 * set threading onto one strand of the double helix — so the section stack
 * becomes two spiral columns of rings.
 */
export function ContourDna({ about, scroll, reduced }: Props) {
  const lines = useRef<LineSegments>(null);
  const pres = useRef(0);
  const spin = useRef(0);
  const appear = useRef(0);
  const modeVis = useRef(0);
  const colScratch = useMemo(() => new Color(), []);

  const { geometry, material } = useMemo(() => {
    const TOTAL = RINGS * 2;
    const verts = TOTAL * SEG * 2; // closed loop as discrete segment pairs
    const position = new Float32Array(verts * 3);
    const aBlob = new Float32Array(verts * 2);
    const aHelix = new Float32Array(verts * 3);

    let v = 0;
    for (let i = 0; i < TOTAL; i++) {
      // blob state: planes spread evenly over the sphere, both sets interleaved
      // so at rest they form one stack instead of two coincident ones
      const phi = (Math.PI * (i + 0.5)) / TOTAL;
      const y0 = Math.cos(phi) * FORM_RADIUS;
      const r0 = Math.sin(phi) * FORM_RADIUS;

      // helix state: set parity picks the strand, the ring's own index its height
      const strand = i % 2;
      const t = (Math.floor(i / 2) + 0.5) / RINGS;
      const ang = t * HELIX_TURNS * Math.PI * 2 + strand * Math.PI;
      const y1 = (t - 0.5) * HELIX_H;
      const cx = Math.cos(ang) * HELIX_R;
      const cz = Math.sin(ang) * HELIX_R;

      for (let s = 0; s < SEG; s++) {
        const a0 = (Math.PI * 2 * s) / SEG;
        const a1 = (Math.PI * 2 * (s + 1)) / SEG;
        for (const a of [a0, a1]) {
          position[v * 3] = Math.cos(a);
          position[v * 3 + 1] = 0;
          position[v * 3 + 2] = Math.sin(a);
          aBlob[v * 2] = y0;
          aBlob[v * 2 + 1] = r0;
          aHelix[v * 3] = y1;
          aHelix[v * 3 + 1] = cx;
          aHelix[v * 3 + 2] = cz;
          v++;
        }
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("aBlob", new BufferAttribute(aBlob, 2));
    geometry.setAttribute("aHelix", new BufferAttribute(aHelix, 3));

    const material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDistort: { value: 0 },
        uFreq: { value: 0.5 },
        uPres: { value: 0 },
        uFade: { value: 0 },
        uRough: { value: 0.1 },
        uCamDist: { value: 10 },
        uLo: { value: new Color(0.5, 0.5, 0.5) },
        uHi: { value: new Color(0.9, 0.9, 0.9) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      // crossings accumulate into brighter nodes, which is how a stack of drawn
      // sections is supposed to read
      blending: AdditiveBlending,
    });
    return { geometry, material };
  }, []);

  useFrame(({ camera }, delta) => {
    const l = lines.current;
    if (!l) return;
    const tw = blobTweak.get();
    const u = material.uniforms;

    appear.current += (1 - appear.current) * (1 - Math.pow(0.04, delta));
    const modeTarget = tw.mode === "wire" ? 1 : 0;
    modeVis.current += (modeTarget - modeVis.current) * (1 - Math.pow(0.06, delta));
    const fade = (reduced ? 1 : appear.current) * modeVis.current;
    u.uFade.value = fade;
    l.visible = fade > 0.004;
    if (fade <= 0.004) return;

    const target = reduced ? 0 : Math.max(0, Math.min(1, about?.current ?? 0));
    pres.current += (target - pres.current) * (reduced ? 1 : 1 - Math.pow(0.05, delta));
    const v = pres.current;

    // same field, same mapping as the liquid and the particles
    u.uTime.value += delta * tw.speed * TIME_RATE;
    u.uDistort.value = tw.distort * DISTORT_MAX;
    u.uFreq.value = tw.freq;
    u.uPres.value = v;
    u.uRough.value = tw.roughness;
    u.uCamDist.value = camera.position.length();

    colScratch.set(tw.color);
    (u.uHi.value as Color).setRGB(colScratch.r, colScratch.g, colScratch.b);
    (u.uLo.value as Color).setRGB(colScratch.r * 0.45, colScratch.g * 0.45, colScratch.b * 0.5);

    l.position.setX(DOCK_X * v);
    spin.current += delta * tw.speed * SPIN_RATE;
    l.rotation.set(0, spin.current + (scroll?.current ?? 0) * Math.PI * 3.0, 0);
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
