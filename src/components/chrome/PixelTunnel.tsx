"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, InstancedBufferAttribute, ShaderMaterial, Vector2 } from "three";
import type { InstancedMesh, PerspectiveCamera } from "three";
import { formState } from "@/lib/formClock";
import { smoothstep } from "@/lib/formChoreo";
import { screenFill, tubeMouth, tunnelCross } from "@/lib/tubeMouth";
import { tubeHole } from "@/lib/tubeHole";
// Une SEULE molette est lue ici, `diveArrive` — pas un panneau pour ce fichier (voir « PAS DE
// PANNEAU DEV ICI » dans l'en-tête, qui vaut toujours pour G/Z0/CELL/REST) : c'est le seuil
// que formClock possède et que ce fragment recopiait en dur.
import { posteTweak } from "@/lib/posteTweak";
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
 * LES CELLULES ÉTEINTES EXISTENT. Le masque de phosphore couvre tout le tube, pas
 * seulement les lettres allumées : chaque cellule porte une couleur de repos sombre
 * (REST) à laquelle s'ADDITIONNE l'échantillon du canvas — jamais un mix, un phosphore
 * émet (même doctrine que FRAG_CANVAS/FRAG_FRAME dans ChromeTableau). Sans REST, le
 * canvas étant noir à ~95 % de sa surface (voir tubeScreen.draw), le corridor serait une
 * bande de texte flottant dans le vide plutôt qu'un tunnel dont on voit les parois.
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
/** 48 × 36 × 16 — le nombre d'instances du mesh. */
const COUNT = COLS * ROWS * SLICES;

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
 * plongée est choisie légèrement AU-DELÀ de Z0 (voir CAM_DIVE_PAST_GLASS dans formClock.ts,
 * ≈ 1.14 · Z0, même rapport qu'avant cette tâche) — Z0 reste donc « le seuil », seulement il
 * ne fixe plus, seul, l'angle du cône.
 */
const Z0 = 2.2;
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
 * Combien de « tranches » on traverse sur la PLONGÉE ENTIÈRE (dive 0→1). Choisi égal à
 * SLICES : c'est la seule valeur qui fait coïncider exactement « la plongée est finie »
 * et « le corridor a bouclé une fois pile » — recycle() est périodique de période SLICES
 * (voir tunnelGeom.test.ts, « recycle est périodique de période D »), donc à travel=16
 * chaque tranche est revenue à sa position de départ, et le geste se referme sans
 * s'arrêter à une phase arbitraire du cycle. Toute autre valeur (8, 24…) aurait été un
 * choix tout aussi défendable pour la VITESSE perçue ; celle-ci est retenue pour ce
 * qu'elle rend exact plutôt que pour son effet, qui reste à juger à l'écran.
 */
const TRAVEL_PER_DIVE = SLICES;

/**
 * Sous ce seuil de `dive`, le corridor n'existe pas visuellement — voir le useFrame plus
 * bas. Une comparaison stricte à 0 flotterait au premier epsilon de bruit numérique sur
 * `workReveal.dive`.
 */
const DIVE_EPS = 1e-4;

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
varying vec2 vUvCell;
varying float vSc;
varying float vDepth;

const float G = ${G};
const float Z0 = ${Z0};
// D, pas SLICES : le fichier de test (tunnelGeom.test.ts) nomme sa constante de boucle D
// pour la même quantité — repris ici pour que les deux se lisent côte à côte.
const float D = ${SLICES}.0;
const float COLS = ${COLS}.0;
const float ROWS = ${ROWS}.0;
const float CELL = ${CELL};
const float FILL_XY = ${FILL_XY};
const float FILL_Z = ${FILL_Z}${Number.isInteger(FILL_Z) ? ".0" : ""};

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
  float z = recycle(sliceZ(aSlice, Z0, G), uTravel, Z0, G, D);
  float sc = z / Z0;

  // La cellule à l'échelle de référence (tranche 0) : centrée sur la grille, Y inversé
  // pour que le haut du canvas (aCell.y → 0, où le terminal écrit) devienne le haut du
  // corridor (Y local positif) — un choix de présentation, pas une contrainte de
  // tunnelGeom, qui ne connaît que des grandeurs scalaires.
  vec2 cellRef = vec2((aCell.x - 0.5) * COLS, (0.5 - aCell.y) * ROWS) * CELL;
  // « position » : le cube unité de BoxGeometry(1,1,1), en [-0.5, 0.5] par axe. Sa propre
  // taille ET son décalage dans la grille grossissent tous deux par « sc » : c'est
  // l'invariant du tube droit appliqué à un bloc entier, pas seulement à son centre —
  // sans quoi les blocs resteraient à taille constante dans un cône qui, lui, s'évase.
  vec3 boxRef = vec3(cellRef, 0.0) + position * vec3(CELL * FILL_XY, CELL * FILL_XY, CELL * FILL_Z);
  // Z NÉGATIF : la caméra par défaut de la scène est à z=+10, tournée vers -Z (voir
  // ChromeCanvas) — s'éloigner dans le corridor, c'est donc aller vers les z locaux
  // négatifs. tunnelGeom ne porte que des magnitudes positives (z0>0 précisé dans son
  // en-tête) ; le signe est une décision de présentation prise ICI, une seule fois.
  vec3 p = vec3(boxRef.xy * sc, -z + boxRef.z * sc);

  // uHoleUv + (aCell − 0.5) · uSpan, PAS aCell BRUT — voir l'en-tête du fichier. "aCell"
  // reste la position de la cellule dans la grille DE RÉFÉRENCE (0..1 sur 48×36, inchangé,
  // c'est ce qui place le bloc dans "cellRef" ci-dessus) ; c'est SEULEMENT le point du canvas
  // qu'elle échantillonne qui change — recentré sur le trou et resserré à sa fenêtre au lieu
  // de courir sur les 512×384 px entiers. "(aCell − 0.5)" est déjà centré sur 0 (comme
  // "cellRef"), donc à "uSpan" = l'étendue pleine de la fenêtre, une cellule en bord de grille
  // (aCell ≈ 0 ou 1) atterrit exactement sur le bord de la fenêtre, pas au-delà.
  vUvCell = uHoleUv + (aCell - 0.5) * uSpan;
  vSc = sc;
  // La profondeur RECYCLÉE, en unités locales — voir uCamDepth dans FRAG : le fondu de
  // proximité en a besoin pour savoir à quelle distance de la caméra (le long du SEUL axe
  // qui varie ici, l'axe du corridor) cette instance se trouve, sans reconstruire une
  // distance 3D complète pour un fondu qui n'a besoin que de la profondeur.
  vDepth = z;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uScreen;
uniform float uDive;
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
uniform float uCamDepth;
varying vec2 vUvCell;
varying float vSc;
varying float vDepth;

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
const float ATTEN_K = 0.15;

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
const float PEAK = 3.2;

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
const float DISCARD_FRAC = 4.0;
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
const float FADE_FRAC = 0.15;

void main() {
  float d = abs(vDepth - uCamDepth);
  float cutoff = DISCARD_FRAC * max(uCamDepth, 1e-3);
  if (d < cutoff) discard;
  vec3 lit = texture2D(uScreen, vUvCell).rgb;
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
  float luma = dot(lit, vec3(0.2126, 0.7152, 0.0722)) * uNeon;
  // Le halo, superlinéaire — voir BLOOM_P. Additif comme tout le reste de ce fichier : un
  // phosphore ÉMET, il ne se mélange pas au fond (même doctrine que REST ci-dessus et que
  // le tube dans ChromeTableau).
  vec3 col = REST + NEON * (luma + BLOOM_K * pow(luma, BLOOM_P));
  // Le point de fuite s'assombrit : vSc croît géométriquement avec la profondeur
  // recyclée (voir le vertex shader), donc l'atténuer directement évite de reconvertir
  // une distance qui n'existe déjà plus une fois recyclée dans [Z0, Z0·(1+g)^D).
  col *= 1.0 / (1.0 + ATTEN_K * (vSc - 1.0));
  // PLANCHER À 0.4, PAS 0 — voir DISCARD_FRAC : AU cutoff, le demi-angle de la tranche
  // exposée est PAR CONSTRUCTION proche de celui de la caméra (≈22° contre 21°), pas cent
  // fois trop grand ; partir de zéro assombrissait pour rien la fraction (mesurée ≈10 %,
  // voir FADE_FRAC) du cycle où le voisin non retiré tombe tout juste après le cutoff.
  col *= mix(0.4, 1.0, smoothstep(cutoff, cutoff + FADE_FRAC * max(uCamDepth, 1e-3), d));
  float p = clamp((uDive - uArrive) / max(1.0 - uArrive, 1e-3), 0.0, 1.0);
  float rise = smoothstep(0.0, 0.45, p);
  float fall = smoothstep(0.45, 1.0, p);
  float mult = (1.0 + (PEAK - 1.0) * rise) * (1.0 - fall);
  col *= mult * uEnter;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* -------------------------------------------------------------------------- */

/** Le cube unité, plus deux attributs PAR INSTANCE : quelle cellule du canvas (aCell) et
 *  quelle tranche du corridor (aSlice). Aucun instanceMatrix — la position de chaque
 *  instance est entièrement recalculée dans le vertex shader à partir de ces deux
 *  attributs, jamais posée depuis le CPU. */
function buildGrid(): BoxGeometry {
  const geo = new BoxGeometry(1, 1, 1);
  const cell = new Float32Array(COUNT * 2);
  const slice = new Float32Array(COUNT);
  let i = 0;
  for (let k = 0; k < SLICES; k++) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        cell[i * 2] = (col + 0.5) / COLS;
        cell[i * 2 + 1] = (row + 0.5) / ROWS;
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
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => buildGrid(), []);
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
      }),
    [screenTex]
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
    const x = screenFill(
      camera.position.z,
      camera.near,
      Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360)
    );
    // La montée après le croisement : 0 au moment où le poste a fini de s'effacer, 1 une fois
    // `birthSpan` écrans plus loin. Même unité que le croisement, donc les deux se raccordent
    // exactement là où l'un s'arrête.
    const birth =
      1 - smoothstep(pt.crossOut - Math.max(pt.birthSpan, 1e-3), pt.crossOut, x);
    const enter = tunnelCross(
      camera.position.z,
      camera.near,
      Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360),
      pt.crossIn,
      pt.crossOut
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
    const mouth = 2 * hole.half;
    const sx = (Math.max(tubeMouth.hw, 1e-4) * mouth) / REF_HW;
    const sy = (Math.max(tubeMouth.hh, 1e-4) * mouth) / REF_HH;
    mesh.position.set(tubeMouth.holeX, tubeMouth.holeY, tubeMouth.frontZ);
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
    uniforms.uHoleUv.value.set(hole.u, hole.v);
    uniforms.uSpan.value = hole.half * 2;
    uniforms.uTravel.value = s.dive * TRAVEL_PER_DIVE;
    uniforms.uDive.value = s.dive;
    uniforms.uArrive.value = pt.diveArrive;
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
          position: mesh.position.toArray(),
          scale: mesh.scale.toArray(),
          uTravel: u.uTravel.value as number,
          uDive: u.uDive.value as number,
          uCamDepth: u.uCamDepth.value as number,
          uHoleUv: (u.uHoleUv.value as Vector2).toArray(),
          uSpan: u.uSpan.value as number,
        };
      },
    };
  }, []);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, COUNT]}
      visible={false}
      // Les instances sont déplacées en vertex shader ; la boîte englobante que three
      // calculerait depuis le cube unité (1×1×1 à l'origine) n'a aucun rapport avec
      // l'étendue réelle du corridor déplié, et le frustum culling la découperait dès
      // que la caméra ne regarderait plus exactement l'origine du cube brut.
      frustumCulled={false}
    />
  );
}
