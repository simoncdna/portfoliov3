"use client";

import { useSyncExternalStore } from "react";
import { ENV_INTENSITY, ENV_ROT_Y } from "./formField";

/**
 * DEV STORE — la scène du poste, en molettes vivantes. Même contrat que les panneaux
 * qui ont trouvé les nombres de PLATE_LOOK puis ceux de la toile : ceci existe pour
 * FINIR en constantes dans la source, puis être supprimé. Le bouton « copier » du
 * panneau crache l'état sous la forme exacte que la source attend — c'est la moitié du
 * cycle qui manquait la dernière fois, où le dépouillement s'est fait à la main.
 *
 * CES VALEURS SONT LA SOURCE DE VÉRITÉ tant que le panneau vit : ChromeTableau ne garde
 * plus ses propres TV_FILL / scrMin / scrMax / DIVE_FADE_START/END, formClock ses
 * CAM_DIVE_ARRIVE / CAM_DIVE_PAST_GLASS, ni tubeHole son WINDOW_CHARS — tous les lisent
 * ici. Deux copies auraient dérivé l'une de l'autre au premier réglage oublié.
 *
 * LE STORE EST DONC LU PAR QUATRE FICHIERS ET DEUX SHADERS, ce qui est justement ce qui le
 * rend utile sur la plongée : `diveArrive` gouverne à la fois l'arrêt de la caméra
 * (formClock) et le départ de l'arc de luminosité du corridor (PixelTunnel) — deux nombres
 * qui ÉTAIENT le même 0.5 écrit deux fois, dans deux fichiers, dont un en GLSL.
 *
 * Lu IMPÉRATIVEMENT une fois par frame (`posteTweak.get()`), jamais par un hook dans la
 * scène : aucune de ces molettes ne change de géométrie ni de graphe React, donc aucune
 * ne justifie un re-render de ChromeTableau pendant qu'on traîne une barre. Seul le
 * panneau s'abonne (`usePosteTweak`).
 */
/**
 * LES ENVIRONNEMENTS ESSAYABLES. « local » est le seul qui vive dans le dépôt
 * (public/env/studio_small_03_1k.hdr, celui que la prod sert) ; les autres sont les
 * presets de drei, TÉLÉCHARGÉS DEPUIS UN CDN au moment où on les choisit.
 *
 * Donc : réservés au réglage, jamais à la prod. Le jour où un de ces environnements
 * gagne, il faut rapatrier le .hdr dans public/env/, le pointer depuis ENV_FILE et
 * l'ajouter à ATTRIBUTIONS.md — un preset drei n'est pas une dépendance qu'on livre.
 */
export const POSTE_ENVS = [
  "local",
  "studio",
  "warehouse",
  "apartment",
  "city",
  "lobby",
  "park",
  "forest",
  "dawn",
  "sunset",
  "night",
] as const;

export type PosteEnv = (typeof POSTE_ENVS)[number];

