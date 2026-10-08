"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry,
  DoubleSide,
  FrontSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from "three";
import type { Mesh, PerspectiveCamera } from "three";
import { formState } from "@/lib/formClock";
import { smoothstep } from "@/lib/formChoreo";
import { screenFill, screenFillUnit, tubeMouth, tunnelCross } from "@/lib/tubeMouth";
import { tunnelLive } from "@/lib/tunnelLive";
import { tubeHole } from "@/lib/tubeHole";
// Une SEULE molette est lue ici, `diveArrive` — pas un panneau pour ce fichier (voir « PAS DE
// PANNEAU DEV ICI » dans l'en-tête, qui vaut toujours pour G/Z0/CELL/REST) : c'est le seuil
// que formClock possède et que ce fragment recopiait en dur.
import { posteTweak, useTunnelGrid } from "@/lib/posteTweak";
import { tubeScreen } from "@/lib/tubeScreen";
import { TV_LINES } from "@/lib/tubeLines";

/**
 * LE CORRIDOR DE PHOSPHORE — la grille du tube RÉPÉTÉE en profondeur, une tranche à
 * l'échelle géométrique de la précédente. tunnelGeom.ts porte l'invariant (échelle/
 * distance constant ⇒ corridor DROIT) et le teste ; ce fichier ne fait que porter les
 * 27 648 instances et le shader qui les place — voir l'en-tête de tunnelGeom.ts : « ces
 * formules sont dupliquées en GLSL dans PixelTunnel, et c'est délibéré : le vertex shader
 * […] n'est pas testable. Les garder identiques ici et là-bas est ce qui fait que ce
 * test couvre réellement ce que le GPU dessine. »
 *
 * CE N'EST PAS UN CORRIDOR GÉNÉRIQUE DANS LEQUEL ON AURAIT MIS DU TEXTE — c'est L'INTÉRIEUR
 * D'UNE LETTRE : la caméra plonge dans la CONTREFORME (le trou fermé) du « a » de « rabbit »,
 * et les jambages de cette lettre, faits des mêmes cellules de phosphore, forment les parois
 * qu'on traverse. Concrètement : chaque tranche n'échantillonne plus le canvas ENTIER (ce que
 * `aCell` ferait brut, en couvrant les 512×384 px) mais une PETITE FENÊTRE centrée sur le trou
 * (`tubeHole()` — voir ce module pour le calcul du centre et de la demi-largeur), agrandie
 * pour remplir les 48×36 cellules de la grille de référence. `uHoleUv`/`uSpan`, mis à jour
 * par frame (le trou suit `textNonce`, voir tubeHole), portent ce recentrage/zoom — voir le
 * vertex shader plus bas pour la formule exacte, et `tubeMouth.holeX/holeY` (pas `cx/cy`)
 * pour l'alignement MONDE qui vise le même point (formClock, CAM_DIVE_ARRIVE, vise aussi ce
 * point : caméra et corridor doivent être d'accord sur OÙ est ce trou).
 *
 * MÊME CANVAS QUE LE POSTE — pas une texture qui lui ressemble. `tubeScreen(TV_LINES)`
 * est un singleton paresseux (voir ce fichier) : le premier appelant fige le contenu
 * pour tous les suivants, qui ne lisent que `.tex`. `TV_LINES` est donc importée depuis
 * ChromeTableau et non redéclarée ici — une copie locale, même identique aujourd'hui,
 * dériverait silencieusement de l'original au premier mot changé là-bas, et si CE fichier
 * se montait un jour avant ChromeTableau, ce serait SA copie qui gagnerait la course et
 * s'imprimerait dans le canvas — sans erreur, juste le mauvais texte pour toujours. En
 * partageant la même constante, le résultat est correct quel que soit l'ordre de montage,
 * plutôt que de dépendre d'une garantie d'ordre de rendu de React que ce fichier ne
 * vérifie pas.
 *
 * LES CELLULES ÉTEINTES N'EXISTENT PLUS, ET C'EST UN RENVERSEMENT ASSUMÉ. Elles existaient :
 * le masque de phosphore couvrait tout le tube, chaque cellule portant une couleur de repos
 * sombre (REST) à laquelle s'ADDITIONNE l'échantillon du canvas — jamais un mix, un phosphore
 * émet (même doctrine que FRAG_CANVAS/FRAG_FRAME dans ChromeTableau). L'argument était que
 * sans REST, le canvas étant noir à ~95 % de sa surface, le corridor serait « une bande de
 * texte flottant dans le vide plutôt qu'un tunnel dont on voit les parois ».
 *
 * CET ARGUMENT VALAIT POUR UNE AUTRE GÉOMÉTRIE. Il a été écrit quand chaque tranche
 * échantillonnait le canvas ENTIER : les parois étaient alors le masque, faute de mieux.
 * Depuis que le corridor prélève une fenêtre de texte et que la caméra entre DANS la
 * contreforme du « a », les parois sont les TRAITS de la lettre — et le masque, lui, remplit
 * précisément le trou qu'on est censé traverser. `uRest` (défaut 0) et `uCut` (le seuil de
 * luminance sous lequel une cellule est retirée) rendent donc le vide au vide. Les deux sont
 * au panneau : c'est un réglage d'image, pas une vérité.
 *
 * PAS DE PANNEAU DEV ICI. Les constantes géométriques ci-dessous (G, Z0, CELL, …) sont
 * des points de départ RAISONNABLES, réglés par le calcul (voir leurs commentaires). REST
 * (dans le fragment shader) A été recalibrée contre le rendu réel dès T5 : la première
 * valeur, choisie au jugé, était invisible sous `toneMappingExposure: 0.3` de la scène — le
 * masque de phosphore éteint disparaissait dans le fond, exactement le défaut que ce fichier
 * était censé éviter.
 *
 * L'ALIGNEMENT SUR L'ÉCRAN, LUI, EST DE T6 — pas un réglage à l'œil non plus, un calcul :
 * la grille RÉFÉRENCE ci-dessous (COLS×CELL par ROWS×CELL, au repos) est mise à l'échelle
 * et déplacée, à chaque frame où le corridor existe, pour que sa tranche 0 coïncide avec le
 * rectangle-monde du tube que ChromeTableau publie (`tubeMouth` — voir ce fichier et le
 * useFrame plus bas). Avant ce calcul, le corridor était une grille posée à l'origine du
 * monde, sans rapport de taille ni de position avec l'écran du poste : une paroi plate
 * derrière lui plutôt qu'un corridor qui en prolonge le rectangle — voir le rapport de T6
 * pour les captures avant/après.
 */

/**
 * Colonnes et rangées de la grille — calées sur l'aspect 4:3 du canvas (512×384, voir
 * tubeScreen.ts) pour que chaque cellule soit CARRÉE : 512/48 = 384/36 = 10,667 px. Une
 * grille qui ne respecterait pas ce rapport étirerait les lettres du canvas sur les blocs.
 */
const COLS = 48;
const ROWS = 36;
/** Tranches recyclées — voir tunnelGeom.ts : « seize tranches suffisent pour une
 *  profondeur illimitée ». Réduire ici EN PREMIER si le budget de frame déborde (voir plus
 *  bas) : la profondeur du corridor se remarque moins que la résolution de sa grille. */
const SLICES = 16;
/* LE NOMBRE D'INSTANCES N'EST PAS UNE CONSTANTE : il se déduit de la grille vivante
 * (`gridOf`) et se pose sur la géométrie elle-même — voir buildGrid pour ce qu'une constante
 * y cassait. COLS/ROWS/SLICES ne servent qu'à la grille RÉFÉRENCE (REF_HW/REF_HH) et aux
 * valeurs initiales des uniformes. */

/**
 * Le taux de croissance géométrique entre deux tranches. PAS une constante exportée par
 * tunnelGeom (le module n'exporte que des fonctions pures — z0 et g y sont des
 * paramètres, jamais des valeurs figées) : reprise ici pour la même raison qu'ailleurs
 * dans ce dépôt, la valeur que tunnelGeom.test.ts exerce (Z0=2, G=0.35) — par convenance
 * de calibrage et de vérification croisée avec les tests, pas parce qu'elle serait « la »
 * valeur canonique de la feature.
 */
const G = 0.35;
/**
 * La profondeur (unités monde) de la tranche 0 — le plan le plus proche du sommet du cône.
 *
 * RECALIBRÉE PAR T6, ET POUR UNE RAISON QUI N'EXISTAIT PAS AVANT L'ALIGNEMENT SUR L'ÉCRAN.
 * Z0=0.2 (la valeur de T5) donnait un cône dont le DEMI-ANGLE D'OUVERTURE — l'angle, vu
 * depuis le sommet, sous lequel une tranche est vue, CONSTANT par construction (voir
 * l'invariant de tunnelGeom) — valait environ 72° : bien plus large que le demi-champ de
 * la caméra (fov=42° ⇒ 21°). Conséquence mesurée : la caméra, une fois à l'intérieur (voir
 * formClock, CAM_DIVE_PAST_GLASS), ne voyait jamais le cône « de loin » — elle butait
 * toujours sur la tranche la plus proche de sa propre profondeur, qui remplissait tout
 * l'écran (le rapport de tâche montre les captures : quatre cellules géantes plutôt qu'un
 * corridor qui s'éloigne).
 *
 * CE DEMI-ANGLE, TEL QUE DÉRIVÉ CI-DESSUS, NE DÉPEND PAS DE CELL NI DE COLS — seulement de
 * Z0 et du rectangle-monde de l'écran (tubeMouth.hw) — MAIS SEULEMENT SOUS L'HYPOTHÈSE
 * `mesh.scale.z = 1` DE T6 (voir le useFrame plus bas). La preuve tenait en une ligne : la
 * demi-largeur MONDE d'une tranche à l'échelle sc vaut `sx · (COLS/2) · CELL · FILL_XY ·
 * sc`, et `sx` vaut PAR CONSTRUCTION `tubeMouth.hw / ((COLS/2) · CELL)` — le produit
 * `(COLS/2) · CELL` s'annulait donc, ne laissant que `tubeMouth.hw · FILL_XY / Z0`. CETTE
 * TÂCHE (T7) CASSE CETTE HYPOTHÈSE : `mesh.scale.z` suit désormais `sx` lui aussi (voir le
 * useFrame — sans quoi chaque cellule ressort en écharde, ~28× plus longue en Z qu'en X/Y,
 * mesuré au navigateur avant ce changement). Une fois Z mis à l'échelle par `sx` comme X/Y,
 * le `sx` du numérateur et celui, nouveau, du dénominateur (la PROFONDEUR est maintenant
 * ELLE AUSSI × sx) s'annulent l'un l'autre au lieu de s'annuler avec `(COLS/2)·CELL` — et ce
 * dernier produit reste, cette fois AU NUMÉRATEUR : le demi-angle « de loin » (tranches
 * lointaines, sc grand) devient `(COLS/2) · CELL · FILL_XY / Z0`, CETTE FOIS DÉPENDANT DE
 * CELL. Voir le commentaire de CELL ci-dessous pour ce que ça implique et pour le demi-angle
 * qui compte réellement ici (celui de la tranche la plus proche, pas celui « de loin »).
 *
 * Z0 GARDE NÉANMOINS SON RÔLE DE T6 : la profondeur locale à laquelle vise la caméra de
 * plongée est choisie AU-DELÀ de Z0 (voir `divePast` dans posteTweak) — Z0 reste donc « le
 * seuil », seulement il ne fixe plus, seul, l'angle du cône.
 *
 * 2.2 → 0.85, ET LA RAISON EST UNE ERREUR DE CALIBRAGE, PAS UN GOÛT. Tout le raisonnement
 * ci-dessus compare le cône au demi-champ de la caméra en citant « fov=42° ⇒ 21° » : c'est le
 * demi-champ VERTICAL. Le demi-champ HORIZONTAL vaut atan(tan(21°)·aspect) — 35.2° sur le
 * viewport de bureau mesuré (1999×1088). Le cône, lui, valait
 * atan(FILL_XY·(1+DISCARD_FRAC)/DISCARD_FRAC·(COLS/2)·CELL/Z0) = 22.1° : il ne couvrait donc
 * que des viewports jusqu'à 1.06:1. MESURÉ AU NAVIGATEUR : deux bandes noires sur les côtés,
 * et — même cause — aucune paroi latérale qui défile, donc un corridor qui lisait comme « la
 * même lettre en plus gros » au lieu d'une traversée.
 *
 * 0.85 porte le demi-angle à 46.4°, ce qui couvre jusqu'à 2.74:1 (un 21:9 est à 2.33). LE
 * RISQUE EST DE L'AUTRE CÔTÉ et il est documenté juste au-dessus : trop large, la caméra bute
 * sur la tranche la plus proche qui remplit l'écran — c'est ce que Z0=0.2 (72°) donnait en T5.
 * Ce qui a changé depuis, et qui rend 46° tenable là où 72° ne l'était pas, c'est
 * DISCARD_FRAC=4.0 (T7) : la tranche proche est RETIRÉE, pas seulement assombrie. Le
 * commentaire de CELL, plus bas, porte le calcul de ce demi-angle-là.
 */
