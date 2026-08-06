"use client";

/**
 * CE QUE LE CORRIDOR VAUT MAINTENANT — les deux grandeurs animées, publiées par frame pour que
 * le panneau dev les AFFICHE au lieu de les recalculer.
 *
 * MÊME MOTIF QUE tubeMouth : un singleton mutable, écrit une fois par frame par PixelTunnel, lu
 * par le panneau à sa propre cadence (~8 Hz, voir useDiveLive) — pas un store avec abonnement,
 * parce que personne ne veut être notifié, seulement lire la valeur COURANTE.
 *
 * POURQUOI ÇA EXISTE. `Paroi` et `Blocs` sont des PAIRES (tubeWall → tubeWallIn, fillXY → fillIn)
 * interpolées sur l'avancée de la dissolution : ce qui part au shader n'est donc AUCUNE des quatre
 * molettes du panneau, et rien ne le montrait. D'où une question légitime revenue trois fois —
 * « tubeWall vaut 0.10 au bout du tunnel ? » — à laquelle un nombre à l'écran répond mieux que
 * n'importe quel commentaire.
 *
 * ET PAS UNE COPIE DE LA FORMULE DANS LE PANNEAU : la dissolution ne se termine pas à la fin de la
 * plongée mais à l'amorce du fondu (voir `dissolve` dans PixelTunnel), donc une seconde
 * implémentation dériverait au premier réglage touché d'un seul côté — exactement le défaut que
 * tubeMouth existe pour éviter.
 */
export const tunnelLive = {
  /** uWall — la part du pas qu'un bloc occupe en profondeur, à cet instant. */
  wall: 0,
  /** uFillXY — la part de sa case qu'un bloc occupe en largeur, à cet instant. */
  blocks: 0,
};