export type PosteTweak = {
  /* ---- HDRI ------------------------------------------------------------- */
  /** Quel environnement éclaire le poste — voir POSTE_ENVS. */
  env: PosteEnv;
  /**
   * uEnvInt — la force avec laquelle l'environnement frappe le chrome. C'est le
   * levier principal du rendu métal : au-dessus de ~5 le poste brûle, en dessous
   * de ~1 il devient du plomb.
   */
  envInt: number;
  /** uEnvRot — OÙ se posent les reflets, radians autour de Y. */
  envRot: number;

  /* ---- Le décapage, et pourquoi il est ici ------------------------------ */
  /**
   * SANS CETTE MOLETTE, LES DEUX D'AU-DESSUS NE SERVENT À RIEN. Mesuré, pas supposé :
   * changer d'HDRI sur un poste posé ne change RIEN à l'image, parce que le fragment
   * final vaut `mix(chrome, skin, uReveal · uTv)` — à uReveal = 1 le chrome, et avec lui
   * tout l'environnement, est intégralement remplacé par la texture du glb. L'HDRI ne se
   * voit que pendant que le poste est encore chromé.
   *
   * `revealAuto` rend la main à l'horloge (le comportement du site) ; à false, `reveal`
   * fige le décapage où on veut — 0 pour juger l'HDRI sur du chrome plein, 1 pour la peau,
   * entre les deux pour régler la transition elle-même.
   */
  revealAuto: boolean;
  /** Le décapage forcé, 0 = chrome plein, 1 = peau. Ignoré si revealAuto. */
  reveal: number;

  /* ---- La peau du glb : couleur et éclairage ----------------------------- */
  /**
   * L'espace couleur de la texture du poste. false = NoColorSpace, ce que la source
   * force aujourd'hui SANS COMMENTAIRE ; true = SRGBColorSpace, ce que GLTFLoader pose
   * de lui-même sur un baseColor.
   *
   * L'écart n'est pas cosmétique : en NoColorSpace, les octets sRGB de la texture sont
   * pris pour du linéaire, puis la sortie du renderer les ré-encode en sRGB — la peau
   * sort donc PLUS CLAIRE et moins saturée que le fichier. C'est le premier levier à
   * essayer quand la couleur du glb ne ressemble pas à sa texture.
   */
  skinSrgb: boolean;
  /*
   * PAS D'EXPOSITION ICI, et c'est un choix. `toneMappingExposure` (1.15, dans le
   * `gl={{…}}` de ChromeCanvas) est un vrai levier sur la couleur du poste — mais il est
   * GLOBAL : le blob du Hero et le crâne d'About le subissent, ce qui en fait un outil
   * trompeur dans un panneau appelé « poste ». Et l'écrire depuis ici viole
   * react-hooks/immutability à juste titre : le renderer est construit par le <Canvas>,
   * donc une exposition réglable appartient à ChromeCanvas. `skinGain` ci-dessous fait le
   * même travail à l'échelle du seul poste, ce qui est ce qu'on veut ici.
   */
  /**
   * Le vernis : le coefficient du rebord fresnel ajouté à la peau (0.55 dans la source).
   * 0 = peau mate comme du papier, ce que la source dit lire « comme un décalque ».
   */
  skinFres: number;
  /**
   * LA TEINTE DE LA PEAU, en hex — MULTIPLIÉE sur la texture, donc blanc = neutre et
   * c'est le défaut. Multiplicative et non mélangée : un mix aurait aplati les usures et
   * les sérigraphies du boîtier vers une couleur unie, alors que la matière du poste est
   * précisément le sujet. Un multiplicateur ne peut que foncer et colorer — pour éclaircir,
   * c'est `skinGain`.
   */
  skinTint: string;
  /** Saturation de la peau, 1 = neutre. 0 = boîtier gris, au-delà de 1 elle pousse. */
  skinSat: number;
  /**
   * Gain de la peau, 1 = neutre. PROPRE AU POSTE, contrairement à `exposure` qui est
   * globale : sur un boîtier trop clair, c'est celui-ci qu'il faut baisser.
   */
  skinGain: number;

  /* ---- Cadrage ---------------------------------------------------------- */
  /**
   * TV_FILL — la fraction de la demi-dimension visible LA PLUS CONTRAIGNANTE que le
   * poste occupe. Ce n'est pas une échelle absolue : le cadrage est recalculé sur les
   * étendues mesurées de l'objet et sur la caméra vivante, donc la molette veut dire
   * la même chose à tous les viewports.
   */
  fill: number;

  /* ---- Le rectangle lumineux sur le verre -------------------------------- */
  /**
   * Le rectangle du tube en unités de forme, paramétré en CENTRE + TAILLE plutôt qu'en
   * min/max : on déplace un écran, puis on le dimensionne — enchaîner deux coins pour
   * translater un rectangle demande de bouger quatre molettes sans en casser une. Le
   * bouton « copier » reconvertit en min/max, la forme que le shader veut.
   *
   * Repère : l'objet s'étend sur ±(PLATE_H + LINER_W + 2·FRAME_W) ≈ ±4,38.
   */
  scrX: number;
  scrY: number;
  scrW: number;
  scrH: number;

  /* ---- L'ENTRÉE : où l'on rentre dans le poste --------------------------- */
  /**
   * QUI CHOISIT L'ENDROIT OÙ L'ON RENTRE : la MESURE ou la MAIN.
   *
   * true (le défaut, et ce qu'on veut cuire si rien ne cloche) — tubeHole.ts trouve la
   * contreforme du « a » de « rabbit » en mesurant la police réellement peinte (voir son
   * en-tête). Le trou SUIT alors `textX`/`textY`/`textSize` : retoucher la frappe le
   * déplace tout seul, ce qu'aucune coordonnée écrite à la main ne peut faire.
   *
   * false — `aimX`/`aimY` ci-dessous, en pixels du canvas, prennent la place du calcul.
   * Pour viser autre chose que ce « a » (une autre lettre, un coin de l'écran) ou pour
   * corriger ce que la mesure du glyphe n'a pas su viser.
   *
   * Le panneau affiche les coordonnées du point EFFECTIF dans les deux modes — donc on peut
   * lire où la mesure a visé, et basculer sur « point » repart exactement de là, sans saut.
   */
  aimAuto: boolean;
  /**
   * LE POINT VISÉ, en pixels du canvas 512×384 — x vers la DROITE, y vers le BAS (les
   * conventions du canvas, qui porte flipY = false, comme `textX`/`textY`). Ignorés si
   * `aimAuto`.
   *
   * CE POINT EST VISÉ PAR DEUX CHOSES À LA FOIS : la caméra de plongée (formClock aligne
   * camX/camY sur `tubeMouth.holeX/holeY`, la conversion en monde de ce point) et l'axe du
   * corridor (PixelTunnel y centre son cône). Les deux lisent le MÊME point — c'est ce qui
   * garantit qu'on ne peut pas régler l'un et regarder l'autre de travers.
   */
  aimX: number;
  aimY: number;
  /**
   * LA FENÊTRE DU FONDU, en multiples de l'avance d'un caractère : la zone du canvas que le
   * corridor prélève À L'INSTANT DU CROISEMENT, et donc aussi la taille de sa bouche (la
   * tranche 0 couvre exactement l'empreinte de cette fenêtre sur le verre — voir PixelTunnel).
   *
   * ELLE PILOTE AUSSI LA TAILLE DU CORRIDOR À L'ÉCRAN, et c'est le levier pour l'agrandir : la
   * bouche EST l'empreinte de cette fenêtre sur le verre (voir PixelTunnel), donc 30 caractères
   * lui font couvrir ~70 % de la largeur du canvas au lieu de 30 %. Le corridor grandit sans que
   * l'alignement avec le texte peint se perde, puisque les deux restent la même région.
   *
   * ⚠ ELLE DÉPLACE LE PLANCHER DU RECUL DE LA BOUCHE : les cellules grandissent avec elle, donc
   * leur longueur en profondeur aussi (voir `mouthBack`). Le recul est plafonné par le calcul dans
   * PixelTunnel, donc ce couple ne peut plus se désaccorder — mais l'écart d'échelle au début du
   * croisement, lui, grandit avec le recul.
   *
   * 12 ≈ « white rabbit », ET C'ÉTAIT LA CONDITION DU FONDU. À 2 caractères (la valeur d'avant),
   * le corridor montrait le « a » et son voisin pendant que l'écran du poste affichait toute
   * la phrase : deux images de la même chose qui ne se recouvraient pas, donc une superposition
   * qu'on lit comme un décalage plutôt que comme un relais. En couvrant la même zone que
   * l'écran, le croisement devient un fondu entre deux versions du MÊME cadre — l'une lisse,
   * l'autre en blocs de phosphore, ce qui est précisément l'effet « l'image se résout en
   * pixels ».
   *
   * Le resserrement sur la lettre vient APRÈS, et c'est `zoomChars` qui le porte.
   */
  /**
   * LA CORRECTION DU TIRAGE DU VERRE, en pixels du canvas — ce qui amène la caméra sur la lettre
   * TELLE QU'ELLE EST PEINTE, et non là où la relation affine la place.
   *
   * Le fragment du tube déplace l'UV du texte de `vFormN.xy · vec2(0.10, -0.10)` pour le coudre au
   * relief du verre : jusqu'à 0.10 UV, soit ~38 px de canvas. La visée, elle, ignore ce
   * déplacement. Ces deux nombres le compensent.
   *
   * RÉGLABLES ET PLUS CUITS, parce que leur valeur dépend de l'endroit visé sur le verre : elle est
   * périmée par tout changement de lettre, de ligne, de corps de texte ou de rectangle du tube. Une
   * constante obligeait à re-mesurer au navigateur puis à recompiler à chaque fois ; ici la lettre
   * se recentre à l'œil en deux glissements, et le bouton « copier » crache la valeur.
   *
   * −2.0 / +4.8 SONT LES VALEURS RETENUES À L'ŒIL, sur le rendu complet, et elles remplacent un
   * +12.6 / −5.0 que j'avais MESURÉ au framebuffer. La mesure n'était pas fausse mais partielle :
   * prise à 1.39 écran du verre, corridor encore absent, elle centrait la lettre du seul poste. Le
   * réglage qui compte est celui du croisement, les deux scènes allumées — d'où ces molettes plutôt
   * qu'une constante, et d'où le fait que l'œil tranche ici mieux que le framebuffer.
   */
  dragX: number;
  dragY: number;
  holeWin: number;
  /**
   * LA FENÊTRE À L'ARRIVÉE, même unité : le corridor s'y resserre sur `zoomSpan` écrans de
   * plongée, ce qui grossit la contreforme du « a » jusqu'à la traverser.
   *
   * 5 ET NON 1.5, PARCE QU'UNE FENÊTRE TROP SERRÉE N'A PLUS RIEN À MONTRER. Mesuré au
   * navigateur : à 1.5 caractère, passé dive ≈ 0.5, chaque cellule échantillonne un patch
   * presque uni de la panse du « a » — les 16 tranches lisant TOUTES la même fenêtre, la paroi
   * devenait un mur vert uniforme, et baisser le taux de blocs révélait une trame qui ne
   * dessinait plus rien. Vérifié que ce n'était ni l'occlusion (image identique à `cellCut` 0
   * et 0.05) ni la seule atténuation. À 5, les parois restent des lettres jusqu'au bout.
   *
   * SEULE LA FENÊTRE BOUGE, PAS LA BOUCHE. Le prélèvement se resserre dans le shader (uSpan)
   * tandis que la géométrie du corridor reste posée sur `holeWin` : faire respirer la bouche
   * elle-même aurait rétroagi sur la cible de la caméra (`divePast` est en demi-largeurs de
   * bouche), donc une caméra qui poursuit une cible mouvante.
   */
  zoomChars: number;
  zoomSpan: number;

  /* ---- LA PLONGÉE : quand et de combien la caméra entre ------------------ */
  /**
   * CAM_DIVE_ARRIVE — LE MOMENT. La part de la plongée (0..1) que la caméra passe à
   * AVANCER ; au-delà elle est arrivée et ne bouge plus, seul le corridor défile (voir le
   * grand commentaire de formClock sur les deux phases). C'est donc le nombre qui dit
   * QUAND on passe du zoom au plan de tube.
   *
   * L'arc de luminosité du corridor repart de ce même point (PixelTunnel, uArrive) : les
   * deux ne peuvent pas se désaccorder puisqu'ils lisent cette molette-ci.
   */
  diveArrive: number;
  /**
   * CAM_DIVE_PAST_GLASS — LA DISTANCE. De combien la caméra dépasse le front du verre une
   * fois arrivée, en DEMI-LARGEURS DE LA BOUCHE du corridor (et non en unités monde, ce
   * qu'elle était : voir plus bas).
   *
   * Le défaut 2.7 place la caméra à une profondeur LOCALE de 2.7 × REF_HW ≈ 2.3 (REF_HW = 0.84
   * dans PixelTunnel), soit 2.7 × Z0 — la position que cette constante a toujours visée, juste
   * après le seuil.
   *
   * IL SE DÉPLACE AVEC Z0, ET PAS SEULEMENT PAR PROPRETÉ. Le corridor est auto-similaire le
   * long de son axe (recyclage géométrique), donc la profondeur n'a de sens que RELATIVEMENT à
   * Z0 : c'est le rapport qui décide quelles tranches sont proches, et surtout `vSc = z/Z0`,
   * qui porte l'atténuation de distance. Mesuré : à Z0 baissé de 2.2 à 0.85 sans toucher à ce
   * nombre (donc 6.9 × Z0 au lieu de 2.7), les tranches visibles passaient de vSc ≈ 13 à ≈ 37
   * et l'atténuation de 0.35 à 0.16 — un corridor éteint, sans erreur. Si Z0 rebouge dans
   * PixelTunnel, ce nombre le suit dans le même rapport. L'exprimer dans l'unité de la bouche la rend invariante :
   * elle suit le cadrage, le viewport ET `Fenêtre`, alors qu'un nombre monde devait être
   * recalibré à chaque fois que l'échelle du corridor changeait. À revoir si COLS ou CELL
   * bougent dans PixelTunnel, puisque REF_HW en dépend.
   *
   * TROP PETIT, ELLE S'ARRÊTE AU BORD DU SEUIL plutôt que dedans : elle doit atterrir un
   * peu APRÈS la première tranche du corridor (Z0 dans PixelTunnel, en unités LOCALES —
   * voir le commentaire de la constante dans formClock pour le taux de change entre les
   * deux repères, qui suit le viewport). C'est la molette à bouger si le plan de tube
   * s'ouvre sur un mur ou sur une croix géante au lieu d'un corridor.
   */
  divePast: number;
  /**
   * LE FONDU CROISÉ POSTE ↔ TUNNEL, en « écrans » de distance restante jusqu'au verre (voir
   * `screenFill` dans tubeMouth) : 1 = l'écran remplit tout juste la hauteur du cadre, 0 = on
   * touche le verre. Le poste s'éteint et le corridor s'allume sur LA MÊME fenêtre, donc les
   * deux plans se superposent pendant tout le croisement.
   *
   * `crossIn` ARBITRE LA DURÉE DU RECOUVREMENT. 0.20 est la valeur retenue : le basculement tombe
   * au ras du verre, la lettre énorme, ce qui est le geste voulu. Un 0.55 a été essayé pour faire
   * durer le recouvrement et écarté — il fait apparaître le corridor trop tôt, donc loin du verre,
   * là où il est vu plus petit que le texte peint (voir `mouthBack`).
   *
   * À GARDER EN TÊTE SI LE FONDU SEMBLE SEC : mesuré au navigateur, une fenêtre 0.13 → 0.08 tient
   * dans ~4 px de scroll — deux ou trois frames, donc une coupe plutôt qu'un fondu — quand
   * 0.65 → 0.13 en fait 54. Le levier n'est alors pas cette borne mais la vitesse de la caméra au
   * ras du verre. `crossOut` doit rester > 0 — à 0 le poste est encore là quand le plan proche
   * franchit le verre, et on voit l'intérieur du boîtier (matériaux en DoubleSide).
   */
  crossIn: number;
  /**
   * LE PALIER — la distance au verre où le corridor est ENTIÈREMENT LÀ et où le poste commence
   * seulement à partir. Entre `crossIn` et lui, le corridor monte pendant que le poste reste
   * PLEIN : les deux scènes se superposent vraiment, au lieu de se croiser à mi-valeur chacune.
   *
   * Sans ce troisième nombre, une seule rampe pilotait les deux en sens inverse — donc à
   * l'instant où l'on voyait le mieux les deux, aucune des deux n'était entière. C'est ce que
   * « le fondu est mal réalisé » désignait.
   *
   * ET LE POSTE DOIT AVOIR FINI DE PARTIR AVANT QU'ON SOIT TRÈS PRÈS, ce qui contraint `crossOut`
   * par le bas : à 0.09 écran du verre, un poste encore à 11 % laissait lire son BOÎTIER — pas son
   * écran, le corps de la machine, éclairé par l'HDRI et vu de très près — derrière le corridor.
   * D'où 0.28 / 0.13 : le corridor arrive sur 0.12 écran, le poste s'efface sur les 0.15 suivants,
   * et à 0.09 il n'y a plus que du phosphore.
   */
  crossHold: number;
  crossOut: number;
  /**
   * LA NAISSANCE DU CORRIDOR — son intensité À L'INSTANT du croisement, en fraction de son
   * intensité normale, puis `birthSpan` (en écrans, au-delà du verre) pour y monter.
   *
   * Sans ça il naissait à 1 : le poste s'effaçait pendant que le corridor arrivait à pleine
   * puissance, et le croisement se lisait comme un flash au lieu d'un relais. Un corridor qui
   * s'allume EN entrant dedans est aussi ce que la matière raconte — le phosphore répond à la
   * traversée, il ne l'attend pas.
   *
   * Se compose avec l'arc de luminosité qui existe déjà plus loin dans la plongée (PEAK dans
   * PixelTunnel, qui monte puis retombe au noir) : celui-ci gouverne les premiers instants,
   * celui-là la traversée.
   */
  birthDim: number;
  birthSpan: number;
  /**
   * LE RECENTRAGE SUR LA LETTRE : la distance au verre, en « écrans » (même unité que
   * `crossIn`/`crossOut`), à laquelle il doit être TERMINÉ. Il commence à la pose d'entrée —
   * pas à une distance réglable de plus : ancrée sur l'entrée, la rampe vaut exactement 0
   * tant que la plongée n'a pas commencé, donc le poste s'ouvre CENTRÉ SUR LUI-MÊME et
   * dérive vers la lettre seulement en approchant. Une borne de départ absolue ne pouvait pas
   * tenir cette promesse : dès que la pose d'entrée passait sous elle, la caméra visait déjà
   * la lettre à l'arrivée dans Work.
   *
   * 1.5 ÉCRAN : fini bien avant le croisement (0.40), donc la lettre ne dérive plus pendant la
   * superposition — mais assez tard pour que la courbe ait de la place entre `aimFrom` et lui.
   *
   * IL DOIT SE TERMINER LOIN, et c'est tout l'enjeu de ce nombre. L'écart au centre
   * de l'image est un écart MONDE divisé par la distance à la lettre : un retard de marche
   * qui passe inaperçu de loin explose en fin d'approche, quand le diviseur tend vers zéro.
   * Une marche calée sur `diveArrive` (ce qui était le cas) ne finissait qu'APRÈS la
   * traversée du verre — donc la lettre dérivait vers un bord pendant toute la partie où
   * elle est grosse. Fini à `aimBy` écrans, la caméra est déjà sur l'axe de la lettre avant
   * que celle-ci ne remplisse le cadre, et le plongeon se fait droit dedans.
   */
  /**
   * OÙ LE RECENTRAGE COMMENCE, en écrans — avant lui, la caméra reste centrée sur L'ORDINATEUR.
   *
   * Cette borne avait été retirée puis la rampe ancrée sur la pose d'entrée, pour garantir qu'elle
   * vaut exactement 0 au départ. Le défaut était ailleurs : ancrée sur l'entrée, la dérive commence
   * IMMÉDIATEMENT, donc le plan large n'est jamais cadré sur la machine — il glisse déjà vers la
   * lettre. Ici la caméra tient l'ordinateur au centre jusqu'à `aimFrom`, puis la courbe part.
   *
   * Bornée par la pose d'entrée (`min(aimFrom, distance à l'entrée)`) : si l'entrée est déjà plus
   * près que cette valeur, la rampe repart de l'entrée et vaut toujours 0 au départ.
   */
  aimFrom: number;
  aimBy: number;

  /* ---- LA RÉSOLUTION DU PHOSPHORE en approchant --------------------------- */
  /**
   * CE QUE DEVIENT L'ÉCRAN DU POSTE QUAND LA CAMÉRA S'EN APPROCHE (voir `uPixel` dans
   * ChromeTableau) : `pixelHalo` est le FACTEUR appliqué à la halation en fin d'approche — 1 la
   * laisse telle qu'elle est de loin, en dessous elle s'efface, AU-DESSUS elle s'intensifie. À
   * 1.35, le phosphore bave de plus en plus fort à mesure qu'on entre dans l'écran, ce qui est le
   * geste voulu ; la borne de la barre monte à 3. `pixelGamma` est l'exposant de la courbe qui
   * écrase les demi-teintes — 0 = AUCUNE
   * courbe, donc l'image de loin (le facteur vaut `pow(luma, exposant)`, qui ne vaut 1 qu'à
   * l'exposant nul ; la réponse effective du tube est donc luma^(1+exposant), à comparer au
   * BLOOM_P = 2.4 du corridor).
   *
   * `pixelHalo` = 1 ET `pixelGamma` = 0 redonnent EXACTEMENT l'image d'avant cette mécanique,
   * au bit près — utile pour juger ce qu'elle coûte en définition.
   *
   * ILS EXISTENT PARCE QU'UNE COURBE PONCTUELLE NE PEUT PAS SÉPARER LE TROU DES BORDS. La
   * contreforme du « a » est un gris à ~31 % (mesuré : 67 sur 211) — mais les bords antialiasés
   * du glyphe le sont aussi. Un `pow` les traite donc identiquement : à 1.4, le cœur du trait
   * perd 23 % quand un bord faible en perd 72 %, et les lettres maigrissent. D'où deux doses
   * réglables au lieu d'une valeur cuite, et un défaut prudent.
   *
   * LA VRAIE SÉPARATION SERAIT SPATIALE, pas tonale : le halo cuit dans le canvas fait ~22 px
   * (c'est lui qui remplit la contreforme) là où l'antialiasing en fait ~1. Repeindre le canvas
   * avec un `shadowBlur` réduit — une seconde texture, mélangée avec la première en
   * approchant — ouvrirait le trou SANS toucher aux bords. Non fait : ça coûte un sampler et
   * un repaint de plus, et ces deux molettes disent d'abord si le jeu en vaut la chandelle.
   */
  pixelHalo: number;
  pixelGamma: number;

  /* ---- LE CORRIDOR : sa grille et sa profondeur --------------------------- */
  /**
   * LA RÉSOLUTION DE LA GRILLE, en multiples de la grille de référence 48×36. C'est le nombre
   * de « pixels » du corridor : à 1, une lettre de la fenêtre de 12 caractères ne fait que
   * ~4 blocs de large, ce qui lit comme des rectangles plutôt que comme du texte traversé.
   *
   * LA TAILLE DE CELLULE COMPENSE, ET C'EST CE QUI REND LA MOLETTE UTILISABLE. `CELL` est
   * dérivée de la résolution pour que `(COLS/2)·CELL` — la demi-largeur de la grille de
   * référence, donc la BOUCHE du corridor et l'angle de son cône — reste invariante. Sans ça,
   * doubler la résolution doublerait l'angle du cône (voir Z0 dans PixelTunnel) et déplacerait
   * la cible de la caméra du même coup : la molette aurait changé trois choses à la fois.
   *
   * COLS et ROWS restent exactement 4:3 (des multiples de 4 et 3), la condition pour que les
   * cellules soient carrées — voir leur commentaire dans PixelTunnel.
   *
   * LE COÛT, MESURÉ AU NAVIGATEUR (dans le corridor, médiane sur 40 à 120 frames) — le nombre
   * d'instances vaut COLS·ROWS·tranches, donc ×4 quand cette molette double :
   *
   *    48×36   ·  28k : 15.8 ms        192×144 · 442k : 25 ms  (40 fps)
   *    96×72   · 111k :  8.4 ms        240×180 · 691k : 42 ms  (24 fps)
   *   144×108 · 249k :  9 à 17 ms      288×216 · 995k : 50 ms  (20 fps)
   *   168×126 · 339k :  9.1 ms
   *
   * DEUX CHOSES À LIRE LÀ-DEDANS. Sous ~350k le coût ne suit PAS le nombre d'instances et les
   * mesures sont bruitées — une grille grossière est même reproductiblement plus lente qu'une
   * fine. La cause n'est pas isolée (le `discard` du fragment désactive le rejet early-Z, donc
   * le coût suit la surface couverte plutôt que le compte d'instances, mais ça n'explique pas
   * tout l'écart). Au-delà de ~450k, en revanche, la dégradation est franche et monotone.
   *
   * D'où le défaut à 3 et la barre bornée à 5 : au-delà on paye vraiment, et la mesure ci-dessus
   * a été prise sur une machine de développement — donc à refaire, plus bas, avant de cuire une
   * valeur pour la prod.
   */
  gridScale: number;
  /**
   * Le nombre de tranches recyclées — la densité de plans qu'on traverse. Plus il y en a, plus
   * la profondeur se lit ; le coût est linéaire (voir gridScale).
   */
  slices: number;
  /**
   * LE BLOC EST-IL UNE PLAQUE (4 sommets) OU UN CUBE (24) ? — LE SEUL RÉGLAGE QUI CHANGE L'ORDRE
   * DE GRANDEUR DU COÛT.
   *
   * Mesuré à dive 0.8, une fois le tri des cellules remonté dans le vertex shader (voir
   * PixelTunnel) : le corridor est VERTEX-BOUND, pas fill-bound — 6,2 M blocs × 24 sommets =
   * 150 M sommets par frame, soit 203 ms. Le nombre d'instances qu'on peut se payer est donc
   * fixé par les sommets qu'elles coûtent, et une plaque en coûte SIX FOIS MOINS qu'un cube.
   *
   * CE QUE LA PLAQUE PERD : l'épaisseur en profondeur (`FILL_Z`, sans effet sur une plaque), donc
   * les faces latérales qu'on aperçoit sur les bords du cadre et le remplissage des interstices
   * ENTRE tranches. À la taille où ces blocs se voient (fillXY 0.2 d'une case, elle-même une
   * fraction de l'écran), c'est à juger à l'œil — d'où le bouton plutôt qu'un choix cuit.
   */
  blockQuad: boolean;
  /**
   * FILL_XY — la part de sa case qu'un bloc occupe, DE LOIN puis DEDANS (`fillIn`). C'est la
   * largeur des interstices, donc la lisibilité de la trame : à 1 les blocs se touchent et la
   * grille disparaît, plus bas ils se détachent un à un.
   *
   * Interpolé sur l'avancée de la traversée — la même que le défilement (voir uTravel) : de
   * loin l'image reste une image, et à mesure qu'on entre les blocs se séparent, donc on voit
   * de quoi elle était faite. C'est aussi ce qui laisse VOIR À TRAVERS : les cellules éteintes
   * écrivent la profondeur (voir `cellCut`), donc sans interstices les parois lointaines sont
   * masquées par les proches.
   */
  fillXY: number;
  fillIn: number;
  /**
   * G — la croissance géométrique d'une tranche à la suivante. Gouverne l'espacement des plans
   * en profondeur (et donc la vitesse apparente du défilement), PAS l'angle du cône.
   */
  growth: number;
  /**
   * ATTEN_K — l'atténuation avec la profondeur, en 1/(1+k·(échelle−1)). Le repère de distance
   * du corridor : à 0 toutes les tranches sont aussi lumineuses et la profondeur s'aplatit.
   */
  atten: number;
  /**
   * DISCARD_FRAC — le rayon, en multiples de la profondeur de la caméra, dans lequel les
   * cellules sont RETIRÉES. C'est ce qui empêche la tranche la plus proche de remplir l'écran
   * (voir Z0 dans PixelTunnel) ; le baisser rapproche les parois, le monter creuse le vide
   * devant la caméra.
   *
   * ET C'EST LE RÉGLAGE QUI DÉCIDE SI L'ON VOIT LES BLOCS GROSSIR — la raison est géométrique.
   * Dans ce cône auto-similaire, la taille d'un bloc ET son écart à l'axe sont proportionnels à sa
   * profondeur, donc son angle vu depuis la caméra vaut θ∞ / (1 − camDepth/z) : CONSTANT tant que
   * z ≫ camDepth. Le champ lointain est un motif fixe, et le grossissement n'existe que dans les
   * dernières unités avant la caméra. À 4 (l'ancienne valeur), tout bloc plus proche que
   * 5 × camDepth était retiré — là où ce facteur ne vaut encore que 1.25 : les blocs mouraient
   * juste avant de commencer à grossir, et ce qui restait était le motif statique dont des rangs
   * apparaissaient au fond et disparaissaient à rayon fixe. Le cône étant auto-similaire, le rang
   * suivant ressemble au précédent — l'œil lit un va-et-vient, pas une progression. Rapporté à
   * l'écran, puis mesuré : « on ne voit jamais le trou s'élargir ».
   *
   * À 0.4 le facteur atteint 2.1 et les stries filent jusqu'aux bords. Ça n'a été possible qu'avec
   * `cellCut` > 0 : sans lui, la tranche proche qu'on vient d'exposer amène son plancher de
   * cellules NOIRES, opaques et écrivant la profondeur, qui masque tout le corridor derrière —
   * l'image devenait noire au lieu de devenir vivante. Coût mesuré à dive 0.68 : 28 ms à 4.0,
   * 30 ms à 0.4 — le retrait ne se paye quasiment pas.
   */
  discard: number;

  /**
   * PEAK — le sommet de l'arc de luminosité : combien le corridor luit au plus fort de la
   * traversée, en multiples de son intensité de croisière. L'arc monte jusque-là puis retombe à
   * 0 exactement à la fin de la plongée (voir le fragment) — c'est déjà le fondu au noir de la
   * sortie, pas un assombrissement vers une couleur de repos.
   */
  peak: number;
  /**
   * LE CORRIDOR BOUCLE-T-IL, OU LE TRAVERSE-T-ON UNE FOIS ? — le geste, pas un réglage d'image.
   *
   * false (le défaut) : chaque tranche vient à la caméra UNE fois, passe, et ne revient pas. À la
   * fin il ne reste que les dernières tranches, les plus larges, qui s'écartent puis dégagent —
   * on SORT du tube, ce qui enchaîne sur le fondu au noir. Le corridor a une fin.
   *
   * true : `recycle` (voir tunnelGeom.ts) ramène au fond toute tranche passée trop près, donc le
   * corridor est sans fond et sans sortie. C'était le comportement d'origine, gardé parce que le
   * code qui le porte est prouvé (tunnelGeom.test.ts) et qu'un tunnel sans fin est un geste
   * défendable — simplement pas celui-ci.
   */
  /**
   * LA FORME DU CORRIDOR — UN PUITS DROIT (true, le défaut) OU LE CÔNE AUTO-SIMILAIRE (false).
   *
   * C'est le seul réglage qui décide si l'on VOIT les pixels grossir, et la raison est
   * démontrable plutôt que affaire de goût. Dans le cône, la tranche k est à z0·(1+g)^(k−travel)
   * et la taille d'un bloc COMME son écart à l'axe sont tous deux ∝ z, toutes les tranches
   * échantillonnant la même fenêtre du canvas : avancer `travel` de 1 fait donc prendre à chaque
   * tranche la place, la taille ET l'image de sa voisine. L'image rendue est EXACTEMENT périodique
   * de période un cran — un zoom infini à la Droste. Les blocs s'écartent, meurent au rayon de
   * retrait, l'image se réinitialise : aucune progression n'est visible, par construction. C'est
   * ce que « on a l'impression de faire avant/arrière » décrivait, et aucune molette ne pouvait
   * le corriger — l'auto-similarité EST la boucle, donc couper `recycle` n'y suffisait pas.
   *
   * Le puits garde la section constante (la fenêtre de la lettre, extrudée en profondeur), espace
   * ses tranches de `tubeStep` et laisse aux blocs leur taille : un bloc à distance d couvre
   * taille/d, donc il grossit vraiment en approchant, rien ne se répète, et la sortie est littérale
   * — les derniers blocs filent hors cadre.
   *
   * Le cône reste accessible : il donne l'image dense et striée d'un tunnel sans fin, qui est un
   * geste défendable — simplement pas « on rentre, on pénètre, on ressort ».
   */
  tubeShaft: boolean;
  /**
   * LE PAS ENTRE DEUX TRANCHES DU PUITS, en demi-largeurs de la bouche (voir REF_HW dans
   * PixelTunnel, où la conversion est faite). C'est le rapport pas/largeur qui décide si ça se lit
   * comme un TUYAU court qu'on enfile vite ou comme un long couloir : à 1 les tranches sont aussi
   * espacées que la bouche est large, en dessous elles se serrent et la trame devient un continuum.
   * Sans effet sur le cône, dont l'espacement est géométrique (`growth`).
   */
  tubeStep: number;
  /**
   * LA PAROI DU PUITS EST-ELLE CONTINUE ? — la part du pas qu'un bloc occupe EN PROFONDEUR.
   *
   * C'est le réglage qui décide si l'on voit UN tunnel ou QUARANTE anneaux, et c'est ce qui
   * empêchait de voir le bout s'élargir. Un tunnel n'a qu'une ouverture, celle du fond : en
   * approchant, son angle croît de façon monotone jusqu'à dépasser le cadre — on sort. Avec des
   * anneaux séparés (blocs courts en Z, donc du vide entre les tranches), CHAQUE anneau a la
   * sienne : la plus proche grandit, passe, et la suivante — plus petite puisque plus loin — prend
   * le relais. Rapporté à l'écran : « je le vois grossir puis de nouveau petit, du fait des
   * répétitions ». Aucun réglage de forme ni de vitesse ne pouvait le corriger, c'est la
   * SEGMENTATION de la paroi qui le causait.
   *
   * À 1 les blocs se touchent d'une tranche à l'autre : la paroi est un mur continu, la trame de
   * pixels reste lisible latéralement, et il ne reste qu'une seule ouverture. En dessous, la paroi
   * se découpe en anneaux — utile si on veut au contraire sentir qu'on franchit des plans, mais
   * alors le bout du tunnel ne se lit plus.
   */
  tubeWall: number;
  /**
   * LA PAROI À LA SORTIE — la même grandeur que `tubeWall`, mais à la FIN de la traversée, et
   * c'est ce couple qui anime la sortie.
   *
   * Même motif que `fillXY`/`fillIn` (les blocs se séparent latéralement à mesure qu'on entre) et
   * interpolé sur la même avancée, pour que les deux racontent un seul mouvement : la paroi part
   * CONTINUE — donc un tunnel avec une seule ouverture au fond, qui grandit — et se DÉCOUPE en
   * chemin. Les blocs s'écartent en profondeur comme ils s'écartent en largeur, le mur devient une
   * grille, la grille devient des points, et le tube se dissout au moment où on en sort.
   *
   * L'ordre importe : commencer segmenté puis fermer la paroi produirait l'effet inverse (un
   * tunnel qui se referme), et c'est en partant de « continue » que le bout du tunnel se lit —
   * voir `tubeWall`.
   */
  tubeWallIn: number;
  /**
   * OÙ LA DISSOLUTION EST TERMINÉE, en % de la traversée (même unité que `fallAt`) — c'est-à-dire
   * l'instant où `Paroi` et `Blocs` atteignent leurs valeurs de fin.
   *
   * IL A ÉTÉ DÉDUIT DE `fallAt`, ET C'ÉTAIT FAUX. Le raisonnement — « la dissolution doit être
   * pleine quand le fondu s'amorce, sinon ses bornes de fin ne se voient jamais » — reste juste,
   * mais l'instant où l'image meurt À L'ÉCRAN ne se lit pas dans `fallAt` : constaté en scrollant,
   * la course s'achève visuellement vers 68 % de la dissolution, où la paroi valait encore 0.37 et
   * les blocs 0.29 au lieu de 0.10 et 0.20. Un nombre dérivé d'une hypothèse sur la fin, dans une
   * chorégraphie dont la fin dépend du scroll réel, ne pouvait pas tomber juste — d'où une molette
   * plutôt qu'une formule, calée à l'œil contre la ligne « Anime » du panneau.
   */
  dissolveAt: number;
  tunnelLoop: boolean;
  /**
   * OÙ COMMENCE LE FONDU AU NOIR sur la traversée (0 = dès l'arrivée du corridor, 1 = jamais).
   *
   * Il valait 0.45, cuit dans le shader, et c'était trop tôt d'un geste entier : en traversée
   * unique, les dernières tranches — les plus larges — s'écartent et dégagent sur la toute fin,
   * et c'est ÇA la sortie du tube. Mesuré, à dive 0.979 le corridor était bien épuisé mais l'arc
   * l'avait déjà éteint à ~7 % : la sortie se jouait dans le noir. Plus haut, on voit le tube
   * s'ouvrir avant que tout s'éteigne — ce qui enchaîne sur la page noire et les planches.
   */
  fallAt: number;
  /**
   * COMBIEN DE CORRIDOR ON TRAVERSE sur ce qui reste de la plongée après le croisement, en
   * multiples de sa longueur entière (« tranches » crans, chaque cran multipliant la profondeur
   * par 1 + `growth`). À 1, la dernière tranche arrive pile à la fin de la plongée : on ressort
   * juste au moment où tout s'éteint. En dessous, on s'arrête AVANT d'être sorti ; au-dessus, on
   * finit dans le vide, le corridor épuisé.
   *
   * ENTIER SEULEMENT EN MODE BOUCLE (`tunnelLoop`) : là, `recycle` est périodique de période
   * « tranches » (tunnelGeom.test.ts), donc seul un nombre entier de tours fait coïncider « la
   * plongée est finie » et « le corridor a bouclé pile » — à 1.5 la traversée s'arrêterait au
   * milieu d'un cycle, sur un saut de position des tranches. Sans boucle, cette contrainte
   * n'existe pas : rien ne se répète, donc rien ne peut sauter.
   */
  cycles: number;
  /**
   * DE COMBIEN LA BOUCHE DU CORRIDOR SE TIENT DERRIÈRE LE VERRE, en « écrans ».
   *
   * ELLE NE PEUT ÊTRE NI À ÉGALITÉ NI LOIN, et c'est tout l'enjeu de ce nombre. À égalité (0) le
   * corridor est à la même profondeur que la surface du verre : opaque et écrivant la profondeur,
   * il gagne et MASQUE le texte peint — plus de superposition, donc plus de fondu croisé, juste
   * un remplacement. Trop loin, il est vu plus petit que ce texte : mesuré, l'ancien ancrage (le
   * sommet du cône sur le verre, la tranche 0 restant à Z0 derrière) donnait un rapport d'échelle
   * de ~1.8 — deux images du même mot qui ne coïncidaient qu'en leur centre.
   *
   * Le rapport vaut 1 + recul / (distance de la caméra au verre). 0.13 est la valeur retenue à
   * l'œil, et elle a une raison géométrique que le calcul confirme : les cellules ne sont pas des
   * plaques mais des TUBES (voir FILL_Z), et leur demi-longueur en profondeur — estimée à ~0.064
   * écran pour la grille retenue — doit tenir derrière le verre. En dessous, elles le TRAVERSENT :
   * opaques, elles masquent alors le texte peint dans le rectangle de la bouche pendant que le
   * reste de l'écran reste visible autour, ce qui se lit comme deux canvas côte à côte. 0.13 laisse
   * le double de marge, au prix d'un écart d'échelle plus marqué au début du croisement.
   */
  mouthBack: number;
  /**
   * REST — le masque de phosphore éteint, en fraction de sa couleur. 0 = les cellules sans
   * lumière ne portent RIEN, donc le trou de la lettre est du vide.
   */
  restLevel: number;
  /**
   * À 0.03 — LA VALEUR RETENUE, ET ELLE A ÉTÉ À 0. Ce 0 tenait tant que la tranche proche était
   * retirée très tôt (`discard` 4) : ses cellules noires n'avaient pas le temps de compter. En
   * baissant le retrait pour qu'on VOIE enfin les blocs grossir (voir `discard`), elles arrivent
   * plein cadre, et comme le matériau écrit la profondeur elles masquent tout le corridor derrière
   * — le corridor devenait noir, constaté à l'écran. Un seuil positif retire le vide au lieu de le
   * peindre en noir, ce qui est aussi la demande d'origine au mot près : « à l'intérieur des
   * lettres, noir COMME S'IL N'Y AVAIT PAS DE BLOCS ». 0.03 suffit — il ne touche que les cellules
   * quasi éteintes, bien en dessous de la contreforme du « a » (0.26, voir le repère plus bas).
   *
   * Ce qui suit vaut donc pour l'ancien 0 :
   *
   * ⚠ RIEN N'EST RETIRÉ ET LE CORRIDOR DEVIENT UN MUR NOIR. Le matériau écrit la profondeur :
   * une cellule éteinte est un bloc noir, pas du vide. Pendant le fondu, ce mur APPARAÎT par-dessus
   * le poste — un grand rectangle noir qui monte au milieu de l'image, constaté à l'écran — et plus
   * loin il masque les parois lointaines. 0.1 retire les cellules que le canvas laisse sombres tout
   * en gardant les lettres entières : voir plus bas ce que valent les luminances réelles.
   *
   * LE SEUIL SOUS LEQUEL UNE CELLULE N'EXISTE PAS, en luminance du canvas (0..1) — retirée,
   * pas noircie : le matériau écrit la profondeur, donc une cellule noire masquerait la paroi
   * derrière elle (voir son commentaire dans le fragment).
   *
   * Repère mesuré sur le canvas réel : la contreforme du « a » est à 0.26 (67 sur 255, le halo
   * cuit du phosphore), les bords antialiasés entre 0.40 et 0.63, le cœur des traits à 0.83.
   * Un seuil à 0.33 retire donc le trou et garde la lettre entière ; au-delà de 0.45 les
   * lettres commencent à se creuser par les bords.
   */
  cellCut: number;

  /**
   * LE CALAGE FIN DE L'ÉCRITURE DU CORRIDOR, en pixels du canvas — décale ce qu'il PRÉLÈVE, pas
   * où il est posé (voir son usage dans PixelTunnel).
   *
   * POURQUOI UN RÉGLAGE À L'ŒIL ICI, alors que tout le reste est mesuré : un cône montre la
   * MÊME fenêtre à une échelle différente sur chacune de ses tranches. Il n'existe donc pas
   * d'alignement exact avec l'écran plat du poste — seulement un alignement de la tranche qui
   * DOMINE l'image à l'instant du croisement, et laquelle domine dépend du retrait, du nombre
   * de tranches et de la course de la caméra. Le défilement qui part du croisement (voir
   * uTravel) met la tranche 0 à la bouche ; ces deux nombres finissent le travail.
   */
  corrX: number;
  corrY: number;

  /* ---- Le texte dans le canvas du tube ---------------------------------- */
  /**
   * Où l'invite est peinte dans le canvas 512×384, en pixels depuis le coin HAUT
   * GAUCHE (le canvas porte flipY = false, donc y descend comme en 2D).
   */
  textX: number;
  textY: number;
  /** Le corps du glyphe, px. 30 sur un canvas de 384 de haut ≈ 12 lignes. */
  textSize: number;
  /** Le halo de phosphore cuit dans la texture (shadowBlur), px. */
  textGlow: number;
  /**
   * Force l'état FINAL de la séquence (dernière phrase, curseur allumé) : on cale un texte
   * sur ce qu'il sera, pas sur une frappe en cours qui change de largeur sous la molette.
   */
  textFull: boolean;
  /**
   * Les phrases s'EMPILENT (un vrai terminal, les précédentes restent affichées) ou
   * s'EFFACENT l'une l'autre (le geste du film : chaque message seul sur un écran noir).
   * Défaut : effacement — c'est ce que les trois phrases citées évoquent.
   */
  textStack: boolean;
  /**
   * Une lettre toutes les… secondes. Le débit d'une ligne série, pas d'une main.
   *
   * RÉGLABLE parce que la séquence est passée à trois phrases : à 0.07 s la lettre, plus
   * les pauses, le déroulé complet dure une dizaine de secondes — davantage que ce qu'un
   * lecteur pressé passe dans la section. C'est le premier nombre à serrer si la dernière
   * phrase n'a pas le temps d'arriver.
   */
  textChar: number;
  /** La pause après une phrase avant que la suivante commence, secondes. */
  textHold: number;
  /**
   * Bumpé dès qu'une molette de texte bouge — le tube ne repeint son canvas qu'au
   * CHANGEMENT D'ÉTAT (c'est ce qui garde le coût à trois ordres de grandeur sous une
   * frame), donc sans ce nonce un déplacement n'apparaîtrait qu'au clignotement
   * suivant, jusqu'à une demi-seconde plus tard. Bumpé par `set()` lui-même : le
   * panneau ne peut pas l'oublier.
   */
  textNonce: number;
  /** Bumpé par replay() : rembobine l'horloge du tube, l'attente et la frappe rejouent. */
  replayNonce: number;
};

