"use client";

import { posteTweak } from "./posteTweak";
import { LINE_STEP } from "./tubeScreen";
import { TV_LINES } from "./tubeLines";
import { letterIndex } from "./letterTarget";

/**
 * LA CONTREFORME DU « a » DE « rabbit », EN UV DU CANVAS DU TUBE.
 *
 * Le tunnel n'est pas un corridor générique dans lequel on aurait mis du texte : c'est
 * L'INTÉRIEUR D'UNE LETTRE, la contreforme (le trou fermé) du « a » de « rabbit » dans la
 * dernière phrase du terminal (« Follow the white rabbit. », TV_LINES). Ce module dit OÙ
 * ce trou se trouve dans le canvas 512×384 que tubeScreen peint — deux consommateurs :
 * PixelTunnel (pour centrer sa fenêtre de prélèvement, voir son en-tête) et ChromeTableau
 * (pour publier ce point en coordonnées MONDE via tubeMouth.holeX/holeY, que formClock vise
 * pendant la plongée).
 *
 * CALCULÉ, PAS RÉGLÉ À L'ŒIL — c'est le point du mécanisme (voir le rapport de tâche) :
 * l'ABSCISSE vient de `ctx.measureText` sur les préfixes de la ligne réellement peinte, à
 * la police réellement utilisée (posteTweak, la même que tubeScreen.draw lit) — exact par
 * construction, monospace ou pas, et qui SUIT le panneau dev si `textSize`/`textX` changent.
 * L'ORDONNÉE vient de `TextMetrics.actualBoundingBox{Ascent,Descent}` du glyphe « a » SEUL,
 * sous le MÊME textBaseline="top" que tubeScreen.draw — pas une fraction arbitraire de
 * `textSize`, qui aurait ignoré la police réelle (ui-monospace résout différemment selon
 * l'OS) et le fait que « a » n'a ni hampe ni jambage : sa boîte d'encre est plus basse et
 * plus courte que la ligne entière.
 *
 * LE BIAIS VERTICAL (HOLE_Y_BIAS) EST LA SEULE CONSTANTE RÉGLÉE, ET ELLE A ÉTÉ VÉRIFIÉE
 * CONTRE UN RENDU RÉEL, pas choisie au jugé : ce glyphe est un « a » à deux étages (un petit
 * œil sous la panse, une grande boucle basse) — recréé dans un canvas hors-page avec le
 * même dégradé (shadowBlur=22.5, la valeur de production) et zoomé, le milieu géométrique de
 * la boîte d'encre (fraction 0.5) tombe sur la barre qui SÉPARE les deux compartiments, pas
 * dans un trou ; la fraction 0.68 (un peu sous ce milieu, proche de la ligne de base) tombe
 * au centre de la boucle basse — largement le plus grand des deux trous, et celui qui lit
 * comme LE trou une fois le halo de phosphore appliqué (le petit œil du haut s'y fond
 * presque entièrement). Voir le rapport de tâche pour les captures prises à chaque étape.
 *
 * REPLI SUR LE CENTRE DE L'ÉCRAN (u=v=0.5) SI « rabbit » DISPARAÎT DE LA DERNIÈRE PHRASE —
 * pas un crash, pas un NaN qui plante le vertex shader sans message (voir l'avertissement de
 * tunnelGeom.ts sur ce point précis) : exactement le comportement d'avant cette tâche.
 */
export type TubeHole = {
  /** Centre de la contreforme, en UV du canvas (0..1). v=0 est le HAUT — mêmes
   *  conventions que `aCell` dans PixelTunnel (tubeScreen pose `tex.flipY = false`). */
  u: number;
  v: number;
  /**
   * Demi-étendue de la fenêtre de prélèvement autour de ce centre, en UV — LA MÊME valeur
   * sur les deux axes. Ce n'est pas une coïncidence à documenter deux fois : une fenêtre
   * dont le rapport largeur/hauteur EN PIXELS CANVAS vaut 512/384 (le rapport du canvas
   * lui-même — voir CANVAS_W/CANVAS_H) donne, une fois chaque axe normalisé par SA PROPRE
   * dimension (÷512 pour u, ÷384 pour v), la MÊME fraction sur les deux — c'est justement
   * ce qui fait qu'un carré de cellules (COLS/ROWS = 48/36 = 4:3, voir PixelTunnel) prélève
   * un carré de pixels plutôt qu'un rectangle qui étirerait le glyphe.
   */
  half: number;
};

