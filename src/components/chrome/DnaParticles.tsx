"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, BufferAttribute, Color, ShaderMaterial } from "three";
import type { Points } from "three";
import { blobTweak, useBlobTweak } from "@/lib/blobTweak";

type Props = {
  /** 0..1 presence of the About section (drives assembly / dock / spin) */
  about?: React.MutableRefObject<number>;
  /** whole-page scroll fraction 0..1 (scrubs rotation) */
  scroll?: React.MutableRefObject<number>;
  reduced?: boolean;
};

const HOME_R = 2.1; // rest cluster radius (matches the liquid blob BR)
const R = 0.8; // helix radius (matches the liquid HR)
const H = 3.8; // helix height (matches the liquid 2*HH)
const TURNS = 1.0; // a single loop, like the liquid DNA
const RUNGS = 5; // ladder steps
const STRAND_FRAC = 0.78; // share of particles on the strands (rest = rungs)
const TUBE_RADIUS = 0.17; // strands fill a tube of this radius (not a thin line)
const RUNG_RADIUS = 0.1; // rungs are tubes too
const DOCK_X = -3.6;
const GROUP_SCALE = 1.0;

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
attribute vec3 aTarget;
attribute float aSeed;
varying float vSeed;
${SNOISE}
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
  // panel distort: persistent living deformation of the whole cloud
  float fscale = 0.8 + uFreq * 1.4;
  vec3 dz = vec3(
    snoise(pos * fscale + vec3(uTime * 0.3, 0.0, 0.0)),
    snoise(pos * fscale + vec3(0.0, uTime * 0.25, 4.0)),
    snoise(pos * fscale + vec3(8.0, 0.0, uTime * 0.2))
  );
  pos += dz * uDistort;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = (1.6 + uAbout * 0.7) * (15.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uFade;
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
  // + a hot specular glint → each particle reads as a polished metal bead
  vec3 L = normalize(vec3(0.5, 0.85, 0.65));
  float diff = clamp(dot(nrm, L), 0.0, 1.0);
  float spec = pow(clamp(reflect(-L, nrm).z, 0.0, 1.0), 32.0);
  float env = 0.5 + 0.5 * nrm.y;
  vec3 base = mix(uLo, uHi, env);
  vec3 col = base * (0.3 + 0.8 * diff) + vec3(1.0) * spec * (0.9 + 0.5 * vSeed);
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
export function DnaParticles({ about, scroll, reduced }: Props) {
  const points = useRef<Points>(null);
  const pres = useRef(0);
  const spin = useRef(0);
  const appear = useRef(0); // load-in fade
  const modeVis = useRef(0); // eased visibility for the "particles" form mode
  const colScratch = useMemo(() => new Color(), []);

  // panel "Particles" slider (8..72) → particle count (density)
  const { particleDetail } = useBlobTweak();
  const N = Math.max(2000, Math.round(particleDetail * 260));

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uAbout: { value: 0 },
          uFade: { value: 0 },
          uDistort: { value: 0.25 },
          uFreq: { value: 0.5 },
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
    const strandPoint = (t: number, s: number) => {
      const a = t * TURNS * Math.PI * 2 + s * Math.PI;
      return [Math.cos(a) * R, (t - 0.5) * H, Math.sin(a) * R] as const;
    };
    // uniform random point inside a ball of radius r → fills a tube (not a line)
    const ball = (r: number): [number, number, number] => {
      let x = 0, y = 0, z = 0, d = 2;
      while (d > 1 || d === 0) {
        x = rnd() * 2 - 1;
        y = rnd() * 2 - 1;
        z = rnd() * 2 - 1;
        d = x * x + y * y + z * z;
      }
      return [x * r, y * r, z * r];
    };

    const nStrand = Math.floor(N * STRAND_FRAC);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i;
      home[i * 3] = Math.cos(th) * rad * HOME_R;
      home[i * 3 + 1] = y * HOME_R;
      home[i * 3 + 2] = Math.sin(th) * rad * HOME_R;

      let tx: number, ty: number, tz: number;
      if (i < nStrand) {
        const [px, py, pz] = strandPoint(rnd(), i % 2);
        const [ox, oy, oz] = ball(TUBE_RADIUS);
        tx = px + ox;
        ty = py + oy;
        tz = pz + oz;
      } else {
        const t = (Math.floor(rnd() * RUNGS) + 0.5) / RUNGS;
        const u = rnd();
        const [ax, ay, az] = strandPoint(t, 0);
        const [bx, by, bz] = strandPoint(t, 1);
        const [ox, oy, oz] = ball(RUNG_RADIUS);
        tx = ax + (bx - ax) * u + ox;
        ty = ay + (by - ay) * u + oy;
        tz = az + (bz - az) * u + oz;
      }
      target[i * 3] = tx;
      target[i * 3 + 1] = ty;
      target[i * 3 + 2] = tz;
      seed[i] = rnd();
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(home, 3));
    geometry.setAttribute("aTarget", new BufferAttribute(target, 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seed, 1));
    return geometry;
  }, [N]);

  useFrame((_, delta) => {
    const pts = points.current;
    if (!pts) return;
    const tw = blobTweak.get();

    // visible from the hero (as the central sphere), only in "particles" mode
    appear.current += (1 - appear.current) * (1 - Math.pow(0.04, delta));
    const modeTarget = tw.mode === "particles" ? 1 : 0;
    modeVis.current += (modeTarget - modeVis.current) * (1 - Math.pow(0.06, delta));
    const fade = appear.current * modeVis.current;

    const u = material.uniforms;
    u.uFade.value = fade;
    const on = fade > 0.004;
    pts.visible = on;
    if (!on) return;

    // scroll morphs the cluster (sphere) → DNA + docks left (same as the liquid)
    const target = reduced ? 0 : Math.max(0, Math.min(1, about?.current ?? 0));
    pres.current += (target - pres.current) * (reduced ? 1 : 1 - Math.pow(0.05, delta));
    const v = pres.current;
    u.uTime.value += delta * (0.5 + tw.speed);
    u.uAbout.value = v;

    // colour from the panel
    colScratch.set(tw.color);
    (u.uHi.value as Color).setRGB(colScratch.r, colScratch.g, colScratch.b);
    (u.uLo.value as Color).setRGB(colScratch.r * 0.5, colScratch.g * 0.5, colScratch.b * 0.5);
    u.uDistort.value = tw.distort * 0.55; // same as the liquid (0 = clean)
    u.uFreq.value = tw.freq;

    pts.position.setX(DOCK_X * v);
    pts.scale.setScalar(GROUP_SCALE);
    spin.current += delta * (0.5 + tw.speed) * 0.5;
    pts.rotation.set(0, spin.current + (scroll?.current ?? 0) * Math.PI * 3.0, 0);
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} visible={false} />;
}