/**
 * LES VALEURS DE LA SOURCE. envInt/envRot sont importés de formField plutôt que recopiés —
 * le jour où la constante bouge là-bas, le panneau s'ouvre sur la bonne valeur au lieu de
 * mentir.
 *
 * L'ENTRÉE ET LA PLONGÉE (aimAuto…crossOut) SONT LES VALEURS DE LA SOURCE, PAS D'UN RÉGLAGE :
 * ce sont les constantes que ces molettes remplacent, recopiées à l'identique le jour où
 * elles sont devenues réglables — 0/0 pour le décalage du trou (donc le trou MESURÉ par
 * tubeHole, intact), et les nombres calculés de formClock (CAM_DIVE_ARRIVE,
 * CAM_DIVE_PAST_GLASS) et de tubeHole (WINDOW_CHARS) pour les autres. `crossIn`/`crossOut`
 * sont les seuls nombres NEUFS : ils remplacent DIVE_FADE_START/END, qui réglaient la même
 * chose sur un `dive` brut au lieu de la distance au verre. Ouvrir le panneau ne change donc rien à l'image tant
 * qu'on n'a pas traîné une barre.
 *
 * TOUT LE RESTE VIENT D'UNE SESSION DE RÉGLAGE (2026-08-05), pas de la mesure d'origine.
 *
 * L'ÉCRAN A ÉTÉ RE-DÉRIVÉ D'UNE MESURE, PAS D'UNE CAPTURE. Les valeurs d'avant — centre
 * (-1.298, 1.434), 2.150 × 1.842 — avaient été relevées à l'œil, et elles collaient le canvas au
 * coin HAUT-GAUCHE de l'écran du poste en n'en couvrant que 56 % de la largeur. Mesuré au
 * framebuffer (le creux sombre du tube encadré par le boîtier clair, à comparer aux quatre coins
 * du canvas projetés par la visée manuelle), sur le viewport 1512×863 :
 *
 *   écran du poste : -244 → +144 px (388 de large), -230 → +59 px (289 de haut)
 *   canvas d'avant : -238 → -21 px (217 de large), -233 → -48 px (185 de haut)
 *
 * D'où le facteur 1.79 en largeur et 1.56 en hauteur, et le recentrage : centre (-0.51, 0.88),
 * 3.85 × 2.88. Le rapport tombe à 1.34, celui de l'écran mesuré, quand le canvas vaut 1.333
 * (512/384) — l'agrandissement ne déforme donc rien.
 *
 * C'EST LE BON LEVIER POUR GROSSIR LE TEXTE, et pas son corps : à corps constant, le texte
 * grandit dans le même rapport (1.79) sans qu'une ligne d'habillage change. Grossir la police,
 * lui, coûte un caractère par ligne à chaque cran (voir tubeLines). Le texte suit : descendu à y = 30, corps 31 px, et un halo poussé à 22.5 — trois
 * fois celui d'origine, un phosphore qui bave franchement dans le verre.
 *
 * LE CADRAGE : `fill` remonté à 0.5 pour que le poste — et donc le texte de son écran —
 * paraisse plus grand. Il était descendu à 0.42 (en passant par 0.32, trop petit), puis remonté
 * quand grossir le seul texte s'est avéré coûter une ligne d'habillage pour rien : c'est
 * l'objet entier qu'il fallait rapprocher, pas le corps du texte. Ce n'est pas neutre pour la plongée : le rectangle du
 * tube, et avec lui `tubeMouth.frontZ`, rétrécit d'autant ; voir la note de
 * DIVE_FADE_START/END dans ChromeTableau.
 *
 * LA PEAU A CHANGÉ DE RÉGIME. sRGB (donc le décodage que GLTFLoader posait de lui-même),
 * teinte grise à 0.734 de net (#c2c2c2 × gain 1.36), saturation tombée à 0.36 et vernis
 * monté à 1.3 : le boîtier beige devient un gris graphite verni. Ce réglage va AVEC
 * `toneMappingExposure: 0.3` dans ChromeCanvas — sans lui le poste est bien plus clair que
 * ce qui a été validé. Les deux ne se déplacent pas séparément.
 */
