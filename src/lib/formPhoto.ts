/**
 * The plates — the Work section's matter rolled out into 16:9 photographs, laid on a
 * strip the section slides along — as shared GLSL.
 *
 * It lives beside formShapes, and for the same reason: a plate is a distance field
 * mixed into the blob's, so the metal FLOWS into the first one instead of cutting to
 * it. The difference is that a plate carries an image, so this file owns two things a
 * shape never needed — the sheet's own relief (a photograph lying dead flat reads as a
 * decal, not as metal that has been rolled out) and the sampling of the picture off the
 * surface the marcher actually hit.
 *
 * Two ideas hold the whole thing up.
 *
 * THE IMAGES ARE THE METAL. They are sampled at the END of the march, on hit pixels
 * only, and the UV is read off the local hit point — so the picture is carried by
 * whatever the field is doing that frame: it swells with the relief, it is dragged by
 * the surface's tilt, it tears when the sheet tears. No second pass, no plane mesh, no
 * cross-fade with a DOM image.
 *
 * THE PROJECTS ARE A STRIP, NOT A SEQUENCE OF STATES. Every plate has a fixed place on
 * one strip, a pitch apart — far enough apart that a neighbour is off the side of the
 * screen — and the section slides along it. So changing plate is not a dissolve and not
 * a re-forming: the picture you are reading leaves one side of the screen while the next
 * arrives from the other, both of them real sheets of metal at the same time. That is
 * why the field below is a UNION of two slots rather than one shape with a mood.
 *
 * Requires, in scope: snoise / fbm, uTime, uFreq, and the uniforms declared below.
 */

import { works } from "@/data/site";

/** How many plates the strip carries — one slot per project. */
const N = works.length;

/**

 * The plate's COMMON HALF-HEIGHT, in the form's LOCAL space (i.e. before uScale).
 *
 * There is no plate aspect any more. Every photograph keeps its own — 3:2, 2:3, 3:4, whatever
 * the file is — so what the plates share is their HEIGHT and their width follows from the
 * image. A single 16:9 box was the first design and it was wrong the moment real photographs
 * arrived: three of the four are portrait, and a 16:9 cover-crop of a portrait keeps a central
 * band, which cut the ceramics in half and emptied the desk.
 *
 * Set so the picture stands about 490px tall on a 1440x860 window, which leaves the name and
 * the four numbers their room underneath. It took a step up when the neighbours were pushed
 * out to the screen's edge (see the sliver packing in LiquidDna): the shown plate no longer
 * shares the stage, so it gets the air the gallery used to spend on them.
 *
 * (World units: multiply by uScale. On screen: 1 world unit = --form-dim / 7.677 px, the
 * camera's visible height at z = 0 — see --form-lift.)
 */
export const PLATE_H = 3.4;
/** Half-thickness. Never scaled with the picture: it is the edge of a print, not part of it. */
export const PLATE_T = 0.16;
/**
 * The aspect a slot uses until its file has decoded. Nothing is drawn on it before then (see
 * uPhotoReady), so this only has to be a sane box for the marcher to bound.
 */
export const PLATE_ASP0 = 16 / 9;
/*
 * THERE IS NO PLATE_GAP ANY MORE. The strip used to be packed shoulder to shoulder — half a
 * width, a fixed gap, half a width — which put the neighbours well inside the frame and read
 * as a carousel. The spacing is now derived from the VIEWPORT (see the sliver packing in
 * LiquidDna): a neighbour pierces the edge of the screen by a fraction of its own width —
 * a sliver at rest, stepping well into the frame while the strip travels — whatever the
 * window or the photograph's aspect. At rest the shown plate holds the stage alone.
 */
/**
 * Corner radius — ZERO. A rounded corner has curved normals, and curved normals catch the
 * light differently from the flat face: that is a bevel, and a bevel is the one thing that
 * still said "object" rather than "picture" once every deformation was off. A photographic
 * print has square corners.
 */
const PLATE_ROUND = 0.0;

