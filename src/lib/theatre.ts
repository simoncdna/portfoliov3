/**
 * LA SALLE — quatre pièces en rond, et la caméra qui en fait le tour.
 *
 * Ce module ne contient que de la géométrie et un pont. Il ne connaît ni three, ni le
 * DOM : le placement des pièces et la pose de caméra sont ce qu'on se trompe en
 * écrivant, donc ils sont ici, purs et testés (tests/theatre.test.ts), et le composant
 * qui les consomme n'a plus qu'à les appliquer.
 *
 * DEUX DÉCISIONS PORTENT TOUT LE RESTE.
 *
 * 1. LA CAMÉRA EST DEHORS, PAS DEDANS. Elle a d'abord été placée au milieu du cercle,
 *    et c'était une erreur de géométrie et non de réglage : debout au centre d'une
 *    rotonde, on ne voit pas le mur d'en face. Les trois autres pièces tombaient à ±90°
 *    de l'axe, très au-delà de ce que couvre l'objectif — invisibles quoi qu'on fasse
 *    avec la brume ou la profondeur. Dehors, tout se range dans le même demi-espace :
 *    le sujet devant, ses voisines vers les bords du cadre, l'opposée derrière lui.
 *
 * 2. ON INTERPOLE L'ANGLE, PAS LA POSITION. Interpoler la position de la caméra en
 *    cartésien tire une CORDE : elle couperait par le milieu de la salle, en ligne
 *    droite d'une pièce à l'autre. En polaire elle suit l'ARC, donc elle longe la
 *    salle. Même départ, même arrivée, trajet radicalement différent — et c'est tout
 *    le sujet de cette scène.
 */

/**
 * Les quatre objets, dans l'ordre de `works` : Pictarine, Forma, Crazee.B, Klay.
 *
 * La liste vit ICI et pas dans theatreShapes, bien que ce soient des formes : c'est une
 * décision de mise en scène — quel objet représente quel projet — et theatreShapes n'en
 * importe que le type, de sorte que les deux modules restent autonomes et testables
 * séparément (voir la note là-bas).
 */
export type PieceKind = "appareil" | "marteau" | "burger" | "vase";

export const PIECE_OF_WORK: readonly PieceKind[] = ["appareil", "marteau", "burger", "vase"];

/** Une pièce posée dans la salle. Les angles sont en radians, autour de l'axe Y. */
export type Station = {
  kind: PieceKind;
  /** position angulaire sur le cercle */
  phi: number;
  /** hauteur, en unités monde, relative au centre de la salle */
  y: number;
  /** demi-taille */
  scale: number;
  /** inclinaison propre dans le plan de l'image, en radians */
  tilt: number;
};

/**
 * LE RAYON EST UN COMPROMIS, PAS UN NOMBRE LIBRE. Il doit rester PLUS GRAND que la
 * distance d'approche : en dessous, la caméra traverserait le centre et se retrouverait
 * de l'autre côté de la salle, dos à la pièce qu'elle est censée regarder. Plus il est
 * grand, plus l'arc est ample — mais plus les trois autres pièces s'éloignent, jusqu'à
 * disparaître. À 6 contre 5, la caméra tourne à 11 du centre et les voisines restent
 * dans le cadre.
 */
export const RING_RADIUS = 6;

/** Distance caméra ↔ pièce visée. Voir RING_RADIUS : elle doit rester en dessous. */
export const APPROACH = 5;

/**
 * Rayon du cercle que parcourt la CAMÉRA — dehors, donc la somme des deux.
 *
 * Exporté plutôt que recalculé de part et d'autre : l'horloge s'en sert pour caler le
 * centre de la salle sur la sortie de la plongée, le test pour vérifier l'arc. Deux
 * additions séparées finiraient par diverger d'un réglage.
 */
export const CAM_RADIUS = RING_RADIUS + APPROACH;

