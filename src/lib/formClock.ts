"use client";

import { blobTweak, TIME_RATE, SPIN_RATE } from "./blobTweak";
import { formChoreo, smoothstep, confine, type FormChoreo } from "./formChoreo";
import { aboutReveal } from "./aboutReveal";
import { workReveal } from "./workReveal";
import { workPlate, MOOD_REST, SHAPES, type Shape } from "./workPlate";
import { pose as camPose, seek as camSeek } from "./cameraStage";
import { screenFill, tubeMouth } from "./tubeMouth";
import { tubeHole } from "./tubeHole";
// Le panneau du poste, lu par frame comme blobTweak au-dessus : la plongée y a ses deux
// nombres tant que ce panneau vit (voir le bloc de la caméra plus bas).
import { posteTweak } from "./posteTweak";
import { CAM_RADIUS, STATIONS, shortestDelta, theatreCamera, theatreReveal } from "./theatre";

/**
 * The central form's live state: one clock, one turntable, one eased scroll
 * position, for every representation.
 *
 * It is shared rather than per-component because the representations hand the
 * frame over to one another mid-transition, and a handover is only invisible if
 * both sides are drawing the same instant of the same field in the same place.
 * Private clocks drift apart for reasons that have nothing to do with the
 * animation:
 *
 *  - the skull mesh suspends on a 8.9 MB glb, so it used to start its clock
 *    several hundred ms after the liquid started its own — the seam showed or not
 *    depending on whether the model happened to be in cache;
 *  - the exit spin boost was only accumulated by whichever form was on screen;
 *  - a form hidden by the Form switch froze, then came back out of phase.
 *
 * Advanced exactly once per frame by FormDriver, which is mounted ahead of the
 * forms; they only read.
 */
export type FormState = FormChoreo & {
  /** the noise field's phase (advanced by Speed) */
  time: number;
  /*
   * THERE IS NO ROLL-OUT PEAK. A pulse (flat·(1−flat)·4, the burst spec's impulse)
   * overloading distort/spike at mid-roll was tried and removed: with the roll-out
   * riding the arrival — the metal flattening WHILE it crosses the stage — a fit of
   * rage in the middle of that trajectory added noise, not drama. The burst grammar
   * belongs to the click (the rafale spec), where it answers a deliberate gesture.
   */
  /**
   * The WORK MESH's turn on stage, 0..1 — the corridor from About's exit to Work's
   * departure, eased. The tableau is a mesh now (ChromeTableau), and the baton passes
   * MESH TO MESH: the skull reforms its sphere at About's end and crossfades with the
   * tableau wearing ITS sphere disguise — the raymarched blob is bypassed for the
   * whole corridor (it only serves the Hero, and comes back when this falls so the
   * Contact dock has its blob again). Both meshes sample the same field, so the
   * sphere they exchange is the same object twice.
   */
  tableauOn: number;
  /**
   * La plongée, 0..1 — la traversée de l'écran. Lue par ChromeTableau (fondu du poste,
   * détail macro) et par PixelTunnel (l'avance dans le corridor). Atténuée par tableauOn
   * comme le reste : hors du corridor de Work, il n'y a pas de plongée.
   */
  dive: number;
  /**
   * LA CAMÉRA, confinée au corridor de Work.
   *
   * Le scale grossit un objet ; un dolly change la PERSPECTIVE, et c'est ce que la moulure
   * du tableau — un mesh avec une épaisseur réelle et un biseau — a à montrer et qu'aucun
   * scale n'atteint.
   *
   * Chacune est atténuée vers son identité par `tableauOn` (voir confine), qui vaut
   * exactement 0 hors de Work. Donc Hero, About et Contact gardent au bit près le frustum
   * contre lequel tout le CSS a été réglé — le 7.677 de globals.css est
   * 2·tan(fov/2)·camZ, et il reste vrai partout ailleurs. Le confinement n'est pas une
   * promesse, c'est une identité arithmétique.
   *
   * PAS DE ROTATION, jamais. Un plan perpendiculaire à l'axe de vue projette un rectangle
   * quelle que soit la POSITION de la caméra ; c'est la rotation qui en fait un trapèze —
   * et tout le mécanisme `faced`/snap de ce fichier existe pour l'empêcher.
   */
  camZ: number;
  camY: number;
  camX: number;
  camFov: number;
  /**
   * LE LACET DE LA CAMÉRA. Il est resté nul pendant toute la vie de ce fichier : les
   * sections se composent en DÉPLAÇANT la caméra dans un plan, jamais en la tournant.
   * La salle est la première à en avoir besoin — elle se regarde de l'extérieur du
   * cercle, donc l'œil doit pivoter vers l'intérieur. Zéro hors de la salle, ce qui
   * rend l'ajout invisible partout ailleurs.
   */
  camRotY: number;
  /**
   * LA SALLE — voir theatre.ts. `on` est sa présence, `phi` l'angle courant de la
   * caméra sur son cercle, et `cx/cy/cz` le centre en coordonnées monde.
   *
   * Le centre est calé pour que la caméra en sorte EXACTEMENT là où la plongée l'a
   * laissée : à la station 0 (angle 0) la pose de salle est celle d'arrivée de la
   * plongée, au bit près. Le raccord entre les deux plans n'a donc aucune transition à
   * jouer — il n'y a rien à raccorder.
   */
  theatre: { on: number; phi: number; cx: number; cy: number; cz: number };
  /**
   * The plates' wave phase — a SECOND clock, because the wind has to be able to stop while
   * the metal keeps breathing.
   *
   * Pointing at a project's name holds the picture still, and a freeze must not be a jump:
   * this integrates at a rate that eases to zero (see `hover`), so the crest that was on
   * screen stays exactly where it is and starts again from there. Scaling a shared clock
   * inside the shader would rewind the wave to its origin instead, which is a lurch.
   */
  wave: number;
  /** turntable angle, radians — signed by the scroll direction */
  spin: number;
  /**
   * LE MÊME PLATEAU, SANS LE TOUR DE PAGE — l'angle que lit le poste de Work.
   *
   * `spin` porte deux gestes que le tableau-photo confondait légitimement : la marche vers
   * `faced` (présenter la pièce) ET la révolution par changement d'œuvre (`turn`, « la page
   * tourne pour montrer le tirage suivant »). L'ordinateur n'a plus de tirage à présenter en
   * tournant : chaque changement d'œuvre le faisait pivoter sur lui-même pour rien.
   *
   * Donc le même angle moins `turn`. Les deux bouts sont exacts par construction, ce qui est
   * tout l'intérêt de le calculer ICI plutôt que de le rattraper chez le lecteur : à
   * md.flat = 0 il vaut `free`, l'angle vivant du blob, au bit près — le poste porte encore
   * la sphère et sa dérive ne doit pas être amputée ; à md.flat = 1 le terme `free`
   * disparaît de l'expression et il ne reste que `faced`, multiple EXACT de 2π, donc un
   * poste FACE À LA CAMÉRA, immobile, et identique à chaque approche quelle que soit la
   * vitesse du scroll. Entre les deux, la même marche continue que `spin`.
   */
  spinPosed: number;
  /**
   * The shown plate's silhouette, eased. Mutated in place (never replaced), so a
   * form can hold a reference to it and read it every frame without allocating.
   */
  mood: {
    sx: number;
    sy: number;
    sz: number;
    distort: number;
    freq: number;
    spike: number;
    /** one eased amount per bespoke shape, keyed as in SHAPES */
    shapes: Record<Shape, number>;
    /**
     * 0 = the resting sphere, 1 = the flat 16:9 plates. The Work section's whole
     * premise: the metal is rolled out into photographic plate.
     *
     * It rises ONCE, on arriving in the section, and falls once on leaving — changing
     * plate does not touch it, because a plate change is the strip sliding, not the metal
     * re-forming. Everything that has to agree about how flat the piece is reads this one
     * number: the shader's field, the turntable's freeze, and the walk to face the
     * camera. Two of them disagreeing is a plate presenting itself edge-on.
     */
    flat: number;
    /**
     * The developer, 0..1 — how far the photograph has COME UP on the settled plate.
     *
     * The picture used to surface while the metal was still rolling out (a window on
     * flatness, open from 20%), and that was two events on top of each other: neither the
     * metamorphosis nor the photograph could be read. This eases toward 1 only once the
     * plate is EXACTLY flat (the snap in this file makes "exactly" a real state), so the
     * sequence is: the metal settles, chrome and still — then the print rises out of it,
     * like a tirage in the developer bath. Global, not per slot: it is the section's
     * opening moment, and later plates arrive already developed.
     */
    dev: number;
    /**
     * DEAD, held at 0. It measured the strip's travel and drove the wave's breath —
     * and the strip does not travel any more: with the index as the selector, a plate
     * change is material (dissolve → melt → swap → reform → develop), not lateral.
     * The field survives so the wave/extinction plumbing that reads it stays wired
     * for the day a travelling variant comes back.
     */
    slide: number;
    /**
     * The slot the one plate is WEARING — which photograph the piece carries, as the
     * shader addresses it (texture, aspect, owner). An integer at all times now: it
     * only changes at the bottom of the melt, under cover of the liquid, where a swap
     * has no rectangle left to be seen on. (It was the strip's continuous position,
     * back when changing plate was a slide.)
     */
    car: number;
    /**
     * Eased presence of the reader's attention on the shown plate — the project's name
     * being pointed at (or keyboard-focused).
     *
     * ONE number for the whole gesture: the wind stops, the colour arrives, and the picture
     * steps forward. Three effects off one signal cannot fall out of step with each other,
     * and the reverse is free — letting go of the name plays all three backwards.
     */
    hover: number;
  };
};

