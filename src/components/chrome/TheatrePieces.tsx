"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector4 } from "three";
import type { Points } from "three";
import { formState } from "@/lib/formClock";
import { THEATRE_LOOK } from "@/lib/theatreLook";
import { RING_RADIUS, STATIONS, stationPosition } from "@/lib/theatre";
import { buildPiece } from "@/lib/theatreShapes";

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

  float r0 = aSeed.x / TAU;
  float r1 = aSeed.y / TAU;

  // La saillance est TRANSPORTÉE, pas devinée : une formule unique ne peut pas désigner
  // les pointes d'un vase et les coins d'un appareil. Voir theatreShapes.
  float w = smoothstep(1.0 - uZone, 1.0, aSal);

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

  if (pick < w * uRate) {
    float ph = fract(uTime / uCycle + r0);
    if (ph < uOut) {
      float e = ph / uOut;
      float k = ease(e);
      // Haut vers le haut, bas vers le bas — et c'est le y APRÈS orientation qui décide,
      // pas celui du modèle : sur une pièce inclinée les deux ne coïncident plus.
      esc.y = sign(base.y) * uReach * k;
      esc.x = ((r0 - 0.5) * 1.4 + sin(uTime * 0.7 + r1 * TAU) * 0.35) * uFan * k;
      esc.z = ((r1 - 0.5) * 1.4 + cos(uTime * 0.6 + r0 * TAU) * 0.35) * uFan * k;
      // Elle s'éteint plus vite qu'elle ne s'éloigne : la matière doit se perdre, pas se
      // poser quelque part.
      alpha = pow(1.0 - e, 1.5);
    } else {
      // Retour en fondu : sans lui la particule réapparaît d'un coup à sa place et la
      // pièce clignote au rythme du cycle.
      alpha = smoothstep(0.0, 0.2, (ph - uOut) / max(0.02, 1.0 - uOut));
    }
  }

  vAlpha = alpha * RT.z;
  vDust = RT.w;

  vec3 world = XF.xyz + (base + esc) * XF.w;
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

export function TheatrePieces() {
  const points = useRef<Points>(null);

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
    for (let i = 0; i < SLOTS; i++) {
      xf.push(new Vector4(0, 0, 0, 1));
      rot.push(new Vector4(0, 0, 0, 0));
    }
    return new ShaderMaterial({
      uniforms: {
        uXf: { value: xf },
        uRot: { value: rot },
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
    for (let i = 0; i < STATIONS.length; i++) {
      const s = STATIONS[i];
      const p = stationPosition(s, c.cx, c.cy, c.cz);
      xf[i].set(c.cx + (p.x - c.cx) * spread, p.y, c.cz + (p.z - c.cz) * spread, s.scale);
      // Chaque pièce tourne à sa propre vitesse, tirée de son index : dérivée de sa
      // POSITION, elle se rebattrait à chaque déplacement du centre de la salle.
      rot[i].set(s.tilt, u.uTime.value * g.spin * (0.5 + ((i * 0.37) % 1)), on, 0);
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
    const fov = (camera as typeof camera & { fov?: number }).fov ?? 47;
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
