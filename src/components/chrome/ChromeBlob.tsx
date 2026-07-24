"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, Quaternion } from "three";
import type {
  Group,
  MeshStandardMaterial,
  WebGLProgramParametersWithUniforms,
} from "three";

type Vec2Ref = React.MutableRefObject<{ x: number; y: number }>;
type ClickRef = React.MutableRefObject<{
  fire: boolean;
  strength: number;
  ripple: number;
}>;

type Props = {
  scroll: React.MutableRefObject<number>;
  pointer: Vec2Ref;
  click: ClickRef;
  reduced: boolean;
  distort?: number;
  speed?: number;
  scale?: number;
};

/* GLSL injected into MeshStandardMaterial's vertex program. Keeps PBR chrome
   reflections (envMap) while displacing the surface with flowing simplex noise,
   a cursor-facing bulge, and a travelling click ripple. Normals are recomputed
   from neighbour samples so reflections stay correct on the deformed skin. */
const PRELUDE = /* glsl */ `
uniform float uTime;
uniform float uDistort;
uniform float uFreq;
uniform float uSpeed;
uniform vec3  uPointerDir;
uniform float uPointerStrength;
uniform vec3  uClickDir;
uniform float uRipple;
uniform float uClickStrength;

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

vec3 vDispPos;

float getDisp(vec3 pos, vec3 nrm){
  vec3 sp = pos * uFreq;
  float n  = snoise(sp + vec3(0.0, uTime*uSpeed, uTime*uSpeed*0.5));
  float n2 = snoise(sp*1.5 - vec3(uTime*uSpeed*0.8));
  float d = (n*0.9 + n2*0.1) * uDistort;
  float aim = max(dot(normalize(nrm), uPointerDir), 0.0);
  d += pow(aim, 3.0) * uPointerStrength;
  if(uClickStrength > 0.001){
    float ang = acos(clamp(dot(normalize(nrm), uClickDir), -1.0, 1.0));
    float band = exp(-pow(ang*3.0 - uRipple, 2.0) * 2.5);
    d += band * uClickStrength * 0.5;
  }
  return d;
}
`;

const NORMAL_BLOCK = /* glsl */ `
vec3 objectNormal = vec3(normal);
{
  vec3 nrm = normalize(objectNormal);
  vec3 tang = normalize(cross(nrm, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
  vec3 bitang = normalize(cross(nrm, tang));
  float e = 0.08;
  float d0 = getDisp(position, nrm);
  vDispPos = position + nrm * d0;
  vec3 pa = position + tang * e;
  vec3 pb = position + bitang * e;
  vec3 da = pa + nrm * getDisp(pa, nrm);
  vec3 db = pb + nrm * getDisp(pb, nrm);
  vec3 nn = normalize(cross(da - vDispPos, db - vDispPos));
  if(dot(nn, nrm) < 0.0) nn = -nn;
  objectNormal = nn;
}
`;

export function ChromeBlob({
  scroll,
  pointer,
  click,
  reduced,
  distort = 0.3,
  speed = 0.5,
  scale = 1.7,
}: Props) {
  const group = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const rot = useRef({ x: 0, y: 0 });
  const kick = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDistort: { value: distort },
      uFreq: { value: 0.4 },
      uSpeed: { value: speed },
      uPointerDir: { value: new Vector3(0, 0, 1) },
      uPointerStrength: { value: 0 },
      uClickDir: { value: new Vector3(0, 0, 1) },
      uRipple: { value: 0 },
      uClickStrength: { value: 0 },
    }),
    [distort, speed]
  );

  // scratch objects (never allocate in the frame loop)
  const scratch = useMemo(
    () => ({ wp: new Vector3(), op: new Vector3(), q: new Quaternion() }),
    []
  );

  const onBeforeCompile = useMemo(
    () => (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${PRELUDE}`)
        .replace("#include <beginnormal_vertex>", NORMAL_BLOCK)
        .replace("#include <begin_vertex>", "vec3 transformed = vDispPos;");
    },
    [uniforms]
  );

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    uniforms.uTime.value = t;

    if (reduced) {
      g.rotation.set(0.2, 0.7, -0.15);
      uniforms.uDistort.value = 0.26;
      uniforms.uPointerStrength.value = 0;
      uniforms.uClickStrength.value = 0;
      return;
    }

    const s = scroll.current;
    const p = pointer.current;

    // ---- rotation: idle drift + gentle pointer steer + scroll spin ----
    const targetY = t * 0.1 + p.x * 0.5 + s * 2.0;
    const targetX = Math.sin(t * 0.14) * 0.1 - p.y * 0.35 - s * 0.5;
    const k = 1 - Math.pow(0.0018, delta);
    rot.current.y += (targetY - rot.current.y) * k;
    rot.current.x += (targetX - rot.current.x) * k;
    g.rotation.set(rot.current.x, rot.current.y, Math.cos(t * 0.1) * 0.05);

    // ---- pointer bulge: world dir -> object space (anchored to screen) ----
    scratch.wp.set(p.x, -p.y, 1.1).normalize();
    scratch.q.copy(g.quaternion).invert();
    scratch.op.copy(scratch.wp).applyQuaternion(scratch.q);
    uniforms.uPointerDir.value.copy(scratch.op);
    uniforms.uPointerStrength.value +=
      (0.24 - uniforms.uPointerStrength.value) * (1 - Math.pow(0.02, delta));

    // ---- click ripple + scale kick ----
    const c = click.current;
    if (c.fire) {
      c.fire = false;
      c.strength = 1;
      c.ripple = 0;
      uniforms.uClickDir.value.copy(uniforms.uPointerDir.value);
      kick.current = 1;
    }
    if (c.strength > 0.001) {
      c.ripple += delta * 7;
      c.strength *= Math.exp(-delta * 2.1);
      uniforms.uRipple.value = c.ripple;
      uniforms.uClickStrength.value = c.strength;
    } else {
      uniforms.uClickStrength.value = 0;
    }

    // scale kick eases back to 1; brief roughness dip = spec flash
    kick.current *= Math.exp(-delta * 4.5);
    const sc = scale * (1 + kick.current * 0.06);
    g.scale.setScalar(sc);
    uniforms.uDistort.value = distort + s * 0.1 + kick.current * 0.15;
    // brief sharpen (spec flash) on click, resting at 0.06
    if (mat.current) mat.current.roughness = 0.12 - kick.current * 0.05;
  });

  return (
    <group ref={group} scale={scale}>
      <mesh frustumCulled={false}>
        <torusKnotGeometry args={[0.78, 0.68, 360, 52, 2, 3]} />
        <meshStandardMaterial
          ref={mat}
          metalness={1}
          roughness={0.12}
          envMapIntensity={1.05}
          color="#cbccca"
          onBeforeCompile={onBeforeCompile}
        />
      </mesh>
    </group>
  );
}
