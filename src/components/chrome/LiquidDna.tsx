"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEnvironment } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Color, Matrix3, ShaderMaterial, Vector2, Vector3 } from "three";
import type { Mesh } from "three";
import { blobTweak } from "@/lib/blobTweak";

type Props = {
  about?: React.MutableRefObject<number>;
  scroll?: React.MutableRefObject<number>;
  pointer?: React.MutableRefObject<{ x: number; y: number }>;
  reduced?: boolean;
};

const DOCK_X = -3.6;
const ENV_INTENSITY = 3.2;
const ENV_ROT_Y = 2.4;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
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
uniform float uDock;      // world x offset
uniform float uFade;
uniform float uRough;     // 0 = mirror, higher = duller (panel)
uniform float uDistort;   // living-noise amplitude (panel)
uniform float uFreq;      // living-noise frequency (panel)
uniform vec3  uCursorDir; // magnetic pull direction (local space)
uniform float uHover;     // 0..1 cursor-over-form strength
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

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0);
  return length(pa - ba*h) - r;
}

// ---------- shape constants ----------
const float BR    = 2.1;   // blob radius
const float HR    = 0.8;   // helix radius
const float TUBE  = 0.24;  // strand tube radius (chunky)
const float HH    = 1.9;   // helix half-height
const float TURNS = 1.0;   // a single intertwining loop
const float RUNG_R = 0.12;
const float RUNGS  = 5.0;
const float PI = 3.14159265359;

// one helical strand tube (approx: unwrap the helix in cylindrical coords)
float sdStrand(vec3 p, float phase){
  float twist = TURNS * 2.0 * PI / (2.0 * HH);
  float r = length(p.xz);
  float ang = atan(p.z, p.x);
  float a = p.y * twist + phase;
  float dif = ang - a;
  dif = atan(sin(dif), cos(dif));         // wrap to [-pi, pi]
  float d = length(vec2(r - HR, dif * HR)) - TUBE;
  d = max(d, abs(p.y) - HH);              // cap the ends
  return d;
}
float sdRungs(vec3 p){
  float twist = TURNS * 2.0 * PI / (2.0 * HH);
  float step = 2.0 * HH / RUNGS;
  float yy = mod(p.y + step*0.5, step) - step*0.5;
  float a = p.y * twist;
  vec3 dir = vec3(cos(a), 0.0, sin(a));
  float d = sdCapsule(vec3(p.x, yy, p.z), -HR*dir, HR*dir, RUNG_R);
  d = max(d, abs(p.y) - HH);
  return d;
}
float sdDna(vec3 p){
  float s0 = sdStrand(p, 0.0);
  float s1 = sdStrand(p, PI);
  float d = smin(s0, s1, 0.18);
  d = smin(d, sdRungs(p), 0.16);
  return d;
}
float sdBlob(vec3 p){
  float fscale = 0.8 + uFreq * 1.4;
  float n = snoise(p * fscale + vec3(0.0, uTime * 0.3, 0.0)) * uDistort;
  return length(p) - (BR + n);
}

// full scene SDF (blob → DNA morph + living flow)
float map(vec3 wp){
  // into local space: undock + unspin
  vec3 p = wp - vec3(uDock, 0.0, 0.0);
  float c = cos(uSpin), s = sin(uSpin);
  p = vec3(c*p.x - s*p.z, p.y, s*p.x + c*p.z);
  // magnetic lean: the whole piece drifts toward the cursor
  p -= uCursorDir * (uHover * 0.07);
  float dB = sdBlob(p);
  float dD = sdDna(p);
  float d = mix(dB, dD, uPres);
  // living surface flow (ripples), stronger once assembled
  float flow = snoise(p * 1.6 + vec3(uTime * 0.5, uTime * 0.35, 0.0)) * uDistort * (0.25 + 0.35 * uPres);
  d -= flow;
  // magnetic stretch: the cursor-facing side reaches out toward it
  float aim = max(dot(normalize(p + vec3(1e-4)), uCursorDir), 0.0);
  d -= pow(aim, 2.5) * uHover * 0.2;
  return d;
}
vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p+e.xyy) - map(p-e.xyy),
    map(p+e.yxy) - map(p-e.yxy),
    map(p+e.yyx) - map(p-e.yyx)
  ));
}
vec3 sampleEnv(vec3 dir){
  float ca = cos(uEnvRot), sa = sin(uEnvRot);
  vec3 d = normalize(vec3(dir.x*ca - dir.z*sa, dir.y, dir.x*sa + dir.z*ca));
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y,-1.0,1.0)) * 0.31830989 + 0.5);
  vec3 e = texture2D(uEnv, uv).rgb * uEnvInt;
  return vec3(1.0) - exp(-e * 1.3);       // exposure tone map
}