const Z0 = 0.85;
/**
 * Taille d'une cellule (unités monde) à l'échelle de référence (tranche 0). DEPUIS CETTE
 * TÂCHE (T7), CELL FIXE DEUX CHOSES À LA FOIS, ET C'EST LA SOURCE DE LA TENSION RÉSOLUE
 * CI-DESSOUS — voir le commentaire de Z0 pour pourquoi CELL est entrée dans l'angle :
 *
 *   1. L'ANGLE DE LA TRANCHE LA PLUS PROCHE — celui qui compte réellement : la caméra de
 *      plongée vit à une profondeur locale (≈ 1.14·Z0, voir Z0 ci-dessus) COMPARABLE à Z0
 *      lui-même, donc jamais assez loin pour que le demi-angle « de loin » (voir Z0) décrive
 *      ce qu'elle voit — voir DISCARD_FRAC dans FRAG pour la mesure de cet écart. La tranche
 *      qu'expose le fondu de proximité (juste après le seuil DISCARD_FRAC·uCamDepth) a un
 *      demi-angle de `FILL_XY · (1+DISCARD_FRAC) / DISCARD_FRAC · (COLS/2) · CELL / Z0` —
 *      SANS tubeMouth.hw ni sx (la preuve : les deux s'annulent, comme pour l'angle « de
 *      loin », une fois qu'on exprime tout en fonction de la distance AU CUTOFF plutôt que
 *      de la profondeur brute) — donc réglable par CELL SEUL, indépendamment du viewport.
 *      Avec CELL=0.035 : `0.85 · 1.25 · 24 · 0.035 / 2.2 ≈ 0.406`, atan ≈ 22° — proche des
 *      21° (demi-champ) de la caméra, vérifié au navigateur (voir le rapport de tâche).
 *
 *   2. LE RECOUVREMENT ENTRE TRANCHES (inchangé dans sa forme depuis T6, voir FILL_Z
 *      ci-dessous) : CELL·FILL_Z·(2+g)/2 ≳ Z0·g. Cette condition tire CELL vers le HAUT
 *      (avec FILL_Z fixé à FILL_XY, T6 voulait CELL/Z0 ≈ 0.41) tandis que (1) le tire vers
 *      le BAS (CELL/Z0 ≈ 0.016 pour 22°) — un facteur ~25 d'écart, MESURÉ, pas approché : les
 *      deux ne peuvent pas être satisfaites par le même CELL avec FILL_Z = FILL_XY. D'où
 *      FILL_Z, découplé de FILL_XY ci-dessous, qui absorbe SEUL l'exigence de recouvrement
 *      pendant que CELL répond SEULE à (1).
 *
 * 0.035 est choisi pour (1) ; le recouvrement de (2) est vérifié séparément sous FILL_Z.
 */
const CELL = 0.035;
/** Fraction de la maille qu'occupe un bloc, EN X/Y — le reste est l'interstice du masque de
 *  phosphore (comme les liserés noirs entre les luminophores d'un vrai tube). Gouverne (avec
 *  CELL) l'angle de la tranche proche — voir le commentaire de CELL — jamais le recouvrement
 *  entre tranches, qui est l'affaire de FILL_Z seul depuis que les deux sont découplées. */
const FILL_XY = 0.85;
/**
 * Fraction de la maille qu'occupe un bloc, EN PROFONDEUR — DÉCOUPLÉE DE FILL_XY depuis cette
 * tâche (T7), et c'est le cœur de la résolution ci-dessus (voir CELL) : si les deux étaient
 * égales (l'invariant « cellule ~cubique » de T6), CELL devrait satisfaire à la fois l'angle
 * de la tranche proche (qui le veut petit, ≈0.035) ET le recouvrement (qui le veut ≈25× plus
 * grand) — impossible avec un seul nombre. FILL_Z prend donc SEULE la charge du recouvrement :
 * avec CELL=0.035, il faut FILL_Z ≳ 2·Z0·g/(CELL·(2+g)) = 2·2.2·0.35/(0.035·2.35) ≈ 18.7 ;
 * 21 donne (0.035 · 21 · 2.35/2 ≈ 0.864) contre (2.2 · 0.35 = 0.77), soit +12 % de marge —
 * du même ordre que celle de T6 (+17 %) et de T5 (+14 %). CE N'EST PLUS UN CUBE : chaque
 * cellule est ~25× plus longue en Z qu'en X/Y, EN LOCAL, donc AUSSI en monde puisque
 * `mesh.scale` est désormais uniforme (voir le useFrame) — assumé, pas caché : c'est la
 * tranche proche elle-même (DISCARD_FRAC dans FRAG), pas la forme de la cellule, qui
 * gouverne ce qu'on voit en premier plan.
 */
const FILL_Z = 21;

/**
 * Demi-largeur / demi-hauteur de la grille RÉFÉRENCE (tranche 0, échelle 1), en unités
 * locales — ce que le useFrame met à l'échelle pour rejoindre `tubeMouth.hw`/`hh` (le
 * rectangle-monde de l'écran, publié par ChromeTableau). PAS carrée (COLS/ROWS = 4:3, voir
 * ci-dessus) alors que le rectangle du tube ne l'est pas non plus exactement (2.15/1.842 ≈
 * 1.167 par défaut, dans posteTweak) : l'échelle non-uniforme posée sur l'objet (mesh.scale
 * dans le useFrame) étire donc très légèrement les cellules pour combler l'écart plutôt que
 * de laisser une bande de grille dépasser d'un côté du rectangle — un compromis choisi
 * plutôt que mesuré : ~14 % d'écart d'aspect entre les deux, invisible à l'œil sur une
 * grille de cette taille de cellule.
 */
const REF_HW = (COLS / 2) * CELL;
const REF_HH = (ROWS / 2) * CELL;

/**
 * LA GRILLE VIVANTE, dérivée de `gridScale` (posteTweak). COLS et ROWS restent des multiples
 * de 4 et 3 — donc exactement 4:3, la condition des cellules carrées — et CELL est déduite de
 * l'INVARIANT `(COLS/2)·CELL = REF_HW` : la bouche du corridor et l'angle de son cône ne
 * bougent pas quand on change la résolution, seule la finesse des blocs change. FILL_Z suit
 * l'inverse de CELL pour que l'étendue des cellules EN PROFONDEUR reste la même — sans quoi
 * une grille fine laisserait des trous entre les tranches (voir la condition de la tranche
 * proche dans le commentaire de CELL).
 */
function gridOf(scale: number) {
  const base = Math.max(1, Math.round(12 * scale));
  const cols = 4 * base;
  const rows = 3 * base;
  const cell = (2 * REF_HW) / cols;
  return { cols, rows, cell, fillZ: (FILL_Z * CELL) / cell };
}

/**
 * Combien de « tranches » on traverse sur la PLONGÉE ENTIÈRE (dive 0→1). Choisi égal à
 * SLICES : c'est la seule valeur qui fait coïncider exactement « la plongée est finie »
 * et « le corridor a bouclé une fois pile » — recycle() est périodique de période SLICES
 * (voir tunnelGeom.test.ts, « recycle est périodique de période D »), donc à travel=16
 * chaque tranche est revenue à sa position de départ, et le geste se referme sans
 * s'arrêter à une phase arbitraire du cycle. Toute autre valeur (8, 24…) aurait été un
 * choix tout aussi défendable pour la VITESSE perçue ; celle-ci est retenue pour ce
 * qu'elle rend exact plutôt que pour son effet, qui reste à juger à l'écran.
 */
/* TRAVEL_PER_DIVE A DÉMÉNAGÉ DANS LE useFrame (`grid.slices`) — le raisonnement ci-dessus est
 * inchangé, mais le nombre de tranches est réglable depuis le panneau, et une constante figée
 * ici aurait fait boucler le corridor sur un cycle qui n'est plus le sien. */

/**
 * Sous ce seuil de `dive`, le corridor n'existe pas visuellement — voir le useFrame plus
 * bas. Une comparaison stricte à 0 flotterait au premier epsilon de bruit numérique sur
 * `workReveal.dive`.
 */
const DIVE_EPS = 1e-4;

/**
 * LA FENÊTRE DU DÉCROCHAGE, en unités de `dive` — voir `uBreak` dans le vertex shader pour ce
 * qu'elle porte, et le useFrame pour pourquoi elle est dans cette unité et pas dans celle de
 * l'arc de luminosité.
 *
 * ELLE S'INSCRIT DANS UNE SUITE DE BORNES QUI DOIT ÊTRE LUE DANS L'ORDRE, et qui est répartie
 * sur trois fichiers — de quoi la casser sans s'en apercevoir. La séquence complète :
 *
 *   0.75  la dissolution du corridor s'achève (`dissolveAt`, posteTweak)
 *   0.68 → 0.88  LE DÉCROCHAGE : les stries deviennent des points et quittent leurs cases
 *   0.78 → 0.90  l'extinction du corridor (`fallAt` → `fallBy` en p, voir posteTweak)
 *   0.80 → 0.90  la poussière de la salle monte (formClock)
 *   0.90 → 0.915 le noir : plus de corridor, pas encore de pièces, de la poussière seule
 *   0.915 → 0.99 les pièces se condensent (formClock)
 *
 * CES NOMBRES SONT DES POINTS DE DÉPART, à juger à l'écran et pas au calcul — en particulier
 * BREAK_GRAIN et la durée du recouvrement : le grain du tunnel et celui de la salle ne
 * coïncident pas par construction (0,0013 contre 0,0097 unité monde), mais le tunnel est à
 * quelques centièmes de la caméra et la salle à onze unités, donc à l'écran le rapport
 * s'inverse d'un facteur ~29. Il n'y a aucun réglage « juste » à dériver de là, seulement une
 * continuité à obtenir à l'œil.
 */
const BREAK_AT = 0.68;
const BREAK_BY = 0.88;

/**
 * COMBIEN LA COURSE ACCÉLÈRE — la part de `u²` mélangée à `u` dans l'avancée de la traversée
 * (voir son usage dans le useFrame). 0 = vitesse constante, ce qu'elle était ; 1 = quadratique
 * pure, où le départ traîne trop pour que le corridor se lise pendant qu'il naît.
 */
const TRAVEL_ACCEL = 0.35;

/* -------------------------------------------------------------------------- */
/* shaders                                                                    */
/* -------------------------------------------------------------------------- */