/**
 * LES ANGLES SONT VOLONTAIREMENT IRRÉGULIERS, ET LE CALCUL EST SERRÉ.
 *
 * Une pièce diamétralement opposée à celle qu'on regarde se retrouve pile dans son axe,
 * juste derrière : la profondeur meurt au moment précis où on l'observe. Il ne suffit
 * pas d'éviter 0/90/180/270 — la première rédaction utilisait 0/88/179/268, où 88 et
 * 268 restent opposés à la seconde près (le test l'a attrapée).
 *
 * Combien d'écart faut-il ? À rayon 6 et caméra à 11, une pièce écartée de δ de
 * l'opposition se décale latéralement de 6·sin δ à ~17 de profondeur, soit un angle
 * apparent de atan(6·sin δ / 17) ; une pièce en sous-tend environ 3 de rayon. À δ = 8°
 * cela donne 2,8° — elles se recouvrent encore. À δ = 20° on obtient 6,9°, soit deux
 * rayons d'écart : nettement séparées.
 *
 * D'où ces quatre-là : les deux diagonales (0↔148 et 62↔218) sont à 32° et 24° de
 * l'opposition. La salle n'est donc pas une rotonde complète mais une abside de 218° —
 * conséquence assumée de la contrainte, pas un choix de composition.
 */
const ANGLES_DEG = [0, 62, 148, 218];
const Y = [-0.2, 0.35, -0.45, 0.15];
const SCALE = [0.92, 0.84, 0.88, 0.8];
const TILT_DEG = [-16, 11, -7, 19];

export const STATIONS: readonly Station[] = PIECE_OF_WORK.map((kind, i) => ({
  kind,
  phi: (ANGLES_DEG[i] * Math.PI) / 180,
  y: Y[i],
  scale: SCALE[i],
  tilt: (TILT_DEG[i] * Math.PI) / 180,
}));

/** Position monde d'une pièce, autour d'un centre de salle. */
export function stationPosition(s: Station, cx: number, cy: number, cz: number) {
  return {
    x: cx + RING_RADIUS * Math.sin(s.phi),
    y: cy + s.y,
    z: cz + RING_RADIUS * Math.cos(s.phi),
  };
}

/**
 * DE COMBIEN LA PIÈCE OUVERTE S'ÉCARTE, pour laisser sa place au texte — en unités monde.
 *
 * 1,75 contre un rayon apparent de ~0,75 : la pièce se retire d'un peu plus de deux fois
 * sa propre largeur, donc elle libère une place franche sans sortir du cadre. En dessous
 * de 1,5 le texte lui rentre dedans ; au-delà de 2 elle touche le bord à la station la
 * plus proche de la caméra.
 */
export const SLIDE = 1.75;

/**
 * Le rayon apparent d'une pièce, en unités monde, avant son échelle propre.
 *
 * Il ne sert PAS au rendu — le nuage a la taille que lui donne sa forme — mais à tout ce
 * qui doit viser la pièce sans la dessiner : la cible de survol posée sur elle (voir
 * theatreScreen) et le recul du texte. Mesuré sur la plus large des quatre (le burger,
 * 0,56 de rayon) et la plus haute (le vase, 0,62 de demi-hauteur), arrondi au-dessus.
 */
export const PIECE_RADIUS = 0.75;

/**
 * LE DÉCALAGE DE LA PIÈCE OUVERTE, en offset monde à ajouter à sa station.
 *
 * PUREMENT LATÉRAL, ET C'EST L'INVARIANT (testé) : l'offset est porté par l'axe DROITE de
 * la caméra, donc sa composante sur l'axe de visée est nulle et la pièce ne s'éloigne pas
 * d'un millimètre en glissant. Elle se décale dans le cadre, elle ne recule pas — sans
 * quoi elle rapetisserait pendant qu'on la présente, ce qui est l'inverse de l'intention.
 *
 * La caméra de la salle a un lacet égal à φ (voir theatreCamera), donc son axe droite est
 * (cos φ, 0, −sin φ). Vers la GAUCHE, donc l'opposé.
 *
 * `k` est l'avancement de l'ouverture (0 = en place, 1 = décalée). Il vient de l'horloge,
 * qui est le seul endroit où quelque chose s'intègre dans cette scène.
 */
