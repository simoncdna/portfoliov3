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

  /* ---- NAISSANCE ---- */

  /**
   * LE RAYON DU HALO D'OÙ LES GRAINS ARRIVENT, en unités de pièce — comme `reach`, donc
   * indépendant de l'échelle de la station.
   *
   * Le nuage est en `AdditiveBlending` et se règle « sur la somme, pas sur l'unité » : un halo
   * étalé sur un grand volume est plus SOMBRE par pixel qu'une pièce dense, donc trop de portée
   * fait paraître la convergence partie de trop bas. C'est le premier levier si la naissance
   * semble sortir du noir au lieu de sortir de la poussière.
   *
   * À 0, les grains naissent chez eux : il ne reste que la montée d'alpha échelonnée. C'est ce
   * que `reduced` force.
   */
  birthReach: number;
  /**
   * LA PART DE LA RAMPE PASSÉE À ÉCHELONNER LES GRAINS, dans [0,1). À 0 ils arrivent tous
   * ensemble — la pièce se contracte d'un bloc ; plus haut, elle se prend en vague.
   *
   * IL SE DISPUTE LA MÊME FENÊTRE QUE `birthCascade`. Elle vaut ≈ 0,84 s (voir la spec : le
   * troisième temps du film couvre `dive` 0,90 → 1 en 16 % de `diveSeconds`, sans ease, donc un
   * centième de `dive` y vaut 0,11 s à 7 s de plongée). `birthWave + birthCascade` proche de 1
   * ne laisse plus de place à la course elle-même.
   */
  birthWave: number;
  /**
   * LE RETARD DU FOND SUR LE DEVANT, en part de la rampe — voir `stationBirth`, qui en fait une
   * fonction de l'écart angulaire plutôt qu'un rang. À 0, les quatre pièces naissent ensemble et
   * `stationBirth` rend exactement la présence partagée.
   */
  birthCascade: number;
  /**
   * DE COMBIEN LA POUSSIÈRE CREUSE au plus fort de la convergence, en fraction de `dustGain`.
   *
   * Sur une cloche `4·on·(1−on)` : le facteur vaut EXACTEMENT 1 à `on` = 0 et `on` = 1, donc la
   * poussière seule du noir peuplé et la poussière de la salle posée sont inchangées — seul le
   * passage creuse. L'air a l'air d'avoir donné la matière.
   *
   * Ce n'est pas une conservation : 30 000 grains de poussière contre ~140 000 pour les quatre
   * pièces, les comptes ne s'équilibrent pas et ne le peuvent pas. C'est un effet de CAUSE — sans
   * lui la poussière reste indifférente à ce qui naît dedans.
   */
  dustGive: number;

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
  birthReach: 2.5,
  birthWave: 0.55,
  birthCascade: 0.35,
  dustGive: 0.3,
  ramp: ["#323239", "#84848e", "#f0f0f0", "#ffffff", "#f2f2f2"],
  dustColor: "#ffffff",
};