const DEFAULTS: Omit<PosteTweak, "textNonce" | "replayNonce"> = {
  env: "local",
  envInt: ENV_INTENSITY,
  envRot: ENV_ROT_Y,
  revealAuto: true,
  // 0 : basculer sur « manuel » montre immédiatement le chrome, l'état où l'HDRI se voit.
  reveal: 0,
  skinSrgb: true,
  skinFres: 1.3,
  skinTint: "#c2c2c2",
  skinSat: 0.36,
  skinGain: 1.36,
  fill: 0.5,
  scrX: -0.51,
  scrY: 0.88,
  scrW: 3.85,
  scrH: 2.88,
  aimAuto: true,
  // Le centre du canvas — jamais utilisé tant que `aimAuto` tient, et remplacé par le point
  // mesuré à la seconde où on bascule (voir le panneau) : ces deux nombres ne sont un défaut
  // que pour le premier rendu, pas une visée que quelqu'un aurait choisie.
  aimX: 256,
  aimY: 192,
  dragX: -2,
  dragY: 4.8,
  holeWin: 8,
  zoomChars: 5,
  zoomSpan: 0.6,
  diveArrive: 0.5,
  divePast: 2.7,
  crossIn: 0.06,
  crossHold: 0.04,
  crossOut: 0.03,
  birthDim: 0.4,
  birthSpan: 1,
  aimFrom: 3.5,
  aimBy: 1.5,
  gridScale: 5.5,
  slices: 40,
  blockQuad: true,
  fillXY: 0.48,
  fillIn: 0.2,
  growth: 0.59,
  atten: 0,
  discard: 0.6,
  mouthBack: 0.06,
  peak: 2.8,
  cycles: 1,
  tubeShaft: true,
  tubeStep: 0.2,
  tubeWall: 0.95,
  tubeWallIn: 0.1,
  dissolveAt: 0.5,
  tunnelLoop: false,
  fallAt: 0.8,
  restLevel: 0,
  cellCut: 0,
  corrX: 0,
  corrY: 0,
  pixelHalo: 0.85,
  pixelGamma: 1.15,
  textX: 12,
  textY: 30,
  textSize: 20,
  textGlow: 14,
  textFull: false,
  textStack: false,
  textChar: 0.07,
  textHold: 1.6,
};

