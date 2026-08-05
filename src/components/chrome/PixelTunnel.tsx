"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, InstancedBufferAttribute, ShaderMaterial } from "three";
import type { InstancedMesh } from "three";
import { formState } from "@/lib/formClock";
import { tubeMouth } from "@/lib/tubeMouth";
import { tubeScreen } from "@/lib/tubeScreen";
import { TV_LINES } from "./ChromeTableau";

/**
 * LE CORRIDOR DE PHOSPHORE — la grille du tube RÉPÉTÉE en profondeur, une tranche à
 * l'échelle géométrique de la précédente. tunnelGeom.ts porte l'invariant (échelle/
 * distance constant ⇒ corridor DROIT) et le teste ; ce fichier ne fait que porter les
 * 27 648 instances et le shader qui les place — voir l'en-tête de tunnelGeom.ts : « ces
 * formules sont dupliquées en GLSL dans PixelTunnel, et c'est délibéré : le vertex shader
 * […] n'est pas testable. Les garder identiques ici et là-bas est ce qui fait que ce
 * test couvre réellement ce que le GPU dessine. »
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
 * CE DEMI-ANGLE NE DÉPEND PAS DE CELL NI DE COLS — seulement de Z0 et du rectangle-monde de
 * l'écran (tubeMouth.hw). La preuve tient en une ligne : la demi-largeur MONDE d'une
 * tranche à l'échelle sc vaut `sx · (COLS/2) · CELL · FILL_XY · sc`, et `sx` (le useFrame
 * plus bas) vaut PAR CONSTRUCTION `tubeMouth.hw / ((COLS/2) · CELL)` — le produit
 * `(COLS/2) · CELL` s'annule donc exactement, et il reste `tubeMouth.hw · FILL_XY · sc`. Le
 * rapport à la profondeur `Z0 · sc` (puisque sc = sliceZ(k)/Z0) est alors
 * `tubeMouth.hw · FILL_XY / Z0`, SANS CELL NI COLS. Choisir CELL ne change donc que la
 * RÉSOLUTION de la grille (combien de cellules subdivisent le même rectangle), jamais la
 * forme du cône — c'est Z0 qui la fixe, et Z0 seul.
 *
 * 2.2 vise un demi-angle d'environ 16° au viewport de bureau testé (tubeMouth.hw ≈ 0.75,
 * FILL_XY = 0.85 ⇒ atan(0.75 · 0.85 / 2.2) ≈ 16°), confortablement sous les 21° de la
 * caméra : la plupart des tranches, vues depuis l'intérieur, tiennent alors dans le champ
 * plutôt que de le dépasser. PAS UNIVERSEL : `tubeMouth.hw` varie avec le viewport (le
 * cadrage `k`, voir ChromeTableau), donc ce demi-angle varie aussi — plus étroit sur un
 * viewport où l'écran du poste paraît plus petit (mobile portrait, mesuré ≈ 5°), jamais
 * plus large que sur le viewport testé ici. Un cône trop ÉTROIT lit encore comme un
 * corridor (juste plus serré) ; c'est un cône trop LARGE qui lit comme un mur — voir plus
 * haut. Réserve du rapport de tâche.
 */
const Z0 = 2.2;
/**
 * Taille d'une cellule (unités monde) à l'échelle de référence (tranche 0) — SEULEMENT LA
 * RÉSOLUTION de la grille désormais (voir Z0 ci-dessus : elle s'annule dans la forme du
 * cône), pas sa taille apparente. Choisie pour satisfaire le recouvrement entre tranches
 * ci-dessous avec le NOUVEAU Z0 ; l'ancien repère (« du même ordre que PLATE_H ») ne
 * s'applique plus, puisque la grille est maintenant TOUJOURS remise à l'échelle (`sx`/`sy`,
 * voir le useFrame) pour rejoindre `tubeMouth.hw`/`hh`, quelle que soit sa taille de
 * référence.
 *
 * CELL, FILL_Z ET G SONT LIÉS : l'écart entre les centres de deux tranches consécutives, à
 * l'échelle de la tranche k, vaut Z0·g·sc_k (la dérivée discrète de sliceZ) ; la
 * demi-profondeur d'un bloc à cette même échelle vaut CELL·FILL_Z·sc_k/2. Pour que les
 * blocs d'une tranche touchent ceux de la suivante plutôt que de laisser un vide, on veut
 * (demi-profondeur_k + demi-profondeur_k+1) ≳ écart, soit CELL·FILL_Z·(2+g)/2 ≳ Z0·g — avec
 * les valeurs ci-dessous (0.9 · 0.85 · 2.35/2 ≈ 0.899) contre (2.2 · 0.35 = 0.77),
 * l'inégalité tient, avec une marge proportionnellement un peu plus large que celle de T5
 * (0.899 vs 0.77, +17 % ; T5 avait 0.0799 vs 0.07, +14 %). Vérifié algébriquement, PAS à
 * l'œil — voir le rapport de tâche pour la confirmation au navigateur.
 */