export const PLATE_SDF = /* glsl */ `
const float PLATE_H     = ${PLATE_H.toFixed(3)};
const float PLATE_T     = ${PLATE_T.toFixed(3)};
const float PLATE_ASP0  = ${PLATE_ASP0.toFixed(4)};
const float PLATE_ROUND = ${PLATE_ROUND.toFixed(2)};
const float PLATE_LAST  = ${(N - 1).toFixed(1)};
/** The plate half-width the wave's amplitude was tuned against — see plateWave. */
const float WAVE_REF    = 2.80;

/** Where the strip is, in plate units: 0 = the first plate centred, 1.5 = between 2nd and 3rd. */
uniform float uCar;
/** …and in local units, interpolated between the two slots it is between. The geometry reads
    THIS one: with per-image widths the slots are not evenly spaced, so a position in plate
    units cannot be turned into a distance inside the shader. Both come from the same number. */
uniform float uCarX;
/** Each slot's place along the strip, local units — packed on the JS side from the widths. */
uniform float uSlotX[${N}];
/**
 * The aspect the ONE sheet currently wears (w/h) — eased on the JS side toward the worn
 * slot's photograph, so a page turn is the bare metal GLIDING from one proportion to the
 * next rather than a rectangle snapping. Always read while the print is dissolved (the
 * swap waits on dev = 0), so the glide never stretches a visible picture.
 */
uniform float uAspNow;
/** 0 = the sheet is liquid metal, 1 = it is cloth in the wind. See plateSheet. */
uniform float uFlag;
/**
 * A ceiling on the plates' size, 0..1 — normally 1, and only below it when the pictures would
 * not fit across the frame. The camera sees a world WIDTH that depends on the canvas's aspect,
 * so a gallery that fits a laptop is wider than a phone held upright can show, and a photograph
 * cropped by the edge of the screen is not a photograph any more. Computed each frame in
 * LiquidDna; everything the plates are made of reads their size through it.
 */
uniform float uPlateK;
/**
 * How much smaller a plate gets per slot away from the one being read, 0..1.
 *
 * The gallery's only depth cue now that nothing is tilted or deformed: the pictures on either
 * side are the same photographs, hung further away. 0 puts them all at the same size, which
 * reads as a filmstrip rather than as a gallery.
 */
uniform float uShrink;
/**
 * How much the plate being READ steps forward while its name is pointed at, 0 = none.
 *
 * Per-slot and not on the form's global scale, where it started: that scale belongs to the
 * whole strip, so the hover grew the neighbours too. Only the shown slot takes it.
 */
uniform float uGrow;

/**
 * How deep the cloth swings, local units, and how hard the wind blows. Both zero by default —
 * the section is a gallery of flat prints — and one number away from coming back (see plateLook).
 */
uniform float uFlagAmp;
uniform float uWind;
/**
 * The wave's own clock, NOT uTime.
 *
 * Separate because the wind has to be able to stop — pointing at a project's name holds the
 * picture still — and a freeze must not be a jump. So the clock is integrated on the JS side at
 * a rate that falls to zero (see formClock), and the phase simply stops advancing: whatever
 * crest was on screen stays where it is, and lets go from there. Reading uTime and scaling it
 * here instead would rewind the wave to the origin, which is a lurch.
 */
uniform float uWave;

/** Slot i's place along the strip. */
float slotX(float slot){
  int i = int(slot + 0.5);
${Array.from({ length: N }, (_, i) => `  if (i == ${i}) return uSlotX[${i}];`).join("\n")}
  return 0.0;
}

/** The sheet's outer half-extents: the shared height, the worn aspect's width (eased,
    see uAspNow), the same thickness. Still takes the slot for signature stability. */
vec3 slotHalf(float i){
  float h = PLATE_H * uPlateK;
  return vec3(h * uAspNow, h, PLATE_T);
}
/** Slot i's size: smaller the further it is from the one on show, and larger if it IS the one
    on show and the reader is pointing at its name. Clamped at one slot out, so the fourth
    picture is not a stamp. */
float slotScale(float i){
  float away = 1.0 - uShrink * min(1.0, abs(i - uCar));
  float mine = step(abs(i - floor(uCar + 0.5)), 0.5);
  return away * (1.0 + uGrow * mine);
}
/** Slot i's offset from the middle of the screen, local units. */
vec3 plateSlot(float i){ return vec3(slotX(i) - uCarX, 0.0, 0.0); }

/** The slot the strip is at or just past, clamped to the ones that exist. */
float plateNear(){ return clamp(floor(uCar + 0.0001), 0.0, PLATE_LAST); }

/** Rounded box, exact. \`h\` is the OUTER extent, hence the inset by the round. */
float plateBox(vec3 p, vec3 h){
  vec3 q = abs(p) - (h - PLATE_ROUND);
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - PLATE_ROUND;
}

/**
 * The liquid relief: domain-warped fbm, denser than the blob's own. Evaluated in PLATE-local
 * space (the caller subtracts the slot's offset first), so it travels with its own sheet — in
 * strip space it would be a fixed wobble the pictures slide through.
 */
float plateRelief(vec3 p){
  vec3 sp = p * (uFreq * 1.6);
  vec3 wrp = sp + vec3(snoise(sp + vec3(0.0, uTime * 0.22, 0.0)),
                       snoise(sp + vec3(3.1, 1.7, uTime * 0.15)),
                       snoise(sp + vec3(9.2, 5.3, uTime * 0.10))) * 0.7;
  return fbm(wrp);
}

/**
 * The wind's wave — the whole photograph swelling and travelling. Off by default.
 *
 * Normalised over the sheet (±1 at the edges), so it is a property of the PICTURE and not of
 * world space: resizing a plate carries the whole wave with it. Three waves at three angles and
 * three rates, because a single sine — however fast — reads as corrugated iron.
 */
float plateWave(vec3 p, vec3 h){
  vec2 u = vec2(p.x / h.x, p.y / h.y);
  float a = u.x * 3.78 + u.y * 0.55 - uWave * 4.00 * uWind;
  float b = u.x * 1.54 - u.y * 1.81 - uWave * 2.60 * uWind;
  float c = u.y * 1.42 + u.x * 0.56 - uWave * 1.70 * uWind;
  float w = sin(a) * 0.55 + sin(b) * 0.30 + sin(c) * 0.25;
  return w * (h.x / WAVE_REF);
}

/**
 * One sheet: the plate, and whatever is being done to it.
 *
 * CLOTH shifts the DOMAIN in depth (\`z - wave\`) — the sheet bends and keeps its thickness and
 * its outline. LIQUID subtracts noise from the DISTANCE, which swells the surface in every
 * direction and can tear it. Two different deformations, which is exactly why one can be
 * crossed into the other; both are gated on their own amplitude, so a flat print — the current
 * setting — pays for neither.
 */
float plateSheet(vec3 q, vec3 h, float relief){
  float amp = uFlagAmp * uFlag;
  float d = amp < 0.001 ? plateBox(q, h)
                        : plateBox(vec3(q.xy, q.z - plateWave(q, h) * amp), h);
  float liquid = relief * (1.0 - uFlag);
  if (liquid < 0.001) return d;
  return d - plateRelief(q) * liquid;
}

/**
 * One plate's field, at its place on the strip and at its own size.
 *
 * Dividing the point by the slot's scale and multiplying the result back is what keeps this a
 * true distance field under a uniform scale — the marcher would punch through a plate that was
 * merely evaluated smaller.
 */
float slotField(vec3 p, float i, float relief){
  float k = slotScale(i);
  return plateSheet((p - plateSlot(i)) / k, slotHalf(i), relief) * k;
}

/**
 * The "strip" is ONE sheet now. With the index as the selector and the change made
 * material (the print dissolves, the sheet remelts, the slot is swapped at the bottom
 * of the melt — see formClock), there is never a second plate to draw: uCar is an
 * integer at all times, and this evaluates exactly the slot the piece is wearing.
 * (The four-slot union lives in the git history with the gallery-wall variant.)
 */
float plateStrip(vec3 p, float relief){
  return slotField(p, plateNear(), relief);
}

/**
 * The blob's field flattened toward the strip's.
 *
 * A convex combination of two 1-Lipschitz fields is still 1-Lipschitz, so the mix costs the
 * marcher nothing. Note that \`flatness\` has to reach EXACTLY 1 for the plates to be exact —
 * see the snap in formClock, without which a fraction of the blob's distance stayed mixed in
 * and the far plates never registered a hit.
 *
 * NOT \`flat\` for the parameter name: it is a reserved word in GLSL — the interpolation
 * qualifier — so the declaration is a syntax error and the whole fragment shader fails to
 * compile ("ERROR: 'flat' : syntax error").
 */
float plateField(vec3 p, float flatness, float relief, float base){
  if (flatness < 0.001) return base;
  return mix(base, plateStrip(p, relief), flatness);
}

/**
 * Which sheet a point belongs to, and where it sits on that sheet. One sheet exists,
 * so the answer is the worn slot — in its OWN space, so the picture's uv is right
 * whatever size the plate is.
 */
float plateOwner(vec3 p, out vec3 local){
  float i = plateNear();
  local = (p - plateSlot(i)) / slotScale(i);
  return i;
}
`;