/** Les clés dont le mouvement oblige le tube à repeindre son canvas. */
/*
 * `textChar` et `textHold` n'y sont PAS, et ce n'est pas un oubli : elles changent le
 * déroulé, pas la mise en page. L'horloge dérive (ligne, caractères) de l'instant à chaque
 * frame, donc les bouger fait bouger cet état, et la comparaison d'état repeint d'elle-même.
 */
const TEXT_KEYS = [
  "textX",
  "textY",
  "textSize",
  "textGlow",
  "textFull",
  "textStack",
] as const;

let state: PosteTweak = { ...DEFAULTS, textNonce: 0, replayNonce: 0 };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const posteTweak = {
  get: (): PosteTweak => state,
  set(patch: Partial<PosteTweak>) {
    const repaint = TEXT_KEYS.some((k) => k in patch);
    state = { ...state, ...patch, textNonce: state.textNonce + (repaint ? 1 : 0) };
    emit();
  },
  replay() {
    state = { ...state, replayNonce: state.replayNonce + 1 };
    emit();
  },
  reset() {
    state = {
      ...DEFAULTS,
      textNonce: state.textNonce + 1,
      replayNonce: state.replayNonce,
    };
    emit();
  },
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

/**
 * UN HUBLOT DE DÉVELOPPEMENT — `window.__poste` en dev, rien en prod. Même motif que
 * `window.__form` (formClock) et `window.__tunnel` (PixelTunnel) : le store est un singleton
 * de module, donc assignable une fois pour toutes hors composant. Sert à MESURER (régler une
 * barre depuis un script et lire le coût de frame) sans avoir à cliquer dans le panneau, et
 * accessoirement à rejouer un état exact d'une session à l'autre.
 */
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__poste = posteTweak;
}

