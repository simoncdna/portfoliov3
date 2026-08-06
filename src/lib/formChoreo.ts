/**
 * The central form's scroll choreography.
 *
 * Every representation reads the same two scroll signals (About presence, then
 * the About exit) and has to dock, grow, spin and fade *identically* — the
 * blob→skull transition is a handover between two renderers, so any drift
 * between their copies of this arithmetic shows up as the form jumping at the
 * moment it changes hands. So it lives here once.
 */

/**
 * Where the form parks per section (world x). About keeps its text on the right
 * and the form on the left; Work is the MIRROR of About — the index of project
 * names reads on the left in display type, and the piece holds the right margin,
 * developing each row's photograph. Same reading layout, sides swapped.
 *
 * 2.6 and not About's 3.6: the plates are wider than the skull, and at 3.6 a
 * landscape photograph ran off the right edge of the screen before the size cap
 * (uPlateK, which knows about this dock) had anything sane left to give it.
 */
export const DOCK_X = -3.6;
/*
 * ZÉRO — LE POSTE EST AU MILIEU.
 *
 * 2.6 mettait la pièce dans la marge droite, en miroir d'About : l'index des noms lisait à
 * gauche en display, l'œuvre tenait la droite. Cette composition supposait deux sujets, du
 * texte et une image. Le poste est un sujet unique et il n'a rien à côté de quoi se ranger —
 * il apparaît au centre de l'écran, ce qui est aussi la seule place tenable pour un objet qu'on
 * regarde s'allumer.
 *
 * Le 2.6 était lui-même dérivé (« les plaques sont plus larges que le crâne, à 3.6 une
 * photographie en paysage sortait par le bord droit avant que le plafond de taille n'ait plus
 * rien de sensé à lui donner »). Ce raisonnement portait sur des plaques photographiques ; il
 * ne s'applique plus.
 */
export const DOCK_X_WORK = 0;

/**
 * …and where it goes once Work is over. Contact's text is left-aligned across the
 * full shell, so the centre is the one place the form cannot stay: it would sit
 * straight behind "Let's have a chat". It steps aside to the right — which is where
 * it used to live for the whole of Work, back when the projects were a list.
 */
export const DOCK_X_AFTER = 3.6;

/**
 * How far the form rides ABOVE the viewport's centre in Work (world y).
 *
 * ZERO since the index: the piece no longer carries its name and the numbers under
 * it — the type lives in the left column now — so there is nothing to optically
 * re-centre against and the photograph sits plumb on the middle of the screen.
 * (It was 0.7, half the height of the text block that used to hang below.)
 */
export const DOCK_Y_WORK = 0;

/**
 * How much the form grows once it is back in the middle, as a fraction of its
 * resting size. It fills the space the About text just vacated — but barely: past
 * about a fifth it stops reading as a mass taking the stage and starts reading as
 * the camera pushing in, which is a different (and unintended) statement.
 *
 * 0.10, DEPUIS 0.2 — et le commentaire ci-dessus avait raison sans aller assez loin.
 * Le pic à 1,2 a été jugé trop gros À L'USAGE, précisément au moment où il compte le
 * plus : le gonflement culmine pendant le relais crâne → poste, donc c'est ce pic-là
 * que le lecteur voit au moment où les deux formes se croisent. Un gonflement qui
 * attire l'œil pendant qu'on essaie de rendre un fondu invisible travaille contre
 * lui — l'air que le gonflement était censé « dépenser » entre les encoches et la
 * pièce coûtait plus cher qu'il ne rapportait.
 *
 * Réglé à l'œil, pas calculé : c'est une valeur de mise en scène.
 */
const EXIT_SCALE = 0.1;

