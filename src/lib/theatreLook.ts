/**
 * LES NOMBRES DE LA SALLE — le nuage de particules des quatre projets (voir TheatrePieces),
 * comme un seul jeu documenté.
 *
 * Même fichier, même rôle que `plateLook` pour les plaques : un littéral figé, lu
 * impérativement une fois par frame par la scène. Chaque champ finit sur un uniforme ou dans
 * un tampon, donc changer un nombre ici change l'image à la frame suivante et ne recompile rien.
 *
 * IL Y A EU UN STORE ICI, ET IL EST PARTI AVEC LE PANNEAU DEV qu'il servait — même fin que
 * celui de plateLook avant lui, et la même leçon : sans écrivain, `set`/`reset`/`subscribe`
 * sont un mécanisme d'édition que personne ne peut atteindre. Ces valeurs-ci sortent de ce
 * cycle-là, réglées à l'écran puis recopiées ici. Si un jour il faut les rerégler en direct,
 * c'est le store qu'on remet autour de ce littéral, pas une seconde copie des nombres à côté.
 */
export type TheatreLook = {
  /* ---- FORME : ces trois-là décident du contenu des tampons, pas d'un uniforme ---- */

  /**
   * Le nombre de pas sur la pleine largeur du cube unité — donc la finesse
   * d'échantillonnage des pièces, et par là leur nombre de points (~38 000 pour les quatre
   * à 64, ~140 000 à 124). Le grain suit tout seul : `uSize` vaut `grain × 2/density`.
   */
  density: number;
  /** Le nombre de grains de poussière dans la salle. */
  dust: number;
  /** L'échelle d'ensemble de la disposition, et le rayon du volume de poussière avec elle. */
  spread: number;

  /* ---- MATIÈRE ---- */

  /** Diamètre du grain, en pas de grille. À 1 les particules d'une pièce se touchent juste. */
  grain: number;
  /** L'intensité du nuage. Se règle sur la SOMME des recouvrements, pas sur un grain isolé. */
  gain: number;
  /** Celle de la poussière, séparément — elle est bien plus clairsemée que les pièces. */
  dustGain: number;
  /** Demi-profondeur de la rampe de couleur, en unités monde, centrée sur la pièce visée. */
  depthSpan: number;

  /* ---- DÉCOMPOSITION ---- */

  /** Part de la zone saillante qui se détache. */
  rate: number;
  /** Jusqu'où, depuis la pointe, la zone s'étend ; au-delà de 1 tout le corps part. */
  zone: number;
  /** Part du cycle passée dehors — le vrai plafond de la décomposition. */
  out: number;
  /** Longueur du départ, en unités de pièce. */
  reach: number;
  /** Secondes d'un aller-retour complet. Jamais 0 : le vertex divise le temps par ce nombre. */
  cycle: number;
  /** Ouverture latérale du panache. */
  fan: number;
  /** Flottement sur place. */
  float: number;
  /** Vitesse de rotation propre, radians/seconde. */
  spin: number;
  /**
   * La rotation SUPPLÉMENTAIRE de la pièce ouverte, radians/seconde — « elle se présente ».
   *
   * Nettement au-dessus de `spin` (0,45 contre 0,06) : la rotation d'ambiance est une
   * dérive qu'on ne remarque pas, celle-ci doit se voir sans qu'on la fixe. Un tour en
   * quatorze secondes, soit un quart de tour le temps qu'on lise le résumé — assez pour
   * que l'objet se soit montré sous un autre angle, trop peu pour tourner sous le nez.
   */
  openSpin: number;

  /* ---- COULEURS ---- */

  /**
   * La rampe de profondeur, du fond de la salle (0) au point le plus proche (4).
   *
   * EN HEX sRGB, ET C'EST UN PIÈGE À CONNAÎTRE. Elle a été en triplets LINÉAIRES, passés bruts
   * au shader ; `new Color("#323239")` fait maintenant passer three.js par sa gestion des
   * couleurs et reconvertit en linéaire. Une valeur reprise telle quelle d'un ancien triplet
   * sortirait donc beaucoup plus claire — s'il faut revenir sur d'anciens nombres, il faut les
   * convertir, pas les recopier.
   *
   * Noter que le dernier arrêt est légèrement PLUS SOMBRE que l'avant-dernier : la rampe n'est
   * pas tenue d'être monotone, et ce petit retrait est ce qui empêche les pointes les plus
   * proches de brûler en aplat.
   */
  ramp: readonly [string, string, string, string, string];
  /**
   * La couleur des grains de poussière.
   *
   * POURQUOI ELLE EST À PART. La poussière empruntait la rampe de profondeur des pièces : elle
   * était donc, par construction, de la même matière que les objets — ce qui est juste tant
   * qu'on la veut « du même métal », et faux dès qu'on la veut comme un air, une atmosphère,
   * quelque chose qui n'est pas la pièce.
   *
   * Le blanc la remet exactement dans la rampe : elle est loin dans la profondeur, et l'arrêt
   * le plus proche est blanc. C'est donc la valeur neutre, pas une couleur choisie.
   */
  dustColor: string;
};

export const THEATRE_LOOK: TheatreLook = {
  density: 124,
  dust: 30000,
  spread: 1,
  grain: 0.6,
  gain: 2.05,
  dustGain: 1.25,
  depthSpan: 30.5,
  rate: 1,
  zone: 2,
  out: 0.95,
  reach: 1.8,
  cycle: 60,
  fan: 0.35,
  float: 0.02,
  spin: 0.06,
  openSpin: 0.45,
  ramp: ["#323239", "#84848e", "#f0f0f0", "#ffffff", "#f2f2f2"],
  dustColor: "#ffffff",
};