export function usePosteTweak(): PosteTweak {
  return useSyncExternalStore(posteTweak.subscribe, posteTweak.get, posteTweak.get);
}

/**
 * S'abonner au SEUL nom d'environnement. C'est la seule molette qui ne peut pas se lire
 * par frame : changer d'HDRI change une RESSOURCE, donc il faut un rendu React (le hook
 * de drei re-suspend et recharge). Un `usePosteTweak()` complet dans ChromeTableau aurait
 * fait re-rendre la scène à chaque pixel de drag sur les onze autres barres — même motif
 * que useBlobOpen dans blobTweak : un primitif, un abonnement étroit.
 */
/**
 * S'abonner à la SEULE clé qui oblige PixelTunnel à reconstruire son tableau d'instances : la
 * résolution de la grille et le nombre de tranches. Rendue comme une CHAÎNE et non comme un
 * objet — `useSyncExternalStore` compare les snapshots par identité, donc un objet neuf à
 * chaque lecture ferait boucler le rendu. Même motif que `usePosteEnv` juste en dessous : un
 * primitif, un abonnement étroit, pour ne pas re-rendre la scène à chaque pixel de drag sur
 * les vingt autres barres.
 */
export function useTunnelGrid(): string {
  const key = () => {
    const s = posteTweak.get();
    return `${s.gridScale}|${Math.round(s.slices)}|${s.blockQuad ? "q" : "c"}`;
  };
  return useSyncExternalStore(
    posteTweak.subscribe,
    key,
    () => `${DEFAULTS.gridScale}|${DEFAULTS.slices}|${DEFAULTS.blockQuad ? "q" : "c"}`
  );
}