/** Total scrub over a full page of scroll (radians). */
const SCRUB = Math.PI * 3;

/**
 * Scroll fraction below which a frame counts as standing still. The page scroll
 * is quantised, so without a dead band a single pixel of jitter — or a rounding
 * wobble in a smooth-scroll library — would keep flipping the direction.
 */
const STILL = 1e-5;

/**
 * How fast the matter answers the cursor, as the fraction of the crossing still to
 * go after a second. Slower than a UI hover on purpose: this is a mass being
 * reshaped, and a snap would read as a sprite swap rather than as the same metal
 * finding a new form.
 *
 * 0.40 → 90% of the melt in ~2.5s. It was 0.56 (~4s), which was longer than DWELL:
 * a reader moving steadily down the band was handed the next plate before the
 * previous object had finished arriving, so no plate was ever seen fully formed —
 * the section read as permanently in transit. At 2.5s the metal settles inside the
 * 1.4s floor plus the time a name takes to be read, and the change still costs
 * enough to be felt.
 */
const MOOD_RATE = 0.4;

/*
 * THERE IS NO SWAY. A ±6° rock was tried here as the flat plate's substitute for the
 * turntable — the reasoning being that a plate held dead still is a poster rather than a
 * piece of metal in a room — and it was removed: on a perspective camera any tilt at all
 * projects the picture as a trapezoid, and the section is a gallery of PHOTOGRAPHS. A
 * photograph hanging square to the wall is not lifeless, it is hung properly. What carries
 * the dimension instead is an optic, not a rotation — the chromatic split in formPhoto.
 *
 * So at full flatness the whole turntable angle resolves to `faced`, an exact multiple of
 * 2π, and every plate projects as a true rectangle.
 */

/**
 * The print's arrival rate — the fraction still to go after a second, so 0.1 is 90%
 * of the arrival in 1s: slow enough to be seen arriving, fast enough that the section
 * is not kept waiting. Dialled live on the toile dev panel, then baked here when the
 * panel went.
 */
const DEV_RATE = 0.1;

/**
 * The page turn's rate — how fast the framed work spins its revolution, as the
 * fraction still to go after a second. An exponential revolution reads as a work
 * being turned by a hand — committed at once, gentle on the landing. 0.06 (from
 * 0.02): 90% of the turn in ~0.8s rather than ~0.6 — at the old rate the work was
 * around before the gesture could be followed; a hand turning a framed picture
 * takes its time, and the settle still lands inside the dwell.
 */
const TURN_RATE = 0.06;

/**
 * La pose au repos — celle que ChromeCanvas déclare sur son `<Canvas camera={…}>`.
 *
 * Dupliquée ici volontairement plutôt que lue depuis la caméra vivante : c'est la valeur
 * vers laquelle le confinement RAMÈNE, donc elle doit être une constante connue et non le
 * résultat de ce que la frame précédente a écrit — sinon la caméra dérive par
 * accumulation. MOVE THIS WITH ChromeCanvas's camera prop.
 *
 * EXPORTÉE depuis T6 : ChromeTableau s'en sert aussi, pour geler son cadrage (`uSeatK`)
 * sur cette pose plutôt que sur la caméra vivante — voir le commentaire au-dessus du
 * calcul de `k` dans son useFrame pour la raison (sans ce gel, la plongée ne ferait pas
 * grossir le poste : le cadrage existant COMPENSE déjà tout changement de z/fov de la
 * caméra pour garder le poste à une taille d'écran constante, ce qui est exactement
 * l'effet qu'une poussée de caméra ne doit PAS avoir ici).
 */
export const CAM_REST = { z: 10, y: 0, x: 0, fov: 42 } as const;

