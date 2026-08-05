"use client";

/**
 * LE RECTANGLE-MONDE DE L'ÉCRAN — le pont entre ChromeTableau (le seul à connaître tvExt,
 * mesuré sur le glb, et `k`, le facteur de cadrage vivant) et ses deux lecteurs de T6 :
 * formClock (qui vise la caméra de plongée sur ce rectangle) et PixelTunnel (qui fait
 * naître le corridor à sa place et à sa taille — voir « le tunnel doit être aligné sur
 * l'écran » dans le plan).
 *
 * MÊME MOTIF QUE workReveal / tubeGate : un singleton mutable, écrit une fois par frame
 * par ChromeTableau (juste après avoir calculé `k`), lu par les deux autres à leur propre
 * cadence — pas un store avec abonnement, parce qu'aucun des trois ne veut être notifié,
 * chacun veut juste la valeur COURANTE quand son propre useFrame tourne. Le sens est
 * WebGL → WebGL cette fois (workReveal/tubeGate sont DOM ↔ WebGL), mais le problème est
 * identique : deux composants ont besoin du MÊME nombre et un seul (ChromeTableau) a les
 * moyens de le calculer — tvExt vient du glb chargé, `k` du cadrage, dockX/dockY/scale de
 * l'horloge, scrX/scrY/scrW/scrH de posteTweak. Dériver une SECONDE fois cette valeur
 * ailleurs, avec une copie de la formule, dérive au premier réglage touché d'un seul côté
 * (fill, scrX…) — précisément le défaut que ce fichier existe pour éviter.
 *
 * UN FRAME DE RETARD, ASSUMÉ. formClock (dans FormDriver, monté AVANT les formes — voir
 * ChromeCanvas) calcule la caméra de la frame N à partir de ce que ChromeTableau a écrit à
 * la frame N−1. Sans conséquence : ce rectangle ne bouge qu'au resize de la fenêtre ou à un
 * réglage du panneau dev, jamais par frame en usage normal — la même latence existe déjà
 * entre ChromeTableau et les variables CSS --plate-px-* qu'il écrit pour le DOM.
 *
 * AVANT LE PREMIER GLB CHARGÉ, ces nombres valent leur défaut (0) — sans consé quence non
 * plus : `dive` ne peut de toute façon pas dépasser 0 avant que `tableauOn` soit monté (il
 * faut avoir scrollé loin dans Work), et le glb est précha rgé au chargement du module
 * (`useGLTF.preload`, en bas de ChromeTableau.tsx) — en pratique toujours prêt bien avant.
 */
export const tubeMouth = {
  /** Centre du rectangle de l'écran, en monde (X, Y). */
  cx: 0,
  cy: 0,
  /** Demi-largeur / demi-hauteur du rectangle, en monde. */
  hw: 0,
  hh: 0,
  /**
   * Le front du VERRE (pas de l'objet entier — voir tvExt.glassZ dans ChromeTableau),
   * en Z monde. C'est le seuil que la caméra de plongée doit avoir dépassé, et devant
   * lequel le poste doit être ENTIÈREMENT éteint — voir formClock (DIVE_PAST_GLASS) et
   * ChromeTableau (DIVE_FADE_END).
   */
  frontZ: 0,
};
