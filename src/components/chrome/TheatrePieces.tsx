"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3, Vector4 } from "three";
import type { Points } from "three";
import { formState } from "@/lib/formClock";
import { THEATRE_LOOK } from "@/lib/theatreLook";
import {
  PIECE_RADIUS,
  RING_RADIUS,
  STATIONS,
  stationBirth,
  stationPosition,
  stationSlide,
  theatreReveal,
  theatreScreen,
} from "@/lib/theatre";
import { buildPiece } from "@/lib/theatreShapes";

type Props = {
  reduced?: boolean;
};

/**
 * LE THÉÂTRE — les quatre projets en nuages de particules, dans la salle qu'on traverse
 * après la plongée.
 *
 * La géométrie et la pose de caméra ne sont pas ici : elles sont dans `theatre` et
 * `theatreShapes`, purs et testés. Ce composant ne fait que téléverser des tampons une
 * fois et pousser une poignée d'uniformes par frame.
 *
 * TROIS CHOSES PORTENT LE RENDU.
 *
 * 1. LA POSE DES PIÈCES EST DANS DES UNIFORMES, PAS DANS LES ATTRIBUTS. Cinq vec4
 *    suffisent pour placer, orienter et faire tourner les quatre objets. Mise dans les
 *    attributs, la moindre animation aurait demandé de réécrire un mégaoctet de tampon
 *    par frame ; ici le CPU touche vingt nombres et cent mille particules suivent.
 *
 * 2. LA DÉCOMPOSITION EST UN CYCLE, PAS UNE FUITE. Chaque particule a son horloge
 *    décalée : elle se détache, dérive, s'éteint plus vite qu'elle ne s'éloigne, puis
 *    revient chez elle. La pièce s'effrite en continu sans jamais se vider — et les
 *    trous qui s'ouvrent à ses pointes pendant l'absence sont tout le sujet.
 *
 * 3. RIEN NE S'INTÈGRE D'UNE FRAME À L'AUTRE. Tout le mouvement se déduit du temps et
 *    de deux graines tirées une fois. Un champ qui accumulerait sa position dérive, se
 *    met à respirer à contretemps quand l'onglet passe en arrière-plan, et ne revient
 *    jamais au même état.
 */

/** Quatre pièces plus un emplacement réservé à la poussière. */
const SLOTS = STATIONS.length + 1;
const DUST_SLOT = STATIONS.length;

/*
 * LES RÉGLAGES NE SONT PAS ICI, ils sont dans `theatreLook` — un littéral documenté à côté de
 * `theatre` et `theatreShapes`, comme `plateLook` l'est pour les plaques. Ils avaient d'abord
 * été un `TUNE` figé en tête de ce fichier, rapporté tel quel de l'artifact où ils avaient été
 * trouvés ; les sortir est ce qui a permis de les régler à l'écran, et ils y sont restés une
 * fois trouvés.
 */