export function usePosteEnv(): PosteEnv {
  return useSyncExternalStore(
    posteTweak.subscribe,
    () => posteTweak.get().env,
    () => DEFAULTS.env
  );
}

/**
 * S'abonner au seul espace couleur de la peau. Comme l'environnement, ce n'est pas une
 * valeur par frame mais une PROPRIÉTÉ DE TEXTURE : trois.js la lit à la compilation du
 * sampler, donc il faut repasser par l'effet qui la pose (et un needsUpdate).
 */
export function usePosteSkinSrgb(): boolean {
  return useSyncExternalStore(
    posteTweak.subscribe,
    () => posteTweak.get().skinSrgb,
    () => DEFAULTS.skinSrgb
  );
}

/**
 * Un hex de picker vers trois flottants GLSL — EN LINÉAIRE, et c'est tout l'enjeu.
 *
 * Le panneau passe la teinte à `Color.set(hex)`, et three, gestion de couleur activée
 * (le défaut depuis r152, et R3F ne la désactive pas), DÉCODE sRGB→linéaire à cet
 * instant : l'uniforme ne porte donc jamais les octets du picker. Cracher `#8a7f6a`
 * tel quel dans un `vec3(0.54, 0.50, 0.42)` donnerait une teinte visiblement plus
 * claire que celle réglée — le code cuit ne reproduirait pas l'image validée. On refait
 * donc ici exactement la conversion que three a faite.
 */
