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
   * WINDOW_CHARS — la largeur de la fenêtre de prélèvement autour du trou, en multiples de
   * l'avance d'un caractère. Combien de lettres voisines forment les parois du corridor :
   * voir tubeHole.ts, qui explique pourquoi 2 (une tranche de « r » et de « b ») plutôt
   * qu'une lettre entière de plus.
   */
  holeWin: number;

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
   * Le défaut 7 place la caméra à une profondeur LOCALE de 7 × REF_HW ≈ 5.9 (REF_HW = 0.84
   * dans PixelTunnel) — plus loin que le seuil Z0 = 2.2 que cette constante visait quand la
   * bouche faisait tout l'écran, ET C'EST OBLIGATOIRE depuis qu'elle est calée sur la fenêtre.
   * Le corridor est auto-similaire le long de son axe (recyclage géométrique), donc s'enfoncer
   * plus loin n'y change rien À UNE EXCEPTION PRÈS : le plan proche de la caméra est à 0.1
   * MONDE, une distance qui ne rétrécit pas avec le corridor. À une profondeur locale de 2.5,
   * les premières tranches tombaient DANS ce plan proche — mesuré au navigateur, un écran noir
   * sans erreur. Le corridor n'est pas plus loin, il est vu d'aussi près : seul le plan de
   * coupe est dégagé. L'exprimer dans l'unité de la bouche la rend invariante :
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
   * `crossIn` doit rester PETIT : c'est là que le basculement commence, et le geste demande
   * qu'il n'arrive qu'une fois collé à l'écran, la lettre énorme, juste avant de passer à
   * travers. `crossOut` doit rester > 0 — à 0 le poste est encore là quand le plan proche
   * franchit le verre, et on voit l'intérieur du boîtier (matériaux en DoubleSide).
   */
  crossIn: number;
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
   * IL DOIT SE TERMINER LOIN, et c'est tout l'enjeu de ces deux nombres. L'écart au centre
   * de l'image est un écart MONDE divisé par la distance à la lettre : un retard de marche
   * qui passe inaperçu de loin explose en fin d'approche, quand le diviseur tend vers zéro.
   * Une marche calée sur `diveArrive` (ce qui était le cas) ne finissait qu'APRÈS la
   * traversée du verre — donc la lettre dérivait vers un bord pendant toute la partie où
   * elle est grosse. Fini à `aimBy` écrans, la caméra est déjà sur l'axe de la lettre avant
   * que celle-ci ne remplisse le cadre, et le plongeon se fait droit dedans.
   */
  aimBy: number;

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
 * L'écran : le rectangle relevé sur capture était min (-2.464, -0.303) / max (1.254,
 * 2.701) — trop large et trop bas, le texte sortait par le haut du verre. Retenu :
 * min (-2.373, 0.513) / max (-0.223, 2.355), soit centre (-1.298, 1.434) et 2.150 × 1.842
 * ici. Le texte suit : descendu à y = 30, corps 31 px, et un halo poussé à 22.5 — trois
 * fois celui d'origine, un phosphore qui bave franchement dans le verre.
 *
 * LE CADRAGE : `fill` descendu de 0.5 à 0.42 (réglé à la molette, en passant par 0.32 —
 * trop petit sur un écran de bureau). Ce n'est pas neutre pour la plongée : le rectangle du
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
  fill: 0.42,
  scrX: -1.298,
  scrY: 1.434,
  scrW: 2.15,
  scrH: 1.842,
  aimAuto: true,
  // Le centre du canvas — jamais utilisé tant que `aimAuto` tient, et remplacé par le point
  // mesuré à la seconde où on bascule (voir le panneau) : ces deux nombres ne sont un défaut
  // que pour le premier rendu, pas une visée que quelqu'un aurait choisie.
  aimX: 256,
  aimY: 192,
  holeWin: 2,
  diveArrive: 0.5,
  divePast: 7,
  crossIn: 0.13,
  crossOut: 0.08,
  birthDim: 0.4,
  birthSpan: 1,
  aimBy: 2,
  textX: 26,
  textY: 30,
  textSize: 31,
  textGlow: 22.5,
  textFull: false,
  textStack: false,
  textChar: 0.07,
  textHold: 1.4,
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
    `const CROSS_OUT = ${n(s.crossOut, 3)};`,
    `const AIM_BY = ${n(s.aimBy, 2)};`,
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
    `// src/lib/tubeHole.ts`,
    `const WINDOW_CHARS = ${n(s.holeWin, 2)};`,
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