/*
 * LA POSE DE PLONGÉE — écrite en dur ici, PAS déléguée à une seconde feuille Theatre.js.
 *
 * Le plan (T6) prévoyait par défaut une seconde feuille Theatre pour cette trajectoire,
 * avec un repli vers une interpolation directe si le studio se révélait inutilisable. Il
 * l'est : cameraStage documente que son JSON committé est un état IDENTITÉ (sheetsById:
 * {}, aucune keyframe) — la trajectoire de l'ENTRÉE elle-même n'a jamais été auteurée à la
 * main, et rien ne changerait cela. Theatre n'a de valeur que pour un réglage AU DOIGT dans
 * son studio graphique ; une plongée est une poussée DROITE le long de l'axe de vue, vers
 * un point connu par le calcul (le rectangle de l'écran, voir tubeMouth) — une
 * interpolation entre deux poses, pas une courbe qui mérite d'être dessinée image par
 * image.
 *
 * COMPOSÉE PAR-DESSUS LA POSE THEATRE, PAS À SA PLACE : les trois `confine(CAM_REST.*,
 * pose.*, on)` plus bas restent la première couche (l'entrée) ; la plongée réutilise
 * `confine` une seconde fois, EN PARTANT de ce que cette première couche a produit. Si
 * Theatre gagne un jour une vraie trajectoire d'entrée auteurée à la main, la plongée
 * continuera de s'y ADDITIONNER au lieu de l'écraser. Aujourd'hui la première couche vaut
 * toujours CAM_REST à l'identique (pose Theatre inerte), donc la plongée est la SEULE chose
 * qui bouge la caméra dans Work — mais rien dans le code ci-dessous ne suppose ça.
 *
 * UNE SEULE VARIABLE (`state.dive`, déjà confinée au corridor de Work — voir plus bas),
 * PAS TROIS SIGNAUX pour les trois phases de la table du plan :
 *
 *   0    → 0.5   l'approche : la caméra glisse de la pose d'entrée vers un point choisi
 *                UN PEU AU-DELÀ du verre (CAM_DIVE_PAST_GLASS de plus, en profondeur, que
 *                le rectangle de l'écran) — elle grossit en chemin par PERSPECTIVE RÉELLE
 *                (voir le gel de `k` dans ChromeTableau), pas par un zoom déguisé, et
 *                traverse le verre quelque part au milieu (≈0,336-0,349 selon le viewport
 *                — voir le calcul dans ChromeTableau, DIVE_FADE_START/END, qui en dépend).
 *                Le fondu du poste doit être terminé avant CE point-là, pas avant 0.5.
 *   0.5  → 1     le corridor : la caméra NE BOUGE PLUS — elle est déjà à sa place, à
 *                l'intérieur. Le sentiment de défilement vient du recyclage des tranches
 *                du tunnel (uTravel, dans PixelTunnel), pas d'un long trajet caméra à
 *                travers ~24 unités de profondeur : tunnelGeom recycle exprès seize
 *                tranches pour couvrir une profondeur « infinie » SANS que la caméra ait à
 *                parcourir cette distance.
 *
 * Une seule courbe (smoothstep sur `dive`, borné à [0, CAM_DIVE_ARRIVE]) porte les deux
 * phases : rien ne bascule brutalement entre elles, le point où la caméra s'immobilise est
 * simplement celui où la courbe a fini de monter.
 */
/*
 * CAM_DIVE_ARRIVE ET CAM_DIVE_PAST_GLASS ONT DÉMÉNAGÉ DANS posteTweak (`diveArrive`,
 * `divePast`) — tant que le panneau du poste vit, ce fichier les LIT (`dv`, dans le bloc de
 * la caméra plus bas) au lieu de les déclarer. Même raison que TV_FILL avant elles : une
 * constante ici plus un défaut là-bas, et le premier réglage recopié d'un seul côté les fait
 * mentir tous les deux. Elles reviendront ici quand le panneau partira — le bouton
 * « copier » crache exactement les deux lignes attendues, sous le chemin de ce fichier.
 *
 * CE QU'ELLES VEULENT DIRE NE CHANGE PAS, et la seconde a des contraintes qu'aucune molette
 * ne connaît — donc elles restent écrites ici :
 *
 * CAM_DIVE_ARRIVE (0.5) — la part de la plongée (0..1) que la caméra passe à AVANCER.
 * Au-delà, elle est arrivée. C'est la frontière des deux phases de la table du plan
 * ci-dessus, et l'arc de luminosité du corridor repart du même point (PixelTunnel, uArrive,
 * qui lit la même molette — ce fut le MÊME 0.5 écrit dans deux fichiers dont un en GLSL).
 *
 * CAM_DIVE_PAST_GLASS (2.23) — de combien la caméra dépasse le front du verre, une fois
 * arrivée (monde, unités Z).
 *
 * DOIT PLACER LA CAMÉRA UN PEU APRÈS LE Z0 DE PixelTunnel (2.2 — la profondeur LOCALE de sa
 * tranche 0, le seuil du tunnel), sans quoi elle s'arrête AVANT même d'avoir franchi la
 * première tranche du corridor : elle resterait au bord du seuil plutôt que dedans. Deux
 * valeurs plus petites (0.5, puis 1.8 avant la recalibration de Z0 dans PixelTunnel) ont été
 * essayées et rejetées pour cette raison même.
 *
 * RECALIBRÉE PAR CETTE TÂCHE (T7), ET CE N'EST PAS LE MÊME GENRE DE CHANGEMENT QUE LES DEUX
 * PRÉCÉDENTS. Cette constante est en unités MONDE ; « profondeur locale » (le seuil qu'elle
 * doit dépasser) est en unités LOCALES au corridor — les deux ne coïncidaient que parce que
 * PixelTunnel posait `mesh.scale.z = 1` (T6). Cette tâche fait suivre l'échelle Z par `sx`
 * (voir l'en-tête de PixelTunnel.tsx : sans ça, chaque cellule ressort en écharde ~28× plus
 * longue en Z qu'en X/Y), ce qui change le TAUX DE CHANGE entre les deux repères : 1 unité
 * MONDE valait 1 unité LOCALE avant (scale.z=1) ; elle en vaut 1/sx après. `sx` a lui-même
 * changé dans cette tâche (voir CELL dans PixelTunnel.tsx, recalibré ≈0.9 → 0.035 pour une
 * autre raison, l'angle de la tranche proche) : au CELL de T6, sx ≈ 0.0346 et 2.5 unités
 * MONDE atterrissaient à une profondeur locale ≈72, profondément à l'intérieur du cycle de
 * recyclage plutôt que juste après son seuil — mesuré au navigateur, une croix géante (les
 * interstices FILL_XY d'UNE cellule, grossie par sa distance au sommet du cône) plutôt qu'un
 * corridor. Au CELL de CETTE tâche, sx ≈ 0.890 (mesuré au navigateur, viewport testé).
 *
 * 2.23 = 2.5 × sx (le sx ACTUEL, ci-dessus) VISE la MÊME profondeur LOCALE qu'avant tout ceci
 * (2.5, juste après le seuil 2.2) à TRAVERS l'échelle courante — la caméra retrouve la
 * position que ce commentaire a toujours visée, seulement exprimée dans l'unité MONDE qui la
 * fait réellement atterrir là. CALIBRÉ SUR LE VIEWPORT TESTÉ (même réserve que le demi-angle
 * de PixelTunnel, qui varie déjà avec `tubeMouth.hw` sans qu'on l'y corrige pour chaque
 * taille d'écran) : `sx` suit le viewport, cette constante ne le peut pas sans que
 * PixelTunnel publie son échelle quelque part que ce fichier puisse lire — non fait ici, pour
 * ne pas ajouter un troisième écrivain à un objet partagé (`tubeMouth`) qui n'en a qu'un par
 * conception (voir son en-tête). Sur un AUTRE viewport, la caméra atterrit à une profondeur
 * locale différente de 2.5 — jamais assez loin pour retomber dans le régime pathologique
 * mesuré ci-dessus (72), puisque `sx` ne varie que d'un facteur limité entre viewports (le
 * poste change de taille apparente, pas d'ordre de grandeur).
 */

