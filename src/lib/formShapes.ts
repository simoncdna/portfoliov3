/**
 * The bespoke fields — one object per project (see workPlate) — as shared GLSL.
 *
 * They live here rather than inside one renderer because the liquid and the
 * particles both have to be able to become them: the liquid raymarches the field,
 * the particles project themselves onto its zero-set. Two copies of a gavel would
 * be two gavels that drift apart.
 *
 * Everything below is an exact-or-under distance field, which is what buys both
 * uses: the marcher can stride by the value, and the particles can land on the
 * surface in a couple of Newton steps (for a true distance field, p - n*d IS the
 * closest surface point).
 *
 * Requires FORM_RADIUS to be in scope as BR — supplied by the constant below.
 */

import { FORM_RADIUS } from "./blobTweak";

/**
 * Per-shape scale. Written out one by one rather than as a single factor because
 * these objects have wildly different natural proportions — a gavel is long, a
 * burger is squat — and what has to match between them is how big they READ, not
 * their raw dimensions. Tuned so each one fills about the same amount of frame.
 */
const K = { gavel: 1.15, camera: 1.6, burger: 1.85, vase: 1.45 };

/** The farthest any scaled shape reaches from the origin — the marcher's bound. */
export const SHAPE_REACH = 2.5;

export const SHAPE_SDF = /* glsl */ `
const float SHAPE_BR = ${FORM_RADIUS.toFixed(2)};
const float SHAPE_REACH = ${SHAPE_REACH.toFixed(2)};

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0);
  return length(pa - ba*h) - r;
}
/* Capped cylinders, one per axis. */
float sdCylX(vec3 p, float h, float r){
  vec2 d = abs(vec2(length(p.yz), p.x)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float sdCylY(vec3 p, float h, float r){
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float sdCylZ(vec3 p, float h, float r){
  vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float sdRoundBox(vec3 p, vec3 b, float r){
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
/** Ellipsoid — a lower bound rather than the exact distance, so marching stays safe. */
float sdEllip(vec3 p, vec3 r){
  return (length(p / r) - 1.0) * min(r.x, min(r.y, r.z));
}
/** Torus about Y (lying flat) and about Z (standing up). */
float sdTorusY(vec3 p, vec2 t){ return length(vec2(length(p.xz) - t.x, p.y)) - t.y; }
float sdTorusZ(vec3 p, vec2 t){ return length(vec2(length(p.xy) - t.x, p.z)) - t.y; }

/**
 * A judge's gavel: head across X, handle down Y, plus the two collars a real one
 * has near the head's ends — those are most of what makes it read as a gavel
 * rather than as a mallet. Tilted 45°: level, it looks like a mallet at rest; on
 * the diagonal it reads as one about to fall.
 */
float sdGavel(vec3 p){
  const float C = 0.70710678;
  p = vec3(C * p.x + C * p.y, C * p.y - C * p.x, p.z);
  float head = sdCylX(p - vec3(0.0, 0.62, 0.0), 1.05, 0.60);
  float collars = min(sdCylX(p - vec3( 0.72, 0.62, 0.0), 0.10, 0.68),
                      sdCylX(p - vec3(-0.72, 0.62, 0.0), 0.10, 0.68));
  float d = min(head, collars);
  float handle = sdCapsule(p, vec3(0.0, 0.42, 0.0), vec3(0.0, -1.85, 0.0), 0.19);
  return smin(d, handle, 0.12);
}

/**
 * A camera: body, a lens barrel out of +Z with a wide front ring, the viewfinder
 * hump and the shutter button.
 *
 * The proportions are dictated by the turntable. A first pass used a broad shallow
 * body with a modest lens, and for the quarter-turn where the lens pointed away it
 * read as a plain box — the object's whole identity hidden behind its own back. So
 * the body is narrow and shallow, and the lens RING is deliberately wider than the
 * body is tall (0.80 against 0.62): it therefore breaks the silhouette from every
 * angle, including straight from behind. A camera is recognised by its lens.
 *
 * (A framed print was tried here — more on-register for this universe, which is
 * already a printed edition — and abandoned: a picture edge-on is a plank, and
 * keeping it facing the viewer meant exempting it from the turntable the whole
 * section is built on.)
 */
float sdCamera(vec3 p){
  float body = sdRoundBox(p, vec3(0.95, 0.62, 0.30), 0.10);
  float barrel = sdCylZ(p - vec3(0.04, -0.02, 0.52), 0.30, 0.52);
  float ring = sdCylZ(p - vec3(0.04, -0.02, 0.90), 0.09, 0.80);
  float hump = sdRoundBox(p - vec3(-0.46, 0.66, 0.0), vec3(0.28, 0.16, 0.22), 0.07);
  float shutter = sdCylY(p - vec3(0.60, 0.68, 0.0), 0.11, 0.13);
  float d = smin(body, barrel, 0.10);
  d = min(d, ring);
  d = smin(d, hump, 0.08);
  return smin(d, shutter, 0.06);
}

/**
 * A burger. The layers are combined with min(), not smin(): a smooth union melts
 * the stack into one loaf, and the whole read depends on the seams between bun,
 * cheese and patty staying legible. The buns are domes — ellipsoids cut flat where
 * they meet the filling — for the same reason.
 */
float sdBurger(vec3 p){
  float top = max(sdEllip(p - vec3(0.0, 0.42, 0.0), vec3(1.06, 0.66, 1.06)), 0.42 - p.y);
  float cheese = sdRoundBox(p - vec3(0.0, 0.20, 0.0), vec3(1.02, 0.05, 1.02), 0.06);
  float patty = sdCylY(p - vec3(0.0, -0.06, 0.0), 0.20, 0.98);
  float base = max(sdEllip(p - vec3(0.0, -0.42, 0.0), vec3(1.00, 0.52, 1.00)), p.y + 0.42);
  return min(min(top, cheese), min(patty, base));
}

/**
 * A Roman amphora: belly, neck, flared rim, footed base, and two handles mirrored
 * with abs(x) — one evaluation for both, and abs() is 1-Lipschitz so the field
 * stays valid. The handles are the difference between an amphora and a vase.
 */
float sdVase(vec3 p){
  float belly = sdEllip(p - vec3(0.0, -0.20, 0.0), vec3(0.90, 1.10, 0.90));
  float neck = sdCylY(p - vec3(0.0, 1.02, 0.0), 0.42, 0.32);
  float d = smin(belly, neck, 0.30);
  float rim = sdTorusY(p - vec3(0.0, 1.44, 0.0), vec2(0.38, 0.09));
  d = min(d, rim);
  float foot = sdCylY(p - vec3(0.0, -1.30, 0.0), 0.09, 0.44);
  d = smin(d, foot, 0.18);
  vec3 h = vec3(abs(p.x) - 0.84, p.y - 0.62, p.z);
  return min(d, sdTorusZ(h, vec2(0.34, 0.068)));
}

/**
 * The hovered project's object, mixed into whatever field the caller already has.
 *
 * MIXED, not substituted: a convex combination of 1-Lipschitz fields is still
 * 1-Lipschitz, so no caller needs extra caution — and what you see is the metal
 * flowing into the shape rather than one form cutting to another. Every amount
 * eases independently, so leaving one project for another drains the first while
 * filling the second, and both pass through the caller's own field on the way.
 *
 * The tests are on a uniform, so they are coherent across the whole draw: a shape
 * that is fully absent costs nothing.
 *
 * @param amt gavel / camera / burger / vase, in SHAPES order (see workPlate)
 */
float shapeField(vec3 p, vec4 amt, float base){
  float d = base;
  if (amt.x > 0.001) d = mix(d, sdGavel(p / ${K.gavel.toFixed(2)}) * ${K.gavel.toFixed(2)}, amt.x);
  if (amt.y > 0.001) d = mix(d, sdCamera(p / ${K.camera.toFixed(2)}) * ${K.camera.toFixed(2)}, amt.y);
  if (amt.z > 0.001) d = mix(d, sdBurger(p / ${K.burger.toFixed(2)}) * ${K.burger.toFixed(2)}, amt.z);
  if (amt.w > 0.001) d = mix(d, sdVase(p / ${K.vase.toFixed(2)}) * ${K.vase.toFixed(2)}, amt.w);
  return d;
}

/**
 * Pulls a point onto that field's surface, starting from the resting sphere.
 *
 * For a true distance field, p - n*d is the closest surface point, so two Newton
 * steps are plenty — and at amt = 0 the field IS the resting sphere the point is
 * already sitting on, which makes this a no-op rather than a special case. That is
 * the whole reason shapeField takes a base: the particles blend from their own home
 * exactly as the liquid blends from its blob.
 */
vec3 shapeProject(vec3 p, vec4 amt){
  for (int i = 0; i < 2; i++) {
    float d = shapeField(p, amt, length(p) - SHAPE_BR);
    // 4-tap tetrahedron gradient: same quality as central differences, two fewer
    // field evaluations — and this runs once per particle, per frame.
    vec2 k = vec2(1.0, -1.0);
    float e = 0.02;
    vec3 g = normalize(
      k.xyy * shapeField(p + k.xyy*e, amt, length(p + k.xyy*e) - SHAPE_BR) +
      k.yyx * shapeField(p + k.yyx*e, amt, length(p + k.yyx*e) - SHAPE_BR) +
      k.yxy * shapeField(p + k.yxy*e, amt, length(p + k.yxy*e) - SHAPE_BR) +
      k.xxx * shapeField(p + k.xxx*e, amt, length(p + k.xxx*e) - SHAPE_BR));
    p -= g * d;
  }
  return p;
}
`;