export function stationSlide(phi: number, k: number) {
  const d = -SLIDE * k;
  return { x: Math.cos(phi) * d, z: -Math.sin(phi) * d };
}

/**
 * L'écart angulaire le plus court entre deux angles, dans (−π, π].
 *
 * Sans lui, passer de la dernière pièce à la première ferait faire trois quarts de tour
 * à l'envers au lieu d'un quart en avant.
 */
export function shortestDelta(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * L'AVANCEMENT DE LA NAISSANCE D'UNE PIÈCE — la cascade, sans état ni tri.
 *
 * Les quatre pièces partageaient une seule présence (`theatre.on`), donc elles apparaissaient
 * ensemble. Ici chacune reçoit la sienne, RETARDÉE DE SON ÉCART ANGULAIRE À LA CAMÉRA : celle
 * qu'on regarde naît d'abord, celles du dos suivent. On voit la salle se peupler au lieu d'un
 * interrupteur.
 *
 * CONTINU, DONC NI CLASSEMENT NI ÉTAT. Trier les stations par distance aurait demandé un rang —
 * un entier qui saute, donc quelque chose à intégrer, donc de l'état dans un fichier qui n'en a
 * pas. Le retard est ici une FONCTION de l'écart, et l'ordre en sort tout seul : avec les angles
 * actuels (0, 62, 148, 218) et la caméra à φ = 0 à l'arrivée, il vaut 0, 1, puis 3 (142°) et 2
 * (148°) quasi ex æquo. Il reste juste si les angles changent.
 *
 * ET LA SORTIE EST GRATUITE. Quand `on` retombe (la sortie de salle, dans formClock), la même
 * formule défait les pièces dans le même ordre, en commençant par le fond : les grains repartent
 * dans leur halo et la salle se rend à la poussière, sans une ligne de code de sortie.
 *
 * `phi` EST L'ANGLE COURANT DE LA CAMÉRA, PAS CELUI DE LA STATION VISÉE. Pendant la fenêtre de
 * naissance la caméra est immobile (le scroll est verrouillé par le film — voir tubeGate), donc
 * les deux coïncident alors ; mais à la sortie, prendre le courant fait défaire la salle depuis
 * là où on regarde vraiment.
 *
 * À `cascade` = 0 le résultat vaut EXACTEMENT `on` pour toute station — la cascade est
 * strictement opt-in, et un test le fixe par une égalité stricte. Ce n'est pas de la chance
 * mais une identité IEEE-754 : `d · 0` vaut +0, `on − 0` vaut `on` au bit près, `x / 1` est
 * exact, et le clamp ne touche rien dans [0,1].
 *
 * BORNÉ À 0,999, ET PAS POUR LA RAISON QU'ON CROIT. Une première rédaction de ce commentaire
 * disait « à 1, toutes les pièces naîtraient au même instant » : c'est L'INVERSE. À `cascade`
 * → 1, chaque pièce bascule d'un coup à SON propre seuil (`on` = son `d`), soit quatre
 * marches séparées — mesuré : 0 / 0,344 / 0,789 / 0,822. La simultanéité, c'est `cascade` = 0.
 * Ce que la borne évite réellement, c'est un NaN : à `cascade` exactement 1 le quotient vaut
 * ±Infinity, que le clamp absorbe — SAUF quand `on` tombe pile sur `d`, où il vaut NaN. Et un
 * NaN traverse `Math.max(0, Math.min(1, …))` sans être borné : il partirait dans `uRot[i].z`
 * sans laisser de trace en console.
 *
 * ET CETTE COÏNCIDENCE N'EST PAS THÉORIQUE : la station 0 a `d` = 0 exactement, donc `on` = 0 —
 * l'état de repos au départ de chaque plongée — en est une. Non bornée, la pièce de devant
 * serait NaN AU REPOS, à tous les chargements. C'est d'ailleurs la première assertion que le
 * test de la borne fait tomber.
 */
export function stationBirth(phi: number, stationPhi: number, on: number, cascade: number) {
  const lag = Math.max(0, Math.min(0.999, cascade));
  const d = Math.abs(shortestDelta(phi, stationPhi)) / Math.PI;
  return Math.max(0, Math.min(1, (on - d * lag) / (1 - lag)));
}

export type CamPose = { x: number; y: number; z: number; rotY: number };

/**
 * La pose de caméra pour un angle donné : DEHORS, dans l'axe du centre et de la pièce,
 * tournée vers l'intérieur.
 *
 * Le lacet n'est pas libre, il se DÉDUIT de l'angle — et c'est ce couplage qui fait que
 * la caméra reste tournée vers la pièce pendant tout le déplacement, sans qu'aucune
 * animation d'orientation ne soit écrite.
 */
export function theatreCamera(phi: number, cx: number, cy: number, cz: number, height: number): CamPose {
  return {
    x: cx + CAM_RADIUS * Math.sin(phi),
    y: cy + height,
    z: cz + CAM_RADIUS * Math.cos(phi),
    /*
     * La caméra du site regarde par défaut vers les −Z. Pour viser le centre depuis
     * l'angle φ, il faut donc tourner de φ autour de Y : à φ = 0 elle est en +Z et
     * regarde déjà dans la bonne direction, d'où une rotation nulle.
     */
    rotY: phi,
  };
}

/**
 * LE PONT DOM → HORLOGE, du même genre que workReveal et aboutReveal : un singleton
 * mutable nu, écrit par la section et lu une fois par frame par l'horloge de la forme.
 *
 * Il ne porte QUE la station visée, en index entier — pas une position continue, et pas
 * la présence de la salle. Les quatre paliers sont un choix : le scroll passe d'un
 * projet au suivant et s'arrête sur chacun, il ne balaie pas l'abside. La marche qui
 * produit cet entier, avec son plancher de temps, est dans Work.tsx.
 *
 * La PRÉSENCE, elle, se déduit de `state.dive` dans l'horloge : ce nombre monte déjà
 * avec le film et retombe seul à la sortie de section. Lui donner un second pont aurait
 * dupliqué cette retombée, avec la certitude qu'un jour l'un des deux l'oublie.
 *
 * `hover` et `open` disent QUELLE pièce le pointeur désigne et laquelle est ouverte, en
 * index, ou −1. Des entiers nus et pas des rampes, pour la même raison que `station` :
 * ce que le DOM sait, c'est où est le pointeur et sur quoi on a cliqué. Les rampes qui en
 * découlent — la matière qui se tient, le décalage, la dissipation des trois autres —
 * sont fabriquées par l'horloge et par TheatrePieces, chacune là où elle est lue.
 */
export const theatreReveal = { station: 0, hover: -1, open: -1 };

/**
 * LE PONT INVERSE — HORLOGE → DOM : où chaque pièce se trouve À L'ÉCRAN.
 *
 * Même motif que --plate-px-* (publié par ChromeTableau et lu par .plate-hit), avec une
 * différence qui justifie un singleton plutôt que des variables CSS : ces nombres ne sont
 * pas seulement POSÉS sur du DOM, ils sont AUSSI comparés (quelle pièce est sous le
 * pointeur, à quelle distance). Une variable CSS se relit en `getComputedStyle`, ce qui
 * force un recalcul de style par lecture ; un objet mutable se lit pour rien.
 *
 * En PIXELS CSS DEPUIS LE CENTRE DU VIEWPORT, parce que c'est le repère de la scène : la
 * forme est dessinée par un canvas fixe centré, pas par le flux de la page.
 *
 * `freeX/freeY` est la place que la pièce OCCUPAIT avant de glisser — c'est là que le
 * texte vient s'installer. Publiée à part plutôt que recalculée côté DOM : le CPU du rendu
 * a déjà la caméra et la projection sous la main, et deux projections indépendantes du même
 * point finissent toujours par ne plus être d'accord.
 */
export const theatreScreen = {
  x: [0, 0, 0, 0],
  y: [0, 0, 0, 0],
  /** rayon apparent de la pièce, en px CSS */
  r: [0, 0, 0, 0],
  freeX: [0, 0, 0, 0],
  freeY: [0, 0, 0, 0],
};