/**
 * How tightly the sheet's flatness chases the entrance's scrub (workReveal.form), as
 * the fraction still to go after a second. Tight — the scrub IS the animation and a
 * lag here is a laggy wheel — but not a hard copy: the smoothing is what keeps the
 * metamorphosis reading as matter with weight rather than as a slider. 0.0005 (from
 * 0.002): the old value left ~15% of the gesture arriving after the hand had stopped,
 * which read as the metal dragging its feet rather than as weight.
 */
const FORM_RATE = 0.0005;

/**
 * How fast the hover gesture answers, as the fraction still to go after a second.
 *
 * 0.05 → about a third of a second. Quicker than anything else in this file, because this
 * one is answering a cursor rather than a scroll: past roughly half a second the wind is
 * still drifting to a stop when the reader has already moved on. Slower than a UI hover all
 * the same — what is being stopped is a mass of moving metal, and it should be felt slowing
 * down rather than switched off.
 */
const HOVER_RATE = 0.05;

/**
 * La vitesse à laquelle la caméra rallie la station visée, en 1/secondes d'une
 * exponentielle. 2,0 met le trajet à ~1,5 s : assez lent pour qu'on voie la salle
 * défiler pendant qu'on la longe, assez vif pour que la molette réponde.
 */
const THEATRE_RATE = 2.0;

/** La focale de la salle — plus longue que celle du poste, la salle est plus profonde. */
const THEATRE_FOV = 47;

/** L'angle courant de la caméra sur le cercle de la salle. Voir le bloc de la caméra. */
let theatrePhi = 0;

const state: FormState = {
  ...formChoreo(0, 0, 0, 0),
  time: 0,
  wave: 0,
  spin: 0,
  spinPosed: 0,
  tableauOn: 0,
  dive: 0,
  camZ: CAM_REST.z,
  camY: CAM_REST.y,
  camX: CAM_REST.x,
  camFov: CAM_REST.fov,
  camRotY: 0,
  theatre: { on: 0, phi: 0, cx: 0, cy: 0, cz: 0 },
  mood: {
    sx: MOOD_REST.stretch[0],
    sy: MOOD_REST.stretch[1],
    sz: MOOD_REST.stretch[2],
    distort: MOOD_REST.distort,
    freq: MOOD_REST.freq,
    spike: MOOD_REST.spike,
    shapes: { gavel: 0, camera: 0, burger: 0, vase: 0 },
    flat: 0,
    dev: 0,
    slide: 0,
    car: 0,
    hover: 0,
  },
};

let eased = 0; // eased About presence — the input to the whole choreography
let easedWork = 0; // eased Work presence — the piece on display, centre stage
let easedAfter = 0; // eased presence of everything past Work — the right dock
let drift = 0; // integrated idle turntable
let dir = 1; // eased scroll direction, -1..1
let dirTarget = 1;
let lastScroll = 0;
let primed = false;
// Accumulated scroll that happened while the ambient turntable was held (the
// About pin). Subtracting it from the scroll fed to the turntable freezes the
// ambient turn during the hold WITHOUT a jump at either edge: it starts at 0 and
// stops growing on release, so the turntable simply carries on from where it was
// left, permanently but invisibly offset on a modular spin.
let holdOffset = 0;
// Eased freeze amount. `aboutReveal.hold` arrives as a binary from the About
// pin's onToggle; easing it here — beside dir and the about presence, where the
// clock does all its other smoothing — is what keeps the skull from HITCHING as
// the pin engages. A hard 0→1 cuts the ambient scroll-turn dead in one frame,
// while the controlled 360° that replaces it starts from zero velocity
// (sine.inOut, scrub-smoothed on top): the turntable's speed would drop to
// nothing for a moment before the spin picks it up. Ramping the freeze in lets
// the ambient turn bleed out exactly as the spin builds, with no gap between.
let holdEased = 0;
// The slot the piece is WEARING — which photograph the one plate carries. Held here
// rather than read off workPlate every frame because it must SURVIVE the section
// releasing the plate (index -1): the sheet un-forms still wearing the last print's
// slot, and hands it back on the way up. Only the swap (at the bottom of the melt)
// and reduced motion may write it.
let shownSlot = 0;
// The page turn: an extra, controlled revolution of the turntable per canvas change.
// `turn` eases toward `turnTarget` (multiples of 2π, so a settled work is face-on by
// construction); the swap fires as the turn crosses edge-on (see swapAtAngle).
let turn = 0;
let turnTarget = 0;
let swapAtAngle = 0;
let swapPending = false;
// The face-on angle the flattening plate is walked to (radians) — latched, see below.
let faced = 0;