/** Le mot dont on vise une lettre — voir l'en-tête du fichier. */
const WORD = "rabbit";
/** Le « a » est le 2ᵉ caractère de « rabbit » (r-a-b-b-i-t), donc l'offset 1. */
const LETTER_OFFSET = 1;

/** Voir « LE BIAIS VERTICAL » dans l'en-tête du fichier. */
const HOLE_Y_BIAS = 0.68;

/*
 * WINDOW_CHARS A DÉMÉNAGÉ DANS posteTweak (`holeWin`), avec le décalage du trou — même
 * raison que TV_FILL avant elle : tant que le panneau vit, une constante ici PLUS un défaut
 * là-bas et le premier réglage recopié d'un seul côté les fait mentir tous les deux.
 *
 * (Ce qu'elle veut dire est inchangé : la largeur de la fenêtre de prélèvement en multiples
 * de l'avance d'un caractère, mesurée sur « a » lui-même — donc exacte pour CETTE police
 * plutôt que supposée. Son 2.0 d'origine était réglé contre des captures à
 * dive = 0.3/0.5/0.7/0.9, pas au jugé sur le canvas seul : assez pour qu'une tranche de
 * « r » et de « b » borde le trou — les jambages qu'on doit voir comme parois du corridor,
 * voir l'en-tête de PixelTunnel — sans laisser entrer une lettre entière de plus, ce qui
 * diluerait le trou au milieu d'un mur de texte au lieu de le montrer comme LE sujet.)
 */

/** Le canvas du tube — voir tubeScreen.ts. Répété ici plutôt qu'importé : ce fichier ne
 *  peint jamais ce canvas (voir tubeScreen pour pourquoi ces dimensions ne bougent pas
 *  sans une revue explicite), il ne fait que raisonner en pixels de la même grille — même
 *  choix que PixelTunnel, dont COLS/ROWS sont déjà commentées contre ce même 512×384 sans
 *  l'importer. */
const CANVAS_W = 512;
const CANVAS_H = 384;

/** Repli si `WORD` disparaît de la dernière phrase — voir l'en-tête du fichier. */
const FALLBACK: TubeHole = { u: 0.5, v: 0.5, half: 0.5 };

/**
 * Un contexte 2D UNIQUEMENT POUR MESURER — jamais dessiné, jamais lu comme pixels, et
 * surtout PAS le canvas de tubeScreen (qui, lui, est la texture réellement affichée : le
 * mélanger avec un canvas de mesure serait le genre de couplage accidentel que l'en-tête de
 * tubeScreen met en garde contre pour `lines`). Un canvas 0×0 suffit : measureText ne
 * regarde que `font`, jamais les dimensions du canvas ni son contenu.
 */
let scratch: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!scratch) scratch = document.createElement("canvas").getContext("2d")!;
  return scratch;
}

/** Un pixel ramené dans [0, span] — voir son seul appelant. */
function clamp01(px: number, span: number): number {
  return Math.max(0, Math.min(span, px));
}