/**
 * The size it settles at in Work — an absolute scale, not a bonus on top of the
 * resting one. Slightly below the resting size, and below the swell it reaches
 * mid-crossing: the four notches have to read as a frame around the piece with real
 * air between them and it, and that air is what the exit's swell spends. So the form
 * comes back down a little to sit inside its own frame.
 *
 * EXPORTÉE depuis le correctif du relais crâne→poste : ChromeTableau s'en sert aussi,
 * comme la référence FIXE contre laquelle son cadrage (`uSeatK`) est calibré, au lieu
 * de la valeur VIVANTE de `scale` — voir le commentaire au-dessus de `halfHeightLocal`
 * dans son useFrame pour la raison (sans ce gel, le cadrage divise par un `scale` qui
 * gonfle encore pendant le gonflement de sortie d'About, ce que le crâne ne fait
 * jamais puisqu'il n'a pas d'équivalent de `k`).
 */
export const WORK_SCALE = 0.62;

/** Companion size beside Contact — small, off to the side, no longer the subject. */
const AFTER_SCALE = 0.72;

/**
 * The blob→skull handover window, in units of About presence.
 *
 * The liquid is a raymarched SDF and the skull is a real mesh, so they cannot be
 * morphed into one another — they are cross-faded instead. It is invisible only
 * because it happens at the very start of the morph, where the skull mesh is
 * still the same noise-displaced sphere the liquid is drawing. Widening this
 * window is what would make the swap visible.
 */
export const HANDOVER_IN = 0.02;
export const HANDOVER_OUT = 0.16;

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type FormChoreo = {
  /** 0 = resting sphere, 1 = assembled form */
  pres: number;
  /** world x offset */
  dockX: number;
  /** world y offset */
  dockY: number;
  /** global grow/shrink */
  scale: number;
  /** extra spin rate (rad/s) while exiting */
  spinBoost: number;
  /** 0 = the liquid owns the frame, 1 = the skull mesh does */
  handover: number;
  /**
   * The skull mesh's own presence. It goes opaque almost immediately rather than
   * fading in over the window, because it is drawn *under* the liquid (which draws
   * last, depth-test off): two half-transparent copies of the same sphere would
   * let the page bleed through the middle of the swap. So the layer underneath
   * turns solid first and the one on top dissolves off it.
   */
  skullOn: number;
};

/**
 * @param about eased 0..1 presence of the About section
 * @param exit  0..1 progress of the About exit, scrubbed by the pinned timeline
 *              (aboutReveal.exit) — NOT read off the Work section's position, so
 *              it cannot drift from the text fade it follows
 * @param work  eased 0..1 presence of the Work section, which is a genuine
 *              function of where that section is (unlike the exit): it settles the
 *              form in the middle at display size, inside its frame of notches
 * @param after eased 0..1 presence of everything past Work. It does not undo `work`
 *              (which stays claimed) — it overrides it, so the form steps out of the
 *              centre and off to the side for Contact
 */
