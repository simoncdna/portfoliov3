"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, InstancedBufferAttribute, ShaderMaterial } from "three";
import type { InstancedMesh } from "three";
import { formState } from "@/lib/formClock";
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
 * des points de départ RAISONNABLES, réglés par le calcul (voir leurs commentaires) — un
 * navigateur a servi, en fin de tâche, à vérifier qu'AUCUNE géométrie n'avait disparu
 * (voir le rapport de tâche pour la capture), mais pas à les affiner à l'œil sous la
 * caméra et le cadrage que T6 posera. REST (dans le fragment shader), en revanche, A été
 * recalibrée contre le rendu réel : la première valeur, choisie au jugé, était invisible
 * sous `toneMappingExposure: 0.3` de la scène — le masque de phosphore éteint disparaissait
 * dans le fond, exactement le défaut que ce fichier était censé éviter. Le reste demeure
 * des candidates au réglage visuel, pas des valeurs mesurées sous la caméra finale.
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
 * La profondeur (unités monde) de la tranche 0 — le plan le plus proche du sommet du
 * cône. Choisie PETITE pour deux raisons qui se recoupent : (1) « à l'origine » au sens
 * le plus littéral — le sommet du cône (z local → 0) est à l'origine du repère du mesh,
 * donc un Z0 petit garde la tranche 0 tout près de ce point ; (2) c'est Z0 qui fixe, avec
 * CELL et G, le rapport entre l'écart séparant deux tranches et la taille d'un bloc (voir
 * CELL ci-dessous) — un Z0 trop grand aurait ouvert des vides entre les tranches.
 */
const Z0 = 0.2;
/**
 * Taille d'une cellule (unités monde) à l'échelle de référence (tranche 0). Choisie pour
 * que la grille au repos (48 × 0.08 ≈ 3,8 × 2,9) soit du même ordre de grandeur que les
 * autres objets de la scène (PLATE_H = 3.4 dans formPhoto.ts) et donc VISIBLE à la pose
 * de caméra par défaut (z=10, fov=42) sans la dominer.
 *
 * CELL, FILL_XY, FILL_Z ET G SONT LIÉS : l'écart entre les centres de deux tranches
 * consécutives, à l'échelle de la tranche k, vaut Z0·g·sc_k (la dérivée discrète de
 * sliceZ) ; la demi-profondeur d'un bloc à cette même échelle vaut CELL·FILL_Z·sc_k/2.
 * Pour que les blocs d'une tranche touchent ceux de la suivante plutôt que de laisser un
 * vide, on veut (demi-profondeur_k + demi-profondeur_k+1) ≳ écart, soit
 * CELL·FILL_Z·(2+g)/2 ≳ Z0·g — avec les valeurs ci-dessous (0.08 · 0.85 · 2.35/2 ≈ 0.08)
 * contre (0.2 · 0.35 = 0.07), l'inégalité tient : léger recouvrement plutôt qu'un vide.
 * Ce calcul est vérifié algébriquement, PAS à l'œil — un navigateur confirmera ou non
 * qu'il se voit comme prévu.
 */
const CELL = 0.08;
/** Fraction de la maille qu'occupe un bloc, XY — le reste est l'interstice du masque de
 *  phosphore (comme les liserés noirs entre les luminophores d'un vrai tube). */
const FILL_XY = 0.85;
/** Même fraction en profondeur, pour que les blocs restent à peu près cubiques — voir le
 *  calcul de recouvrement sous Z0. */
const FILL_Z = 0.85;

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
  vec4 wp = modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uScreen;
varying vec2 vUvCell;
varying float vSc;

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

void main() {
  vec3 lit = texture2D(uScreen, vUvCell).rgb;
  // ADDITIF, jamais mélangé — un phosphore ÉMET (même doctrine que ChromeTableau) :
  // mélanger éteindrait REST là où le canvas est sombre, qui est presque partout.
  vec3 col = REST + lit;
  // Le point de fuite s'assombrit : vSc croît géométriquement avec la profondeur
  // recyclée (voir le vertex shader), donc l'atténuer directement évite de reconvertir
  // une distance qui n'existe déjà plus une fois recyclée dans [Z0, Z0·(1+g)^D).
  col *= 1.0 / (1.0 + ATTEN_K * (vSc - 1.0));
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
    (mesh.material as ShaderMaterial).uniforms.uTravel.value = s.dive * TRAVEL_PER_DIVE;
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