void main(){
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamRot * vec3(ndc * uTanHalf, -1.0));
  vec3 ro = uCamPos;

  // raymarch
  float t = 0.0;
  float d = 0.0;
  bool hit = false;
  for (int i = 0; i < 96; i++){
    vec3 p = ro + rd * t;
    d = map(p);
    if (d < 0.0015) { hit = true; break; }
    t += d * 0.9;
    if (t > 18.0) break;
  }
  if (!hit) discard;

  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  vec3 refl = reflect(rd, n);
  vec3 env = sampleEnv(refl);
  float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
  vec3 tint = mix(uLo, uHi, 0.75);
  // roughness (panel): 0 = punchy mirror, higher = duller with more matte fill
  vec3 col = env * tint * (1.2 - uRough * 1.1) + fres * vec3(1.0, 0.97, 0.92) * 0.4 + tint * (0.05 + uRough * 0.6);
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

export function LiquidDna({ about, scroll, pointer, reduced }: Props) {
  const { camera, size } = useThree();
  const envMap = useEnvironment({ preset: "studio" });
  const meshRef = useRef<Mesh>(null);
  const pres = useRef(0);
  const spin = useRef(0);
  const appear = useRef(0); // load-in fade (the liquid is the permanent hero form)
  const modeVis = useRef(1); // eased visibility for the "blob" (liquid) form mode
  const hover = useRef(0); // eased cursor-over-form strength
  const colScratch = useMemo(() => new Color(), []);
  const ndcScratch = useMemo(() => new Vector3(), []);
  const dirScratch = useMemo(() => new Vector3(), []);

  const { geometry, material } = useMemo(() => {
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
        uDock: { value: 0 },
        uFade: { value: 0 },
        uRough: { value: 0.12 },
        uDistort: { value: 0.25 },
        uFreq: { value: 0.5 },
        uCursorDir: { value: new Vector3(0, 0, 1) },
        uHover: { value: 0 },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const u = material.uniforms;
    const tw = blobTweak.get();

    // fade in on load; only visible while the panel's Form is "blob" (liquid)
    appear.current += (1 - appear.current) * (1 - Math.pow(0.04, delta));
    const modeTarget = tw.mode === "blob" ? 1 : 0;
    modeVis.current += (modeTarget - modeVis.current) * (1 - Math.pow(0.06, delta));
    const fade = (reduced ? 1 : appear.current) * modeVis.current;
    u.uFade.value = fade;
    if (meshRef.current) meshRef.current.visible = fade > 0.004;
    if (fade <= 0.004) return;

    // living motion + speed from the panel (speed 0 → fully frozen)
    u.uTime.value += delta * tw.speed * 1.3;

    // scroll morphs the liquid: blob (sphere) at hero → DNA docked left at About
    const target = reduced ? 0 : Math.max(0, Math.min(1, about?.current ?? 0));
    pres.current += (target - pres.current) * (reduced ? 1 : 1 - Math.pow(0.05, delta));
    const v = pres.current;
    u.uPres.value = v;
    u.uDock.value = DOCK_X * v;
    spin.current += delta * tw.speed * 0.7; // idle spin only when speed > 0
    u.uSpin.value = spin.current + (scroll?.current ?? 0) * Math.PI * 3.0;

    // panel-driven material: colour → tint, roughness, distort/freq → living noise
    colScratch.set(tw.color);
    (u.uHi.value as Vector3).set(colScratch.r, colScratch.g, colScratch.b);
    (u.uLo.value as Vector3).set(colScratch.r * 0.5, colScratch.g * 0.5, colScratch.b * 0.5);
    u.uRough.value = tw.roughness;
    u.uDistort.value = tw.distort * 0.55; // 0 in the panel → perfectly smooth
    u.uFreq.value = tw.freq;
    u.uEnv.value = envMap;

    // ---- magnetic hover: pull/stretch the piece toward the cursor ----
    let hoverTarget = 0;
    const ptr = pointer?.current;
    if (ptr && !reduced) {
      // where the form is on screen (its docked centre → NDC)
      ndcScratch.set(u.uDock.value, 0, 0).project(camera);
      const cx = ptr.x;
      const cy = -ptr.y; // pointer.y is top-down; NDC y is bottom-up
      const dx = cx - ndcScratch.x;
      const dy = cy - ndcScratch.y;
      hoverTarget = 1 - smoothstep(0.2, 0.65, Math.hypot(dx, dy));
      // cursor direction in the SDF's (spun) local frame
      const aspect = size.width / size.height;
      const ox = dx * aspect;
      const cs = Math.cos(u.uSpin.value);
      const sn = Math.sin(u.uSpin.value);
      dirScratch.set(cs * ox, dy, sn * ox);
      if (dirScratch.lengthSq() > 1e-6) dirScratch.normalize();
      (u.uCursorDir.value as Vector3).copy(dirScratch);
    }
    hover.current += (hoverTarget - hover.current) * (1 - Math.pow(0.02, delta));
    u.uHover.value = hover.current;

    const fov = (camera as { fov?: number }).fov ?? 42;
    const tanHalf = Math.tan((fov * Math.PI) / 180 / 2);
    (u.uTanHalf.value as Vector2).set(tanHalf * (size.width / size.height), tanHalf);
    (u.uCamPos.value as Vector3).copy(camera.position);
    (u.uCamRot.value as Matrix3).setFromMatrix4(camera.matrixWorld);
  });

  return <mesh ref={meshRef} frustumCulled={false} renderOrder={999} geometry={geometry} material={material} visible={false} />;
}
