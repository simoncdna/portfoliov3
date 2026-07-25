/**
 * The shared GLSL of the central form.
 *
 * The panel drives ONE material shown through three representations (liquid SDF,
 * particle cloud, wireframe mesh). Each renderer used to carry its own copy of
 * the noise, which is how the same dial drifted into meaning something different
 * per form. The field lives here so there is one definition to change.
 */

import { FORM_RADIUS } from "./blobTweak";

/** Ashima/Gustavson simplex noise (3D). */
export const SNOISE = /* glsl */ `
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

/**
 * The form's surface displacement, as a signed offset along a supplied direction.
 * Mirrors what the liquid's SDF does analytically:
 *
 *  - `lump` is the blob's domain-warped fbm, the domain normalised by FORM_R so
 *    uFreq means one feature size in every representation, amplitude a fraction
 *    of that radius. It fades out as the form assembles, because the liquid stops
 *    evaluating sdBlob at that point.
 *  - `flow` is the travelling ripple, always present and stronger once assembled
 *    — the only noise source the DNA has. Its amplitude is absolute (world units)
 *    rather than radius-relative, matching `d -= flow` on a distance field.
 *
 * Requires uniforms uTime / uDistort / uFreq / uPres and SNOISE in scope.
 */
export const FORM_DISPLACE = /* glsl */ `
const float FORM_R = ${FORM_RADIUS.toFixed(2)};
float fbm(vec3 p){ return snoise(p) * 0.7 + snoise(p * 2.1) * 0.3; }
float formOffset(vec3 pos){
  vec3 sp = (pos / FORM_R) * uFreq;
  vec3 wrp = sp + vec3(snoise(sp + vec3(0.0, uTime * 0.30, 0.0)),
                       snoise(sp + vec3(3.1, 1.7, uTime * 0.18)),
                       snoise(sp + vec3(9.2, 5.3, uTime * 0.12))) * 0.9;
  float lump = fbm(wrp) * uDistort * FORM_R * (1.0 - uPres);
  float flow = snoise(pos * 1.6 + vec3(uTime * 0.5, uTime * 0.35, 0.0))
             * uDistort * 0.55 * (0.25 + 0.35 * uPres);
  return lump + flow;
}
`;

/** Reflection environment, shared so every representation reflects the same room. */
export const ENV_INTENSITY = 3.2;
export const ENV_ROT_Y = 2.4;

/**
 * The chrome itself: an equirect environment reflection, a fresnel rim and a flat
 * tinted fill, as a function of the surface normal and the view ray.
 *
 * Shared between the raymarched liquid and the mesh skull because they hand over
 * to one another mid-transition — the same pixel has to be the same metal on both
 * sides of the swap.
 *
 * Roughness (panel 0..1): 0 = punchy mirror, 1 = fully matte. Both the mirror and
 * its fresnel rim reach exactly zero at 1.0 — a rim highlight surviving on a
 * "fully rough" surface is what would still read as chrome — leaving only the
 * flat tinted fill.
 *
 * Requires uniforms uEnv / uEnvInt / uEnvRot / uRough / uLo / uHi in scope.
 */
export const CHROME_SHADE = /* glsl */ `
vec3 sampleEnv(vec3 dir){
  float ca = cos(uEnvRot), sa = sin(uEnvRot);
  vec3 d = normalize(vec3(dir.x*ca - dir.z*sa, dir.y, dir.x*sa + dir.z*ca));
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y,-1.0,1.0)) * 0.31830989 + 0.5);
  vec3 e = texture2D(uEnv, uv).rgb * uEnvInt;
  return vec3(1.0) - exp(-e * 1.3);       // exposure tone map
}

vec3 chromeShade(vec3 n, vec3 rd){
  vec3 env = sampleEnv(reflect(rd, n));
  float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
  vec3 tint = mix(uLo, uHi, 0.75);
  float mirror = 1.0 - uRough;
  return env * tint * (1.2 * mirror)
       + fres * vec3(1.0, 0.97, 0.92) * 0.4 * mirror
       + tint * (0.05 + uRough * 0.6);
}
`;