const CELL = 0.9;
/** Fraction de la maille qu'occupe un bloc, XY — le reste est l'interstice du masque de
 *  phosphore (comme les liserés noirs entre les luminophores d'un vrai tube). */
const FILL_XY = 0.85;
/** Même fraction en profondeur, pour que les blocs restent à peu près cubiques — voir le
 *  calcul de recouvrement sous Z0. */
const FILL_Z = 0.85;

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
const float FILL_Z = ${FILL_Z};

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

  vUvCell = aCell;
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
const vec3 REST = vec3(0.22, 0.38, 0.30);
// Atténuation en 1/(1+k·Δ), pas un simple facteur linéaire : plusieurs tranches doivent
// rester lisibles avant que le fond ne s'assombrisse franchement, ce qu'une chute
// linéaire en sc (qui grossit vite, géométriquement) aurait rendu trop abrupte dès les
// toutes premières tranches. Choisi à l'œil sans navigateur — voir l'en-tête du fichier.
const float ATTEN_K = 0.15;

/*
 * L'ARC DE LUMINOSITÉ DU CORRIDOR (0.5→1 de la plongée) — T6, table du plan : « le
 * corridor défile, la luminosité monte puis retombe au noir ». p REMET À ZÉRO au début du
 * corridor (dive=CAM_DIVE_ARRIVE=0.5, voir formClock) plutôt que de repartir de dive brut,
 * pour que cet arc ne dépende que de « où on est dans le corridor », pas de la valeur exacte
 * du point où la caméra s'est arrêtée d'avancer.
 *
 * mult vaut EXACTEMENT 1 à p=0 (rise=0, fall=0 donc (1+0)·(1−0)=1) : pas de saut à l'instant
 * où cet arc prend le relais de « pas d'arc du tout » (dive<0.5, où le corridor est déjà
 * visible à luminosité normale depuis le fondu du poste) — seulement une continuité, pas un
 * flash. Il monte ensuite vers PEAK (une sensation de vitesse, la traversée qui s'intensifie)
 * puis retombe à 0 exactement à p=1 (dive=1) : « retombe au noir » au sens propre, tout le
 * fragment (REST compris) s'éteint plutôt que de simplement s'assombrir vers une couleur de
 * repos qui resterait visible.
 */
const float PEAK = 1.6;

/*
 * LE FONDU DE PROXIMITÉ — pourquoi il existe, ce que le rapport de tâche a MESURÉ, pas
 * supposé.
 *
 * La caméra de plongée (formClock, CAM_DIVE_PAST_GLASS) s'immobilise à une profondeur
 * locale FIXE, à l'INTÉRIEUR de la plage recyclée des seize tranches — pas loin d'elle, à
 * l'intérieur. Le recyclage fait continûment défiler chacune des seize devant cette
 * profondeur fixe (c'est tout le sens de « le corridor défile ») : un script Node
 * (tunnelGeom, rejoué avec Z0/CAM_DIVE_PAST_GLASS actuels) montre que la tranche la plus
 * proche de la caméra oscille entre ~0.02 et ~0.43 unité de profondeur locale au fil d'un
 * seul cycle de recyclage (une fraction de dive de 1/16) — et à 0.02, cette tranche est
 * presque SUR la caméra.
 *
 * OR L'ANGLE D'OUVERTURE DU CÔNE (voir Z0 dans l'en-tête du fichier) NE PROTÈGE PAS DE ÇA.
 * Ce demi-angle (~16° au viewport testé) n'est vrai qu'EN CHAMP LOINTAIN, c'est-à-dire pour
 * une tranche dont la distance à la caméra est grande devant sa propre profondeur — ce qui
 * est FAUX ici par construction : la caméra vit au milieu de tranches toutes proches les
 * unes des autres (facteur 1.35 d'une tranche à la suivante). Une tranche à une distance de
 * 0.02 avec une demi-largeur monde de l'ordre de 0.7 (voir Z0) subtend un angle qui
 * dépasse 90°, quel que soit le demi-angle « de loin » qu'on a réglé — le rapport de tâche
 * montre les captures avant ce fondu : le même mur de deux ou trois cellules qu'avec
 * l'ancien Z0, malgré l'angle recalculé.
 *
 * LA CORRECTION EST DONC LOCALE À LA TRANCHE, PAS GLOBALE AU CÔNE : chaque cellule
 * s'assombrit en fonction de SA PROPRE distance (le long du seul axe qui varie, la
 * profondeur — voir vDepth) à la caméra, et non plus seulement de son échelle globale
 * (ATTEN_K, qui répondait déjà au point de fuite mais pas au passage rapproché). Vers le
 * noir plutôt que vers une couleur de secours : le matériau est OPAQUE (voir sa création
 * plus bas), donc une cellule qui « disparaît » doit rendre du noir, pas juste cesser
 * d'émettre, sinon elle resterait un panneau plat couleur REST — la même paroi plate que ce
 * fondu existe pour supprimer.
 *
 * NEAR_FADE, EN UNITÉS DE PROFONDEUR LOCALE, RÉGLÉ SUR LA PLAGE MESURÉE CI-DESSUS (0.02 à
 * 0.43) — et VÉRIFIÉ PAR LE CALCUL, pas seulement choisi : à 0.6, le MEILLEUR cas du cycle
 * (0.43, la tranche la plus proche de la caméra n'est alors qu'à cette distance-là, jamais
 * moins ce jour-là) ne perd presque rien (smoothstep(0,0.6,0.43) ≈ 0.80 — quasi pleine
 * intensité, ce qu'on veut : rien à corriger quand rien n'est trop proche) tandis que le
 * PIRE cas (0.02, une tranche presque SUR la caméra) tombe à smoothstep(0,0.6,0.02) ≈ 0.003,
 * pratiquement noir. Le fondu n'agit donc que sur la fraction du cycle où une tranche est
 * réellement collée à la caméra, pas sur le cycle entier.
 */