function measure(): TubeHole {
  const pt = posteTweak.get();
  const line = TV_LINES[TV_LINES.length - 1];
  const ctx = measureCtx();
  ctx.font = `600 ${pt.textSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textBaseline = "top";

  const idx = letterIndex(line, WORD, LETTER_OFFSET);
  if (idx < 0) {
    // LE MOT A DISPARU DE LA PHRASE — et la réponse dépend de qui visait. En AUTO il n'y a
    // plus rien à mesurer : repli documenté sur le centre de l'écran (voir FALLBACK). En
    // MANUEL le mot n'a jamais compté ; ignorer la visée réglée à la main pour retomber au
    // centre serait une molette qui cesse d'obéir sans le dire. Seule la FENÊTRE a besoin
    // d'une mesure, et son unité est le pas de la police, pas ce mot-là : « a » seul suffit.
    if (pt.aimAuto) return FALLBACK;
    const advance = ctx.measureText("a").width;
    return {
      u: clamp01(pt.aimX, CANVAS_W) / CANVAS_W,
      v: clamp01(pt.aimY, CANVAS_H) / CANVAS_H,
      half: (pt.holeWin * advance) / 2 / CANVAS_W,
    };
  }

  // La ligne réellement peinte est "> " + la phrase — voir tubeScreen.draw. Et SA position
  // Y suit la même formule que draw() (pas juste `pt.textY`) : si `textStack` est vrai, la
  // dernière phrase est poussée sous les précédentes plutôt qu'à `textY` pile. Cette
  // branche n'est visitée qu'au panneau dev (le défaut est `textStack: false`), mais la
  // dupliquer correctement coûte trois lignes et évite un trou qui dérive de l'écran dès
  // qu'on touche cette molette-là.
  const lineIdx = TV_LINES.length - 1;
  const first = pt.textStack ? 0 : lineIdx;
  const y = pt.textY + (lineIdx - first) * pt.textSize * LINE_STEP;

  const prefix = "> " + line.slice(0, idx);
  const through = "> " + line.slice(0, idx + 1);
  const leftPx = pt.textX + ctx.measureText(prefix).width;
  const rightPx = pt.textX + ctx.measureText(through).width;

  // La boîte d'encre du glyphe SEUL, sous le même textBaseline="top" que draw(). Le signe
  // compte : actualBoundingBoxAscent est POSITIF quand le haut de l'encre est AU-DESSUS de
  // la ligne de référence — pour un « a » sans hampe sous un repère "top" (qui place cette
  // ligne au sommet de l'em, bien au-dessus de la hauteur d'x), c'est l'inverse : le haut de
  // l'encre est EN DESSOUS de la ligne, donc la mesure réelle est négative (~ -6 pour ce
  // canvas à 31px, vérifiée au navigateur — voir le rapport de tâche). D'où le MOINS ici :
  // `y - ascent` avec ascent négatif redonne bien un point sous `y`, jamais au-dessus.
  const letter = line[idx];
  const ink = ctx.measureText(letter);
  const inkTop = y - ink.actualBoundingBoxAscent;
  const inkBottom = y + ink.actualBoundingBoxDescent;

  // LA VISÉE DE LA MAIN REMPLACE CELLE DE LA MESURE, elle ne s'y ajoute pas — voir `aimAuto`
  // dans posteTweak. Bornée au canvas dans les deux cas : le trou est la fenêtre que
  // PixelTunnel prélève dans cette texture, et un centre poussé dehors ne prélèverait plus
  // que le bord étiré par le clamp du sampler — un corridor sans lettre, sans erreur.
  //
  // LA MESURE TOURNE MÊME EN MODE MANUEL, et ce n'est pas du gâchis : `advancePx` ci-dessous
  // (l'avance d'un caractère à la police réelle) donne encore l'unité de la fenêtre de
  // prélèvement, qui doit rester une taille de LETTRE où qu'on vise — et c'est ce qui permet
  // au panneau de montrer le point mesuré pour amorcer la bascule sans saut.
  const cx = clamp01(pt.aimAuto ? (leftPx + rightPx) / 2 : pt.aimX, CANVAS_W);
  const cy = clamp01(
    pt.aimAuto ? inkTop + HOLE_Y_BIAS * (inkBottom - inkTop) : pt.aimY,
    CANVAS_H
  );
  const advancePx = rightPx - leftPx;
  const halfPx = (pt.holeWin * advancePx) / 2;

  return { u: cx / CANVAS_W, v: cy / CANVAS_H, half: halfPx / CANVAS_W };
}

/**
 * Mémorisé et invalidé sur `textNonce` PLUS LES MOLETTES DE LA VISÉE — et le second terme
 * n'est pas une ceinture de sécurité, il est obligatoire. `textNonce` est le nonce que
 * tubeScreen surveille pour décider s'il doit repeindre (voir posteTweak.TEXT_KEYS) : il
 * couvre les ingrédients de MISE EN PAGE de ce calcul (textX/textY/textSize/textStack), donc
 * pour eux « ce calcul est-il encore bon ? » et « le canvas a-t-il changé ? » restent la
 * même question. `aimAuto`/`aimX`/`aimY`/`holeWin`, elles, déplacent le trou SANS toucher au
 * canvas peint — les ajouter à TEXT_KEYS aurait fait repeindre la texture pour rien à chaque
 * pixel de drag, et les omettre ici aurait gelé le trou sur sa valeur d'avant le réglage :
 * une molette morte, sans erreur, exactement le genre de silence que ce fichier documente
 * ailleurs. Pas un souci de coût dans un sens ni dans l'autre (measureText, quelques appels,
 * est de l'ordre de la microseconde) — c'est la justesse du réglage qui décide.
 */
let cache: { key: string; hole: TubeHole } | null = null;

export function tubeHole(): TubeHole {
  const pt = posteTweak.get();
  const key = `${pt.textNonce}|${pt.aimAuto}|${pt.aimX}|${pt.aimY}|${pt.holeWin}`;
  if (!cache || cache.key !== key) cache = { key, hole: measure() };
  return cache.hole;
}
