"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useFBO, useEnvironment } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  FloatType,
  LinearFilter,
  Matrix3,
  Mesh,
  OrthographicCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
} from "three";

type Props = {
  about?: React.MutableRefObject<number>;
  scroll?: React.MutableRefObject<number>;
  reduced?: boolean;
};

const N = 60000;
const HOME_R = 1.5;
const R = 0.72;
const H = 3.6;
const TURNS = 3.0;
const RUNGS = 18;
const STRAND_FRAC = 0.78;
const DOCK_X = -3.6;
const GROUP_SCALE = 1.35;
const P_RADIUS = 0.08; // splat radius (world) — smaller + more = smoother liquid
const FBO_SCALE = 0.9; // fluid buffers res vs screen (higher = sharper)
const FLOW_SPEED = 0.05; // particles travel along the strands (living flow)
const ENV_INTENSITY = 3.5;
const ENV_ROT_Y = 2.4; // match the scene's <Environment environmentRotation>

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

// Pass 1 — splat particles that FLOW along the strands; store view position
const POS_VERT = /* glsl */ `
uniform float uTime;
uniform float uAbout;
uniform float uPointScale;
uniform float uFlow;
attribute float aStrand;   // 0,1 = strands ; 2 = rung
attribute float aParam;    // strand base t / rung height
attribute float aU;        // rung interpolation
attribute float aSeed;
varying vec3 vView;
${SNOISE}
const float RR = ${R.toFixed(4)};
const float HH = ${H.toFixed(4)};
const float TT = ${TURNS.toFixed(4)};
vec3 helix(float t, float strand){
  float ang = t * TT * 6.28318530718 + strand * 3.14159265359;
  return vec3(cos(ang) * RR, (t - 0.5) * HH, sin(ang) * RR);
}
void main(){
  float p = clamp((uAbout - aSeed * 0.22) / 0.78, 0.0, 1.0);
  p = p * p * (3.0 - 2.0 * p);
  vec3 tgt;
  if (aStrand < 1.5) {
    float dir = aStrand < 0.5 ? 1.0 : -1.0;   // strands flow opposite ways
    float tt = fract(aParam + uTime * uFlow * dir + 1.0);
    tgt = helix(tt, aStrand);
  } else {
    tgt = mix(helix(aParam, 0.0), helix(aParam, 1.0), aU);
  }
  vec3 pos = mix(position, tgt, p);
  // living turbulence — persists even when assembled, stronger during flight
  float fly = sin(p * 3.14159265);
  float amp = 0.045 + 0.16 * fly;
  vec3 nz = vec3(
    snoise(pos * 1.2 + vec3(0.0, uTime * 0.4, aSeed * 12.0)),
    snoise(pos * 1.2 + vec3(5.2, uTime * 0.35, aSeed * 12.0)),
    snoise(pos * 1.2 + vec3(9.1, uTime * 0.3, aSeed * 12.0))
  );
  pos += nz * amp;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = mv.xyz;
  gl_PointSize = uPointScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const POS_FRAG = /* glsl */ `