const VERT = /* glsl */ `
uniform float uTravel;
// Le trou (voir tubeHole.ts et l'en-tête du fichier) : son centre en UV du canvas, et la
// largeur PLEINE (pas la demi-largeur que rend tubeHole — voir le useFrame plus bas, qui
// double "half") de la fenêtre qu'on y zoome.
uniform vec2 uHoleUv;
uniform float uSpan;
attribute vec2 aCell;
attribute float aSlice;
varying float vLuma;
varying float vSc;
varying float vNear;

/** La largeur du fondu d'ENTRÉE juste après le retrait, en unités du seuil — voir vNear. */
const float FADE_FRAC = 0.15;

/**
 * LA DISLOCATION — ce qui fait des blocs du corridor la poussière de la salle. "uBreak" court de
 * 0 à 1 sur la fin de la plongée (voir BREAK_AT/BREAK_BY dans le useFrame) et porte trois termes.
 *
 * LE PREMIER EST LE SUJET, les deux autres l'accompagnent. Ce qui fait l'identité visuelle de ce
 * corridor n'est pas le volume des blocs, c'est leur ÉTIREMENT RADIAL : en mode ruban, "lproj"
 * est la longueur du tube de la cellule rabattue dans le plan face caméra (voir le bloc RIBBON),
 * et c'est elle qui dessine les stries en fuite. La faire retomber sur la largeur "w" change
 * chaque strie en un carré face caméra — un grain. Le passage de « traits de lumière en fuite »
 * à « grains suspendus » n'est donc pas un fondu entre deux scènes, c'est un changement de LOI
 * dans la même matière, ce qui est exactement le sujet de ce raccord.
 *
 * Les deux autres suivent : le bloc quitte sa case (BREAK_REACH) et rétrécit vers la taille d'un
 * grain (BREAK_GRAIN). Le déplacement est en uBreak AU CARRÉ et non linéaire — ils doivent
 * LÂCHER, pas sauter : au début du seuil le décrochage doit être à peine perceptible.
 */
uniform float uBreak;

/** Jusqu'où un bloc dérive, en CELLULES de la grille de phosphore — l'unité naturelle ici,
 *  puisqu'une cellule est le « pixel » dont le corridor est fait. */
const float BREAK_REACH = 10.0;
/**
 * Ce qu'il reste de la largeur d'un bloc au bout du décrochage.
 *
 * REMONTÉ DE 0.45 À 0.7 : rétrécir, perdre sa strie et s'éteindre en même temps vidait l'image
 * au moment précis où elle doit être la plus intense. Les blocs gardent donc l'essentiel de leur
 * présence, et c'est l'extinction seule qui les emporte.
 */
const float BREAK_GRAIN = 0.7;
/**
 * L'écart à la radiale, en fraction de celle-ci — voir breakDir. 0 = une étoile parfaitement
 * géométrique, 1 = presque isotrope, donc le grouillement qu'on vient de corriger.
 */
const float BREAK_SPREAD = 0.55;
/** La part de dérive en PROFONDEUR, qui casse la lecture « tout part dans un même plan ». */
const float BREAK_Z = 0.3;
/**
 * À partir de quelle avancée du décrochage la strie commence à s'arrondir — voir son usage.
 * Sous ce seuil les blocs dérivent en gardant leur étirement, donc en gardant la vitesse.
 *
 * REMONTÉ DE 0.45 À 0.7, pour la même raison que BREAK_GRAIN : la strie est le seul signal de
 * vitesse de ce corridor, et la retirer avant la fin de la course laisse un plan qui ralentit
 * alors qu'il accélère. Elle ne s'arrondit plus que sur le tout dernier tiers du décrochage,
 * quand les grains sont déjà en train de s'éteindre.
 */
const float STREAK_HOLD = 0.7;

/**
 * La direction de fuite d'un bloc — tirée UNE FOIS de sa case et de sa tranche, donc stable pour
 * un bloc donné d'une frame à l'autre. Pas d'attribut de plus à téléverser : "aCell" et "aSlice"
 * sont déjà là.
 *
 * RADIALE, PAS ISOTROPE, ET C'EST UNE CORRECTION. Le premier essai tirait une direction uniforme
 * sur la sphère, ce qui paraissait le choix neutre. C'était le mauvais : la caméra est SUR L'AXE,
 * donc la moitié des blocs partait vers elle et l'autre moitié s'en éloignait. Le flux optique
 * cohérent — tout ce qui, dans ce corridor, dit qu'on avance — devenait un grouillement, et le
 * décrochage se lisait comme un ARRÊT au milieu de la plongée, exactement là où la course est
 * censée être la plus rapide.
 *
 * Écartés depuis l'axe, les blocs balaient au contraire vers les bords du cadre et sortent par
 * les côtés : c'est le mouvement qu'on voit en traversant un nuage, et il AJOUTE de la vitesse au
 * lieu d'en retirer. Le décrochage devient une accélération plutôt qu'une dispersion.
 *
 * Le désordre reste, mais dans l'écart à la radiale (BREAK_SPREAD) et sur une petite composante
 * en profondeur (BREAK_Z) : assez pour que ce ne soit pas une explosion géométrique en étoile,
 * trop peu pour rendre le flux incohérent.
 */
vec3 breakDir(vec2 cellRef, vec2 cell, float slice) {
  float a = fract(sin(dot(cell, vec2(127.1, 311.7)) + slice * 74.7) * 43758.5453);
  float b = fract(sin(dot(cell, vec2(269.5, 183.3)) + slice * 51.3) * 43758.5453);
  // La radiale depuis l'axe. Repli sur une direction fixe au centre exact, où elle n'existe pas.
  float l = length(cellRef);
  vec2 rad = l > 1e-5 ? cellRef / l : vec2(1.0, 0.0);
  // Le désordre est ajouté AVANT de renormaliser plutôt que par une rotation : même effet, et
  // pas de sin/cos de plus dans un shader qui en compte déjà deux par bloc (voir le garde à
  // l'appel pour ce que coûte une transcendante ici).
  vec2 dir = normalize(rad + vec2(a - 0.5, b - 0.5) * BREAK_SPREAD);
  return vec3(dir, (fract(a * 7.3 + b * 3.1) - 0.5) * BREAK_Z);
}

/*
 * LE TRI DES BLOCS EST ICI, PLUS DANS LE FRAGMENT — ET C'EST CE QUI REND LA GRILLE FINE
 * JOUABLE.
 *
 * Les deux « discard » du fragment shader (la tranche proche retirée, et la cellule éteinte
 * sous uCut) testaient des grandeurs CONSTANTES PAR INSTANCE : vDepth ne dépend que de
 * aSlice, la luminance que de aCell. On rastérisait donc un bloc entier, on shadait chacun
 * de ses pixels, puis on les jetait tous — pour la grande majorité des blocs, le canvas du
 * terminal étant presque partout noir. Pire : « discard » interdit au GPU l'early-Z, donc
 * les blocs SURVIVANTS se repeignaient les uns par-dessus les autres sur toute la
 * profondeur du corridor.
 *
 * Mesuré à dive 0.8 : 1 728 000 blocs = 79,7 ms/frame avant, et 6 238 080 (le réglage
 * « Pixels » poussé) = 291 ms — injouable. Le même test fait ici sort l'instance du volume
 * de clip (gl_Position hors [-1,1], donc zéro fragment), et le fragment shader n'a plus de
 * discard du tout : l'early-Z revient pour ceux qui restent.
 *
 * LA LECTURE DE TEXTURE DANS LE VERTEX SHADER coûte 36 fetches par bloc (le cube) là où le
 * fragment n'en faisait qu'un par pixel — mais les 36 tombent sur LE MÊME texel, donc dans
 * le cache L1 de la texture, et elle remplace l'échantillonnage du fragment (vLuma, ci-
 * dessous, remplace vUvCell : le fragment n'a plus besoin du canvas).
 */
uniform sampler2D uScreen;
uniform float uCut;
uniform float uCamDepth;
uniform float uDiscard;
// 1 = le corridor boucle (recycle), 0 = on le traverse une fois — voir main().
uniform float uLoop;
/*
 * uShaft — 1 = LE PUITS (blocs de taille FIXE, tranches à espacement CONSTANT), 0 = le cône
 * auto-similaire d'origine. Ce n'est pas un réglage d'image, c'est le seul moyen de voir les
 * pixels grossir, et la raison est démontrable :
 *
 * dans le cône, z(k) = z0·(1+g)^(k−travel), et la taille d'un bloc COMME son écart à l'axe sont
 * tous deux ∝ z, toutes les tranches échantillonnant la même fenêtre du canvas. Avancer travel
 * de 1 fait donc prendre à chaque tranche la place, la taille ET l'image de sa voisine : l'image
 * rendue est EXACTEMENT périodique de période un cran. Un zoom infini à la Droste — les blocs
 * s'écartent, meurent au rayon de retrait, l'image se réinitialise. Aucune progression n'est
 * visible par construction, et c'est ce que le va-et-vient rapporté à l'écran décrivait. Enlever
 * la boucle « recycle » n'y pouvait rien : l'auto-similarité EST la boucle.
 *
 * Dans le puits, la section est constante (la fenêtre de la lettre, extrudée), les tranches sont
 * espacées de uStep et les blocs gardent leur taille : un bloc à distance d couvre taille/d, donc
 * il grossit vraiment en approchant, rien ne se répète, et la sortie est littérale — les derniers
 * blocs filent hors cadre.
 */
uniform float uShaft;
// Le pas entre deux tranches du puits, en unites locales (voir « tubeStep » dans posteTweak).
uniform float uStep;
// La part de ce pas qu'un bloc occupe en profondeur : a 1 la paroi est continue (voir « tubeWall »).
uniform float uWall;

/*
 * LA GEOMETRIE DU CORRIDOR EST EN UNIFORMES, PLUS EN CONSTANTES CUITES — et ce n'est pas une
 * preference de style. Ces sept nombres sont exactement ceux que le panneau dev regle : cuits
 * par interpolation de template, chaque cran de barre reconstruisait la source GLSL et
 * relancait une compilation, donc un panneau injouable. En uniformes, seul le tableau
 * d'instances (aCell/aSlice) se reconstruit, et seulement quand la RESOLUTION change.
 *
 * Z0 reste calibre contre le demi-champ HORIZONTAL de la camera (voir son commentaire plus
 * haut) : il n'est pas au panneau, parce que la profondeur ou s'arrete la camera (<< divePast >>
 * dans posteTweak) est exprimee dans une unite qui en depend.
 */
uniform float uG;
uniform float uZ0;
// D, pas SLICES : le fichier de test (tunnelGeom.test.ts) nomme sa constante de boucle D
// pour la même quantité — repris ici pour que les deux se lisent côte à côte.
uniform float uD;
uniform float uCols;
uniform float uRows;
uniform float uCell;
uniform float uFillXY;
uniform float uFillZ;

/*
 * sliceZ ET recycle — RETRANSCRITES de src/lib/tunnelGeom.ts, vérifiées ligne à ligne
 * contre ce fichier (et non recopiées de mémoire depuis un plan, qui prévenait lui-même
 * que sa version pouvait être fausse).
 *
 * sliceScale N'EST PAS retranscrite séparément. sliceScale(k,g) / sliceZ(k,z0,g) est
 * CONSTANT — c'est le tout premier test de tunnelGeom.test.ts (« échelle / distance est
 * constant sur toutes les tranches »), de valeur 1/z0 puisque sliceScale(0)=1 et
 * sliceZ(0)=z0. Donc après avoir recyclé z, l'échelle qui va avec est directement z/Z0
 * dans main() ci-dessous : pas un raccourci approximatif, l'identité que ce test prouve.
 */
float sliceZ(float k, float z0, float g) {
  return z0 * pow(1.0 + g, k);
}

float recycle(float z, float travel, float z0, float g, float slices) {
  float lg = log(1.0 + g);
  float span = slices * lg;
  float u = log(z / z0) - travel * lg;
  /*
   * LE DOUBLE MODULO, gardé pour coller à la STRUCTURE de tunnelGeom.ts — dont le
   * commentaire explique pourquoi JS a besoin des deux (« % » en JS garde le signe du
   * dividende, donc un travel positif qui dépasse k laisserait u négatif après un seul
   * modulo). EN GLSL CE N'EST PAS LE MÊME BESOIN, et ça a été vérifié contre la
   * spécification du langage plutôt que supposé : « mod(x, y) » du GLSL est DÉFINI comme
   * « x - y·floor(x/y) », qui rend toujours un résultat dans [0, y) — y compris pour un x
   * négatif. Un seul mod suffirait déjà ; le second est donc une redondance sans risque
   * (mod(r + span, span) == r dès que r ∈ [0, span)), gardée pour que cette fonction se
   * relise ligne à ligne contre son homologue JS plutôt que par nécessité GLSL.
   */
  u = mod(mod(u, span) + span, span);
  return z0 * exp(u);
}

void main() {
  /*
   * UNE SEULE TRAVERSÉE, OU LA BOUCLE — voir « tunnelLoop » dans posteTweak pour le geste.
   *
   * Sans boucle, « avancer » se réduit à décaler l'INDICE de la tranche : sliceZ(k − travel) au
   * lieu de sliceZ(k), ce qui est exact et pas une approximation, la suite étant géométrique
   * (z0·(1+g)^k). Une tranche dont l'indice décalé devient négatif passe donc derrière la caméra
   * et n'est plus jamais redessinée — le retrait de la tranche proche (plus bas) s'en occupe
   * avant qu'elle ne balaye tout le cadre. C'est ce qui donne une FIN au corridor : les dernières
   * tranches, les plus larges du cône, s'écartent puis dégagent.
   *
   * « recycle », lui, ramène au fond ce qui est passé trop près : c'est la boucle, donc un tube
   * sans sortie.
   */
  /*
   * z = LA PROFONDEUR DE LA TRANCHE depuis la bouche, sc = L'ÉCHELLE de son motif.
   *
   * Puits : espacement constant (uStep) et sc = 1 — les blocs ne changent JAMAIS de taille dans le
   * monde, donc leur taille à l'écran ne dépend que de leur distance à la caméra. En boucle, la
   * tranche passée devant repart au fond (modulo sur les crans, pas sur les logarithmes).
   *
   * Cône : la suite géométrique d'origine (voir uShaft pour ce qu'elle empêche de voir).
   */
  float z;
  float sc;
  if (uShaft > 0.5) {
    float k = uLoop > 0.5 ? mod(mod(aSlice - uTravel, uD) + uD, uD) : aSlice - uTravel;
    z = k * uStep;
    sc = 1.0;
  } else {
    z = uLoop > 0.5
      ? recycle(sliceZ(aSlice, uZ0, uG), uTravel, uZ0, uG, uD)
      : sliceZ(aSlice - uTravel, uZ0, uG);
    sc = z / uZ0;
  }

  // uHoleUv + (aCell − 0.5) · uSpan, PAS aCell BRUT — voir l'en-tête du fichier. "aCell"
  // reste la position de la cellule dans la grille DE RÉFÉRENCE (0..1, inchangé, c'est ce qui
  // place le bloc dans "cellRef" plus bas) ; c'est SEULEMENT le point du canvas qu'elle
  // échantillonne qui change — recentré sur le trou et resserré à sa fenêtre au lieu de courir
  // sur les 512×384 px entiers. "(aCell − 0.5)" est déjà centré sur 0 (comme "cellRef"), donc
  // à "uSpan" = l'étendue pleine de la fenêtre, une cellule en bord de grille (aCell ≈ 0 ou 1)
  // atterrit exactement sur le bord de la fenêtre, pas au-delà.
  vec2 uvCell = uHoleUv + (aCell - 0.5) * uSpan;
  // LE SEUIL PORTE SUR LA LUMINANCE BRUTE, AVANT uNeon (voir FRAG) : la naissance du corridor
  // divise la luminance par plus de deux, donc seuiller après ferait disparaître le corridor
  // ENTIER à l'instant du fondu, puis réapparaître par morceaux.
  vLuma = dot(texture2D(uScreen, uvCell).rgb, vec3(0.2126, 0.7152, 0.0722));
  /*
   * LE RETRAIT DE CE QUI EST TROP PRÈS — et son unité change avec la forme.
   *
   * Puits : la distance à la caméra est z − uCamDepth (SIGNÉE : négative derrière l'œil, donc
   * retirée du même coup), et le seuil se compte en PAS. Un bloc gardé jusqu'à 0.4 pas grossit
   * 2.5 fois par rapport à un bloc à un pas — c'est ce facteur qui se voit.
   *
   * Cône : la distance ABSOLUE, seuillée en multiples de la profondeur caméra (voir uDiscard).
   */
  float dCam = uShaft > 0.5 ? z - uCamDepth : abs(z - uCamDepth);
  float cutoff = uShaft > 0.5 ? uDiscard * uStep : uDiscard * max(uCamDepth, 1e-3);
  if (dCam < cutoff || vLuma < uCut) {
    // HORS DU VOLUME DE CLIP, pas une échelle nulle : un triangle dégénéré serait tout de même
    // assemblé et clippé au cas par cas, alors qu'un w=1 avec x/y/z=2 sort franchement de
    // [-1,1] — le clipping le supprime avant tout balayage, pour les huit sommets à la fois.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  // La cellule à l'échelle de référence (tranche 0) : centrée sur la grille, Y inversé
  // pour que le haut du canvas (aCell.y → 0, où le terminal écrit) devienne le haut du
  // corridor (Y local positif) — un choix de présentation, pas une contrainte de
  // tunnelGeom, qui ne connaît que des grandeurs scalaires.
  vec2 cellRef = vec2((aCell.x - 0.5) * uCols, (0.5 - aCell.y) * uRows) * uCell;
  // « position » : le cube unité de BoxGeometry(1,1,1), en [-0.5, 0.5] par axe. Sa propre
  // taille ET son décalage dans la grille grossissent tous deux par « sc » : c'est
  // l'invariant du tube droit appliqué à un bloc entier, pas seulement à son centre —
  // sans quoi les blocs resteraient à taille constante dans un cône qui, lui, s'évase.
  /*
   * LA LONGUEUR DU BLOC EN PROFONDEUR, et pourquoi elle ne peut pas être la même dans les deux
   * formes. uFillZ (21 × la résolution) est calibré POUR LE CÔNE, où il compense la taille de
   * cellule pour que l'étendue en profondeur reste constante quand la grille s'affine. Repris tel
   * quel dans le puits, il donnait des barres de ~4,4 PAS de long : les blocs se chevauchaient sur
   * toute la profondeur du tube, ce qui redonnait des stries continues au lieu de pixels qu'on
   * dépasse un par un — vu à l'écran.
   *
   * Dans le puits, la longueur d'un bloc est donc une fraction du PAS (uWall, la molette
   * « Paroi ») — et à 1 les blocs se touchent d'une tranche à l'autre : la paroi devient un mur
   * continu. Ce n'est pas cosmétique, c'est ce qui fait qu'il n'y a qu'UNE ouverture au fond du
   * tube, donc un bout de tunnel dont l'angle croît de façon monotone jusqu'à la sortie. Avec des
   * blocs courts, chaque tranche a la sienne, la plus proche grandit puis cède la place à une plus
   * petite, et le geste se lit comme un va-et-vient — voir « tubeWall » dans posteTweak.
   */
  float fz = uShaft > 0.5 ? uStep * uWall : uCell * uFillZ;
  // La largeur d'un bloc, RÉTRÉCIE par la dislocation (voir uBreak) — sortie en variable parce
  // que le mode ruban la relit plus bas, et que deux copies dériveraient au premier réglage.
  float bxy = uCell * uFillXY * mix(1.0, BREAK_GRAIN, uBreak);
  // Dans le puits, « sc » vaut 1 : la même ligne place donc des blocs de taille constante sur une
  // section constante, sans qu'aucun cas particulier soit nécessaire ici.
  vec3 boxRef = vec3(cellRef, 0.0) + position * vec3(bxy, bxy, fz);
  // Z NÉGATIF : la caméra par défaut de la scène est à z=+10, tournée vers -Z (voir
  // ChromeCanvas) — s'éloigner dans le corridor, c'est donc aller vers les z locaux
  // négatifs. tunnelGeom ne porte que des magnitudes positives (z0>0 précisé dans son
  // en-tête) ; le signe est une décision de présentation prise ICI, une seule fois.
  vec3 p = vec3(boxRef.xy * sc, -z + boxRef.z * sc);

#ifdef RIBBON
  /*
   * LE BLOC EN RUBAN — MÊME SILHOUETTE QUE LE CUBE, QUATRE SOMMETS AU LIEU DE VINGT-QUATRE.
   *
   * Ce qui fait la strie radiale du corridor n'est PAS le volume du cube : c'est sa LONGUEUR en
   * profondeur (uFillZ — les cellules sont des tubes, voir mouthBack) vue de biais depuis l'axe.
   * Et ce fragment shader ne connaît aucune lumière : la couleur est plate sur toute l'instance
   * (elle ne dépend que de vLuma/vSc/vDepth, constants par bloc). Deux formes de MÊME silhouette
   * sortent donc EXACTEMENT les mêmes pixels — d'où le ruban, un quad face caméra étiré le long
   * de l'axe, qui redessine le flanc du tube que la caméra voyait réellement.
   *
   * Une plaque plate (le premier essai) ne suffisait pas : sans étirement il ne reste qu'un point
   * par cellule, et les stries disparaissent — mesuré ET vu, capture à l'appui.
   *
   * LA CAMÉRA EST SUR L'AXE, à la profondeur locale -uCamDepth (voir uCamDepth dans le useFrame :
   * un point à z = uCamDepth est exactement sur elle). « across » est donc la tangentielle, et
   * « along » la direction de l'axe RABATTUE dans le plan face caméra — la longueur vue du tube
   * vaut sa longueur réelle × sin(angle axe/regard), qui tombe à zéro pile au point de fuite. On
   * la borne à la largeur du bloc : au centre du cadre, le tube est vu par le bout, donc carré.
   */
  vec3 pc = vec3(cellRef * sc, -z);
  vec3 v = normalize(pc - vec3(0.0, 0.0, -uCamDepth));
  vec3 axis = vec3(0.0, 0.0, 1.0);
  vec3 across = cross(axis, v);
  float al = length(across);
  across = al > 1e-4 ? across / al : vec3(1.0, 0.0, 0.0);
  vec3 along = normalize(cross(v, across));
  float w = bxy * sc;
  /*
   * LA POINTE DU TUBE NE DÉPASSE JAMAIS LA CAMÉRA — la borne qui rend le RETRAIT réglable.
   *
   * Ces tubes sont longs (uFillZ ≈ 1500 fois la largeur d'une cellule) pour que les tranches se
   * recouvrent en profondeur. Un tube dont le CENTRE est à peine devant la caméra la traverse
   * donc : la moitié avant passe derrière l'œil, ce qui reste se projette en polygone plein cadre
   * et, ce matériau écrivant la profondeur, MASQUE tout le corridor derrière. Constaté à l'écran
   * en baissant « Retrait » — l'image devenait noire au lieu de devenir vivante, et c'est ce que
   * le retrait large d'origine évitait, au prix du grossissement qu'on cherche ici.
   *
   * Plafonner la demi-longueur à 0.9 · (z − profondeur caméra) supprime le cas par construction,
   * quel que soit le retrait : le tube se RACCOURCIT en approchant, donc il grossit et redevient un
   * bloc carré juste avant de filer — ce qui est précisément ce qu'on veut voir arriver.
   */
  float lenZ = min(fz * sc, 1.8 * max(z - uCamDepth, 0.0));
  float lproj = max(lenZ * al, w);
  /*
   * LA STRIE DEVIENT UN POINT — le terme qui porte tout le raccord, voir uBreak. À collapse = 1
   * la longueur rabattue vaut la largeur : le ruban est un carré face caméra, donc un grain.
   *
   * MAIS PAS TOUT DE SUITE — STREAK_HOLD, ET C'EST UNE CORRECTION, pas un raffinement. La strie
   * EST le signal de vitesse : c'est son étirement radial, et lui seul, qui dit qu'on avance
   * (le fragment ne connaît aucune lumière, donc rien d'autre ne porte le mouvement). La faire
   * retomber dès le début du décrochage éteignait la vitesse à l'instant où les blocs lâchent —
   * vu à l'écran : ça faisait une PAUSE au milieu de la traversée, la course s'arrêtait pour
   * laisser jouer une dispersion.
   *
   * Décalée, la lecture redevient juste : les blocs quittent leurs cases EN ÉTANT ENCORE des
   * stries — donc on continue de foncer pendant qu'ils se détachent — et ils ne s'arrondissent
   * qu'à la toute fin, quand la course est de toute façon finie.
   */
  lproj = mix(lproj, w, smoothstep(STREAK_HOLD, 1.0, uBreak));
  p = pc + across * (position.x * w) + along * (position.y * lproj);
#endif

  /*
   * …ET LE BLOC QUITTE SA CASE. Après les deux branches, sur le "p" commun : la dérive est un
   * déplacement du grain, elle n'a rien à voir avec la façon dont sa silhouette a été construite.
   * En cellules (voir BREAK_REACH), et en uBreak² pour que le décrochage s'amorce doucement.
   *
   * LE GARDE N'EST PAS UNE MICRO-OPTIMISATION, C'EST LA DIFFÉRENCE ENTRE FLUIDE ET SACCADÉ.
   * GLSL n'évalue pas paresseusement : écrit sans le "if", breakDir() tourne sur CHAQUE sommet
   * survivant de CHAQUE frame de toute la plongée, y compris pendant les deux tiers où uBreak
   * vaut exactement zéro et où son résultat est multiplié par 0. À gridScale 5.5 la grille fait
   * 264×198×40 instances, soit 8,4 millions d'invocations du vertex shader par frame — le
   * commentaire d'en-tête qui annonce 27 648 date d'un gridScale de ~1 et est périmé. Quelques
   * transcendantes gratuites à cette échelle se paient en millisecondes.
   *
   * ET C'EST UNE BRANCHE SUR UN UNIFORME, donc sans divergence : toutes les invocations d'un
   * même draw call prennent le même chemin, ce qui est le seul cas où un "if" est gratuit sur
   * GPU. La règle habituelle (« pas de branche dans un shader chaud ») vise les branches sur des
   * données par sommet ; celle-ci est l'inverse.
   */
  if (uBreak > 0.0) {
    p += breakDir(cellRef, aCell, aSlice) * (uBreak * uBreak * BREAK_REACH * uCell);
  }

  /*
   * LE FONDU D'ENTRÉE EST CALCULÉ ICI, PLUS DANS LE FRAGMENT — il ne dépend que de la tranche,
   * donc il est constant par bloc, et le fragment n'a plus besoin ni de uCamDepth ni de uDiscard.
   * Plancher à 0.4 : voir FADE_FRAC et le commentaire de uDiscard côté FRAG.
   */
  vNear = mix(0.4, 1.0, smoothstep(cutoff, cutoff + FADE_FRAC * max(uShaft > 0.5 ? uStep : uCamDepth, 1e-3), dCam));
  // L'ATTÉNUATION SE LIT EN DISTANCE, PAS EN ÉCHELLE, dans le puits : sc y vaut 1 partout (voir
  // plus haut), donc c'est la distance à la caméra, comptée en pas, qui dit « loin ».
  vSc = uShaft > 0.5 ? 1.0 + dCam / max(uStep, 1e-4) : sc;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
// PAS DE uScreen ICI : le canvas n'est lu que dans le vertex shader (voir son en-tête), une
// fois par bloc au lieu d'une fois par pixel.
uniform float uDive;
// L'avancée du décrochage — le MÊME uniforme que le vertex shader, déclaré des deux côtés
// parce que les deux en ont besoin : là-bas il défait la forme, ici il défait la couleur. Un
// seul objet "uniforms" les alimente, donc rien à synchroniser.
uniform float uBreak;

// Où l'extinction s'achève — voir "fallBy" dans posteTweak, qui explique pourquoi ce seuil est
// un réglage partagé et non une constante : le JS s'en sert pour cacher le mesh, et le film de
// la plongée pour savoir jusqu'où freiner.
uniform float uFallBy;
// Le point où la caméra a fini d'avancer (CAM_DIVE_ARRIVE, aujourd'hui la molette
// « diveArrive » de posteTweak) — voir L'ARC DE LUMINOSITÉ plus bas. UN UNIFORME ET PAS UNE
// CONSTANTE GLSL : ce nombre appartient à la chorégraphie de la caméra (formClock), et il
// était écrit ici une seconde fois, en dur, dans une autre langue. Deux copies d'un seuil
// que le panneau dev peut maintenant déplacer, c'est un arc qui repart à côté de l'instant
// où la caméra s'immobilise — sans erreur, juste un flash de luminosité au mauvais moment.
uniform float uArrive;
// Le fondu croisé avec le poste (voir crossIn/crossOut dans posteTweak) : 0 = le corridor
// n'est pas encore là, 1 = il est seul. Multiplié sur la couleur, donc il fond vers le noir
// du fond — le poste, lui, s'efface sur la même fenêtre, et les deux plans se superposent.
uniform float uEnter;
// L'intensite du neon a la naissance du corridor (voir birthDim/birthSpan dans posteTweak).
// APPLIQUEE A LA LUMINANCE, AVANT le bloom, et non a la couleur finale : le fragment sort a
// ~2.3 sur les traits (REST + NEON*(luma + K*luma^P) avec luma 0.83), donc un facteur sur la
// sortie les laisse SATURES et ne se voit pas. En entree, il change ce que le superlineaire
// amplifie -- c'est la seule facon de rendre le corridor moins neon plutot que moins visible.
uniform float uNeon;
uniform float uAtten;
// Le masque de phosphore eteint (voir REST). uCut, le seuil sous lequel une cellule n'existe
// pas, est passe dans le VERTEX shader — c'est lui qui retire les blocs desormais.
uniform float uRest;
// Le sommet de l'arc de luminosite : combien le corridor "luit" au plus fort de la traversee.
uniform float uPeak;
// Ou commence le fondu au noir, sur la traversee (0 = tout de suite, 1 = jamais) — voir main().
uniform float uFallAt;
varying float vLuma;
varying float vSc;
// Le fondu de proximité, calculé dans le vertex (il est constant par bloc) — voir vNear là-bas.
varying float vNear;

// Couleur de repos du masque de phosphore éteint — voir l'en-tête du fichier : sans elle
// le corridor n'est qu'une bande de texte dans le vide. Vert-gris, du même esprit que le
// phosphore P1 du tube (voir tubeScreen.ts) mais net en dessous de l'intensité du texte
// allumé. RECALIBRÉE CONTRE LE RENDU RÉEL, pas choisie au jugé : une première valeur
// quatre fois plus sombre (0.05, 0.09, 0.07) rendait le mur de cellules éteintes
// invisible sous toneMappingExposure=0.3 (voir ChromeCanvas) — le texte flottait dans un
// fond apparemment noir, capture à l'appui dans le rapport de tâche.
/*
 * LE PHOSPHORE AU REPOS — QUASI NOIR, ET C'EST LE POINT DE BASCULE DU LOOK.
 *
 * Il valait (0.22, 0.38, 0.30) : un vert-gris qui remplissait bien son rôle d'origine
 * (prouver que le masque de phosphore éteint existe partout, pas seulement sous les
 * lettres) mais qui interdisait le noir. Un fond à 0.38 de vert n'est pas un fond noir,
 * c'est un brouillard — et le régime demandé est « néon vert sur noir », où le contraste
 * EST l'effet. Descendu à un vert très sombre : le masque reste lisible (il n'est pas à
 * zéro, la structure de la grille se devine encore dans les creux) mais il lit comme du
 * noir teinté plutôt que comme une brume.
 *
 * Le rapport allumé/éteint passe ainsi d'environ 3:1 à plus de 30:1, et c'est ce rapport,
 * pas la valeur absolue du vert, qui fait qu'une cellule allumée lit comme du néon.
 */
const vec3 REST = vec3(0.005, 0.045, 0.018);
/**
 * Le vert du néon — le P1 des phosphores poussé vers la saturation, pas un vert d'écran
 * moderne (même doctrine que le #5aff85 du canvas dans tubeScreen). Le canal rouge n'est
 * pas nul : à zéro, le cœur des cellules les plus chaudes ne peut jamais virer au blanc,
 * et un phosphore saturé blanchit en son centre — c'est ce qui distingue une lumière d'un
 * aplat de couleur.
 */
const vec3 NEON = vec3(0.10, 1.0, 0.32);
/**
 * LE DÉCOLORATION DU NÉON — le corridor part au blanc pendant qu'il se disloque.
 *
 * C'EST LE PONT DE MATIÈRE ENTRE LES DEUX MONDES, et c'est pour ça qu'il vaut mieux qu'un
 * fondu. Le corridor est du phosphore VERT ; la salle est de l'argent BLANC. Tant que les deux
 * gardent leur couleur, le raccord ne peut être qu'une substitution — une chose s'en va, une
 * autre arrive. En blanchissant les grains du corridor AVANT qu'ils ne s'éteignent, les
 * derniers points qu'on voit mourir sont déjà de la même matière que les premiers qu'on voit
 * naître : la poussière de la salle monte sur la fenêtre 0.80 → 0.90 (formClock), le corridor
 * blanchit sur 0.68 → 0.88. Ils se croisent en blanc.
 *
 * SUR uBreak ET NON SUR L'ARC DE LUMINOSITÉ : la décoloration est le MÊME geste que le
 * décrochage — la matière change de loi, elle change donc de couleur en même temps qu'elle
 * change de forme. Deux signaux auraient permis de les désynchroniser, ce qu'on ne veut pas.
 *
 * Effet de bord assumé : mixer vers le blanc REMONTE les canaux rouge et bleu, donc la
 * luminance monte pendant la décoloration. Le corridor se surexpose en blanchissant plutôt que
 * de virer à un gris de même valeur — c'est le comportement d'un phosphore saturé (voir le
 * canal rouge non nul de NEON, posé pour cette raison), et l'extinction le rattrape ensuite.
 */
const float BLEACH_AT = 0.2;
/**
 * L'exposant du bloom. Le halo ne s'ajoute pas linéairement à la luminance : il monte en
 * puissance, donc les cellules faibles restent nettes pendant que les fortes bavent — ce
 * qui est le comportement d'un phosphore, et ce que montrent les images de référence
 * ("s09", où les cellules chaudes se fondent entre elles pendant que les tièdes gardent
 * leur bord). Un halo linéaire brouille tout uniformément et lit comme du flou, pas comme
 * de l'émission.
 */
const float BLOOM_P = 2.4;
/** L'intensité du halo, en multiples de la luminance élevée à BLOOM_P. */
const float BLOOM_K = 2.2;
// Atténuation en 1/(1+k·Δ), pas un simple facteur linéaire : plusieurs tranches doivent
// rester lisibles avant que le fond ne s'assombrisse franchement, ce qu'une chute
// linéaire en sc (qui grossit vite, géométriquement) aurait rendu trop abrupte dès les
// toutes premières tranches. Choisi à l'œil sans navigateur — voir l'en-tête du fichier.
// EN UNIFORME (uAtten) — voir la note des uniformes du vertex.

/*
 * L'ARC DE LUMINOSITÉ DU CORRIDOR (uArrive→1 de la plongée) — T6, table du plan : « le
 * corridor défile, la luminosité monte puis retombe au noir ». p REMET À ZÉRO au début du
 * corridor (dive=uArrive, le CAM_DIVE_ARRIVE de formClock — lu en uniforme, voir sa
 * déclaration) plutôt que de repartir de dive brut, pour que cet arc ne dépende que de « où
 * on est dans le corridor », pas de la valeur exacte du point où la caméra s'est arrêtée
 * d'avancer. Cette indépendance ÉTAIT DÉJÀ L'INTENTION du calcul ; elle n'était pas tenue
 * tant que le point en question était recopié ici en dur.
 *
 * mult vaut EXACTEMENT 1 à p=0 (rise=0, fall=0 donc (1+0)·(1−0)=1) : pas de saut à l'instant
 * où cet arc prend le relais de « pas d'arc du tout » (dive<uArrive, où le corridor est déjà
 * visible à luminosité normale depuis le fondu du poste) — seulement une continuité, pas un
 * flash. Il monte ensuite vers PEAK (une sensation de vitesse, la traversée qui s'intensifie)
 * puis retombe à 0 exactement à p=1 (dive=1) : « retombe au noir » au sens propre, tout le
 * fragment (REST compris) s'éteint plutôt que de simplement s'assombrir vers une couleur de
 * repos qui resterait visible.
 */
// EN UNIFORME (uPeak) — voir la note des uniformes du vertex.

/*
 * LA TRANCHE PROCHE — POURQUOI UN ASSOMBRISSEMENT NE SUFFIT PAS, ET CE QUE CETTE TÂCHE (T7)
 * A MESURÉ, PAS SUPPOSÉ.
 *
 * La caméra de plongée (formClock, CAM_DIVE_PAST_GLASS) s'immobilise à une profondeur
 * locale ≈ 2.5, tout PRÈS du seuil Z0=2.2 (voir l'en-tête du fichier) — jamais assez loin
 * pour que le demi-angle « de loin » (Z0 seul, voir son commentaire) décrive ce qu'elle voit
 * réellement : ce demi-angle n'est vrai qu'EN CHAMP LOINTAIN (distance à la tranche grande
 * devant sa propre profondeur), FAUX ici par construction. Le recyclage fait continûment
 * défiler chacune des seize tranches devant cette profondeur fixe (le sens de « le corridor
 * défile ») ; un script Node (tunnelGeom, rejoué avec Z0/CAM_DIVE_PAST_GLASS actuels) montre
 * que la tranche la plus proche EN AVANT de la caméra (les tranches en arrière, plus près du
 * verre qu'elle, ne sont jamais dans son champ) balaie [0, ≈ uCamDepth·G) unité de profondeur
 * locale — et vers 0, son demi-angle DEPUIS LA CAMÉRA (pas depuis le sommet du cône) dépasse
 * 90° : un mur, pas un corridor. Mesuré au navigateur avant tout fondu : quatre cellules
 * géantes plein écran (voir le rapport de tâche).
 *
 * UN ASSOMBRISSEMENT SEUL NE RÉSOUT RIEN, ET C'EST CE QUI A ÉTÉ ESSAYÉ D'ABORD ET REJETÉ :
 * le matériau est OPAQUE (voir sa création plus bas), donc une tranche trop proche, même
 * peinte en noir, reste devant tout ce qu'il y a derrière et l'OCCULTE — un mur noir plutôt
 * qu'un mur clair, toujours un mur. Mesuré : à "uCamDepth" fixe et un simple
 * "smoothstep(0, k·uCamDepth, abs(vDepth−uCamDepth))" en facteur de couleur, l'écran reste
 * bloqué au noir la plupart du temps, PARCE QUE la tranche qui occupe l'écran occulte
 * tout, quelle que soit sa propre couleur.
 *
 * LA CORRECTION EST DONC UN RETRAIT DE GÉOMÉTRIE, PAS SEULEMENT DE COULEUR — voir
 * DISCARD_FRAC dans main() ci-dessous : un fragment retiré ("discard") n'écrit ni couleur ni
 * profondeur, donc le test de profondeur standard laisse voir la tranche suivante au même
 * pixel. C'est le seul moyen, avec un matériau opaque, de voir À TRAVERS une tranche trop
 * proche plutôt que de buter sur son mur.
 */
/**
 * Le rayon de retrait, EN FRACTION de uCamDepth (jamais une distance absolue — la même
 * raison que pour l'ancien fondu par couleur : la profondeur locale de la caméra, ≈2.5 au
 * viewport testé, est ELLE-MÊME une conséquence de CAM_DIVE_PAST_GLASS/sx, viewport-
 * dépendante ; une distance absolue calibrée ici serait fausse ailleurs).
 *
 * CHOISI POUR UN DEMI-ANGLE CIBLE, PAS AU JUGÉ. Au rayon "cutoff = DISCARD_FRAC · uCamDepth",
 * le demi-angle DEPUIS LA CAMÉRA de la tranche qu'on vient d'exposer (celle qui borde le
 * retrait) est "FILL_XY · (1+DISCARD_FRAC)/DISCARD_FRAC · (COLS/2) · CELL / Z0" — voir le
 * commentaire de CELL dans l'en-tête pour la dérivation ; "tubeMouth.hw" et "sx" s'annulent
 * tous les deux, ce qui rend CE demi-angle indépendant du viewport, contrairement à celui
 * « de loin ». Avec DISCARD_FRAC=4.0 et CELL=0.035 : "0.85 · 1.25 · 24 · 0.035 / 2.2 ≈
 * 0.406", atan ≈ 22° — à un degré du demi-champ (21°) de la caméra, vérifié au navigateur
 * (voir le rapport de tâche : dive 0.3/0.5/0.7/0.9, quatre captures).
 */
// EN UNIFORME (uDiscard) — voir la note des uniformes du vertex.
/**
 * La largeur du fondu d'ENTRÉE juste après le retrait — voir main() : sans lui, la première
 * tranche non retirée apparaîtrait à pleine intensité d'un coup, un pop plutôt qu'une
 * arrivée. ÉTROITE délibérément (0.15 · uCamDepth ≈ 0.38, contre un cutoff ≈ 10.0) : un
 * script Node (tunnelGeom, balayage de uTravel sur un cycle complet, cutoff=4·uCamDepth)
 * montre que la tranche exposée tombe à moins de 0.38 de ce cutoff dans SEULEMENT ~10 % du
 * temps (médiane mesurée ≈ 2.05, largement au-delà de la largeur du fondu) — la fenêtre
 * étroite laisse donc la quasi-totalité du cycle à pleine luminosité, et ne s'active que
 * pour la minorité de tranches qui viennent tout juste de passer le retrait.
 */
// FADE_FRAC A DÉMÉNAGÉ DANS LE VERTEX SHADER avec le fondu qu'elle règle (vNear) — le
// raisonnement ci-dessus sur sa largeur est inchangé.

void main() {
  // TOUT CE QUI EST CONSTANT PAR BLOC A DÉMÉNAGÉ DANS LE VERTEX SHADER — les deux « discard »
  // (voir son en-tête) et le fondu de proximité (vNear). Ce fragment ne fait plus que colorer.
  // ADDITIF, jamais mélangé — un phosphore ÉMET (même doctrine que ChromeTableau) :
  // mélanger éteindrait REST là où le canvas est sombre, qui est presque partout.
  /*
   * LE RÉGIME NÉON — vert saturé sur noir, et un halo qui monte en puissance.
   *
   * "lit" sort du canvas du terminal, qui est déjà vert (#5aff85) mais d'un vert de TEXTE :
   * lisible, tempéré, fait pour qu'on lise « Follow the white rabbit » sur un écran de
   * poste. Ici on ne lit plus, on TRAVERSE — donc la même donnée est ré-étalonnée vers un
   * néon franc. On garde la LUMINANCE du canvas (elle porte la forme des glyphes, c'est
   * elle qui dessine les jambages et laisse le trou noir) et on lui substitue une teinte :
   * la couleur du canvas ne sert plus qu'à dire OÙ ça brille, plus de quelle couleur.
   */
  /*
   * LES CELLULES ETEINTES N'EXISTENT PLUS — retirees, pas noircies, et la difference est
   * entiere. Ce materiau est OPAQUE et ecrit la profondeur : une cellule noire devant en
   * masquerait une eclairee derriere, donc le corridor paraitrait plus vide qu'il ne l'est au
   * lieu de laisser voir sa paroi. "discard" est le seul geste qui vaut "il n'y a pas de bloc
   * ici", et il epargne au passage le remplissage.
   *
   * LE SEUIL PORTE SUR LA LUMINANCE BRUTE, AVANT uNeon : la naissance du corridor divise la
   * luminance par plus de deux (voir birthDim), donc appliquer le seuil apres aurait fait
   * disparaitre le corridor ENTIER a l'instant du fondu, puis reapparaitre par morceaux.
   */
  // vLuma VIENT DU VERTEX SHADER, où elle est déjà lue et seuillée — le canvas n'est plus
  // échantillonné par pixel : la luminance est constante sur le bloc (une cellule = un texel),
  // donc l'interpoler d'un sommet à l'autre rend exactement la même valeur.
  float luma = vLuma * uNeon;
  // Le halo, superlinéaire — voir BLOOM_P. Additif comme tout le reste de ce fichier : un
  // phosphore ÉMET, il ne se mélange pas au fond (même doctrine que REST ci-dessus et que
  // le tube dans ChromeTableau).
  // Le néon décoloré vers le blanc — voir BLEACH_AT. Appliqué à la TEINTE et non à la couleur
  // finale : le halo (BLOOM_K) et l'atténuation en profondeur continuent de se calculer sur la
  // même luminance, donc seule la matière change, pas le régime lumineux.
  vec3 neon = mix(NEON, vec3(1.0), smoothstep(BLEACH_AT, 1.0, uBreak));
  vec3 col = REST * uRest + neon * (luma + BLOOM_K * pow(luma, BLOOM_P));
  // Le point de fuite s'assombrit : vSc croît géométriquement avec la profondeur
  // recyclée (voir le vertex shader), donc l'atténuer directement évite de reconvertir
  // une distance qui n'existe déjà plus une fois recyclée dans [Z0, Z0·(1+g)^D).
  col *= 1.0 / (1.0 + uAtten * (vSc - 1.0));
  // PLANCHER À 0.4, PAS 0 — voir DISCARD_FRAC : AU cutoff, le demi-angle de la tranche
  // exposée est PAR CONSTRUCTION proche de celui de la caméra (≈22° contre 21°), pas cent
  // fois trop grand ; partir de zéro assombrissait pour rien la fraction (mesurée ≈10 %,
  // voir FADE_FRAC) du cycle où le voisin non retiré tombe tout juste après le cutoff.
  col *= vNear;
  float p = clamp((uDive - uArrive) / max(1.0 - uArrive, 1e-3), 0.0, 1.0);
  float rise = smoothstep(0.0, 0.45, p);
  /*
   * LE FONDU AU NOIR COMMENCE À uFallAt, PLUS À 0.45 CUIT — sans quoi il recouvre toute la
   * traversée. Constaté à l'écran : en mode « on sort », le corridor est bien épuisé vers la fin
   * (travel 38.6 sur 40), mais l'arc l'avait déjà éteint à 7 % — donc la sortie du tube, qui EST
   * l'élargissement des dernières tranches, se jouait dans le noir. Repousser ce départ laisse
   * voir le tube s'ouvrir, puis éteint.
   *
   * ET IL FINIT À uFallBy, PLUS À 1.0 — c'est ce qui CREUSE LE NOIR. Terminée à p = 1, donc à
   * dive = 1, l'extinction s'achevait à l'instant même où le film rend le scroll : il n'existait
   * aucune fenêtre où le corridor soit éteint ET la salle pas encore montée. Or dive ne va pas
   * au-delà de 1, donc le seuil entre les deux mondes ne peut pas être ajouté APRÈS — il doit
   * être creusé DEDANS. 0.80 en p vaut dive 0.90, soit trois centièmes de film avant que les
   * pièces ne commencent à se condenser (voir formClock) : de la poussière seule, dans le noir.
   *
   * Constante et non uniforme : le panneau dev qui réglait ces nombres n'existe plus, et un
   * uniforme de plus pour une valeur que personne ne peut plus écrire serait un mécanisme mort.
   */
  float fall = smoothstep(uFallAt, uFallBy, p);
  float mult = (1.0 + (uPeak - 1.0) * rise) * (1.0 - fall);
  col *= mult * uEnter;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* -------------------------------------------------------------------------- */

/** Le bloc unité, plus deux attributs PAR INSTANCE : quelle cellule du canvas (aCell) et
 *  quelle tranche du corridor (aSlice). Aucun instanceMatrix — la position de chaque
 *  instance est entièrement recalculée dans le vertex shader à partir de ces deux
 *  attributs, jamais posée depuis le CPU.
 *
 *  D'OÙ LE COUPLE `InstancedBufferGeometry` + `<mesh>`, ET PAS `<instancedMesh>`. Les deux
 *  dessinent le même nombre d'instances (WebGLRenderer.renderBufferDirect prend
 *  `object.count` pour un InstancedMesh, `geometry.instanceCount` sinon), mais le
 *  constructeur d'InstancedMesh alloue TOUJOURS son instanceMatrix : count × 16 flottants,
 *  qu'un shader le lise ou non. À la grille livrée (gridScale 5.5, slices 40 → 264 × 198 × 40
 *  = 2 090 880 instances) cela fait 127,6 Mio de tas JS, puis un unique `gl.bufferData`
 *  BLOQUANT de 180 à 288 ms sur la première frame où le mesh devient visible — c'est-à-dire
 *  au moment précis où le lecteur entre dans la plongée — et autant de VRAM retenue pour un
 *  tampon que VERT ne nomme nulle part.
 *
 *  `instanceCount` est posé ICI, sur la géométrie qui porte déjà aCell/aSlice, et c'est ce
 *  qui rend l'ancien piège inatteignable : three ne regarde pas la taille des attributs,
 *  il dessine le nombre qu'on lui donne, donc un compte tenu à part du tableau (la constante
 *  COUNT, 48×36×16) tronquait tout réglage de « Pixels » aux 27 648 PREMIÈRES entrées — et
 *  comme le remplissage se fait tranche par tranche, il ne restait qu'un morceau de la
 *  tranche 0 : la bouche amputée par le haut et zéro profondeur, quel que soit le réglage.
 *  Le compte ne peut plus diverger du tableau : il est calculé une fois, à côté de lui. */
function buildGrid(
  cols: number,
  rows: number,
  slices: number,
  quad: boolean
): InstancedBufferGeometry {
  /*
   * PLAQUE OU CUBE — voir `blockQuad` dans posteTweak pour ce que ça coûte et ce que ça perd.
   * PlaneGeometry(1,1) est bien dans le même repère que BoxGeometry(1,1,1) sur X/Y ([-0.5, 0.5],
   * donc « position » garde le même sens dans le vertex shader) et vaut z=0 partout, ce qui
   * annule simplement le terme uFillZ.
   */
  const block = quad ? new PlaneGeometry(1, 1) : new BoxGeometry(1, 1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = block.index;
  /*
   * Les attributs du bloc sont PARTAGÉS avec `block`, pas copiés : ils font 4 ou 24 sommets.
   * `block` n'est donc jamais disposé — WebGLGeometries libère au `dispose` d'une géométrie
   * les tampons GPU de SES attributs, et ceux-ci sont désormais les nôtres.
   */
  for (const [name, attr] of Object.entries(block.attributes)) geo.setAttribute(name, attr);

  const count = cols * rows * slices;
  geo.instanceCount = count;
  const cell = new Float32Array(count * 2);
  const slice = new Float32Array(count);
  let i = 0;
  for (let k = 0; k < slices; k++) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        cell[i * 2] = (col + 0.5) / cols;
        cell[i * 2 + 1] = (row + 0.5) / rows;
        slice[i] = k;
        i++;
      }
    }
  }
  geo.setAttribute("aCell", new InstancedBufferAttribute(cell, 2));
  geo.setAttribute("aSlice", new InstancedBufferAttribute(slice, 1));
  return geo;
}

/**
 * BUDGET DE FRAME — critère 6 du spec, MESURÉ, pas supposé.
 *
 * Section Work, canvas ≈1512×837 CSS px (≈2494×1380 px réels, dpr non dégradé par
 * PerformanceMonitor pendant la mesure), M3 Pro (ANGLE Metal), via un hublot dev
 * temporaire qui forçait `mesh.visible = true` et un `uTravel` non nul sans passer par
 * `dive` — donc les 27 648 instances réellement dessinées à chaque frame, pas le chemin
 * de sortie anticipée. requestAnimationFrame, deltas sur 120-180 frames, cinq passages en
 * alternance :
 *
 *   sans le mesh (sortie anticipée)  : moy. 24,75 ms puis 24,46 ms
 *   avec le mesh (27 648 instances)  : moy. 25,99 ms, 24,65 ms, puis 23,97 ms (sur 180)
 *
 * Écart ≈ 0,3 ms en moyenne sur les cinq passages — sous le bruit de mesure d'un
 * passage à l'autre dans le MÊME état (24,75 vs 24,46 ; 25,99 vs 24,65 vs 23,97), et bien
 * sous les 2 ms du critère. AUCUNE réduction de SLICES n'a donc été appliquée.
 *
 * Le hublot de mesure (`window.__tunnelForce`) a été retiré après coup : il ne reste
 * aucune trace de la sortie anticipée normale ci-dessous.
 *
 * RE-MESURÉ PAR CETTE TÂCHE (T7), MÊME SECTION, sans hublot dédié cette fois (dive=0.5 en
 * scrollant dans Work rend déjà le mesh visible avec les 27 648 instances) : deltas
 * requestAnimationFrame sur 150 frames, quatre passages en alternance mesh visible / mesh
 * caché (scrollY=0). Les deux tombent au MÊME palier, ≈8,33 ms — le plafond vsync de l'écran
 * de test (120 Hz), pas un temps de rendu : AUCUN écart mesurable entre les deux états, y
 * compris sous un throttling CPU ×20 (DevTools) qui aurait dû faire apparaître un coût
 * CPU-bound s'il y en avait un. Cohérent avec le ≈0,3 ms de T6 (un coût sous ce plafond reste
 * invisible à une mesure par delta de frame), mais ne le RECONFIRME pas au même chiffre — ce
 * texte le signale plutôt que d'inventer une précision que cette machine ne permettait pas de
 * lire. AUCUNE réduction de SLICES appliquée non plus.
 */
export function PixelTunnel() {
  const meshRef = useRef<Mesh>(null);
  /*
   * LA GÉOMÉTRIE SE RECONSTRUIT QUAND LA RÉSOLUTION CHANGE, et seulement là : c'est le seul
   * des réglages du corridor qui touche à une RESSOURCE (le tableau d'instances) plutôt qu'à
   * un uniforme. Abonnement étroit à une CLÉ TEXTE et pas à un objet — `useSyncExternalStore`
   * compare les snapshots par identité, donc rendre un objet neuf à chaque lecture bouclerait
   * le rendu à l'infini (même motif que usePosteEnv dans posteTweak).
   */
  // L'instant du croisement, latché — voir le calcul de uTravel dans le useFrame.
  const travelFrom = useRef(-1);

  const gridKey = useTunnelGrid();
  const grid = useMemo(() => {
    const [scale, slices, shape] = gridKey.split("|");
    return { ...gridOf(Number(scale)), slices: Number(slices), quad: shape === "q" };
  }, [gridKey]);
  const geometry = useMemo(
    () => buildGrid(grid.cols, grid.rows, grid.slices, grid.quad),
    [grid.cols, grid.rows, grid.slices, grid.quad]
  );
  // Libère aussi les attributs du bloc unité, qui n'ont pas d'autre propriétaire — voir
  // buildGrid, où ils sont partagés plutôt que copiés.
  useEffect(() => () => geometry.dispose(), [geometry]);
  // .tex seulement : ce composant ne peint jamais le canvas, il ne fait que le lire (voir
  // l'en-tête du fichier pour pourquoi TV_LINES vient de ChromeTableau plutôt que d'être
  // redéclarée ici).
  const screenTex = useMemo(() => tubeScreen(TV_LINES).tex, []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTravel: { value: 0 },
          uScreen: { value: screenTex },
          uDive: { value: 0 },
          uCamDepth: { value: 0 },
          // Défaut = tout le canvas (centre 0.5/0.5, span 1) — le FALLBACK de tubeHole si
          // jamais « rabbit » disparaissait de la dernière phrase. Écrasé dès la première
          // frame par le useFrame plus bas ; ce défaut ne se voit que sur l'image manquée
          // avant le premier appel (mesh.visible=false tant que dive<DIVE_EPS, donc jamais
          // en usage normal).
          uHoleUv: { value: new Vector2(0.5, 0.5) },
          uSpan: { value: 1 },
          // Écrasé par frame comme uDive, dont il est le seuil — voir sa déclaration dans FRAG.
          uArrive: { value: posteTweak.get().diveArrive },
          // La géométrie du corridor — écrits par frame comme le reste (voir la note sur les
          // uniformes dans VERT pour pourquoi ils ne sont plus cuits dans la source).
          uG: { value: G },
          uZ0: { value: Z0 },
          uD: { value: SLICES },
          uLoop: { value: 0 },
          uShaft: { value: 1 },
          uStep: { value: 0.2 },
          uWall: { value: 1 },
          uFallAt: { value: 0.45 },
          uFallBy: { value: 0.8 },
          uBreak: { value: 0 },
          uCols: { value: COLS },
          uRows: { value: ROWS },
          uCell: { value: CELL },
          uFillXY: { value: FILL_XY },
          uFillZ: { value: FILL_Z },
          uAtten: { value: 0.15 },
          uRest: { value: 1 },
          uPeak: { value: 3.2 },
          uCut: { value: 0 },
          uDiscard: { value: 4 },
          uEnter: { value: 0 },
          uNeon: { value: 1 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        // OPAQUE, délibérément : des blocs 3D qu'on traverse doivent s'occulter
        // correctement entre eux (le bloc le plus proche cache celui derrière), ce que
        // le test de profondeur par défaut (depthTest/depthWrite: true, non transparent)
        // donne gratuitement. Un matériau transparent aurait exigé un tri par profondeur
        // que three ne fait pas pour un InstancedMesh, et aurait mélangé les tranches
        // entre elles au lieu de les empiler.
        /*
         * RIBBON — le bloc en ruban plutôt qu'en cube (voir le vertex shader). Un `define` et pas
         * un uniforme : la branche disparaît à la compilation, donc le mode cube ne paye rien du
         * calcul de billboard et le mode ruban rien du `if`. Le matériau se reconstruit au
         * changement (le seul moment où une recompilation est acceptable, comme la géométrie).
         */
        defines: grid.quad ? { RIBBON: "" } : {},
        /*
         * DOUBLE FACE EN MODE RUBAN, ET SEULEMENT LÀ. Le quad est réorienté dans le vertex shader
         * (across/along), donc l'ordre de ses sommets ne dit plus rien de son orientation : à
         * FrontSide (le défaut) la moitié des rubans partait en back-face culling — corridor
         * entièrement noir, constaté à l'écran. Le cube, lui, garde son culling : ses faces
         * arrière sont vraiment cachées, les retirer est gratuit.
         */
        side: grid.quad ? DoubleSide : FrontSide,
      }),
    [screenTex, grid.quad]
  );

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const s = formState();
    // SORTIE ANTICIPÉE — hors de la plongée, ce mesh ne doit rien coûter de plus qu'une
    // lecture de formState() et une comparaison. `dive` est déjà atténué par tableauOn
    // dans formClock (voir son commentaire : « hors du corridor de Work, il n'y a pas de
    // plongée »), donc ce seul test couvre aussi bien Hero/About/Contact que Work avant
    // la plongée.
    if (s.dive <= DIVE_EPS) {
      mesh.visible = false;
      return;
    }
    const pt = posteTweak.get();
    /*
     * …ET SORTIE PAR LE HAUT, une fois le corridor éteint — voir `fallBy` (posteTweak) pour pourquoi ce n'est
     * pas une économie mais une nécessité (matériau opaque, il continuerait à découper la salle
     * en noir). Le seuil est DÉRIVÉ de diveArrive plutôt que posé : l'arc de luminosité du
     * fragment est défini sur la plongée RESTANTE après l'arrêt de la caméra, donc écrire 0.90
     * en dur ici se décalerait silencieusement au premier réglage de diveArrive ou de fallBy.
     */
    if (s.dive >= pt.diveArrive + pt.fallBy * (1 - pt.diveArrive)) {
      mesh.visible = false;
      return;
    }
    const x = screenFill(
      camera.position.z,
      camera.near,
      Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360)
    );
    // La montée après le croisement : 0 au moment où le poste a fini de s'effacer, 1 une fois
    // `birthSpan` écrans plus loin. Même unité que le croisement, donc les deux se raccordent
    // exactement là où l'un s'arrête.
    const birth =
      1 - smoothstep(pt.crossHold - Math.max(pt.birthSpan, 1e-3), pt.crossHold, x);
    // Le corridor monte entre `crossIn` et le PALIER, pendant que le poste reste plein (voir
    // `crossHold` dans posteTweak) : c'est là que les deux se superposent.
    const enter = tunnelCross(
      camera.position.z,
      camera.near,
      Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360),
      pt.crossIn,
      pt.crossHold
    );
    // Rien à dessiner avant que le croisement ne commence — même sortie anticipée que
    // ci-dessus, et c'est ce qui fait que le corridor n'existe plus « depuis dive ≈ 0 ».
    if (enter <= DIVE_EPS) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    /*
     * L'ALIGNEMENT SUR LE TROU — voir tubeMouth.ts, tubeHole.ts et l'en-tête de ce fichier.
     * `mesh.position` / `mesh.scale` PLUTÔT QU'UN CALCUL DANS LE VERTEX SHADER : c'est
     * exactement à ça que sert `modelMatrix`, que le vertex shader multiplie déjà (`wp =
     * modelMatrix * vec4(p, 1.0)`) — poser le rectangle-monde ici évite d'ajouter des
     * uniformes (origine, échelle) qui referaient à la main ce que l'objet fait pour rien.
     *
     * `holeX/holeY`, PAS `cx/cy` : le corridor est centré sur la CONTREFORME du « a », pas
     * sur le centre géométrique de l'écran — même raison que la caméra de plongée
     * (formClock, CAM_DIVE_ARRIVE) vise ce même point plutôt que cx/cy. Les deux doivent
     * s'accorder, sans quoi la caméra regarderait l'axe du corridor de travers.
     *
     * ÉCHELLE UNIFORME (X, Y ET Z par `sx`) — PAS Z à 1. Z à 1 (le calcul d'origine, T6)
     * gardait la cadence du corridor indépendante de la taille de l'écran, mais casse
     * l'invariant du tube droit dès qu'on l'applique à la grille de RÉFÉRENCE : la mise à
     * l'échelle du useFrame est justement la transformation supplémentaire, non uniforme
     * (×sx/sy en X/Y, ×1 en Z), qui contredit « les espacements de tunnelGeom sont en unités
     * LOCALES au même titre que CELL ». DIAGNOSTIC D'ORIGINE (avant cette tâche, T7, avec le
     * CELL=0.9 de T6) : mesuré au navigateur, sx/sy ≈ 0,035-0,04 pendant que Z restait à 1 —
     * chaque cellule (cube ~cubique en local, FILL_XY = FILL_Z à l'époque) ressortait ~28×
     * plus longue en Z qu'en X/Y une fois modelMatrix appliqué, une écharde plutôt qu'un
     * bloc. Passer Z par `sx` supprime cette distorsion PAR CONSTRUCTION, quel que soit sx —
     * voir le commentaire de CELL dans l'en-tête pour ce que ce choix a fallu changer par
     * ailleurs (CELL, FILL_Z, DISCARD_FRAC) pour ne pas rouvrir le défaut inverse (le
     * demi-angle de la tranche proche qui devient trop large — même commentaire). `sx` (pas
     * `sy`, ni une moyenne) est repris pour Z par cohérence avec X plutôt que par calcul : les
     * deux ne diffèrent que d'environ 13 % (aspect 4:3 de la grille contre ~1,167 du
     * rectangle-écran, voir REF_HW/REF_HH) et aucun des deux n'a de raison d'être PLUS
     * canonique que l'autre pour un axe qui n'est ni X ni Y.
     *
     * max(…, 1e-4) AVANT LA PLONGÉE : ChromeTableau publie `tubeMouth` par frame dès que le
     * poste est affiché (bien avant que `dive` ne bouge — voir son en-tête), donc en usage
     * normal hw/hh sont déjà non nuls ici. Le garde-fou n'est que pour l'instant théorique
     * où ce useFrame tournerait avant le premier de ChromeTableau (StrictMode, ordre de
     * montage) : une échelle nulle aplatirait toute la grille sur un plan, invisible SANS
     * AUCUNE erreur — même famille de piège que le `max(span, ε)` du shader du tube dans
     * ChromeTableau.
     */
    /*
     * LA BOUCHE DU CORRIDOR EST LA FENÊTRE ÉCHANTILLONNÉE, PAS TOUT L'ÉCRAN — le facteur
     * `2 · hole.half`, qui manquait. La tranche 0 était mise à l'échelle du rectangle-écran
     * ENTIER alors qu'elle n'échantillonne qu'une fenêtre de quelques caractères autour du
     * trou : le corridor montrait donc la lettre ~1/(2·half) ≈ 14× plus grosse que le poste
     * ne la dessine, et le fondu croisé superposait deux tailles différentes du même glyphe.
     * Avec ce facteur, la tranche 0 couvre exactement l'empreinte de sa fenêtre sur le
     * verre : les deux scènes se recouvrent au pixel, et la bouche suit `Fenêtre` toute
     * seule.
     */
    const hole = tubeHole();
    // La bouche reste calée sur la fenêtre LARGE (`holeWin`) : c'est elle qui doit recouvrir
    // l'écran au moment du fondu, et elle ne bouge plus ensuite (voir `zoomChars`).
    const mouth = 2 * hole.half;
    const sx = (Math.max(tubeMouth.hw, 1e-4) * mouth) / REF_HW;
    const sy = (Math.max(tubeMouth.hh, 1e-4) * mouth) / REF_HH;
    /*
     * LA TRANCHE 0 EST POSÉE SUR LE VERRE, PAS L'ORIGINE DU CÔNE — d'où le « + Z0 · sx ». Le
     * sommet du cône est à l'origine du mesh et la tranche 0 vit à Z0 en unités LOCALES derrière
     * lui : ancrer l'origine au verre mettait donc la première tranche EN ARRIÈRE du verre, vue
     * plus petite que le texte que le poste y peint. Mesuré au moment du fondu : un rapport
     * d'échelle d'environ 1.8, donc deux images du même texte qui ne coïncidaient qu'en leur
     * centre et divergeaient partout ailleurs — le désalignement visible pendant le croisement.
     *
     * Décalée en avant de Z0 · sx, la tranche 0 tombe exactement dans le plan du verre, à
     * l'échelle exacte de la fenêtre qu'elle prélève (voir `mouth` plus haut) : les deux scènes
     * se recouvrent. Ce qui la met VRAIMENT là au bon moment est le défilement qui part du
     * croisement (voir uTravel) — sans lui, la tranche 0 aurait déjà glissé.
     *
     * La caméra s'enfonce d'autant en unités locales (Z0 + divePast · REF_HW au lieu de
     * divePast · REF_HW), ce qui ne change pas ce qu'elle voit : le corridor est auto-similaire
     * le long de son axe.
     */
    /*
     * … MOINS UN RECUL, sans quoi la tranche 0 est À ÉGALITÉ avec la surface du verre : ce mesh
     * est opaque et écrit la profondeur, donc il masquerait le texte peint au lieu de s'y
     * superposer — mesuré, la superposition disparaissait entièrement. Voir `mouthBack` dans
     * posteTweak pour l'arbitrage entre « visible à travers » et « à la bonne échelle ».
     */
    /*
     * LE RECUL EST CE SEUL RÉGLAGE, SANS PLANCHER — et il y en a eu un, à retenir comme un
     * contre-exemple. Il valait la DEMI-LONGUEUR D'UNE CELLULE, au motif que ces blocs sont des
     * tubes (voir FILL_Z) et qu'un recul plus court les laisse traverser le verre. Le raisonnement
     * était juste, la conséquence non : ce plancher vaut 0.5 · FILL_Z · CELL · sx, où le grid.cell
     * et le grid.fillZ s'annulent — donc une CONSTANTE (≈0.41 unité monde au viewport testé),
     * insensible à la résolution comme à la fenêtre, les deux choses qu'il prétendait couvrir. Or
     * le réglage lui-même vaut ≈0.34 à mouthBack 0.13 : le plancher écrasait donc en silence TOUTE
     * la moitié basse de la molette (tout ce qui est sous ≈0.16), c'est-à-dire exactement le sens
     * « rapprocher la scène 2 » — d'où un corridor bloqué trop loin et trop petit pendant le
     * fondu, sans que rien ne l'indique.
     *
     * Ce que le plancher voulait empêcher reste vrai (des tubes qui traversent le verre masquent
     * le texte peint dans le rectangle de la bouche), mais ça se règle à l'œil sur CETTE molette,
     * qui peut désormais aller jusqu'à passer devant le verre — d'autant que le croisement se joue
     * maintenant à ras du verre (crossHold 0.05), où le poste a déjà presque disparu.
     */
    const recul =
      pt.mouthBack * screenFillUnit(Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360));
    /*
     * LE DÉCALAGE Z0·sx N'EXISTE QUE POUR LE CÔNE — c'est ce qui amène sa tranche 0, qui vit à Z0
     * DERRIÈRE le sommet, dans le plan du verre (voir juste au-dessus). Le puits, lui, met sa
     * tranche 0 à z = 0 par construction (k · uStep avec k = 0), donc son origine EST la bouche :
     * ajouter le décalage l'aurait posé Z0·sx trop en avant, et la première tranche aurait crevé
     * le verre.
     */
    const apex = pt.tubeShaft ? 0 : Z0 * sx;
    mesh.position.set(tubeMouth.holeX, tubeMouth.holeY, tubeMouth.frontZ + apex - recul);
    mesh.scale.set(sx, sy, sx);
    // La fenêtre de prélèvement — voir tubeHole.ts et l'en-tête du fichier. `half` est une
    // DEMI-largeur ; `uSpan`, lui, porte l'étendue PLEINE de la fenêtre (voir son usage dans
    // VERT : `(aCell − 0.5) · uSpan`, où `aCell − 0.5` va de −0.5 à 0.5), d'où le ×2.
    /*
     * ÉCRIT VIA LE REF (mesh.material), JAMAIS PAR FERMETURE DIRECTE SUR `material` —
     * bien que ce soit RIGOUREUSEMENT le même objet (three.js pose ainsi this.material
     * au constructeur ; JSX le confirme deux lignes plus bas). La différence n'est pas
     * cosmétique pour le lint des hooks : fermer sur la variable `material` issue du
     * useMemo ci-dessus depuis ce callback est EXACTEMENT ce que
     * react-hooks/immutability refuse — l'erreur, déjà présente et tolérée dans
     * ChromeTableau, que `setShared(canvasMat)` y déclenche sur un `canvasMat` lui aussi
     * sorti d'un useMemo. Ce fichier doit passer à zéro (contrainte de la tâche), donc
     * pas la même issue : atteindre l'objet par `mesh.material` — `mesh` venant de
     * `meshRef.current`, LU ICI, dans le callback, jamais pendant le rendu — est
     * exactement le chemin par lequel `mesh.visible` est déjà écrit deux lignes plus
     * haut, sans jamais être relevé.
     */
    const uniforms = (mesh.material as ShaderMaterial).uniforms;
    /*
     * LE CALAGE FIN DU PRÉLÈVEMENT, en pixels du canvas — sur uHoleUv SEULEMENT, jamais sur la
     * position monde de la bouche. Déplacer le contenu dans la fenêtre décale l'écriture à
     * l'écran ; déplacer la bouche déplacerait aussi l'axe que la caméra vise et le trou qu'on
     * traverse. La correction du tirage du verre (voir ChromeTableau) est déjà appliquée à la
     * bouche, elle : ces deux nombres ne servent qu'à finir à l'œil ce qu'aucune mesure ne
     * dit — quelle tranche du cône domine l'image au moment du croisement.
     */
    uniforms.uHoleUv.value.set(hole.u + pt.corrX / 512, hole.v + pt.corrY / 384);
    /*
     * LE RESSERREMENT SUR LA LETTRE — le prélèvement se rétrécit vers `zoomChars` pendant que
     * la caméra achève sa course, donc le « a » grossit jusqu'à la traversée. Piloté par la
     * distance au verre, comme le fondu : les deux se raccordent exactement là où l'un finit
     * (`crossOut`). La bouche, elle, ne bouge pas — voir plus haut.
     */
    const zoom = 1 - smoothstep(pt.crossHold - Math.max(pt.zoomSpan, 1e-3), pt.crossHold, x);
    const narrow = hole.half * (pt.zoomChars / Math.max(pt.holeWin, 1e-3));
    uniforms.uSpan.value = 2 * (hole.half + (narrow - hole.half) * zoom);
    /*
     * LE DÉFILEMENT PART DU FONDU, PAS DU DÉBUT DE LA PLONGÉE — et c'est ce qui cale l'écriture.
     * `dive × tranches` faisait démarrer le cycle à dive 0 : au moment du croisement (vers dive
     * 0.36) le corridor avait donc déjà parcouru un bon tiers de son cycle, aucune tranche
     * n'était restée à la bouche, et comme chaque tranche montre la MÊME fenêtre à une échelle
     * différente, le texte en blocs ne pouvait pas se poser sur celui de l'écran.
     *
     * L'instant du croisement est latché plutôt que calculé : il dépend de la course de la
     * caméra, donc du viewport et de la pose d'entrée. Le verrou tient tant que le corridor est
     * visible et ne se relâche qu'une fois éteint — sans quoi la sortie de Work rembobinerait le
     * défilement d'un coup, un saut au milieu d'un fondu.
     *
     * Le cycle reste ENTIER sur ce qui reste de la plongée (le facteur `/(1 − début)`) : c'est
     * l'invariant que TRAVEL_PER_DIVE portait — « la plongée est finie » et « le corridor a
     * bouclé une fois pile » coïncident, voir tunnelGeom.test.ts sur la périodicité.
     */
    if (enter <= DIVE_EPS) travelFrom.current = -1;
    else if (travelFrom.current < 0 && enter >= 1 - DIVE_EPS) travelFrom.current = s.dive;
    const from = travelFrom.current;
    uniforms.uLoop.value = pt.tunnelLoop ? 1 : 0;
    uniforms.uFallAt.value = pt.fallAt;
    uniforms.uFallBy.value = pt.fallBy;
    /*
     * LA DISLOCATION — voir uBreak dans le vertex shader pour ce qu'elle fait, et formClock pour
     * ce qu'elle raccorde.
     *
     * SUR `dive` ET NON SUR `p` (l'arc de luminosité), bien que l'extinction, elle, soit sur `p` :
     * la fenêtre du décrochage doit se lire dans la même unité que celles de la salle, qui sont
     * écrites en `dive` dans formClock. Un décrochage exprimé en `p` obligerait à retraduire
     * mentalement chaque borne dès qu'on veut savoir laquelle des deux scènes bouge en premier —
     * et c'est précisément l'enchaînement de ces bornes qui est le sujet.
     *
     * ELLE COMMENCE AVANT L'EXTINCTION, ET C'EST L'ORDRE QUI COMPTE. 0,68 tombe pendant que la
     * dissolution finit (0,75) et bien avant que le fondu ne s'amorce (`fallAt` 0,56 en p, soit
     * dive 0,78) : les blocs lâchent donc EN PLEINE LUMIÈRE, on les voit se détacher, et ils ne
     * s'éteignent qu'ensuite, en dérivant. L'inverse — s'éteindre puis décrocher — ne montrerait
     * rien du tout : ce serait un fondu au noir suivi d'un mouvement invisible.
     */
    uniforms.uBreak.value = smoothstep(BREAK_AT, BREAK_BY, s.dive);
    uniforms.uShaft.value = pt.tubeShaft ? 1 : 0;
    /*
     * LE PAS DU PUITS EST EXPRIMÉ EN DEMI-LARGEURS DE LA BOUCHE, pas en unités locales brutes :
     * c'est le rapport pas/largeur qui décide si le corridor se lit comme un TUYAU (pas court, la
     * section défile vite) ou comme un couloir long. Le convertir ici, contre REF_HW, garde ce
     * rapport quand la résolution ou la fenêtre changent — les mêmes raisons que pour `mouthBack`,
     * exprimé lui en « écrans ».
     */
    uniforms.uStep.value = pt.tubeStep * REF_HW;
    // L'ARRONDI N'A DE SENS QU'EN BOUCLE — voir `cycles` dans posteTweak : c'est la périodicité de
    // `recycle` qui exige un nombre ENTIER de tours. Une traversée unique ne répète rien, donc
    // aucune valeur ne peut l'interrompre au milieu d'un cycle.
    const laps = pt.tunnelLoop ? Math.round(pt.cycles) : pt.cycles;
    /*
     * LA COURSE ACCÉLÈRE — elle était LINÉAIRE en `dive`, donc à vitesse rigoureusement
     * constante du croisement jusqu'au bout. Ce qui donnait l'impression de vitesse était la
     * seule perspective ; rien dans la traversée ne poussait.
     *
     * `u` est l'avancée normalisée depuis le croisement, et la courbe mélange `u` et `u²`. Les
     * DEUX BOUTS SONT PRÉSERVÉS (0 → 0 et 1 → 1), donc on parcourt exactement le même nombre de
     * tranches qu'avant et la dernière arrive toujours pile à la fin de la plongée — voir
     * `cycles` dans posteTweak, dont c'est l'invariant. Seule la RÉPARTITION change : à 0.35, la
     * vitesse vaut 0,65× au départ et 1,35× à l'arrivée, soit un rapport d'un peu plus de deux
     * entre le début et la fin de la traversée.
     *
     * Une puissance pure (`u^n`) donnait la même accélération mais écrasait le départ, où le
     * corridor est encore en train de naître et a besoin d'être lisible.
     */
    const u = from < 0 ? 0 : Math.max(0, s.dive - from) / Math.max(1e-3, 1 - from);
    uniforms.uTravel.value = (u * (1 - TRAVEL_ACCEL) + u * u * TRAVEL_ACCEL) * grid.slices * laps;
    uniforms.uDive.value = s.dive;
    uniforms.uArrive.value = pt.diveArrive;
    uniforms.uG.value = pt.growth;
    uniforms.uD.value = grid.slices;
    uniforms.uCols.value = grid.cols;
    uniforms.uRows.value = grid.rows;
    uniforms.uCell.value = grid.cell;
    /*
     * LES BLOCS SE SÉPARENT À MESURE QU'ON ENTRE — sur l'avancée de la traversée, la même que
     * le défilement (`travel` ci-dessus) pour que les deux racontent le même mouvement. De loin
     * la paroi est une image continue ; dedans, chaque cellule se détache, et les interstices
     * qui s'ouvrent laissent voir les tranches lointaines que les proches masquaient.
     */
    /*
     * LA DISSOLUTION SE TERMINE QUAND LE FONDU COMMENCE, PAS À LA FIN DU SCROLL — sans quoi ses
     * deux bornes de fin sont des valeurs que PERSONNE NE VOIT JAMAIS.
     *
     * Mesuré : sur `through` (qui n'atteint 1 qu'à dive = 1), la paroi arrivait bien à 0.10 et les
     * blocs à 0.20 — mais à dive = 1, où l'arc de luminosité (voir uFallAt) a déjà tout éteint. Le
     * dernier état visible à pleine lumière était ~0.28 / ~0.26, donc les deux molettes annonçaient
     * une valeur et en montraient une autre.
     *
     * CET INSTANT A ÉTÉ DÉDUIT DE `fallAt`, ET C'ÉTAIT FAUX : l'instant où l'image meurt à l'écran
     * ne se lit pas dans le réglage du fondu (constaté en scrollant — la course s'achevait vers
     * 68 % de la dissolution, paroi encore à 0.37 au lieu de 0.10). C'est donc `dissolveAt`, une
     * molette, pas une formule — voir posteTweak. Le DÉFILEMENT, lui, garde son avancée sur la
     * plongée entière (voir uTravel plus haut) : la traversée doit se finir avec le scroll, pas
     * avant — deux gestes qui partagent le même départ (le croisement latché), pas la même arrivée.
     */
    const dissolveDive = pt.diveArrive + pt.dissolveAt * (1 - pt.diveArrive);
    const dissolve =
      from < 0 ? 0 : Math.min(1, Math.max(0, (s.dive - from) / Math.max(1e-3, dissolveDive - from)));
    uniforms.uFillXY.value = pt.fillXY + (pt.fillIn - pt.fillXY) * dissolve;
    /*
     * LA PAROI SE DÉCOUPE SUR LA MÊME AVANCÉE — c'est l'animation de la sortie, et elle ne peut
     * pas être ailleurs : `through` est déjà l'avancée du défilement et de la séparation
     * latérale des blocs, donc la paroi qui s'ouvre raconte le MÊME mouvement plutôt qu'un
     * deuxième, désynchronisé. Continue au départ (une seule ouverture, celle du fond, qui
     * grandit — voir tubeWall), découpée à l'arrivée : le mur devient grille, la grille devient
     * points, et le tube se dissout au moment où on en sort.
     */
    uniforms.uWall.value = pt.tubeWall + (pt.tubeWallIn - pt.tubeWall) * dissolve;
    // Publié pour le panneau, qui AFFICHE ces deux nombres — voir tunnelLive.ts pour pourquoi ils
    // ne peuvent pas être recalculés là-bas.
    tunnelLive.wall = uniforms.uWall.value as number;
    tunnelLive.blocks = uniforms.uFillXY.value as number;
    uniforms.uFillZ.value = grid.fillZ;
    uniforms.uAtten.value = pt.atten;
    uniforms.uRest.value = pt.restLevel;
    uniforms.uPeak.value = pt.peak;
    uniforms.uCut.value = pt.cellCut;
    uniforms.uDiscard.value = pt.discard;
    // DEUX uniformes, deux rôles : `uEnter` est la PRÉSENCE (le croisement, qui éteint tout —
    // REST compris — avant l'instant du relais), `uNeon` est l'INTENSITÉ (la naissance sourde
    // puis la montée), dosée sur la luminance en entrée du bloom. Les confondre en un seul
    // facteur de sortie ne faisait pas un corridor moins néon, seulement un corridor saturé
    // plus sombre.
    uniforms.uEnter.value = enter;
    uniforms.uNeon.value = pt.birthDim + (1 - pt.birthDim) * birth;
    // La profondeur LOCALE de la caméra dans le repère du corridor — voir le fondu de
    // proximité dans FRAG. mesh.position.z vaut tubeMouth.frontZ (ci-dessus) et l'axe local
    // recule vers -Z (voir le vertex shader) : la caméra, à s.camZ en monde, est donc à
    // (mesh.position.z − s.camZ) de profondeur MONDE devant l'origine du corridor — DIVISÉE
    // PAR mesh.scale.z pour la ramener en profondeur LOCALE, l'unité de `vDepth` (voir VERT :
    // p.z n'est jamais multiplié par l'échelle, seul modelMatrix l'applique). Tant que Z était
    // à 1 (T6) les deux coïncidaient et cette division était un no-op silencieux ; depuis que
    // Z suit `sx` (ci-dessus), l'omettre ferait comparer une profondeur MONDE à une profondeur
    // LOCALE dans la tranche proche (FRAG) — un facteur d'échelle ~1/sx, proche de 1 (sx≈0.89
    // au CELL actuel, voir son en-tête) mais jamais EXACTEMENT 1, et cette division reste
    // correcte quel que soit CELL plutôt que de dépendre d'une coïncidence numérique.
    uniforms.uCamDepth.value = (mesh.position.z - s.camZ) / mesh.scale.z;
  });

  /**
   * UN HUBLOT DE DÉVELOPPEMENT — `window.__tunnel` en dev, rien en prod. Même besoin que
   * `window.__form` dans formClock.ts (débogage à l'aveugle sinon), mais PAS le même motif :
   * l'état de formClock est un singleton de MODULE, assignable une fois pour toutes hors
   * composant ; celui-ci vit dans `meshRef`, un ref React propre à CETTE instance. D'où
   * l'effet plutôt qu'une affectation au niveau module — il ferme sur `meshRef` (stable
   * d'un rendu à l'autre) une seule fois au montage, et chaque lecture de `.state()` relit
   * `meshRef.current` et les uniformes À CET INSTANT, sans rien copier par frame.
   */
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as Record<string, unknown>).__tunnel = {
      state: () => {
        const mesh = meshRef.current;
        if (!mesh) return null;
        const u = (mesh.material as ShaderMaterial).uniforms;
        return {
          visible: mesh.visible,
          // Le nombre d'instances RÉELLEMENT dessinées (voir buildGrid) — la seule façon de
          // vérifier de l'extérieur que le réglage « Pixels » arrive au mesh.
          count: (mesh.geometry as InstancedBufferGeometry).instanceCount,
          position: mesh.position.toArray(),
          scale: mesh.scale.toArray(),
          uTravel: u.uTravel.value as number,
          uDive: u.uDive.value as number,
          uCamDepth: u.uCamDepth.value as number,
          uHoleUv: (u.uHoleUv.value as Vector2).toArray(),
          uSpan: u.uSpan.value as number,
          /* Tous les autres uniformes, à plat : ce hublot a servi à diagnostiquer un corridor
           * devenu noir, et il ne montrait alors ni le fondu croisé, ni la géométrie, ni le néon —
           * donc rien de ce qui pouvait l'éteindre. */
          u: Object.fromEntries(
            Object.entries(u)
              .filter(([, v]) => typeof (v as { value: unknown }).value === "number")
              .map(([k, v]) => [k, (v as { value: number }).value])
          ),
        };
      },
    };
  }, []);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      visible={false}
      // Les instances sont déplacées en vertex shader ; la boîte englobante que three
      // calculerait depuis le cube unité (1×1×1 à l'origine) n'a aucun rapport avec
      // l'étendue réelle du corridor déplié, et le frustum culling la découperait dès
      // que la caméra ne regarderait plus exactement l'origine du cube brut.
      frustumCulled={false}
    />
  );
}