export function advanceFormClock(
  delta: number,
  about: number,
  work: number,
  scroll: number,
  reduced: boolean
) {
  // The frame the stage RESUMES on (menu curtain, preloader — anything that flips the
  // canvas's frameloop never→always) arrives with the entire pause as its delta: R3F's
  // clock is not advanced while the loop is held. Integrated raw, one menu cycle threw
  // `time` forward by tens of thousands of seconds — and a huge uTime is where fp32
  // dies in the shader: the simplex noise quantises and the chrome comes back covered
  // in stair-step artifacts, a little worse on every open/close. (This, not buffer
  // reallocation, was the accumulating degradation the dpr experiment recorded — see
  // stageLoad.) A real frame is never longer than a tenth of a second; anything above
  // is a pause being handed back, and the clock treats it as one ordinary frame.
  delta = Math.min(delta, 0.1);
  const tw = blobTweak.get();
  const target = reduced ? 0 : Math.max(0, Math.min(1, about));
  eased += (target - eased) * (reduced ? 1 : 1 - Math.pow(0.05, delta));
  const workTarget = reduced ? 0 : Math.max(0, Math.min(1, work));
  easedWork += (workTarget - easedWork) * (reduced ? 1 : 1 - Math.pow(0.05, delta));
  // The putting-away is scrubbed by Work's own exit timeline (workReveal), not read
  // off that section's position — like About's exit, it is the last beat of a sequence
  // and has to stay behind the three DOM beats in front of it.
  const afterTarget = reduced ? 0 : Math.max(0, Math.min(1, workReveal.away));
  easedAfter += (afterTarget - easedAfter) * (reduced ? 1 : 1 - Math.pow(0.05, delta));

  // The About→Work transition is the pinned sequence's own last beat, scrubbed
  // through aboutReveal.exit — not a second trigger reading the Work section's
  // position, which could drift from the text fade it is supposed to follow. Work's
  // ARRIVAL, by contrast, is a fair function of where that section is; only its
  // departure has an order to respect, hence workReveal above.
  const c = formChoreo(eased, reduced ? 0 : aboutReveal.exit, easedWork, easedAfter);

  // shown plate → silhouette, eased so the matter flows into it
  const m = reduced ? MOOD_REST : workPlate.mood;
  const mr = reduced ? 1 : 1 - Math.pow(MOOD_RATE, delta);
  const md = state.mood;
  md.sx += (m.stretch[0] - md.sx) * mr;
  md.sy += (m.stretch[1] - md.sy) * mr;
  md.sz += (m.stretch[2] - md.sz) * mr;
  md.distort += (m.distort - md.distort) * mr;
  md.freq += (m.freq - md.freq) * mr;
  md.spike += (m.spike - md.spike) * mr;
  // Every shape eases, not just the shown one: that is what makes project → project
  // a melt (the old form drains away as the new one fills) rather than a cut.
  for (const s of SHAPES) {
    md.shapes[s] += ((m.shape === s ? 1 : 0) - md.shapes[s]) * mr;
  }

  // THE CHANGE IS A NEW PRINT ON THE SAME SHEET. With the index as the selector and
  // the neighbours off screen, a photograph flying out sideways said nothing — and a
  // return to the blob between prints said too much (it was tried: the melt made every
  // page turn a re-forming, when it is only a page turn). So the sheet stays flat and
  // docked, and changing plate is the print's own cycle: the picture dissolves back
  // into chrome, the slot is swapped on the bare metal (the plate's width glides to
  // the new photograph's aspect meanwhile — see uAspNow in LiquidDna), and the next
  // print develops. The blob is for arriving and leaving; the prints turn on their own.
  const want = workPlate.index >= 0 ? workPlate.index : shownSlot;
  const changing = want !== shownSlot;
  // Reduced motion: the slot just changes, and plate and print snap with it.
  if (reduced) shownSlot = want;

  // The plate. It flattens on the same signal that used to start the metal taking a
  // project's object — the entrance timeline's forming beat, which is what puts a
  // title on workPlate — so the sequence the reader gets is unchanged in structure:
  // the sphere crosses the stage and swells, THEN it is rolled out. `index` rather
  // than `title` because it is the same number the photographs are addressed by, and
  // two flags for one state can disagree.
  //
  // Reduced motion still gets the plate: it is the section's subject, not an effect.
  // (mr is 1 there, so it simply snaps.)
  const onPlate = workPlate.index >= 0 ? 1 : 0;
  // The roll-out is SCRUBBED, not played: workReveal.form is written by the entrance
  // timeline, so the metamorphosis advances under the reader's hand — each notch of
  // the wheel rolls the metal further, backing up melts it back. The clock chases the
  // scrub tightly (FORM_RATE): enough smoothing for the matter to keep its weight,
  // not enough to lag the gesture.
  const flatTarget = onPlate * (reduced ? 1 : Math.max(0, Math.min(1, workReveal.form)));
  md.flat += (flatTarget - md.flat) * (reduced ? 1 : 1 - Math.pow(FORM_RATE, delta));
  // …and the top and bottom of the range SNAP. An exponential ease never lands, and here the
  // last half percent is not cosmetic — it costs twice over:
  //
  //  - the field keeps 0.5% of the BLOB's distance mixed into the plates' (see plateField),
  //    which is nothing at the centre of the screen and more than the marcher's hit threshold
  //    several units out. That is why the gallery's neighbours were invisible: the rays reached
  //    them and never registered an impact.
  //  - the turntable keeps a few milliradians of the angle it was walking away from, and a
  //    photograph rotated by a few milliradians on a perspective camera is a trapezoid, not a
  //    picture.
  //
  // Half a percent of flatness is invisible; being EXACTLY flat is load-bearing.
  if (md.flat > 0.995) md.flat = 1;
  else if (md.flat < 0.005) md.flat = 0;

  // THE PAGE TURN IS A TURN. Changing canvas spins the framed work one full
  // revolution on the turntable — the site's own gesture for matter presenting
  // itself — and the swap happens at the first EDGE-ON crossing (a quarter in),
  // where the work is a line on screen and neither picture exists to be seen
  // cutting to the other. The canvas's proportions glide meanwhile (uAspNow), so
  // the frame resizes in flight. Chained changes queue another revolution.
  if (changing && !reduced && md.flat === 1 && !swapPending) {
    turnTarget += Math.PI * 2;
    swapAtAngle = turnTarget - Math.PI * 1.5;
    swapPending = true;
  }
  // …a change arriving while the metal is not a plate (the entrance, the exit) needs
  // no ceremony: the blob is not carrying a readable picture.
  if (changing && !reduced && md.flat < 1) shownSlot = want;
  turn += (turnTarget - turn) * (reduced ? 1 : 1 - Math.pow(TURN_RATE, delta));
  // The snap, for the same reason flat snaps: a work face-on save a few milliradians
  // is a trapezoid. And the swap, at the edge-on crossing.
  if (turnTarget - turn < 0.002) turn = turnTarget;
  if (swapPending && turn >= swapAtAngle) {
    shownSlot = want;
    swapPending = false;
  }

  // The print's arrival: it rises once the work is EXACTLY flat — the section's
  // OPENING moment only. A canvas change keeps its picture through the whole turn
  // (the swap happens edge-on, where there is nothing to see): a painting being
  // turned around does not fade, it turns. Snapped at both ends like flat itself —
  // the shader gates its grain branch on dev reaching 1, and an exponential ease
  // never lands on its own.
  const devTarget = md.flat === 1 && workPlate.index >= 0 ? 1 : 0;
  md.dev += (devTarget - md.dev) * (reduced ? 1 : 1 - Math.pow(DEV_RATE, delta));
  if (md.dev > 0.995) md.dev = 1;
  else if (md.dev < 0.005) md.dev = 0;

  // The reader pointing at the name. Only while a plate is actually shown: a hover left
  // hanging by the section releasing the plate would hold the wind stopped for good.
  const wantHover = !reduced && workPlate.hover && workPlate.index >= 0 ? 1 : 0;
  md.hover += (wantHover - md.hover) * (reduced ? 1 : 1 - Math.pow(HOVER_RATE, delta));

  // The strip does not travel any more — the shader shows the ONE slot the piece is
  // wearing (see plateStrip). `car` survives as that slot's number, which is how the
  // photograph is addressed; `slide` is dead and held at 0 so the wave's breath and
  // the extinction, both functions of a travel that no longer happens, stay silent.
  md.car = shownSlot;
  md.slide = 0;

  // Scroll direction decides which way the form turns. Scrolling down winds it,
  // scrolling up unwinds it — the idle drift is the same gesture continued, so it
  // has to carry that gesture's sign instead of always turning the same way.
  // Eased rather than switched, so a reversal reads as the mass changing its mind
  // over a quarter second rather than as a jump cut.
  if (!primed) {
    lastScroll = scroll;
    primed = true;
  }
  const moved = scroll - lastScroll;
  lastScroll = scroll;
  if (Math.abs(moved) > STILL) dirTarget = Math.sign(moved);
  dir += (dirTarget - dir) * (reduced ? 1 : 1 - Math.pow(0.02, delta));

  const holdTarget = reduced ? 0 : aboutReveal.hold;
  holdEased += (holdTarget - holdEased) * (reduced ? 1 : 1 - Math.pow(0.1, delta));

  // Two things freeze the turntable, and they freeze it the same way, so they are one
  // number here: the About pin (which owns its own controlled 360°) and the plate
  // being flat (which cannot be turned at all — a photograph edge-on is a plank).
  // max(), not a sum: both are "the ambient turn is not yours right now", and stacking
  // them would take the factor past 1 and spin the form backwards.
  const frz = Math.max(holdEased, md.flat);

  // While the turn is frozen, swallow this frame's scroll movement into the offset so
  // the scroll-scrub term stops advancing. Eased on both counts — see holdEased for
  // the About pin, and md.flat is itself an easing — which is what keeps the freeze
  // from HITCHING at either edge: the offset starts at 0 and stops growing on release,
  // so the turntable carries on from where it was left, permanently but invisibly
  // offset on a modular spin.
  holdOffset += moved * frz;

  Object.assign(state, c);
  // The work mesh's corridor — rises EARLY in Work's arrival (0.28→0.6 of the eased
  // presence: the switch happens while the sphere is still crossing and swelling, so
  // the roll-out can begin under the reader's hand without waiting for the piece to
  // park), falls with the putting-away so the liquid can carry the blob on to
  // Contact's dock. Smooth at both ends: this drives a crossfade of two
  // sphere-wearing forms, and any step in it would flash.
  // …and EARLY enough (0.12→0.45) that the tableau's sphere is on stage while the
  // skull is still melting: the baton passes skull → tableau with no liquid interlude
  // — a third carrier taking the sphere for a beat between the two meshes read as one
  // more transition in a stretch that should read as ONE.
  {
    const tIn = Math.max(0, Math.min(1, (easedWork - 0.12) / 0.33));
    // …and CLAIMED by the exit scrub itself, not only by Work's eased presence. The
    // eased presence LAGS a fast scroll by up to a second, and the liquid's fade is
    // (1 − handover)(1 − tableauOn): a late tableauOn left a gap where the raymarcher
    // lit back up, at partial alpha, over the full screen — invisible (it draws the
    // same sphere the meshes are exchanging) but paid at full march price, which was
    // the corridor's frame drop. The claim rides aboutReveal.exit — the same signal
    // that lowers the handover — so by the time the liquid COULD wake (exit ≳ 0.8),
    // the corridor is already sealed. Exit holds 1 for the rest of the page, so the
    // claim costs nothing new in Work, and (1 − easedAfter) releases it for Contact.
    const claim = reduced ? 0 : smoothstep(0.55, 0.85, aboutReveal.exit);
    state.tableauOn = Math.max(tIn * tIn * (3 - 2 * tIn), claim) * (1 - easedAfter);
  }
  // La plongée est un scrub PUR : aucune inertie, aucun chase. Contrairement à la formation
  // (que l'horloge lisse pour donner du poids à la matière), une traversée doit coller à la
  // molette au pixel — c'est un déplacement du point de vue, pas de la matière, et un point
  // de vue qui traîne derrière la main lit comme une latence.
  //
  // ATTÉNUÉE PAR `dressed`, EN PLUS DE `tableauOn` — et c'est un ajout de T6, pas seulement
  // une reprise de T3. `tableauOn` ne retombe qu'à la TOUTE fin de la sortie de Work (une
  // fois le texte parti ET le métal relâché — voir son commentaire), donc SANS `dressed` un
  // lecteur qui continue de scroller après avoir fini la plongée (`workReveal.dive` reste à 1,
  // rien ne le rebobine) traverserait toute la sortie de Work — le texte qui s'efface, le
  // métal qui se libère en sphère — avec `dive` toujours à 1 : le poste resterait éteint par
  // le fondu de ChromeTableau (voir DIVE_FADE_END là-bas) pendant que la matière qu'il est
  // censé montrer se détache dessous, invisible. `dressed` est LE MÊME garde-fou que celui
  // que ChromeTableau applique déjà à uReveal/uGlow pour la même raison (« le chrome reprend
  // la matière AVANT qu'elle ne fonde ») — dupliqué ici plutôt que partagé : si l'un des deux
  // calculs change, l'autre doit suivre.
  const dressed = Math.max(0, Math.min(1, (md.flat - 0.9) / 0.1));
  state.dive = state.tableauOn * dressed * Math.max(0, Math.min(1, workReveal.dive));
  // La caméra. Le playhead EST le scrub de l'entrée (workReveal.form) — celui qui déroule
  // déjà le métal — donc la trajectoire de caméra est le MÊME geste que la métamorphose,
  // pas un second événement par-dessus. Et piloté par la valeur brute, pas par la lissée
  // (md.flat, qui la chase à FORM_RATE) : le lissage est ce qui donne son poids à la
  // matière, et l'appliquer aussi à la caméra doublerait le retard. La caméra suit la main,
  // le métal traîne derrière.
  //
  // En reduced motion, le playhead est ramené à 0 et la pose forcée au repos : un mouvement
  // de caméra est du mouvement, et cette préférence demande qu'il n'y en ait pas.
  camSeek(reduced ? 0 : workReveal.form);
  const pose = reduced ? CAM_REST : camPose();
  const on = state.tableauOn;
  const entranceZ = confine(CAM_REST.z, pose.z, on);
  const entranceY = confine(CAM_REST.y, pose.y, on);
  const entranceX = confine(CAM_REST.x, pose.x, on);
  state.camFov = confine(CAM_REST.fov, pose.fov, on);
  // LA PLONGÉE, PAR-DESSUS L'ENTRÉE — voir le grand commentaire sur CAM_DIVE_ARRIVE plus
  // haut dans ce fichier. `confine` une seconde fois, en partant cette fois de la pose
  // d'entrée déjà confinée (`entranceZ/X/Y`) plutôt que de CAM_REST directement : composée,
  // pas substituée. `t` vaut exactement 0 à `state.dive` = 0 (hors du corridor, ou avant que
  // la plongée ne commence, ou pendant qu'elle retombe en sortie de Work — voir `dressed` au-
  // dessus), donc `state.camZ/X/Y` valent alors `entranceZ/X/Y` AU BIT PRÈS : l'identité
  // arithmétique que confine() garantit déjà se recompose sans rien perdre.
  const dv = posteTweak.get();
  const t = smoothstep(0, dv.diveArrive, state.dive);
  // `divePast` est en DEMI-LARGEURS DE BOUCHE, pas en unités monde — voir posteTweak. La
  // bouche est la fenêtre échantillonnée (PixelTunnel), donc sa taille monde suit le cadrage
  // ET `Fenêtre` : la caméra reste à la même profondeur RELATIVE dans le corridor quoi qu'on
  // règle, au lieu d'atterrir loin derrière son seuil dès que la bouche rétrécit.
  const mouthHw = tubeMouth.hw * 2 * tubeHole().half;
  state.camZ = confine(entranceZ, tubeMouth.frontZ - dv.divePast * mouthHw, t);
  /*
   * `tubeMouth.holeX/holeY`, PAS `tubeMouth.cx/cy` — LE CHANGEMENT DE CETTE TÂCHE. La
   * caméra de plongée zoome sur une LETTRE (la contreforme du « a » de « rabbit », voir
   * tubeHole.ts), pas sur le centre géométrique du rectangle-écran : sur le poste réel, le
   * texte du terminal n'est pas centré (il part du coin haut-gauche, voir posteTweak), donc
   * viser `cx/cy` pointait la caméra à côté de la lettre que le tunnel de pixels (PixelTunnel)
   * s'apprête à faire traverser — les deux DOIVENT viser le même point, sans quoi la caméra
   * regarderait l'axe du corridor de travers plutôt que droit dans son fond. `t` (ci-dessus)
   * fait de ce visage une transition progressive de l'entrée jusqu'à l'arrivée du corridor,
   * pas un saut : à `dive` petit, l'écart entre viser cx/cy et viser holeX/holeY est encore
   * faible (t petit), et il grandit précisément tandis que le poste s'éteint (voir
   * DIVE_FADE_START/END dans ChromeTableau) — la caméra achève de se désaxer du centre de
   * l'écran à peu près quand il n'y a plus d'écran à regarder de face pour s'en apercevoir.
   */
  // …ET LE RECENTRAGE SUR UNE AUTRE COURBE QUE `t` — voir `aimFrom`/`aimBy` dans posteTweak.
  // Sur la distance au verre, pas sur `dive` : il doit être FINI avant que la lettre ne
  // grossisse, sinon le retard restant se divise par une distance qui tend vers zéro.
  // La rampe part de LA POSE D'ENTRÉE, pas d'une distance absolue : `tAim` vaut donc
  // exactement 0 tant que la plongée n'a pas commencé (camZ = entranceZ), donc le poste est
  // cadré comme Theatre le dit, centré sur lui-même et pas sur la lettre.
  const tanHalfCam = Math.tan((state.camFov * Math.PI) / 360);
  const xEntry = screenFill(entranceZ, 0.1, tanHalfCam);
  // Le départ de la rampe est le PLUS PROCHE de `aimFrom` et de l'entrée : la caméra tient donc
  // l'ordinateur au centre le temps du plan large, et si l'entrée est déjà plus près que `aimFrom`
  // la rampe repart d'elle — elle vaut 0 au départ dans les deux cas (voir posteTweak).
  const xStart = Math.min(dv.aimFrom, xEntry);
  const tAim =
    1 - smoothstep(dv.aimBy, Math.max(xStart, dv.aimBy + 1e-3), screenFill(state.camZ, 0.1, tanHalfCam));
  /*
   * LA COURBE EST DÉFINIE SUR L'ÉCART PROJETÉ, PAS SUR LA POSITION MONDE — et c'est ce qui
   * supprime le coude. Interpoler camX/camY linéairement vers la lettre donnait une dérive
   * latérale qui S'ARRÊTE (à `aimBy`) alors que la poussée en Z continue : un virage puis une
   * ligne droite.
   *
   * `shrink` est la profondeur restante en fraction de celle de l'entrée. Le facteur
   * `(1 − tAim) · shrink` rend l'écart ANGULAIRE de la lettre exactement proportionnel à
   * (1 − tAim) — la profondeur s'annule dans le rapport écart/distance — donc la lettre
   * GLISSE vers le centre de l'image suivant un smoothstep pur, sans à-coup ni arrêt, et le
   * chemin de la caméra dans le monde est courbe puisque la profondeur, elle, ne décroît pas
   * linéairement.
   *
   * Écrit comme un `u` passé à `confine` plutôt qu'en calculant les positions à la main :
   * u = 0 à l'entrée (tAim = 0, shrink = 1) et u = 1 une fois recentré, donc les deux
   * identités que `confine` garantit — camX/camY valent EXACTEMENT entranceX/Y hors de la
   * plongée — se recomposent sans perdre un bit.
   */
  const depthEntry = Math.max(entranceZ - tubeMouth.frontZ, 1e-4);
  const shrink = Math.max(state.camZ - tubeMouth.frontZ, 0) / depthEntry;
  const uAim = Math.max(0, Math.min(1, 1 - (1 - tAim) * shrink));
  state.camX = confine(entranceX, tubeMouth.holeX, uAim);
  state.camY = confine(entranceY, tubeMouth.holeY, uAim);

  /*
   * LA SALLE, PAR-DESSUS LA PLONGÉE — troisième couche de `confine`, composée comme les
   * deux précédentes plutôt que substituée. À présence nulle, camX/Y/Z valent EXACTEMENT
   * ce que la plongée vient d'écrire : l'identité arithmétique que confine() garantit se
   * recompose sans rien perdre, donc ajouter cette scène ne peut pas déplacer d'un bit la
   * caméra de toutes les autres.
   *
   * LE CENTRE EST CALÉ SUR LA SORTIE DE LA PLONGÉE. La caméra tourne à CAM_RADIUS du
   * centre, donc placer celui-ci un CAM_RADIUS plus loin que le point d'arrivée met la
   * station 0 pile sur ce point, à l'angle 0 — et l'angle 0 vaut aussi un lacet nul, qui
   * est l'orientation par défaut. Le raccord est donc une identité, pas une transition :
   * il n'y a littéralement rien à jouer entre les deux plans.
   */
  const diveZ = tubeMouth.frontZ - dv.divePast * mouthHw;
  state.theatre.cx = tubeMouth.holeX;
  state.theatre.cy = tubeMouth.holeY;
  state.theatre.cz = diveZ - CAM_RADIUS;
  /*
   * LA PRÉSENCE SE DÉDUIT DE LA PLONGÉE, ELLE N'A PAS SON PONT. `state.dive` fait déjà
   * exactement le travail : il monte avec le film, et il retombe tout seul à la sortie
   * de section (il est multiplié par `tableauOn` — voir plus haut). Un second booléen
   * écrit par le DOM aurait dupliqué cette retombée, avec la certitude qu'un jour l'un
   * des deux l'oublie et laisse la salle allumée au-dessus de Contact.
   *
   * 0,72 À 0,96 ET NON 0,88 À 1 : la salle monte pendant le DERNIER QUART du film, pas
   * sur ses toutes dernières images, et elle est entière avant que la plongée ne le soit.
   * Deux raisons. Elle arrivait trop tard — on traversait un noir avant qu'elle
   * n'apparaisse, ce qui coupait la séquence en deux plans au lieu d'un enchaînement. Et
   * finir avant la plongée laisse le corridor s'éteindre PAR-DESSUS une salle déjà là,
   * qui est le sens de lecture juste : on débouche dedans, on ne la voit pas se
   * construire.
   */
  const th = smoothstep(0.72, 0.96, state.dive);
  state.theatre.on = th;

  /*
   * L'ANGLE POURSUIT LA STATION VISÉE, PAR LE PLUS COURT CHEMIN. C'est le seul état
   * intégré de ce bloc, et il l'est délibérément : la station est un ENTIER qui saute
   * (quatre paliers, voir theatreReveal), donc quelque chose doit fabriquer le trajet
   * entre deux valeurs discrètes. Le faire en polaire est ce qui donne l'arc — interpolé
   * en cartésien, le même déplacement tirerait une corde à travers la salle.
   */
  const wanted = STATIONS[Math.max(0, Math.min(STATIONS.length - 1, theatreReveal.station))].phi;
  theatrePhi += shortestDelta(theatrePhi, wanted) * (reduced ? 1 : 1 - Math.exp(-delta * THEATRE_RATE));
  state.theatre.phi = theatrePhi;

  const hall = theatreCamera(theatrePhi, state.theatre.cx, state.theatre.cy, state.theatre.cz, 0);
  state.camX = confine(state.camX, hall.x, th);
  state.camY = confine(state.camY, hall.y, th);
  state.camZ = confine(state.camZ, hall.z, th);
  state.camRotY = confine(0, hall.rotY, th);
  state.camFov = confine(state.camFov, THEATRE_FOV, th);
  // NOTE the hover's step forward is NOT here. It used to multiply this scale, which is the
  // whole form's — so pointing at one project's name grew every picture in the gallery,
  // neighbours included. It belongs to the slot being read, and it is applied there (uGrow in
  // formPhoto), the same way the colour is.
  // NOTE the changeover adds nothing to the docks. The plates move because the STRIP
  // moves under a still camera (md.car, read by the field itself) — not because the form
  // is thrown around the stage. That is what lets two photographs be on screen at once,
  // which a single docked object could never do.
  // The living surface flow does NOT reverse: that is the metal breathing, not the
  // form turning, and running it backwards on the way up would read as a glitch.
  // Speed 0 must still freeze it, hence integrating Speed rather than reading a
  // wall clock.
  state.time += delta * tw.speed * TIME_RATE;
  // The wave's own clock, which the hover brings to a standstill. Integrated (rather than
  // scaled at read time) so stopping holds the phase instead of rewinding it. The slide
  // RUNS it: the wind picks up while the strip travels and settles as the plate arrives —
  // through the clock and never through uWind, which multiplies the accumulated phase and
  // would jump the whole wave sideways if it moved mid-flight.
  state.wave += delta * tw.speed * TIME_RATE * (1 - md.hover) * (1 + 1.5 * md.slide);
  // The freeze silences the AMBIENT idle turn, not the whole drift: the About exit's
  // spinBoost happens while that section is still pinned and is meant to be heard.
  // (Holding only the scroll-scrub term left the idle turn running through the
  // pinned 360°, which is the "~1.5 turns" the hold exists to prevent — just a
  // smaller share of it, and one that grows the slower you scroll.)
  drift += delta * dir * (tw.speed * SPIN_RATE * (1 - frz) + c.spinBoost);
  // The scrub is a function of scroll POSITION, so it rewinds exactly; the drift
  // carries the direction of the last gesture. `scroll - holdOffset` freezes the
  // ambient turn during the About pin and again while the plate is flat, and
  // aboutReveal.spin is the single controlled turn the pinned sequence scrubs in (the
  // skull's 360° once the text is drawn). Sum = the whole turntable angle, so no
  // representation keeps a rotation of its own.
  const free = drift + (scroll - holdOffset) * SCRUB + (reduced ? 0 : aboutReveal.spin);

  // Freezing the turntable is not the same as PRESENTING the plate, and the section
  // needs both: a sheet held at whatever angle the ambient turn happened to be at when
  // it flattened is a blade, edge-on, and the photograph is invisible. So the whole
  // angle is walked to a face-on one — a multiple of 2π, not π, since the back of the
  // plate carries the picture mirrored — and md.flat is the walk.
  //
  // FORWARD, never to the nearest. Rounding to the nearest multiple is the naive reading
  // and it is wrong half the time: whenever the piece has just passed a face-on angle the
  // shortest way back is BACKWARDS, and what you see is the metal reversing against the
  // gesture that is driving it. A mass finishes its turn. Hence ceil/floor by the eased
  // scroll direction — scrolling down completes the revolution, scrolling back up unwinds
  // it — which is the rule the ambient turntable already follows everywhere else.
  //
  // The target is latched before the flattening starts and not recomputed after: `free`
  // still creeps while the freeze is only partly in (it is eased), and a target
  // recomputed each frame could cross a boundary and send the piece all the way round for
  // a rounding difference.
  if (md.flat < 0.02) {
    const turns = free / (Math.PI * 2);
    faced = (dir >= 0 ? Math.ceil(turns) : Math.floor(turns)) * Math.PI * 2;
  }
  // …plus the page turn's own revolution, which only a flat work performs — `turn`
  // rests on multiples of 2π (and snaps there), so the settled work is exactly
  // face-on and the picture a true rectangle.
  state.spin = free + (faced - free) * md.flat + turn * md.flat;
  // …que le poste ne performe PAS : le même angle sans la révolution de la page. Voir
  // `spinPosed` dans FormState pour le pourquoi, et ChromeTableau pour le seul lecteur.
  state.spinPosed = free + (faced - free) * md.flat;
}

export const formState = (): Readonly<FormState> => state;

/**
 * UN HUBLOT DE DÉVELOPPEMENT sur l'horloge — `window.__form` en dev, rien en prod.
 *
 * Tout ce fichier est un état de module que rien n'expose : c'est voulu (les formes ne
 * doivent le lire que par `formState()`, une fois par frame), mais ça rend le débogage
 * aveugle. Symptôme réel qui a motivé ceci : « changer les paramètres de la caméra ne fait
 * rien » — impossible à trancher sans voir, au même instant, la présence du corridor, le
 * scrub qui pilote le playhead, et la pose qui en sort. Trois valeurs dans trois modules,
 * aucune observable depuis la console.
 *
 * Les singletons sont exposés par RÉFÉRENCE et l'état par une fonction, donc le hublot
 * montre toujours la frame courante sans rien copier par frame — il ne coûte rien, et en
 * production la branche est morte à la compilation.
 *
 * Lecture seule par convention. Écrire dedans ne cassera rien d'irréparable, mais l'horloge
 * réécrit tout à la frame suivante, donc ça ne sert à rien.
 */
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__form = {
    state: formState,
    workReveal,
    aboutReveal,
    workPlate,
  };
}
