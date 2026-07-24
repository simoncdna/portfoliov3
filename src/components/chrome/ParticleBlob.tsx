"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, ShaderMaterial } from "three";
import type { Group, Points } from "three";

/**
 * Point-cloud "real particle blob" — faithful to Eli Fitch's CodePen (opNeMW):
 * vertices of a subdivided icosahedron rendered as THREE.Points, soft round
 * sprites, displaced by animated Perlin/turbulence noise. Tinted chrome/silver.
 *
 * To make the solid→particles handover seamless, the particles reproduce the
 * SOLID blob's exact surface: same displacement (mode 0, shared uFlow/uDistort/
 * uFreq) in the same object space, and they copy the solid group's rotation +
 * scale each frame. Extra "churn" is layered in only as `hover` rises, so at the
 * crossfade the two shapes coincide and the dissolve reads as one continuous form.
 */

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
uniform float uHover;
uniform float uFlow;
uniform float uDistort;
uniform float uFreq;
varying float vN;
${SNOISE}
float fbm(vec3 p){ return snoise(p) * 0.7 + snoise(p * 2.1) * 0.3; }
// same mode-0 surface as the solid blob's shapeBase → particles sit on it
vec3 shapeM0(vec3 bp){
  vec3 n = normalize(bp);
  vec3 sp = bp * uFreq;
  vec3 wrp = sp + vec3(
    snoise(sp + vec3(0.0, uFlow, 0.0)),
    snoise(sp + vec3(3.1, 1.7, uFlow * 0.6)),
    snoise(sp + vec3(9.2, 5.3, uFlow * 0.4))
  ) * 0.9;
  return bp + n * (fbm(wrp) * uDistort);
}
float turb(vec3 p){
  float t = 0.0, f = 1.0, a = 0.55;
  for (int i = 0; i < 5; i++){ t += a * abs(snoise(p * f)); f *= 2.0; a *= 0.5; }
  return t;
}
void main(){
  vec3 bp = position;              // unit sphere, same as the solid geometry
  vec3 n = normalize(bp);
  vec3 base = shapeM0(bp);         // exact solid surface at the handover
  float churn = smoothstep(0.25, 1.0, uHover);
  float t = turb(bp * 0.9 + vec3(0.0, uTime * 0.3, 0.0));
  vec3 pos = base + n * (t * 0.4 * churn);
  vN = t;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = (1.1 + uHover * 1.7) * (12.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uHover;
uniform vec3 uLo;
uniform vec3 uHi;
varying float vN;
void main(){
  float d = length(gl_PointCoord - vec2(0.5));
  float a = smoothstep(0.5, 0.08, d) * uHover;
  if (a < 0.02) discard;
  vec3 col = mix(uLo, uHi, clamp(vN * 0.75 + 0.15, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}
`;

export function ParticleBlob({
  hover,
  reduced,
  blobGroup,
  shape,
}: {
  hover: React.MutableRefObject<number>;
  reduced: boolean;
  blobGroup: React.MutableRefObject<Group | null>;
  shape: React.MutableRefObject<{ flow: number; distort: number; freq: number }>;
}) {
  const points = useRef<Points>(null);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uHover: { value: 0 },
          uFlow: { value: 0 },
          uDistort: { value: 0.3 },
          uFreq: { value: 0.4 },
          uLo: { value: new Color(0.42, 0.45, 0.5) },
          uHi: { value: new Color(0.94, 0.96, 1.0) },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
      }),
    []
  );

  useFrame((state, delta) => {
    const pts = points.current;
    if (!pts) return;
    const hv = reduced ? 0 : hover.current;
    const u = material.uniforms;
    u.uHover.value = hv;
    u.uTime.value += delta;
    u.uFlow.value = shape.current.flow;
    u.uDistort.value = shape.current.distort;
    u.uFreq.value = shape.current.freq;
    pts.visible = hv > 0.004;
    if (!pts.visible) return;
    // overlay the solid blob exactly: same rotation + scale
    const bg = blobGroup.current;
    if (bg) {
      pts.quaternion.copy(bg.quaternion);
      pts.scale.copy(bg.scale);
    }
  });

  return (
    <points ref={points} frustumCulled={false}>
      <icosahedronGeometry args={[1, 56]} />
      <primitive object={material} attach="material" />
    </points>
  );
}