function hexToGlsl(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "1.0, 1.0, 1.0";
  const int = parseInt(m[1], 16);
  const srgbToLinear = (c: number) =>
    c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
    .map((b) => srgbToLinear(b / 255).toFixed(4))
    .join(", ");
}

/**
 * L'état courant sous la forme que la SOURCE attend, prêt à coller. Le rectangle
 * repasse en min/max (ce que le shader lit) et les flottants sont coupés à la précision
 * à laquelle ils ont été relevés — un 1.2539999999999998 dans un fichier est du bruit.
 */
export function posteTweakAsSource(): string {
  const s = state;
  const n = (v: number, d = 3) => v.toFixed(d).replace(/\.?0+$/, "");
  return [
    ...(s.env === "local"
      ? []
      : [
          `// ⚠ ENVIRONNEMENT « ${s.env} » : c'est un preset drei servi par un CDN.`,
          `// Avant de cuire ces nombres : rapatrier le .hdr dans public/env/, le pointer`,
          `// depuis ENV_FILE, et ajouter son crédit à ATTRIBUTIONS.md.`,
          ``,
        ]),
    `// src/lib/formField.ts`,
    `export const ENV_INTENSITY = ${n(s.envInt, 2)};`,
    `export const ENV_ROT_Y = ${n(s.envRot, 2)};`,
    ``,
    `// src/components/chrome/ChromeTableau.tsx`,
    `tex.colorSpace = ${s.skinSrgb ? "SRGBColorSpace" : "NoColorSpace"};`,
    `// dans FRAG_FRAME — l'étalonnage de la peau`,
    ...(s.skinTint.toLowerCase() === "#ffffff" && s.skinGain === 1
      ? []
      : [`skin *= vec3(${hexToGlsl(s.skinTint)}) * ${n(s.skinGain, 2)};`]),
    ...(s.skinSat === 1
      ? []
      : [`skin = mix(vec3(dot(skin, vec3(0.2126, 0.7152, 0.0722))), skin, ${n(s.skinSat, 2)});`]),
    `skin += skin * fres * ${n(s.skinFres, 2)};`,
    `const TV_FILL = ${n(s.fill, 3)};`,
    `const scrMin = new Vector2(${n(s.scrX - s.scrW / 2)}, ${n(s.scrY - s.scrH / 2)});`,
    `const scrMax = new Vector2(${n(s.scrX + s.scrW / 2)}, ${n(s.scrY + s.scrH / 2)});`,
    `const BIRTH_DIM = ${n(s.birthDim, 2)};`,
    `const BIRTH_SPAN = ${n(s.birthSpan, 2)};`,
    `const CROSS_IN = ${n(s.crossIn, 3)};`,
    `const CROSS_HOLD = ${n(s.crossHold, 3)};`,
    `const CROSS_OUT = ${n(s.crossOut, 3)};`,
    `const AIM_BY = ${n(s.aimBy, 2)};`,
    `// dans FRAG_FRAME — la résolution du phosphore en approchant (uPixel)`,
    `const PIXEL_HALO = ${n(s.pixelHalo, 2)};`,
    `const PIXEL_GAMMA = ${n(s.pixelGamma, 2)};`,
    ...(s.crossOut <= 0
      ? [
          `// ⚠ CROSS_OUT EST À 0 : le poste est encore rendu quand le plan proche franchit le`,
          `// verre, donc on voit l'intérieur du boîtier (DoubleSide). Remonter avant de cuire.`,
        ]
      : []),
    ``,
    `// src/lib/formClock.ts`,
    `const CAM_DIVE_ARRIVE = ${n(s.diveArrive, 3)};`,
    `const CAM_DIVE_PAST_GLASS = ${n(s.divePast, 3)};`,
    ...(s.diveArrive === DEFAULTS.diveArrive
      ? []
      : [
          `// …et dans PixelTunnel.tsx, l'arc de luminosité repart de ce même point (uArrive).`,
          `// Le laisser en uniforme, ou recuire le "0.5" du fragment AVEC celui-ci — jamais l'un`,
          `// sans l'autre, c'est le désaccord que cette molette existe pour rendre impossible.`,
        ]),
    ``,
    `// src/components/chrome/PixelTunnel.tsx — la grille du corridor`,
    `const COLS = ${4 * Math.max(1, Math.round(12 * s.gridScale))};`,
    `const ROWS = ${3 * Math.max(1, Math.round(12 * s.gridScale))};`,
    `const CELL = ${(1.68 / (4 * Math.max(1, Math.round(12 * s.gridScale)))).toFixed(5)};`,
    `const SLICES = ${Math.round(s.slices)};`,
    `const G = ${n(s.growth, 3)};`,
    `const FILL_XY = ${n(s.fillXY, 3)};`,
    `const FILL_IN = ${n(s.fillIn, 3)};`,
    `const FILL_Z = ${n(21 * s.gridScale, 2)};`,
    `const float ATTEN_K = ${n(s.atten, 3)};`,
    `const float DISCARD_FRAC = ${n(s.discard, 2)};`,
    ...(s.restLevel === 0
      ? [`// REST retiré du fragment (uRest = 0) : les cellules éteintes n'existent plus.`]
      : [`const float REST_LEVEL = ${n(s.restLevel, 2)};`]),
    `// dans ChromeTableau — la correction du tirage du verre, px de canvas`,
    `const dragU = ${n(s.dragX, 1)} / 512;`,
    `const dragV = ${n(s.dragY, 1)} / 384;`,
    `const float CELL_CUT = ${n(s.cellCut, 3)};`,
    `// la forme du corridor, et l'animation de la sortie`,
    `const SHAFT = ${s.tubeShaft};`,
    ...(s.tubeShaft
      ? [
          `const STEP = ${n(s.tubeStep, 2)}; // × REF_HW`,
          `const WALL = ${n(s.tubeWall, 2)};`,
          `const WALL_IN = ${n(s.tubeWallIn, 2)};`,
        ]
      : []),
    `const BLOCK = ${s.blockQuad ? `"ruban"` : `"cube"`};`,
    `const LOOP = ${s.tunnelLoop};`,
    `const FALL_AT = ${n(s.fallAt, 2)};`,
    `const DISSOLVE_AT = ${n(s.dissolveAt, 2)};`,
    `const MOUTH_BACK = ${n(s.mouthBack, 3)};`,
    `const float PEAK = ${n(s.peak, 2)};`,
    `const CYCLES = ${Math.round(s.cycles)};`,
    ...(s.corrX === 0 && s.corrY === 0
      ? []
      : [`// le calage fin du prélèvement, px de canvas`, `const CORR_X = ${Math.round(s.corrX)};`, `const CORR_Y = ${Math.round(s.corrY)};`]),
    ``,
    `// src/lib/tubeHole.ts`,
    `const WINDOW_CHARS = ${n(s.holeWin, 2)};`,
    `const ZOOM_CHARS = ${n(s.zoomChars, 2)};`,
    `const ZOOM_SPAN = ${n(s.zoomSpan, 2)};`,
    ...(s.aimAuto
      ? [`// (visée AUTO : le « a » mesuré est resté le bon point — rien à cuire, measure() suffit.)`]
      : [
          `// ⚠ VISÉE MANUELLE — le point ci-dessous REMPLACE la mesure du glyphe, donc le trou ne`,
          `// suivra plus textX/textY/textSize. Avant de cuire ça : vérifier que c'est bien voulu`,
          `// (viser une autre lettre se fait mieux par WORD/LETTER_OFFSET, qui reste mesuré).`,
          `const AIM_X = ${Math.round(s.aimX)};`,
          `const AIM_Y = ${Math.round(s.aimY)};`,
        ]),
    ``,
    `// src/lib/tubeScreen.ts — le pinceau du tube (screen.draw)`,
    `x.font = "600 ${Math.round(s.textSize)}px ui-monospace, SFMono-Regular, Menlo, monospace";`,
    `x.shadowBlur = ${n(s.textGlow, 1)};`,
    `x.fillText(txt, ${Math.round(s.textX)}, ${Math.round(s.textY)});`,
    `// la séquence`,
    `const TYPE_CHAR = ${n(s.textChar, 3)};`,
    `const LINE_HOLD = ${n(s.textHold, 2)};`,
    `// lignes ${s.textStack ? "EMPILÉES (pt.textStack = true)" : "EFFACÉES (le geste du film)"}`,
  ].join("\n");
}