const float NEAR_FADE = 0.6;

void main() {
  vec3 lit = texture2D(uScreen, vUvCell).rgb;
  // ADDITIF, jamais mélangé — un phosphore ÉMET (même doctrine que ChromeTableau) :
  // mélanger éteindrait REST là où le canvas est sombre, qui est presque partout.
  vec3 col = REST + lit;
  // Le point de fuite s'assombrit : vSc croît géométriquement avec la profondeur
  // recyclée (voir le vertex shader), donc l'atténuer directement évite de reconvertir
  // une distance qui n'existe déjà plus une fois recyclée dans [Z0, Z0·(1+g)^D).
  col *= 1.0 / (1.0 + ATTEN_K * (vSc - 1.0));
  col *= smoothstep(0.0, NEAR_FADE, abs(vDepth - uCamDepth));
  float p = clamp((uDive - 0.5) / 0.5, 0.0, 1.0);
  float rise = smoothstep(0.0, 0.45, p);
  float fall = smoothstep(0.45, 1.0, p);
  float mult = (1.0 + (PEAK - 1.0) * rise) * (1.0 - fall);
  col *= mult;
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

  useFrame(() => {
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
    mesh.visible = true;
    /*
     * L'ALIGNEMENT SUR L'ÉCRAN — voir tubeMouth.ts et l'en-tête de ce fichier. `mesh.position`
     * / `mesh.scale` PLUTÔT QU'UN CALCUL DANS LE VERTEX SHADER : c'est exactement à ça que
     * sert `modelMatrix`, que le vertex shader multiplie déjà (`wp = modelMatrix * vec4(p,
     * 1.0)`) — poser le rectangle-monde ici évite d'ajouter deux uniformes (origine, échelle
     * XY) qui referaient à la main ce que l'objet fait pour rien.
     *
     * Échelle NON UNIFORME (X et Y séparément, Z à 1) : X/Y rejoignent le rectangle du tube
     * (tubeMouth.hw/hh contre la demi-étendue de RÉFÉRENCE de la grille, REF_HW/REF_HH) ;
     * Z reste à 1 pour que la cadence du corridor (Z0, G — la profondeur RESSENTIE tranche
     * après tranche) ne se mette pas à dépendre de la taille de l'écran du poste, qui n'a
     * rien à voir avec elle.
     *
     * max(…, 1e-4) AVANT LA PLONGÉE : ChromeTableau publie `tubeMouth` par frame dès que le
     * poste est affiché (bien avant que `dive` ne bouge — voir son en-tête), donc en usage
     * normal hw/hh sont déjà non nuls ici. Le garde-fou n'est que pour l'instant théorique
     * où ce useFrame tournerait avant le premier de ChromeTableau (StrictMode, ordre de
     * montage) : une échelle nulle aplatirait toute la grille sur un plan, invisible SANS
     * AUCUNE erreur — même famille de piège que le `max(span, ε)` du shader du tube dans
     * ChromeTableau.
     */
    const sx = Math.max(tubeMouth.hw, 1e-4) / REF_HW;
    const sy = Math.max(tubeMouth.hh, 1e-4) / REF_HH;
    mesh.position.set(tubeMouth.cx, tubeMouth.cy, tubeMouth.frontZ);
    mesh.scale.set(sx, sy, 1);
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
    uniforms.uTravel.value = s.dive * TRAVEL_PER_DIVE;
    uniforms.uDive.value = s.dive;
    // La profondeur LOCALE de la caméra dans le repère du corridor — voir le fondu de
    // proximité dans FRAG. mesh.position.z vaut tubeMouth.frontZ (ci-dessus) et l'axe local
    // recule vers -Z (voir le vertex shader) : la caméra, à s.camZ en monde, est donc à
    // (mesh.position.z − s.camZ) de profondeur locale devant l'origine du corridor.
    uniforms.uCamDepth.value = mesh.position.z - s.camZ;
  });

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