const VERT = /* glsl */ `
precision highp float;

attribute float aPiece;   // à quelle pièce ce point appartient
attribute float aSal;     // saillance [0,1] : par où cette pièce se perd
attribute vec2 aSeed;

uniform vec4 uXf[${SLOTS}];   // xyz = centre monde, w = échelle
uniform vec4 uRot[${SLOTS}];  // x = inclinaison, y = lacet, z = présence
/**
 * LA LECTURE D'UN PROJET, par pièce — x = LE SOUFFLE, y = LA TENUE.
 *
 * Un troisième tableau de poses plutôt qu'un canal volé aux deux autres : uXf est plein
 * (xyz + échelle) et uRot l'est depuis que son w porte le drapeau de poussière. Cinq vec4
 * de plus se téléversent en microsecondes, là où réutiliser un canal aurait fait dépendre
 * deux réglages l'un de l'autre pour économiser vingt nombres.
 *
 * LA TENUE est ce que le survol répond : la pièce qu'on regarde cesse de s'effriter, ses
 * grains rentrent, elle redevient nette. C'est un facteur sur uRate, donc à 1 la
 * décomposition n'a plus personne à tirer.
 *
 * LE SOUFFLE est ce que les trois autres font quand on en ouvre une : elles finissent leur
 * décomposition et NE REVIENNENT PAS. Voir la boucle plus bas — il ne s'ajoute pas au
 * cycle, il le remplace.
 */
uniform vec4 uFx[${SLOTS}];

uniform float uTime;
uniform float uSize;    // diamètre en unités monde
uniform float uScale;   // (hauteur du viewport / 2) / tan(fov/2), en pixels
uniform float uNear;
uniform float uFar;
uniform float uRate;
uniform float uZone;
uniform float uReach;
uniform float uCycle;
uniform float uFan;
uniform float uOut;
uniform float uFloat;
uniform float uBirthReach;
uniform float uBirthWave;

varying float vDepth;
varying float vAlpha;
/**
 * 1 = ce grain est de la poussière, 0 = il appartient à une pièce.
 *
 * PORTÉ PAR LA POSE (uRot[pi].w), PAS PAR UN ATTRIBUT. Le tampon d'attributs fait plusieurs
 * mégaoctets et n'est réécrit qu'au changement de forme ou de densité ; y ajouter un drapeau
 * aurait fait payer une réécriture à un renseignement qui ne change JAMAIS pour un grain donné.
 * Le canal w de la pose était libre (il valait 0 partout), le CPU le remplit déjà chaque frame
 * pour d'autres raisons, et seize vec4 se téléversent en microsecondes.
 *
 * C'est le même mécanisme que le « tint » de l'artifact d'où cette scène vient — lequel s'en servait
 * pour désigner LA pièce en couleur. Le port l'avait laissé tomber ; il revient pour la poussière.
 */
varying float vDust;

const float TAU = 6.2831853;

float ease(float t) { return t * t * (3.0 - 2.0 * t); }

void main() {
  int pi = int(aPiece + 0.5);
  vec4 XF = uXf[pi];
  vec4 RT = uRot[pi];
  vec4 FX = uFx[pi];

  float r0 = aSeed.x / TAU;
  float r1 = aSeed.y / TAU;

  // La saillance est TRANSPORTÉE, pas devinée : une formule unique ne peut pas désigner
  // les pointes d'un vase et les coins d'un appareil. Voir theatreShapes.
  float w = smoothstep(1.0 - uZone, 1.0, aSal);
  // …sauf quand ça souffle : là c'est TOUT le corps qui part, pas seulement les pointes.
  // Sans ça, une pièce qu'on chasse laisserait son cœur derrière elle, en suspension.
  w = mix(w, 1.0, FX.x);
  // La tenue éteint la décomposition ; le souffle la rallume par-dessus, pour que les deux
  // ne puissent jamais s'annuler (une pièce ne peut de toute façon pas être les deux).
  float rate = max(uRate * (1.0 - FX.y), FX.x);

  // Qui part est tiré UNE FOIS, par un hachage des deux graines — ce qui laisse r0 et r1
  // libres pour la phase et l'ouverture. Corrélées au tirage, les particules qui partent
  // iraient toutes du même côté.
  float pick = fract(sin(r0 * 127.1 + r1 * 311.7) * 43758.5453);

  vec3 base = position + uFloat * vec3(
    sin(uTime * 0.31 + aSeed.x),
    cos(uTime * 0.27 + aSeed.y),
    sin(uTime * 0.23 + aSeed.x + aSeed.y)
  );

  // Lacet propre puis inclinaison dans le plan de l'image.
  float ca = cos(RT.y), sa = sin(RT.y);
  base.xz = vec2(base.x * ca - base.z * sa, base.x * sa + base.z * ca);
  float ct = cos(RT.x), st = sin(RT.x);
  base.xy = vec2(base.x * ct - base.y * st, base.x * st + base.y * ct);

  // L'ORDRE EST LE SUJET : la pièce est posée, orientée, PUIS le panache s'ajoute.
  // Calculé avant la rotation il s'inclinerait avec l'objet, comme si la pesanteur avait
  // tourné avec lui. Après, il reste vertical.
  float alpha = 1.0;
  vec3 esc = vec3(0.0);

  if (pick < w * rate) {
    float ph = fract(uTime / uCycle + r0);
    /*
     * LE SOUFFLE REMPLACE LE CYCLE, IL NE S'Y AJOUTE PAS — et c'est ce qui fait que
     * personne ne revient. Décaler la phase (fract(… + souffle)) ferait tourner le cycle
     * plus loin, donc rentrer les grains plus tôt : la pièce chassée serait revenue avant
     * la fin du geste. Ici la phase devient une RAMPE À SENS UNIQUE qui court de 0 à uOut,
     * échelonnée par grain (le −r0) pour que la pièce se défasse en vague et non d'un bloc.
     *
     * ×1.35 pour que même le grain le plus tardif (r0 ≈ 1, donc retardé de 0.35) atteigne
     * bien le bout de sa course quand le souffle vaut 1 : 1.35 − 0.35 = 1 exactement.
     */
    float phGo = clamp(FX.x * 1.35 - r0 * 0.35, 0.0, 1.0) * uOut;
    ph = mix(ph, phGo, FX.x);
    // Chassées, elles partent aussi PLUS LOIN — sinon la dissipation se lit comme une
    // simple extinction sur place, et le mot « souffle » ne veut plus rien dire.
    float gust = 1.0 + FX.x * 1.6;
    if (ph < uOut) {
      float e = ph / uOut;
      float k = ease(e);
      // Haut vers le haut, bas vers le bas — et c'est le y APRÈS orientation qui décide,
      // pas celui du modèle : sur une pièce inclinée les deux ne coïncident plus.
      esc.y = sign(base.y) * uReach * k * gust;
      esc.x = ((r0 - 0.5) * 1.4 + sin(uTime * 0.7 + r1 * TAU) * 0.35) * uFan * k * gust;
      esc.z = ((r1 - 0.5) * 1.4 + cos(uTime * 0.6 + r0 * TAU) * 0.35) * uFan * k * gust;
      // Elle s'éteint plus vite qu'elle ne s'éloigne : la matière doit se perdre, pas se
      // poser quelque part.
      alpha = pow(1.0 - e, 1.5);
    } else {
      // Retour en fondu : sans lui la particule réapparaît d'un coup à sa place et la
      // pièce clignote au rythme du cycle.
      alpha = smoothstep(0.0, 0.2, (ph - uOut) / max(0.02, 1.0 - uOut));
    }
  }

  /*
   * LA NAISSANCE — le grain arrive du dehors, il ne s'allume pas sur place.
   *
   * RT.z NE SERT PLUS À ÉTEINDRE, IL SERT D'HORLOGE. Il portait \`theatre.on\`, partagé par les
   * quatre pièces, et il multipliait l'alpha : chaque grain était déjà à sa place finale et
   * seule son opacité montait — le fantôme de l'objet fini qui s'allume. Il porte maintenant la
   * naissance de CETTE pièce (voir stationBirth), et c'est l'ARRIVÉE du grain qui fait l'alpha.
   * L'extinction reste exacte : à RT.z = 0, bk vaut 0 pour tous les grains.
   *
   * L'ÉCHELONNAGE PAR GRAIN vient d'un hachage NEUF, pas de \`pick\` réutilisé : corrélés, les
   * grains qui s'effritent seraient aussi les derniers arrivés, et les deux gestes se
   * confondraient.
   */
  float bd = fract(sin(r1 * 269.5 + r0 * 183.3) * 43758.5453) * uBirthWave;
  float bk = ease(clamp((RT.z - bd) / max(1e-3, 1.0 - uBirthWave), 0.0, 1.0));
  // LA POUSSIÈRE EST NÉE D'AVANCE — par le drapeau qui existe déjà (RT.w, voir vDust). C'est
  // elle qui peuple le noir avant que les pièces n'arrivent : la faire naître aussi aurait vidé
  // ce passage de la seule chose qu'il montre.
  bk = mix(bk, 1.0, RT.w);

  /*
   * LA DIRECTION DU HALO : une sphère UNIFORME, tirée sur les deux graines.
   *
   * NE PAS « SIMPLIFIER » EN NORMALISANT TROIS BRUITS. Un vec3 de bruits normalisé concentre les
   * tirages sur les diagonales du cube, et la pièce se condenserait depuis ses huit coins. Le
   * z uniforme + l'angle uniforme est la seule méthode qui couvre la sphère à plat.
   *
   * La direction partage r0/r1 avec le panache de l'effritement, donc départ et arrivée sont de
   * la même famille — assumé : les deux ne coexistent pas, et une pièce dont la matière rentre
   * par où elle sortira se tient mieux qu'une qui mélange deux champs indépendants.
   */
  float bz = r0 * 2.0 - 1.0;
  float brd = sqrt(max(0.0, 1.0 - bz * bz));
  float ban = r1 * TAU;
  vec3 born = vec3(brd * cos(ban), bz, brd * sin(ban))
            * (uBirthReach * (1.0 - bk) * (1.0 - RT.w));

  // L'ARRIVÉE REMPLACE LE FONDU, ELLE NE S'Y AJOUTE PAS. Multiplier bk PAR RT.z aurait laissé le
  // fondu plat par-dessus la convergence : les deux rampes se seraient composées et on aurait
  // revu, en plus faible, le défaut qu'on corrige. La poussière, elle, garde sa présence à elle.
  vAlpha = alpha * mix(bk, RT.z, RT.w);
  vDust = RT.w;

  // \`born\` s'ajoute APRÈS les rotations, au même endroit et pour la même raison que \`esc\` : le
  // halo d'où la matière arrive n'appartient pas plus à l'objet que le panache par où elle part.
  vec3 world = XF.xyz + (base + esc + born) * XF.w;
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(0.05, -mv.z);
  // La taille en pixels varie en 1/distance, comme la projection fait varier les écarts.
  // uSize est un DIAMÈTRE EN UNITÉS DU MONDE : exprimé en pixels il dépasse le millier et
  // se fait écrêter, et toutes les particules sortent à la taille maximale.
  gl_PointSize = clamp(uSize * XF.w * uScale / dist, 1.0, 96.0);

  vDepth = clamp((uFar - dist) / (uFar - uNear), 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

varying float vDepth;
varying float vAlpha;
varying float vDust;

uniform vec3 uC0, uC1, uC2, uC3, uC4;
uniform vec3 uDust;
uniform float uGain;

vec3 ramp(float t) {
  float s = clamp(t, 0.0, 1.0) * 4.0;
  vec3 c = mix(uC0, uC1, clamp(s, 0.0, 1.0));
  c = mix(c, uC2, clamp(s - 1.0, 0.0, 1.0));
  c = mix(c, uC3, clamp(s - 2.0, 0.0, 1.0));
  c = mix(c, uC4, clamp(s - 3.0, 0.0, 1.0));
  return c;
}

void main() {
  // Un disque à frange gaussienne, pas un carré : c'est la frange qui donne au point son
  // air de poussière, et le halo est déjà dedans — aucune passe de bloom à ajouter.
  vec2 uv = gl_PointCoord - 0.5;
  float r2 = dot(uv, uv);
  if (r2 > 0.25) discard;
  float a = exp(-r2 * 11.0) * (1.0 - smoothstep(0.18, 0.25, r2));

  // ALPHA BASSE, ET C'EST LE POINT. Le nuage s'additionne : une intensité juste sur une
  // particule isolée sature dès que quatre se recouvrent, et les faces vues de biais
  // deviennent des aplats. On règle sur la somme, pas sur l'unité.
  float energy = (0.06 + vDepth * 0.5) * uGain * vAlpha;
  /*
   * LA POUSSIÈRE A SA COULEUR, LES PIÈCES GARDENT LA RAMPE. « mix » sur vDust, qui ne vaut que 0 ou
   * 1 : il n'y a rien à interpoler, mais un « mix » évite la branche — sur un shader de points
   * dessiné des dizaines de milliers de fois par frame, deux chemins divergents dans un warp
   * coûtent plus cher que la sélection elle-même.
   *
   * SEULE LA TEINTE CHANGE, PAS L'INTENSITÉ : « energy » reste calculée sur « vDepth » pour tout le
   * monde. La poussière garde donc son atténuation en profondeur et son « dustGain » — on lui donne
   * une couleur, pas un régime lumineux à part, sans quoi le nuage cesserait d'être dans la même
   * salle que les objets.
   */
  vec3 col = mix(ramp(vDepth), uDust, vDust);
  gl_FragColor = vec4(col * a * energy, a * energy);
}
`;