export function formChoreo(
  about: number,
  exit: number,
  work: number,
  after: number
): FormChoreo {
  const a = clamp01(about);
  const x = clamp01(exit);
  const w = clamp01(work);
  const f = clamp01(after);

  // The exit, in three overlapping beats. They overlap on purpose: the form should
  // read as one continuous movement — walking back into the middle while swelling,
  // and already softening into the sphere before it has finished swelling — rather
  // than as three cues played in turn.
  const home = smoothstep(0, 0.5, x); // leaves the left dock, back to centre
  const grow = smoothstep(0.15, 0.8, x); // takes the space the text vacated

  // The skull unmakes itself into the resting sphere — and hands the frame back to
  // the liquid on the way, since the handover reverses as pres falls.
  //
  // That handover lives in a NARROW range of pres (0.16 → 0.02) for a reason: it
  // is the only stretch where the mesh is still close enough to a sphere for the
  // cross-fade to hide. Widening it would show the swap. What it needed instead was
  // more SCROLL inside the same range — so pres falls quickly to the top of the
  // window and then crawls through it, giving the cross-fade about a fifth of the
  // exit beat rather than the sliver it got when pres ran linearly to zero.
  /*
   * RÉALIGNÉ SUR LA FENÊTRE OÙ LE POSTE ARRIVE — le crâne était encore un crâne quand
   * l'ordinateur entrait en scène, et ça se voyait.
   *
   * L'arithmétique : le poste est revendiqué par smoothstep(0.55, 0.85, exit) dans
   * formClock. Avec l'ancien fall = smoothstep(0.35, 0.8, x), `pres` valait encore ≈0,65
   * à x = 0,55 — donc le poste montait sur scène pendant que le crâne était à 65 % un
   * crâne, alors que le commentaire ci-dessous dit précisément que le fondu ne peut se
   * cacher que dans la plage étroite 0,16 → 0,02. Les deux fenêtres étaient décalées
   * d'un quart de la sortie.
   *
   * C'est la FONTE qu'on avance, pas la revendication : déplacer celle-ci rouvrirait le
   * trou où le raymarcher se rallume à pleine facture d'écran (voir le long commentaire
   * de `claim` dans formClock). Ainsi le crâne atteint le haut de la fenêtre (pres 0,16)
   * exactement quand le poste commence à apparaître, et la traverse pendant qu'il monte.
   */
  const fall = smoothstep(0.2, 0.55, x); // 1 → the top of the handover window
  const cross = smoothstep(0.55, 0.85, x); // …then through it, slowly
  const pres = a * ((1 - fall) * (1 - HANDOVER_OUT) + HANDOVER_OUT * (1 - cross));
  return {
    pres,
    // Two docks, summed rather than switched: About's left one is released by the
    // exit (`home` → 1) exactly as Work's centre one is claimed, so the form makes
    // one continuous crossing of the stage instead of teleporting between sides.
    // …and once Work is over, the form slides off the centre to the right dock: the
    // last term wins over Work's 0 rather than being added to it, and the lift and
    // the display size are released on the same signal, so the piece is put away as
    // one gesture instead of three.
    dockX: DOCK_X * a * (1 - home) + DOCK_X_WORK * w * (1 - f) + DOCK_X_AFTER * f,
    dockY: DOCK_Y_WORK * w * (1 - f),
    // Swells for the crossing, then settles down to display size inside its frame.
    scale:
      ((1 + grow * EXIT_SCALE) * (1 - w) + WORK_SCALE * w) * (1 - f) + AFTER_SCALE * f,
    // A pulse, not a level: this is a rate that gets integrated, and `exit` stays
    // at 1 for the whole rest of the page — so anything monotonic in x would leave
    // the blob spinning four times too fast forever. Peaks mid-crossing, zero at
    // both ends, where the form is supposed to be settled.
    spinBoost: x * (1 - x) * 4.8,
    handover: smoothstep(HANDOVER_IN, HANDOVER_OUT, pres),
    skullOn: smoothstep(0, HANDOVER_IN * 1.5, pres),
  };
}

/**
 * Atténue une valeur vers son identité par une présence 0..1.
 *
 * La règle de confinement de la caméra, en un seul endroit. Elle interpole depuis
 * l'IDENTITÉ de la prop et non depuis zéro, ce qui compte : l'identité de camZ est 10 et
 * celle de camFov 42, donc interpoler depuis zéro mettrait la caméra dans le sujet à
 * présence nulle au lieu de la laisser où elle a toujours été.
 *
 * À présence 0 le résultat est l'identité EXACTEMENT — `identity + (target - identity) * 0`
 * est `identity + 0`, pas une approximation. C'est ce qui fait du confinement une identité
 * arithmétique plutôt qu'une promesse : hors du corridor de Work, le frustum contre lequel
 * tout le CSS a été réglé est intact au bit près. Voir tests/formChoreo.test.ts.
 *
 * Ici plutôt que dans formClock parce que ce module n'a AUCUN import : il est donc
 * importable depuis Node, et l'invariant peut être testé sans navigateur ni framework.
 */
export const confine = (identity: number, target: number, presence: number): number =>
  identity + (target - identity) * presence;