/**
 * The pictures: one sampler per project, addressed by slot, and the shading that turns
 * a reflection into a print.
 *
 * Addressed by slot, NOT mixed by weight: the strip means only one photograph is ever on
 * a given sheet, so there is nothing to cross-fade. Each branch below indexes its
 * sampler with a literal, which GLSL ES requires of samplers — hence the generated
 * if-chain rather than an array lookup.
 *
 * The sampled values are used AS THEY COME, with no sRGB→linear step: this material
 * writes straight to the framebuffer (a raw ShaderMaterial gets no colour-space
 * conversion appended), so the texture's display-space values are already what the
 * screen wants. Decoding them here would wash the picture out.
 */
export const PHOTO_SHADE = /* glsl */ `
${Array.from({ length: N }, (_, i) => `uniform sampler2D uPhoto${i};`).join("\n")}
/** 1 once a file has decoded; a slot at 0 is a sheet that simply stays chrome */
uniform float uPhotoReady[${N}];
/** The developer, 0 = chrome, 1 = print — mood.dev from the clock. Strictly AFTER uFlat:
    the metal settles flat and still, and only then does the image come up (see photoShade). */
uniform float uPhotoOn;
/** the print's exposure / sheen / gloss — see photoShade */
uniform vec3 uPrint;
/** contrast curve about mid-grey */
uniform float uContrast;
/** how much the sheet's own geometry shades the print (matte, no reflection) */
uniform float uShade;
/** 0 = the print is monochrome, 1 = the file's own colour. Given on hovering the name — and
    only to the plate being read: see the slot test at the call site. */
uniform float uColour;
/** how far the sheet's relief drags the picture (uv) */
uniform float uWarp;

/** Plate-local point → picture UV, with that plate's own half-extents. No cover-crop: the
    plate is cut to the photograph's shape, so the picture fills it exactly. Y is NOT flipped: three.js uploads with flipY, so
    v = 0 is already the bottom of the photograph. Flipping again puts the sky under the
    grass. */
vec2 plateUv(vec2 xy, vec2 h){
  return vec2(0.5 + xy.x / (2.0 * h.x), 0.5 + xy.y / (2.0 * h.y));
}

/** How far the channels are pulled apart at the picture's corners, in uv. */
uniform float uAber;

/** One sample of the photograph, in colour, as it is in the file. */
vec3 photoRgb(float slot, vec2 uv){
  int i = int(slot + 0.5);
${Array.from(
  { length: N },
  (_, i) => `  if (i == ${i}) return texture2D(uPhoto${i}, uv).rgb * uPhotoReady[${i}];`
).join("\n")}
  return vec3(0.0);
}

/**
 * The picture as it is printed: three samples, one per channel, pulled apart RADIALLY.
 *
 * This is the whole "glass" of the plate now that the sheet is flat — a lens does not
 * refract its three primaries to the same place, so the split is zero at the centre and
 * grows toward the corners. Uniform in one direction instead, it reads as a video glitch;
 * radial, it reads as something seen THROUGH a piece of glass, which is what it is.
 *
 * The split survives in monochrome, and that is the point: three luminances, one per
 * channel, is exactly what leaves a red edge on one side of a contour and a cyan one on the
 * other. So a black-and-white print still fringes. In colour the same three samples carry
 * the file's own pigment instead.
 *
 * The amount is a PARAMETER and not the uniform, because the hover colours ONE picture — the
 * project being read — and leaves its neighbours in black and white. The caller knows which
 * sheet it is shading; this function does not need to.
 */
vec3 photoTone(float slot, vec2 uv, float colour){
  vec2 d = (uv - 0.5) * uAber;
  vec3 a = photoRgb(slot, uv + d);
  vec3 b = photoRgb(slot, uv);
  vec3 c = photoRgb(slot, uv - d);
  const vec3 LUMA = vec3(0.299, 0.587, 0.114);
  return mix(vec3(dot(a, LUMA), dot(b, LUMA), dot(c, LUMA)),
             vec3(a.r, b.g, c.b),
             colour);
}

float photoHas(float slot){
  int i = int(slot + 0.5);
${Array.from({ length: N }, (_, i) => `  if (i == ${i}) return uPhotoReady[${i}];`).join("\n")}
  return 0.0;
}

/**
 * The print, lit by the same room the chrome reflects.
 *
 * Three terms, and they are the whole look — all three live on uPrint so the dev panel
 * owns them (see plateLook):
 *
 *  - x, the EXPOSURE: what the photograph is worth before the room touches it.
 *  - y, the SHEEN: how much the metal's own brightness modulates the emulsion, so a
 *    highlight crossing the sheet crosses the picture too.
 *  - z, the GLOSS: how much raw reflection is left lying over the picture. It is what
 *    preserves the fresnel edge, and what stops the plate reading as a photograph
 *    floating in front of a piece of metal.
 *
 * The last two ARE the shine, and they are deliberately low by default: a cloth banner is
 * fabric, and a flag that mirrors the room reads as a mirror with a photo printed on it.
 * The env was never the exposure, either — this room is dark (a black page, one key
 * light), so a picture multiplied by the reflection alone came out at a third of its own
 * luminance, the grass black and only the sky surviving.
 *
 * Monochrome at rest — that is what keeps four unrelated photographs in one register — and
 * the colour is what the reader is given for pointing at the project's name. Both arrive
 * already mixed, from photoTone; all this does is put the curve and the light on them.
 *
 * The contrast is applied AFTER the mix, so a coloured picture gets the same curve and the
 * same modelling as the grey one: what changes on hover is the pigment, not the exposure.
 *
 * \`dim\` is the EXTINCTION — the neighbours are hung dark (~40% of emulsion) and light up
 * as the strip carries them in; it scales the emulsion terms and never the gloss, because
 * a dark print still reflects the room. Continuous at the call site (a function of
 * |slot − uCar|), so the handoff is a crossing of lights, not a switch.
 */
vec3 photoShade(vec3 metal, vec3 nLocal, vec2 uv, float dim, vec3 rgb){
  float e = dot(metal, vec3(0.3333));
  vec3 tone = clamp((rgb - 0.5) * uContrast + 0.5, 0.0, 1.0);
  // Matte shading from the sheet's own geometry, and the reason it exists: sheen and gloss
  // are the only OTHER terms that depend on the surface, so with both at zero — a print
  // with no reflection in it at all, which is a perfectly reasonable thing to want — the
  // waves became invisible. A flat rectangle of photograph, undulating and unlit.
  //
  // Half-lambert against a fixed light in the PLATE's own frame, so the modelling stays
  // put relative to the picture instead of swinging with the turntable. Cloth is shaded,
  // not mirrored: this is what shows the wind without a single highlight.
  float lam = 0.5 + 0.5 * dot(nLocal, normalize(vec3(-0.35, 0.45, 0.82)));
  float lit = mix(1.0, 0.35 + 1.1 * lam, uShade);
  // The developer. The print does not fade in, it COMES UP, and it comes up the way a
  // print does — BY TONE. In the bath the shadows are the first thing to exist: density
  // grows where the exposure was strongest, and the highlights are the last to separate
  // from the paper. So each pixel's threshold is its own luminance (dark = early),
  // jittered by a photographic grain that crawls while the developer works. The frontier
  // is tonal, not spatial: the image surfaces as a latent picture gaining density, not as
  // a wipe or a dissolve. The whole branch is dead once developed — uPhotoOn is a
  // uniform, so the settled section pays for none of this.
  float on = uPhotoOn;
  // Density rises with the developer: exposure climbs and the curve steepens — a young
  // print is thin and foggy, and the contrast is the last thing it earns.
  vec3 dTone = clamp((tone - 0.5) * (0.75 + 0.25 * on) + 0.5, 0.0, 1.0);
  // …and the metal's own reflection lies OVER the young emulsion and drains away as the
  // density comes up: the picture is developed out of the chrome, not pasted over it.
  float gloss = mix(0.5, uPrint.z, on);
  vec3 print = dTone * ((uPrint.x * (0.35 + 0.65 * on)) * lit + uPrint.y * e) * dim
             + metal * gloss;
  float show = on;
  if (on < 0.999) {
    float lum = dot(tone, vec3(0.3333));
    float g = snoise(vec3(uv * 140.0, uTime * 0.6));
    float th = lum * 0.85 + g * 0.15;
    show = smoothstep(th, th + 0.22, on * 1.6 - 0.2);
  }
  return mix(metal, print, show);
}
`;