/** Un tirage déterministe : le nuage doit être le même d'un montage à l'autre. */
function seeded(seed: number, n: number) {
  const out = new Float32Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = (s / 4294967296) * Math.PI * 2;
  }
  return out;
}

/**
 * LA VITESSE À LAQUELLE LA MATIÈRE SE TIENT quand on survole une pièce, en 1/s.
 *
 * 7 : deux dixièmes de seconde pour l'essentiel du chemin. C'est court exprès — le survol
 * est le seul retour que le pointeur reçoive avant le clic, et une réponse qui met une
 * seconde ne se relie plus au geste qui l'a demandée. La décomposition, elle, reprend à la
 * même vitesse : ce n'est pas une transition, c'est un contact.
 *
 * ICI ET NON DANS L'HORLOGE, contrairement à l'ouverture : cette rampe est PAR PIÈCE et
 * ne concerne que le pointeur. L'horloge n'a rien à savoir de la souris — elle intègre ce
 * dont la chorégraphie dépend (l'angle, l'ouverture), pas ce dont le curseur dépend.
 */
const HOLD_RATE = 7;

export function TheatrePieces({ reduced }: Props) {
  const points = useRef<Points>(null);
  /** L'avancement de la tenue, par pièce. Voir HOLD_RATE. */
  const hold = useRef(new Float32Array(STATIONS.length));
  /**
   * L'angle propre que la pièce ouverte a accumulé — « elle tourne pendant qu'on la lit ».
   *
   * INTÉGRÉ ET NON DÉRIVÉ DE uTime : dérivé, l'angle serait fonction de la présence
   * (uTime × vitesse × ouverture) et retomberait donc à zéro À LA FERMETURE, faisant
   * revenir la pièce à sa pose d'origine en tournant à l'envers. Accumulé, elle s'arrête
   * simplement là où elle en était.
   */
  const openSpin = useRef(0);
  /** Un vecteur de travail pour la projection écran, alloué une fois. */
  const probe = useRef(new Vector3());

  const geometry = useMemo(() => {
    const clouds = STATIONS.map((s) => buildPiece(s.kind, THEATRE_LOOK.density));
    const bodies = clouds.reduce((t, c) => t + c.count, 0);
    const dust = THEATRE_LOOK.dust;
    const total = bodies + dust;

    const pos = new Float32Array(total * 3);
    const piece = new Float32Array(total);
    const sal = new Float32Array(total);

    let k = 0;
    clouds.forEach((c, ci) => {
      for (let i = 0; i < c.count; i++, k++) {
        pos[k * 3] = c.pos[i * 3];
        pos[k * 3 + 1] = c.pos[i * 3 + 1];
        pos[k * 3 + 2] = c.pos[i * 3 + 2];
        piece[k] = ci;
        sal[k] = c.sal[i];
      }
    });

    /*
     * LA POUSSIÈRE, DANS LE MÊME TAMPON ET LE MÊME PROGRAMME. Un grain de poussière
     * n'est qu'une particule dont la « pièce » est le monde entier : centre nul, échelle
     * 1. Sa saillance vaut zéro, donc elle est hors de portée de la décomposition sans
     * qu'aucun réglage n'ait à l'exempter.
     *
     * Le volume englobe la caméra, qui se tient HORS du cercle des pièces : calé sur le
     * seul rayon de la salle, le nuage s'arrêterait avant elle et on avancerait dans un
     * vide net. Plus large que haut, aussi — une salle a un sol et un plafond, un nuage
     * sphérique la ferait lire comme du vide interstellaire.
     */
    let s = 424242 >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const R = (RING_RADIUS * THEATRE_LOOK.spread + 8) * 1.25;
    for (let i = 0; i < dust; i++, k++) {
      pos[k * 3] = (rand() * 2 - 1) * R;
      pos[k * 3 + 1] = (rand() * 2 - 1) * R * 0.5;
      pos[k * 3 + 2] = (rand() * 2 - 1) * R;
      piece[k] = DUST_SLOT;
      sal[k] = 0;
    }

    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("aPiece", new BufferAttribute(piece, 1));
    geo.setAttribute("aSal", new BufferAttribute(sal, 1));
    geo.setAttribute("aSeed", new BufferAttribute(seeded(7919, total * 2), 2));
    return geo;
  }, []);

  const material = useMemo(() => {
    const xf: Vector4[] = [];
    const rot: Vector4[] = [];
    const fx: Vector4[] = [];
    for (let i = 0; i < SLOTS; i++) {
      xf.push(new Vector4(0, 0, 0, 1));
      rot.push(new Vector4(0, 0, 0, 0));
      fx.push(new Vector4(0, 0, 0, 0));
    }
    return new ShaderMaterial({
      uniforms: {
        uXf: { value: xf },
        uRot: { value: rot },
        uFx: { value: fx },
        uTime: { value: 0 },
        uSize: { value: 0 },
        uScale: { value: 400 },
        uNear: { value: 1 },
        uFar: { value: 30 },
        /*
         * OUVERTS À ZÉRO — la valeur du store leur arrive à la première frame, avec tout le
         * reste (voir le useFrame). Les initialiser depuis le store aurait fait DEUX chemins
         * de lecture pour un seul nombre, et le motif du dépôt est justement qu'il n'y en ait
         * qu'un : c'est en n'en lisant qu'à la construction que la section PROJETS du panneau
         * s'est retrouvée muette pendant tout son passage ici.
         */
        uRate: { value: 0 },
        uZone: { value: 0 },
        uReach: { value: 0 },
        uCycle: { value: 1 },
        uFan: { value: 0 },
        uOut: { value: 0 },
        uFloat: { value: 0 },
        uBirthReach: { value: 0 },
        uBirthWave: { value: 0 },
        uGain: { value: 0 },
        /*
         * LA RAMPE ET LA POUSSIÈRE SONT DES `Color`, PAS DES TABLEAUX, et c'est ce qui rend
         * les pastilles du panneau possibles : three.js passe un Color en vec3 exactement
         * comme un triplet, mais lui sait lire un hex CSS — donc le store reste en chaînes,
         * ce qu'un `<input type="color">` produit et relit.
         *
         * Conséquence à connaître : `Color.set("#…")` passe par la gestion des couleurs et
         * convertit sRGB → linéaire, là où un tableau partait brut. Les défauts de la rampe
         * sont donc en sRGB et non plus en linéaire (voir theatreLook).
         */
        uC0: { value: new Color() },
        uC1: { value: new Color() },
        uC2: { value: new Color() },
        uC3: { value: new Color() },
        uC4: { value: new Color() },
        uDust: { value: new Color() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      // Additif. Deux particules qui se croisent font PLUS de lumière, jamais moins — et
      // l'ordre de dessin devient sans effet, donc aucun tri en profondeur.
      blending: AdditiveBlending,
    });
  }, []);

  useFrame(({ camera, size }, delta) => {
    const pts = points.current;
    if (!pts) return;
    const st = formState();
    // DEUX PRÉSENCES — les pièces et la poussière montent sur des fenêtres distinctes, pour que
    // le noir entre le corridor et la salle soit peuplé de poussière seule (voir formClock). Le
    // nuage n'est caché que quand les DEUX sont éteintes : sur la fenêtre où seule la poussière
    // est là, `on` vaut encore zéro et un test sur lui seul aurait sauté toute la traversée.
    const on = st.theatre.on;
    const dustOn = st.theatre.dust;
    pts.visible = Math.max(on, dustOn) > 0.002;
    if (!pts.visible) return;

    const u = material.uniforms;
    u.uTime.value += delta;

    /*
     * TOUT LE RÉGLAGE, POUSSÉ ICI ET NULLE PART AILLEURS — et par frame, bien que ces nombres
     * soient figés (même motif que LiquidDna avec PLATE_LOOK). Une douzaine d'écritures sur un
     * matériau déjà parcouru ne coûte rien devant les cent quarante mille points qu'il dessine,
     * et ça garde le fichier honnête : la seule lecture des réglages est ici, à un endroit qui
     * tourne. Des uniformes lus À LA CONSTRUCTION sont exactement ce qui avait rendu muettes
     * les molettes de PLATE_LOOK — la valeur arrivait, plus personne ne la relisait.
     *
     * `density`, `dust` et `spread` sont absents à dessein : eux ne sont pas des uniformes,
     * ils sont dans les tampons, et c'est la géométrie plus haut qui les porte.
     */
    const g = THEATRE_LOOK;
    u.uRate.value = g.rate;
    u.uZone.value = g.zone;
    u.uReach.value = g.reach;
    u.uCycle.value = g.cycle;
    u.uFan.value = g.fan;
    u.uOut.value = g.out;
    u.uFloat.value = g.float;
    // À ZÉRO SOUS `reduced` : une convergence est du mouvement, et cette préférence demande
    // qu'il n'y en ait pas. Il reste la montée d'alpha, c'est-à-dire l'image d'avant.
    u.uBirthReach.value = reduced ? 0 : g.birthReach;
    u.uBirthWave.value = reduced ? 0 : g.birthWave;
    u.uGain.value = g.gain;
    (u.uC0.value as Color).set(g.ramp[0]);
    (u.uC1.value as Color).set(g.ramp[1]);
    (u.uC2.value as Color).set(g.ramp[2]);
    (u.uC3.value as Color).set(g.ramp[3]);
    (u.uC4.value as Color).set(g.ramp[4]);
    (u.uDust.value as Color).set(g.dustColor);

    const c = st.theatre;
    const spread = g.spread;
    const xf = u.uXf.value as Vector4[];
    const rot = u.uRot.value as Vector4[];
    const fx = u.uFx.value as Vector4[];

    /*
     * LA LECTURE D'UN PROJET — le décalage, la tenue, le souffle.
     *
     * `open` est la pièce concernée et `rev` l'avancement, tous deux fabriqués par
     * l'horloge (voir formClock) : ce composant ne décide de rien, il applique. Le
     * décalage se calcule sur l'angle COURANT de la caméra et non sur celui de la station,
     * pour que la pièce glisse bien vers la gauche du CADRE — pendant que la caméra
     * termine son arc, les deux angles diffèrent, et prendre celui de la station ferait
     * partir la pièce de travers.
     */
    // La focale, lue avant la boucle : la projection écran des pièces en dépend autant que
    // la taille des grains plus bas.
    const fov = (camera as typeof camera & { fov?: number }).fov ?? 47;
    const open = c.open;
    const rev = c.reveal;
    const slide = rev > 0.0005 ? stationSlide(c.phi, rev) : null;
    openSpin.current += delta * g.openSpin * rev;
    const holds = hold.current;
    const holdK = 1 - Math.exp(-delta * HOLD_RATE);

    for (let i = 0; i < STATIONS.length; i++) {
      const s = STATIONS[i];
      const p = stationPosition(s, c.cx, c.cy, c.cz);
      const lit = i === open;
      let x = c.cx + (p.x - c.cx) * spread;
      let z = c.cz + (p.z - c.cz) * spread;
      if (lit && slide) {
        x += slide.x;
        z += slide.z;
      }
      xf[i].set(x, p.y, z, s.scale);
      // Chaque pièce tourne à sa propre vitesse, tirée de son index : dérivée de sa
      // POSITION, elle se rebattrait à chaque déplacement du centre de la salle. La pièce
      // ouverte en prend une seconde, la sienne, qui ne repart pas en arrière (openSpin).
      const spin = u.uTime.value * g.spin * (0.5 + ((i * 0.37) % 1)) + (lit ? openSpin.current : 0);
      // LA NAISSANCE DE CETTE PIÈCE, plus la présence partagée : celle qu'on regarde arrive
      // d'abord, celles du dos suivent — et à la sortie elles se défont dans le même ordre.
      rot[i].set(s.tilt, spin, stationBirth(c.phi, s.phi, on, reduced ? 0 : g.birthCascade), 0);

      holds[i] += ((theatreReveal.hover === i ? 1 : 0) - holds[i]) * holdK;
      // La pièce ouverte se tient d'office : on ne lit pas une chose qui s'effrite.
      // Les trois autres reçoivent le souffle, et rien d'autre.
      fx[i].set(open >= 0 && !lit ? rev : 0, Math.max(holds[i], lit ? rev : 0), 0, 0);

      /*
       * …ET LA POSITION À L'ÉCRAN, pour le DOM (voir theatreScreen). Publiée ici parce que
       * c'est ici qu'on a la caméra et la pose réelle : recalculée côté section, elle
       * serait une SECONDE vérité sur l'endroit où est la pièce, et les deux finiraient par
       * diverger d'une frame — c'est-à-dire d'une cible de clic posée à côté de son objet.
       *
       * La distance se prend AVANT `project`, qui écrase le vecteur.
       */
      const dist = probe.current.set(x, p.y, z).distanceTo(camera.position);
      const v = probe.current.project(camera);
      theatreScreen.x[i] = (v.x * size.width) / 2;
      theatreScreen.y[i] = (-v.y * size.height) / 2;
      theatreScreen.r[i] = (PIECE_RADIUS * s.scale * (size.height / 2)) / (Math.tan((fov * Math.PI) / 360) * dist);
      // …et la place qu'elle a libérée, qui est celle qu'elle occuperait sans décalage.
      const home = lit && slide ? probe.current.set(x - slide.x, p.y, z - slide.z).project(camera) : v;
      theatreScreen.freeX[i] = (home.x * size.width) / 2;
      theatreScreen.freeY[i] = (-home.y * size.height) / 2;
    }
    xf[DUST_SLOT].set(c.cx, c.cy, c.cz, 1);
    // …et w = 1, LE DRAPEAU DE POUSSIÈRE, qui part au fragment via vDust (voir sa déclaration dans
    // le vertex). Les pièces gardent 0, posé juste au-dessus.
    rot[DUST_SLOT].set(0, 0, dustOn * g.dustGain, 1);

    // Le grain est relatif à l'ESPACEMENT des particules : à ×1 elles se touchent tout
    // juste, quelle que soit la densité. Régler la densité ne dérègle donc pas la matière.
    u.uSize.value = g.grain * (2 / g.density);
    // Le facteur qui convertit « unités monde » en pixels — c'est lui qui rend la taille
    // des particules indépendante de la taille de la fenêtre.
    u.uScale.value = ((size.height * Math.min(2, window.devicePixelRatio || 1)) / 2) / Math.tan((fov * Math.PI) / 360);

    // La rampe de profondeur est centrée sur la pièce visée, pas sur la scène entière :
    // avec quatre pièces étalées, une plage calée sur toutes les écraserait au noir.
    const d = Math.hypot(camera.position.x - c.cx, camera.position.y - c.cy, camera.position.z - c.cz);
    u.uNear.value = Math.max(0.4, d - g.depthSpan);
    u.uFar.value = d + g.depthSpan;
  });

  return (
    <points ref={points} frustumCulled={false} visible={false}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={material} attach="material" />
    </points>
  );
}
