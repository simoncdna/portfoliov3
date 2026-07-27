"use client";

import { works } from "@/data/site";

/**
 * Which plate the Work section is showing, and what that does to the matter.
 *
 * The section is one screen: the piece centred inside four corner notches, its name
 * below, and 01–04 under that. Scrolling advances the plate.
 *
 * What the metal DOES on arriving here changed once: it used to melt into a literal
 * object per project (a camera for Pictarine, a gavel for Forma — see formShapes),
 * and it now flattens into a 16:9 plate and becomes that project's PHOTOGRAPH (see
 * formPhoto). The mechanism is the same one and that is the point: both are distance
 * fields mixed into the blob's, so the metal flows into either and never cuts. The
 * objects are kept, at zero — see MOODS.
 *
 * The changeover's 360° went with them. A photograph seen edge-on is a plank — the exact
 * objection that kept a framed print out of formShapes in the first place — so the piece
 * no longer rolls over between plates, and the turntable is frozen for as long as the
 * plates are flat (see formClock).
 *
 * What replaced the roll is a STRIP. The four plates are not four states of one object:
 * they sit side by side, a screen-width apart, and the section slides along them. So a
 * plate change is neither a dissolve nor a re-forming — the photograph being read leaves
 * one side of the screen while the next arrives from the other, both of them real sheets
 * at the same time. There is no direction to record here (the slide carries it) and no
 * per-plate crossfade: the whole changeover is one number in the clock, `mood.car`.
 *
 * A plain mutable singleton (like aboutReveal): written by the section as the scroll
 * advances, eased and read every frame by the form clock. It used to be written on
 * hover — hence its old name, workHover — but hover does not exist on touch, and the
 * scroll was already the actor of every other section.
 */

export type Mood = {
  /** anisotropic scale of the field — the silhouette's proportions */
  stretch: readonly [number, number, number];
  /** multiplies the panel's Distort — how far the lumps travel */
  distort: number;
  /** multiplies the panel's Freq — how big the lumps are */
  freq: number;
  /**
   * Radial thorns from thresholded noise, as a fraction of the radius.
   *
   * The one parameter with a rendering cost: thorns are steep, so the raymarcher
   * shortens its stride to match (see stepK in LiquidDna), and it only has 96 of
   * them. Two failure modes if it is pushed, with opposite fixes — speckling on the
   * thorns means the stride is still too long (raise the uSpike term in stepK);
   * thorn TIPS fizzling out or going holey means rays are running out of steps
   * (lower it, or lower the amplitude here).
   */
  spike: number;
  /**
   * The literal object this project melts into, if any. Each has its own SDF in the
   * shader (parameters can deform a sphere; they cannot build a camera), and the
   * clock keeps one eased amount per shape — so moving from one plate to the next
   * fades the first out while the second fades in, both mixed into the blob's own
   * field. The metal always travels THROUGH the blob rather than cutting.
   *
   * Every project now says `null`: the plate parcours superseded the objects (the
   * matter flattens into the project's photograph instead). The four fields are left
   * in formShapes, tuned, and still mixed by both renderers at amount 0 — putting one
   * back is a single word here, and the particle representation reads the same
   * amounts. Nothing about the objects was wrong; the section changed its subject.
   */
  shape: Shape | null;
};

/** The bespoke fields, in the order the shader mixes them. */
export const SHAPES = ["gavel", "camera", "burger", "vase"] as const;
export type Shape = (typeof SHAPES)[number];

/** Outside the section: the blob is exactly what the panel says it is. */
export const MOOD_REST: Mood = {
  stretch: [1, 1, 1],
  distort: 1,
  freq: 1,
  spike: 0,
  shape: null,
};

/**
 * Keyed by project title rather than index, so reordering `works` cannot silently
 * hand a project someone else's silhouette. (The PHOTOGRAPH is not here: it belongs
 * to the work entry itself, in site.ts, and is addressed by index — reordering the
 * works reorders the pictures with them, which is the behaviour you want for
 * something that IS the project's own content.)
 *
 * What is left here is each project's temperament as matter: how far its lumps travel
 * and how big they are. It governs the flattening and, once flat, how hard the sheet
 * carrying the photograph breathes — a project is still a different piece of metal,
 * even now that every one of them ends up a plate.
 *
 * The commented-out shape is the object that project used to become; see Mood.shape.
 */
export const MOODS: Record<string, Mood> = {
  // 01 — a company whose product is photographs (was: a camera)
  Pictarine: { stretch: [1, 1, 1], distort: 0.4, freq: 1.0, spike: 0, shape: null },
  // 02 — a platform built for legal work (was: a judge's gavel)
  Forma: { stretch: [1, 1, 1], distort: 0.5, freq: 1.0, spike: 0, shape: null },
  // 03 — a restaurant ordering dashboard (was: a burger)
  "Crazee.B": { stretch: [1.1, 0.8, 1.1], distort: 0.8, freq: 0.9, spike: 0, shape: null },
  // 04 — a pottery workshop (was: a Roman amphora)
  Klay: { stretch: [1, 1, 1], distort: 0.45, freq: 1.0, spike: 0, shape: null },
};

/** The plate the form should be heading toward right now. */
export const workPlate = {
  mood: MOOD_REST,
  /** the shown plate's title, or "" outside the section */
  title: "",
  /**
   * …and its position in `works`, or -1 outside the section. Which is to say: which
   * photograph. Derived here rather than passed in, so the section keeps talking about
   * plates by name and only this file knows that the shader addresses them by slot.
   *
   * It is also the section's presence flag for the matter: -1 means the metal owes
   * nothing and stays a blob (see the flattening in formClock).
   */
  index: -1,
  /**
   * Is the reader pointing at (or keyboard-focused on) the shown plate's name.
   *
   * Written straight by the section — there is no logic to wrap, unlike `show` — and eased
   * in the clock, where it drives the whole gesture: the wind stops, the colour arrives, the
   * picture steps forward. It lives here rather than in a singleton of its own because it is
   * a fact about the shown plate, and because `clear` has to be able to drop it: a hover
   * left hanging while the section put the plate away would hold the wind stopped for good.
   */
  hover: false,
  show(title: string) {
    if (workPlate.title === title) return;
    workPlate.title = title;
    workPlate.index = works.findIndex((w) => w.title === title);
    workPlate.mood = MOODS[title] ?? MOOD_REST;
  },
  clear() {
    if (workPlate.title === "") return;
    workPlate.title = "";
    workPlate.index = -1;
    workPlate.hover = false;
    workPlate.mood = MOOD_REST;
  },
};