varying vec3 vView;
void main(){
  vec2 uv = gl_PointCoord - vec2(0.5);
  if (dot(uv, uv) > 0.25) discard;
  gl_FragColor = vec4(vView, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(uSrc, vUv);
  vec3 psum = c.rgb * c.a;
  float wsum = c.a;
  float asum = c.a;
  float wtot = 1.0;
  for (int i = 1; i <= 7; i++){
    float w = exp(-float(i*i) / 24.0);
    vec2 off = uDir * float(i);
    vec4 s1 = texture2D(uSrc, vUv + off);
    vec4 s2 = texture2D(uSrc, vUv - off);
    float d1 = (s1.a > 0.5 && abs(s1.z - c.z) < 0.5) ? 1.0 : 0.0;
    float d2 = (s2.a > 0.5 && abs(s2.z - c.z) < 0.5) ? 1.0 : 0.0;
    psum += s1.rgb * s1.a * w * d1 + s2.rgb * s2.a * w * d2;
    wsum += s1.a * w * d1 + s2.a * w * d2;
    asum += s1.a * w + s2.a * w;
    wtot += 2.0 * w;
  }
  vec3 pos = wsum > 0.0001 ? psum / wsum : c.rgb;
  gl_FragColor = vec4(pos, asum / wtot);
}
`;

// Pass 3 — normals from smoothed position, chrome from the real HDRI
const SHADE_FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uFade;
uniform vec3 uLo;
uniform vec3 uHi;
uniform sampler2D uEnv;
uniform float uEnvInt;
uniform float uEnvRotY;
uniform mat3 uCamMat;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(uSrc, vUv);
  if (c.a < 0.06) discard;
  vec4 cx = texture2D(uSrc, vUv + vec2(uTexel.x, 0.0));
  vec4 cy = texture2D(uSrc, vUv + vec2(0.0, uTexel.y));
  vec3 P = c.rgb;
  vec3 Px = cx.a > 0.06 ? cx.rgb : P;
  vec3 Py = cy.a > 0.06 ? cy.rgb : P;
  vec3 n = normalize(cross(Px - P, Py - P));
  if (n.z < 0.0) n = -n;
  vec3 I = normalize(P);              // camera → surface (view space)
  vec3 Rv = reflect(I, n);            // reflection (view space)
  vec3 Rw = uCamMat * Rv;             // → world space
  float ca = cos(uEnvRotY), sa = sin(uEnvRotY);
  Rw = normalize(vec3(Rw.x * ca - Rw.z * sa, Rw.y, Rw.x * sa + Rw.z * ca));
  vec2 euv = vec2(atan(Rw.z, Rw.x) * 0.15915494 + 0.5, asin(clamp(Rw.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  vec3 env = texture2D(uEnv, euv).rgb * uEnvInt;
  env = vec3(1.0) - exp(-env * 1.3);  // exposure tone map → brighter silver mids
  float diff = clamp(dot(n, normalize(vec3(0.4, 0.7, 0.6))), 0.0, 1.0);
  float fres = pow(1.0 - clamp(dot(n, -I), 0.0, 1.0), 3.0);
  vec3 tint = mix(uLo, uHi, 0.75);
  vec3 col = env * tint + diff * 0.2 * vec3(1.0, 0.99, 0.96) + fres * vec3(1.0, 0.97, 0.92) * 0.3 + tint * 0.16;
  gl_FragColor = vec4(col, clamp(c.a, 0.0, 1.0) * uFade);
}
`;

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;

export function FluidDna({ about, scroll, reduced }: Props) {
  const { gl, camera, size } = useThree();
  const envMap = useEnvironment({ preset: "studio" });
  const pres = useRef(0);
  const spin = useRef(0);

  const fboW = Math.max(2, Math.floor(size.width * FBO_SCALE));
  const fboH = Math.max(2, Math.floor(size.height * FBO_SCALE));
  const fboOpts = { type: FloatType, minFilter: LinearFilter, magFilter: LinearFilter } as const;
  const rtA = useFBO(fboW, fboH, { ...fboOpts, depthBuffer: true });
  const rtB = useFBO(fboW, fboH, { ...fboOpts, depthBuffer: false });

  const built = useMemo(() => {
    const home = new Float32Array(N * 3);
    const aStrand = new Float32Array(N);
    const aParam = new Float32Array(N);
    const aU = new Float32Array(N);
    const seed = new Float32Array(N);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const rnd = () => Math.random();
    const nStrand = Math.floor(N * STRAND_FRAC);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i;
      home[i * 3] = Math.cos(th) * rad * HOME_R;
      home[i * 3 + 1] = y * HOME_R;
      home[i * 3 + 2] = Math.sin(th) * rad * HOME_R;
      if (i < nStrand) {
        aStrand[i] = i % 2;
        aParam[i] = rnd();
        aU[i] = 0;
      } else {
        aStrand[i] = 2;
        aParam[i] = (Math.floor(rnd() * RUNGS) + 0.5) / RUNGS;
        aU[i] = rnd();
      }
      seed[i] = rnd();
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(home, 3));
    geo.setAttribute("aStrand", new BufferAttribute(aStrand, 1));
    geo.setAttribute("aParam", new BufferAttribute(aParam, 1));
    geo.setAttribute("aU", new BufferAttribute(aU, 1));
    geo.setAttribute("aSeed", new BufferAttribute(seed, 1));

    const posMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAbout: { value: 0 }, uPointScale: { value: 200 }, uFlow: { value: FLOW_SPEED } },
      vertexShader: POS_VERT,
      fragmentShader: POS_FRAG,
      depthTest: true,
      depthWrite: true,
    });
    const points = new Points(geo, posMat);
    points.frustumCulled = false;
    const posScene = new Scene();
    posScene.add(points);

    const quadGeo = new BufferGeometry();
    quadGeo.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3)
    );
    quadGeo.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    quadGeo.setIndex([0, 1, 2, 0, 2, 3]);

    const blurMat = new ShaderMaterial({
      uniforms: { uSrc: { value: null }, uDir: { value: new Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const blurScene = new Scene();
    blurScene.add(new Mesh(quadGeo, blurMat));
    const orthoCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const shadeMat = new ShaderMaterial({
      uniforms: {
        uSrc: { value: null },
        uTexel: { value: new Vector2() },
        uFade: { value: 0 },
        uLo: { value: new Color(0.5, 0.5, 0.5) },
        uHi: { value: new Color(0.98, 0.98, 0.95) },
        uEnv: { value: null },
        uEnvInt: { value: ENV_INTENSITY },
        uEnvRotY: { value: ENV_ROT_Y },
        uCamMat: { value: new Matrix3() },
      },
      vertexShader: FS_VERT,
      fragmentShader: SHADE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    return { posMat, points, posScene, quadGeo, blurMat, blurScene, orthoCam, shadeMat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const t = reduced ? 0 : Math.max(0, Math.min(1, about?.current ?? 0));
    pres.current += (t - pres.current) * (reduced ? 1 : 1 - Math.pow(0.05, delta));
    const v = pres.current;
    const fade = Math.max(0, Math.min(1, (v - 0.02) / 0.38));
    built.shadeMat.uniforms.uFade.value = fade;
    // keep the flow/turbulence advancing even before fully present
    built.posMat.uniforms.uTime.value += delta;
    if (fade <= 0.004) return;

    const fov = (camera as { fov?: number }).fov ?? 42;
    const tanHalf = Math.tan((fov * Math.PI) / 180 / 2);
    built.posMat.uniforms.uAbout.value = v;
    built.posMat.uniforms.uPointScale.value = P_RADIUS * (fboH / (2 * tanHalf));
    built.points.position.setX(DOCK_X * v);
    built.points.scale.setScalar(GROUP_SCALE);
    spin.current += delta * 0.35;
    built.points.rotation.set(0, spin.current + (scroll?.current ?? 0) * Math.PI * 3.0, 0);

    built.shadeMat.uniforms.uEnv.value = envMap;
    (built.shadeMat.uniforms.uCamMat.value as Matrix3).setFromMatrix4(camera.matrixWorld);

    const prevRT = gl.getRenderTarget();
    const prevColor = new Color();
    gl.getClearColor(prevColor);
    const prevAlpha = gl.getClearAlpha();

    gl.setRenderTarget(rtA);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, false);
    gl.render(built.posScene, camera);

    built.blurMat.uniforms.uSrc.value = rtA.texture;
    (built.blurMat.uniforms.uDir.value as Vector2).set(1 / fboW, 0);
    gl.setRenderTarget(rtB);
    gl.render(built.blurScene, built.orthoCam);
    built.blurMat.uniforms.uSrc.value = rtB.texture;
    (built.blurMat.uniforms.uDir.value as Vector2).set(0, 1 / fboH);
    gl.setRenderTarget(rtA);
    gl.render(built.blurScene, built.orthoCam);

    built.shadeMat.uniforms.uSrc.value = rtA.texture;
    (built.shadeMat.uniforms.uTexel.value as Vector2).set(1 / fboW, 1 / fboH);

    gl.setRenderTarget(prevRT);
    gl.setClearColor(prevColor, prevAlpha);
  }, -1);

  return (
    <mesh
      frustumCulled={false}
      renderOrder={999}
      geometry={built.quadGeo}
      material={built.shadeMat}
    />
  );
}
