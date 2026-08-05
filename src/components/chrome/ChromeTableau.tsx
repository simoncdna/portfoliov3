"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEnvironment, useGLTF } from "@react-three/drei";
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  NoColorSpace,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Texture } from "three";
import { blobTweak, DISTORT_MAX, FORM_RADIUS } from "@/lib/blobTweak";
import { smoothstep, WORK_SCALE } from "@/lib/formChoreo";
import { SNOISE, FORM_DISPLACE, CHROME_SHADE, ENV_FILE, ENV_INTENSITY, ENV_ROT_Y } from "@/lib/formField";
import { FRAME_W, LINER_W, PHOTO_SHADE, PLATE_H, PLATE_T } from "@/lib/formPhoto";
import { PLATE_LOOK } from "@/lib/plateLook";
import { posteTweak, usePosteEnv, usePosteSkinSrgb } from "@/lib/posteTweak";
import { CAM_REST, formState } from "@/lib/formClock";
import { sequenceAt, sequenceDuration, type SequenceState } from "@/lib/tubeSequence";
import { tubeGate } from "@/lib/tubeGate";
import { tubeMouth } from "@/lib/tubeMouth";
import { tubeScreen } from "@/lib/tubeScreen";
import { works } from "@/data/site";

type Props = {
  reduced?: boolean;
};

/**
 * LE POSTE, as a mesh — the skull's technique applied whole: the television's body is
 * real vertices, each paired with a home on the resting sphere, so the formation is a
 * vertex morph and the raymarcher never marches here. In Work the field only ever
 * draws the travelling blob, hands the frame over inside the first few percent of the
 * morph — where this mesh is still wearing the same noise-displaced sphere — and goes
 * dark. Everything after that is rasterised.
 *
 * The shared field (formOffset) lumps the disguised sphere so the crossfade has
 * nothing to show — and it DIES with the formation ((1 − uPres) in the vertex
 * shader) : a television is not living matter, the formed poste is rigid. The old
 * canvas kept the flow alive at full presence because a canvas breathes; a cabinet
 * does not.
 *
 * The sequence, three beats on two signals: the chrome sphere becomes a CHROME
 * television (the morph, scrubbed by md.flat), the developer strips the chrome to
 * reveal the set's real skin (uReveal, on md.dev — the section's only un-scrubbed
 * event), and the tube lights up with its terminal text on dev's second half (uGlow).
 *
 * The photograph pipeline (PHOTO_SHADE, uPhoto*) is still compiled into the hidden
 * canvas slab's shader but forced dark (uPhotoOn = 0) : the projects' display is a
 * question deliberately left open — see the per-frame block.
 */

/** Assembly staggering — the canvas gathers first, the moulding is raised last. */
const CANVAS_SEED = 0.45;
/** Swirl amplitude while vertices are in flight (world units, peaks mid-morph). */
const FLY = 0.22;
/*
 * THE HOVER DOES NOT STEP FORWARD. A 10% grow on mood.hover (mirroring PLATE_GROW
 * in LiquidDna) was tried and removed: a framed work hanging on a wall does not
 * lean toward the reader. What answers the hover is the PICTURE — the colour
 * fading in (uColour below) — not the object's size.
 */
/**
 * Le cap du poste, radians autour de Y — CALCULÉ, jamais réglé à l'œil : la normale
 * moyenne (pondérée par l'aire) des triangles dont l'UV tombe dans la zone de l'écran,
 * repérée sur l'albedo du mesh verre. Pour cet ordinateur elle vaut (0.000, +0.080,
 * +0.997) : l'écran regarde déjà +Z (le +0.08 vertical est l'inclinaison du moniteur,
 * qu'on garde — un CRT regarde légèrement au-dessus de l'horizon). Zéro, donc, mais le
 * mécanisme reste : le prochain glb n'aura aucune raison d'être aligné.
 */
const TV_YAW = 0;
/*
 * TV_FILL A DÉMÉNAGÉ DANS posteTweak, avec le rectangle du tube et le placement du
 * texte : tant que le panneau vit, le store est l'unique source de ces nombres. Une
 * constante ici PLUS un défaut là-bas, et le premier réglage recopié d'un seul côté les
 * fait mentir tous les deux. Ils reviendront ici quand le panneau partira — le bouton
 * « copier » du panneau crache exactement la forme attendue.
 *
 * (Le cadrage lui-même est inchangé : une fraction de la demi-dimension visible LA PLUS
 * CONTRAIGNANTE, mesurée sur les étendues réelles de l'objet — voir le useFrame.)
 */
/** La demi-étendue du poste en espace de forme, à la largeur de moulure de référence. */
const SCR_H = PLATE_H + LINER_W + 2 * FRAME_W;

/*
 * L'INVARIANT DU FONDU — T6. Les matériaux du poste sont en `side: DoubleSide` (voir
 * `canvasMat`/`frameMats` plus bas) : une coque vue de l'intérieur reste dessinée, sa
 * normale simplement retournée vers la caméra (`if (dot(n,rd)>0.0) n=-n;` dans les deux
 * fragments) — donc si le poste n'est pas ENTIÈREMENT éteint (uFade = 0, ET g.visible =
 * false une fois `on` retombé, voir le useFrame) quand la caméra se retrouve à l'intérieur
 * de sa coque, on voit l'intérieur du boîtier, mal éclairé pour ça.
 *
 * DIVE_FADE_START/END BORNENT CE FONDU EN DESSOUS DU CROISEMENT RÉEL, calculé et pas
 * supposé : formClock pousse la caméra de CAM_REST.z=10 vers `tubeMouth.frontZ -
 * CAM_DIVE_PAST_GLASS` par un smoothstep(0, CAM_DIVE_ARRIVE=0.5, dive) — voir son grand
 * commentaire sur CAM_DIVE_ARRIVE. En résolvant numériquement à quel `dive` le plan proche
 * de la caméra (position − near, near=0.1 par défaut sur une PerspectiveCamera three.js)
 * atteint `tubeMouth.frontZ` (mesuré ≈ 2.22 unités monde au viewport de bureau testé —
 * voir tvExt.glassZ et le rapport de tâche), le croisement tombe entre 0,336 et 0,349 selon
 * l'aspect du viewport (bureau large, tablette portrait, mobile portrait — testé aux trois).
 * DIVE_FADE_END=0.30 laisse donc au moins 0,036 de marge sur les trois — réel, vérifié au
 * navigateur à dive=0.32 (le point le plus tendu de cette marge) et pas seulement calculé.
 * DIVE_FADE_START=0.20 laisse les deux premiers cinquièmes de l'approche (0→
 * CAM_DIVE_ARRIVE=0.5 dans formClock) pleinement solides avant que le fondu commence — une
 * fenêtre plus précoce
 * (0.14) a été essayée et écartée : elle entamait le poste alors qu'il grossissait encore,
 * ce que la table du plan ne demande pas.
 *
 * SI CAM_DIVE_ARRIVE OU CAM_DIVE_PAST_GLASS CHANGENT DANS formClock.ts, OU SI Z0 CHANGE DANS
 * PixelTunnel.tsx (qui contraint CAM_DIVE_PAST_GLASS, voir son commentaire), CE MARGIN DOIT
 * ÊTRE REVÉRIFIÉ — elle n'est pas recalculée automatiquement, elle a été vérifiée une fois
 * pour les valeurs actuelles des trois fichiers.
 */
const DIVE_FADE_START = 0.2;
const DIVE_FADE_END = 0.3;

/*
 * LA SÉQUENCE DU TERMINAL. Le poste apparaît, le curseur clignote À VIDE — l'attente est
 * un état qu'on doit voir, d'où presque trois clignotements avant la première lettre —
 * puis les phrases se FRAPPENT l'une après l'autre, curseur en bout de ligne, et l'invite
 * reste à clignoter sur la dernière.
 *
 * TROIS PHRASES, PAS UNE, et la dernière est un état de repos choisi : « Follow the white
 * rabbit. » est une invitation, ce qui est exactement ce qu'une section de projets doit
 * laisser à l'écran quand le lecteur arrive dessus. La séquence ne boucle donc pas — elle
 * se pose.
 *
 * La cadence de frappe est CONSTANTE, et c'est voulu : un texte reçu par un terminal
 * arrive au rythme de la ligne, pas au rythme d'une main — la frappe humaine irrégulière
 * aurait demandé du hasard, et le hasard par frame est interdit ici (deux lectures du
 * même instant doivent dessiner la même image).
 *
 * EXPORTÉE depuis PixelTunnel : le tunnel doit peindre le MÊME canvas, avec le MÊME
 * contenu — tubeScreen(lines) n'utilise `lines` qu'à son tout premier appel (voir ce
 * fichier). Une copie locale dans PixelTunnel, même identique aujourd'hui, dériverait
 * silencieusement de celle-ci au premier mot changé ; et si PixelTunnel se montait un
 * jour avant ce composant, une copie DIFFÉRENTE y gagnerait la course et s'imprimerait
 * dans le canvas pour de bon, sans erreur. Partager la même constante rend le résultat
 * correct quel que soit l'ordre de montage, plutôt que de dépendre d'une garantie
 * d'ordre de rendu de React qu'aucun des deux fichiers ne vérifie.
 */
export const TV_LINES = ["wake up...", "The matrix has you.", "Follow the white rabbit."];
/** L'attente au curseur nu, secondes — presque trois clignotements. */
const TYPE_IDLE = 1.5;
/** La demi-période du clignotement (530 ms allumé, 530 ms éteint — le battement VT). */
const BLINK = 0.53;

/* -------------------------------------------------------------------------- */
/* shaders                                                                    */
/* -------------------------------------------------------------------------- */

const VERT = /* glsl */ `
uniform float uTime;
uniform float uDistort;
uniform float uFreq;
uniform float uPres;
uniform float uTv;
uniform float uFly;
uniform float uAspX;
uniform float uSeatK;
attribute vec3 aTarget;
attribute float aSeed;
varying vec3 vNrm;
varying vec3 vWPos;
varying vec2 vUv;
varying vec2 vSeat;
varying vec3 vFormN;
${SNOISE}
${FORM_DISPLACE}

const float PI = 3.14159265359;

/** Between the sphere home and the seat on the work — the seat wears the current
    aspect and the size cap (uniforms), so the geometry is built ONCE at a reference
    aspect and resizes without a rebuild. Swirl as the skull does it: sampled on the
    home direction at low frequency, so the shell stretches rather than tears. */
vec3 baseAt(vec3 home, vec3 seat, float w){
  vec3 p = mix(home, seat, w);
  // In flight only — see ChromeSkull's baseAt: zero at both ends of the morph, and
  // the settled tableau (most of Work's screen time) skips the three fetches on
  // every vertex of the carved frame.
  float fly = sin(w * PI) * uFly;
  if (fly > 1e-4) {
    vec3 d = normalize(home + vec3(1e-4));
    vec3 nz = vec3(snoise(d * 1.1 + vec3(0.0, uTime * 0.25, 0.0)),
                   snoise(d * 1.1 + vec3(4.7, uTime * 0.20, 1.3)),
                   snoise(d * 1.1 + vec3(8.3, uTime * 0.15, 2.6)));
    p += nz * fly;
  }
  return p;
}

void main(){
  // Staggered arrival on the built-in key: canvas first, moulding last (see the
  // seeds in the geometry builders) — the frame is RAISED out of an already-forming
  // sheet, which is the whole read of the entrance.
  //
  // uTv, PAS uPres — le poste's OWN forming progress (md.flat, unchanged since T6),
  // pas le signal du champ ci-dessous. Les deux valaient la même chose avant ce
  // correctif (les deux LISAIENT md.flat) ; ils divergent maintenant, et c'est cette
  // ligne qui doit rester sur celui du poste : combien le boîtier s'est LEVÉ hors de
  // la sphère ne regarde que le scrub de Work (workReveal.form), jamais l'agonie du
  // crâne — mesuré : md.flat reste À ZÉRO tout le temps que le crâne fond (voir le
  // commentaire d'uPres plus bas), donc rien ici ne bouge pendant le relais.
  float w = clamp((uTv - aSeed * 0.35) / 0.65, 0.0, 1.0);
  w = w * w * (3.0 - 2.0 * w);

  // The seat as BUILT. A "collée" factor lived here — the dev panel's dial that walked
  // the canvas's edge across the liner band onto the moulding — and the answer it found
  // was 1: the band of bare chrome between picture and frame stays.
  vec3 seat = aTarget * vec3(uAspX, 1.0, 1.0) * uSeatK;
  vec3 p0 = baseAt(position, seat, w);
  vec3 nrm = normalize(mix(normalize(position + vec3(1e-4)), normal, w));

  // The shared lump/flow field, exactly as the skull samples it — twice, one
  // fixed-point step, so the disguised sphere wears the liquid's lumps in the same
  // places and the handover has nothing to show.
  //
  // uPres A CHANGÉ DE SENS ICI — ce n'est plus md.flat. formOffset (voir formField.ts)
  // lit ce uniform pour savoir combien étouffer le lump (1 − uPres) et combien
  // renforcer le flow (0.25 + 0.35·uPres) : c'est la même bascule que le crâne fait
  // avec SON uPres (= s.pres), et le relais n'est invisible que si les deux valent LE
  // MÊME NOMBRE au même instant — deux sphères déguisées qui ne s'accordent que sur
  // leur rayon (voir buildPart, ~ligne 533 : le même repli de 0.96 que le crâne) mais
  // pas sur leur grain restent deux objets reconnaissables l'un sous l'autre.
  //
  // MESURÉ (avant ce correctif) : au cœur du relais (crâne à ~40 % d'opacité,
  // poste à ~20 %, scrollY ≈ 2040 sur un chargement de test), s.pres valait 0.41
  // (crâne déjà à 59 % de lump) tandis que md.flat valait encore 0 (poste à 100 % de
  // lump) — le poste montrait TOUJOURS son grain maximal tant que le crâne n'avait
  // pas fini de fondre, quel que soit où le crâne en était lui-même. D'où
  // max(s.pres, md.flat) : tant que md.flat n'a pas commencé à monter (tout le
  // relais), ce max SUIT s.pres — le poste emprunte le degré de lissage du crâne,
  // comme deux rendus de la même sphère plutôt que deux sphères indépendantes. Une
  // fois md.flat > s.pres (le crâne est déjà parti, le poste se déroule pour de
  // vrai), le max redevient md.flat et le comportement d'avant ce correctif reprend
  // À L'IDENTIQUE — cette ligne ne change donc RIEN à la façon dont le poste se
  // forme, seulement à l'aspect de sa sphère de déguisement pendant le relais.
  float f = formOffset(p0);
  f = formOffset(p0 + nrm * f);
  /*
   * LA MATIÈRE MEURT AVEC LA FORMATION. Le champ partagé est ce qui fait porter à la
   * sphère déguisée les mêmes grumeaux que le liquide — indispensable au départ, le
   * relais avec le crâne se joue là — mais un téléviseur n'est pas de la matière
   * vivante : formé, il est RIGIDE. L'ancienne toile gardait le flow à pleine
   * présence (« keeps the settled canvas breathing ») parce qu'une toile respire ;
   * un boîtier ne respire pas, et un objet dur qui ondule lit comme une erreur.
   * (1 − uTv) éteint le déplacement ET sa correction de normale ensemble — l'un
   * sans l'autre, c'est une surface plate éclairée comme si elle ondulait.
   *
   * SUR uTv, PAS uPres : la rigidité est une propriété du POSTE (elle doit s'éteindre
   * une fois QU'IL s'est formé, sur md.flat), pas du champ partagé emprunté au crâne
   * pendant le relais — si ce gate lisait le uPres ci-dessus, il s'éteindrait dès que
   * s.pres redescend vers 0 en fin de relais, c'est-à-dire AVANT que le poste n'ait
   * commencé à se déployer, ce qui est exactement l'inverse de ce qui est demandé
   * (« il doit s'éteindre PLUS TARD, une fois le relais passé »).
   */
  float alive = 1.0 - uTv;
  // f BRUT dans la différence du gradient, alive appliqué UNE fois au résultat. La
  // première version faisait f *= alive avant la soustraction : le gradient valait
  // alors alive·(F(ps±e) − alive·f)/e, soit un biais isotrope alive·(1−alive)·f/e sur
  // les trois composantes — à mi-morph, de l'ordre de la normale unité : le chrome
  // s'éclairait comme si toute la surface penchait vers (1,1,1), en scintillant avec
  // le champ. ∇(alive·F) = alive·∇F exige le F brut des deux côtés de la différence.
  vec3 ps = p0 + nrm * (f * alive);

  float e = 0.06;
  vec3 grad = (vec3(formOffset(ps + vec3(e, 0.0, 0.0)),
                    formOffset(ps + vec3(0.0, e, 0.0)),
                    formOffset(ps + vec3(0.0, 0.0, e))) - f) / e * alive;
  vec3 nOut = normalize(nrm - (grad - nrm * dot(grad, nrm)));

  vec4 wp = modelMatrix * vec4(ps, 1.0);
  vWPos = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * nOut);
  // LE SIÈGE BRUT (aTarget), pas la position cadrée : c'est l'espace de l'OBJET.
  // Le rectangle du tube a d'abord été comparé à ps — la position après uSeatK — et
  // uSeatK bouge avec le viewport, le cadrage (TV_FILL) et la caméra : le rectangle,
  // cuit sous un k donné, se décalait de l'écran à chaque changement de l'un des
  // trois — « le texte a disparu » était ça. aTarget ne dépend de rien : il est
  // mesuré par tvExt, publié par le rect DOM, et gate le tube — un seul espace,
  // trois consommateurs, aucune conversion pour se tromper.
  vSeat = aTarget.xy;
  vFormN = nOut;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/**
 * LA COULEUR DE LA DALLE ÉTEINTE — le seul nombre de couleur restant ici : le boîtier
 * est texturé (uSkin), il n'a plus de couleur à régler. TV_GLASS ne sert qu'au shader
 * de l'ancienne dalle procédurale, cachée mais compilée : un gris de verre, plus clair
 * que le noir, parce qu'un tube éteint renvoie la pièce. (TV_BODY, le plastique noir de
 * l'étape intermédiaire supprimée, est parti avec elle.)
 */
const TV_CONSTS = /* glsl */ `
const vec3 TV_GLASS = vec3(0.128, 0.132, 0.138);
`;

const FRAG_FRAME = /* glsl */ `
uniform sampler2D uEnv;
uniform float uEnvInt;
uniform float uEnvRot;
uniform float uRough;
uniform float uFade;
uniform vec3 uLo;
uniform vec3 uHi;
uniform vec3 uCamPos;
uniform float uTv;
uniform sampler2D uSkin;
uniform float uSkinFres;
uniform vec3 uSkinTint;
uniform float uSkinSat;
uniform float uSkinGain;
uniform float uReveal;
uniform sampler2D uScreen;
uniform float uGlow;
uniform float uTube;
uniform vec2 uScrMin;
uniform vec2 uScrMax;
varying vec3 vNrm;
varying vec3 vWPos;
varying vec2 vUv;
varying vec2 vSeat;
varying vec3 vFormN;
${TV_CONSTS}
${CHROME_SHADE}
void main(){
  vec3 rd = normalize(vWPos - uCamPos);
  vec3 n = normalize(vNrm);
  if (dot(n, rd) > 0.0) n = -n;
  vec3 col = chromeShade(n, rd);

  /*
   * LE POSTE SE FORME EN CHROME, ET RESTE CHROME UNE FOIS FORMÉ.
   *
   * Une étape intermédiaire — chrome → plastique noir pendant la formation, puis
   * plastique → peau au dévoilement — a existé et a été retirée : elle venait du
   * design précédent (un poste sans texture), et elle intercalait une matière que
   * personne n'avait demandée entre les deux qui comptent. La séquence est « la
   * forme d'abord, la matière ensuite » : le crâne lâche une sphère chrome, la
   * sphère devient un téléviseur CHROME — le relais mesh-à-mesh reste invisible
   * puisque les deux mains tiennent le même chrome — et c'est le révélateur
   * (uReveal, sur md.dev) qui retire le chrome pour découvrir la vraie peau.
   *
   * Le fresnel reste : la peau garde un vernis (un boîtier n'est pas mat comme du
   * papier), et c'est lui qui raccroche la texture à l'éclairage de la scène.
   */
  float fres = pow(1.0 - abs(dot(n, rd)), 3.5);

  /*
   * ET LE CHROME S'EFFACE — la vraie peau du poste apparaît dessous.
   *
   * TROIS ÉTATS, DEUX SIGNAUX, dans cet ordre : le chrome prend la forme d'un poste (uTv, sur
   * md.flat), puis le chrome se retire pour révéler le plastique (uReveal, sur md.dev). Les
   * deux ne sont pas un seul mouvement : la forme d'abord, la matière ensuite. C'est la
   * dramaturgie que ce fichier tient déjà pour le tirage — « the metal settles, chrome and
   * still, THEN the print rises out of it » — appliquée au poste au lieu de la photographie.
   *
   * md.dev est le bon signal parce qu'il ne démarre QUE quand la plaque est exactement plate,
   * et qu'il court sur son propre temps et non sur la molette. Le dévoilement est donc un
   * événement, pas un scrub : c'est la seule chose de cette traversée que le lecteur ne pilote
   * pas image par image.
   *
   * La texture garde un peu du fresnel du chrome par-dessus : un boîtier de télé n'est pas mat
   * comme du papier, il a un vernis. Sans ce reste de réflexion la peau lit comme un décalque.
   */
  vec3 skin = texture2D(uSkin, vUv).rgb;
  /*
   * L'ÉTALONNAGE DE LA PEAU — trois termes, tous NEUTRES par défaut (teinte blanche,
   * gain 1, saturation 1), donc ce bloc ne change rien tant que personne n'y touche.
   *
   * L'ORDRE EST LE SIEN : teinte et gain d'abord, désaturation ensuite, vernis en
   * dernier. Saturer avant de teinter aurait fait dépendre la saturation de la teinte
   * (une teinte rouge sur une image désaturée redonne du rouge saturé) ; et le vernis
   * doit rester DERNIER parce qu'il n'appartient pas à la couleur du plastique mais à
   * son reflet — il doit monter sur la couleur finie, sinon l'étalonnage repeint aussi
   * le brillant.
   *
   * Le gain est propre à la peau, là où l'exposition du panneau est globale : sur un
   * boîtier trop clair, celui-ci est ce qu'il faut baisser, pas l'autre.
   */
  skin *= uSkinTint * uSkinGain;
  // Rec.709 — approximatif si la texture est en NoColorSpace (ses octets sRGB passent
  // pour du linéaire), mais c'est un étalonnage réglé À L'ŒIL sur le résultat affiché :
  // la molette veut dire ce qu'on voit, pas ce qu'un colorimètre mesurerait.
  skin = mix(vec3(dot(skin, vec3(0.2126, 0.7152, 0.0722))), skin, uSkinSat);
  skin += skin * fres * uSkinFres;
  col = mix(col, skin, uReveal * uTv);

  /*
   * LE TUBE — hello world, projeté À PLAT dans l'espace de la forme.
   *
   * Pas d'UV et pas de second mesh : on ne connaît pas l'îlot UV de l'écran dans
   * l'atlas du glb, et l'ancienne dalle procédurale (le porte-photographie) ne
   * coïncide pas avec l'inset du poste. Une projection planaire bornée par un
   * rectangle en espace de forme n'a besoin de rien savoir du modèle — le
   * rectangle est réglé à l'œil sur l'inset (uScrMin/uScrMax, ajustables en dev
   * via window.__scr), et la normale de face (vFormN.z) empêche la projection de
   * traverser le boîtier et de s'imprimer sur le dos.
   *
   * ADDITIF, jamais mélangé : un phosphore ÉMET. Mélanger le vert dans la peau
   * l'éteindrait là où la peau est sombre — c'est-à-dire sur l'écran, là où le
   * texte est. Les lignes de balayage et la vignette ne modulent que l'émission :
   * elles n'existent que dans la lumière du tube.
   */
  // max(span, ε) : un rectangle dégénéré posé par la poignée dev (__scr) donnerait
  // 0/0 → NaN, toutes les comparaisons faussées, et un tube éteint SANS SYMPTÔME —
  // indiscernable d'un uGlow à zéro pour celui qui règle.
  vec2 suv = (vSeat - uScrMin) / max(uScrMax - uScrMin, vec2(1e-4));
  if (uGlow > 0.001 && uTube > 0.5 && vFormN.z > 0.35 &&
      suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
    /*
     * COUSU AU VERRE, pas superposé. Trois termes, et chacun manquait quand le texte
     * lisait comme un calque posé sur l'écran :
     *
     *  - l'UV est TIRÉE PAR LA NORMALE LOCALE (vFormN.xy) : là où le verre bombe, le
     *    texte et les lignes de balayage se courbent avec lui — c'est la réfraction
     *    d'un phosphore vu à travers un verre épais, et c'est le geste que formPhoto
     *    fait déjà pour ses tirages (« drag along the surface's own tilt locks it to
     *    the relief the way a wet print is ») ;
     *  - l'HALATION : quatre taps autour du point, faibles — le phosphore bave dans
     *    le verre, en plus du halo du glyphe déjà dans la texture ;
     *  - l'émission MEURT OÙ LE VERRE TOURNE (vFormN.z^2.5) : un tube vu de biais
     *    s'éteint, un calque non. C'est ce terme qui colle le texte à la géométrie.
     */
    vec2 tuv = vec2(suv.x, 1.0 - suv.y) + vFormN.xy * vec2(0.10, -0.10);
    vec3 lit = texture2D(uScreen, tuv).rgb;
    lit += (texture2D(uScreen, tuv + vec2(0.006, 0.0)).rgb +
            texture2D(uScreen, tuv - vec2(0.006, 0.0)).rgb +
            texture2D(uScreen, tuv + vec2(0.0, 0.008)).rgb +
            texture2D(uScreen, tuv - vec2(0.0, 0.008)).rgb) * 0.22;
    float scan = 0.85 + 0.15 * sin(tuv.y * 220.0 * 3.14159);
    vec2 sc = suv * 2.0 - 1.0;
    float vig = 1.0 - 0.30 * dot(sc, sc);
    float behind = pow(max(vFormN.z, 0.0), 2.5);
    col += lit * scan * vig * behind * uGlow * uTv;
  }

  gl_FragColor = vec4(col, uFade);
}
`;

const FRAG_CANVAS = /* glsl */ `
uniform sampler2D uEnv;
uniform float uEnvInt;
uniform float uEnvRot;
uniform float uRough;
uniform float uFade;
uniform vec3 uLo;
uniform vec3 uHi;
uniform vec3 uCamPos;
uniform float uTv;
uniform sampler2D uScreen;
uniform float uGlow;
uniform float uTime;
uniform float uCar;
uniform float uDevZoom;
uniform float uDevDim;
varying vec3 vNrm;
varying vec3 vWPos;
varying vec2 vUv;
${SNOISE}
float fbm(vec3 p){ return snoise(p) * 0.7 + snoise(p * 2.1) * 0.3; }
${TV_CONSTS}
${CHROME_SHADE}
${PHOTO_SHADE}
void main(){
  vec3 rd = normalize(vWPos - uCamPos);
  vec3 n = normalize(vNrm);
  if (dot(n, rd) > 0.0) n = -n;
  vec3 col = chromeShade(n, rd);
  // The photograph, on the canvas's own uv. uPhotoOn carries the shaped density,
  // uDevZoom an optional approach-from-behind and uDevDim an optional frame's-shadow
  // dim — both tried, both rejected, both now pinned at 1 (see the uniforms).
  // Faces only: the print's edge stays bare metal.
  if (uPhotoOn > 0.002 && abs(vNrm.z) > 0.0) {
    float slot = floor(uCar + 0.5);
    if (photoHas(slot) > 0.5) {
      vec2 tuv = (vUv - 0.5) * uDevZoom + 0.5;
      if (max(abs(tuv.x - 0.5), abs(tuv.y - 0.5)) <= 0.5) {
        col = photoShade(col, normalize(vNrm), tuv, uDevDim, photoTone(slot, tuv, uColour));
      }
    }
  }
  /*
   * LA DALLE ÉTEINTE — chrome → verre gris, sur le même uTv que le boîtier.
   *
   * Un tube cathodique éteint n'est pas noir et n'est pas un miroir : c'est du verre bombé
   * devant un phosphore gris. Donc deux termes et pas un.
   *
   * Le fresnel est BIEN PLUS raide que celui du boîtier (7.0 contre 3.5) et sa réflexion bien
   * plus forte : c'est du verre, il renvoie franchement la pièce sur les bords et presque rien
   * de face. C'est cette différence de courbe entre les deux matériaux qui les fait lire comme
   * deux matières distinctes plutôt que comme un objet d'une seule couleur — et c'est aussi ce
   * qui donnera l'illusion du bombé même sur une dalle géométriquement plate.
   *
   * La vignette assombrit les bords de l'écran. Un tube n'éclaire jamais ses coins de la même
   * façon que son centre, et sans ça la dalle lit comme un rectangle de peinture grise.
   */
  float gf = pow(1.0 - abs(dot(normalize(vNrm), normalize(vWPos - uCamPos))), 7.0);
  vec2 sc = vUv * 2.0 - 1.0;
  float vig = 1.0 - 0.42 * dot(sc, sc);
  vec3 glass = TV_GLASS * vig + col * (0.05 + 0.95 * gf);
  col = mix(col, glass, uTv);

  /*
   * LE TUBE S'ALLUME. Trois choses, et aucune n'est décorative.
   *
   * ADDITIF, jamais mélangé : un phosphore ÉMET, il ne peint pas la dalle. Mélanger le vert
   * dans le verre l'aurait éteint là où le verre est sombre, c'est-à-dire au centre — là où
   * le texte est. Additionner le laisse traverser, et la dalle continue de refléter la pièce
   * par-dessus, ce qui est ce qu'on voit sur un vrai tube.
   *
   * LES LIGNES DE BALAYAGE, en modulant l'émission et pas la dalle : elles n'existent que
   * dans la lumière du tube. 384 lignes pour 384 pixels de texture, c'est-à-dire une par
   * ligne réelle — au-dessus on obtient du moiré, en dessous ça lit comme des rayures.
   *
   * ET LA LUEUR : le phosphore bave. Un seul tap décalé suffit ici, parce que le texte est
   * gros et que le vrai halo viendra du terme additif lui-même une fois le tube lumineux.
   */
  vec3 lit = texture2D(uScreen, vUv).rgb;
  lit += texture2D(uScreen, vUv + vec2(0.0, 0.004)).rgb * 0.5;
  float scan = 0.82 + 0.18 * sin(vUv.y * 384.0 * 3.14159);
  col += lit * scan * uGlow * uTv;

  gl_FragColor = vec4(col, uFade);
}
`;

/* -------------------------------------------------------------------------- */
/* geometry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Pair every vertex of a built geometry with its home on the resting sphere — the
 * skull's radial pairing, with the same inward tuck for anything that cannot reach
 * the silhouette (here: the sheet's back half, which would otherwise stack on its
 * front at the sphere state and z-fight through the crossfade).
 */
function toMorph(geo: BufferGeometry, seedOf: (x: number, y: number, z: number) => number): BufferGeometry {
  const pos = geo.getAttribute("position");
  const n = pos.count;
  const home = new Float32Array(n * 3);
  const target = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    target[i * 3] = x;
    target[i * 3 + 1] = y;
    target[i * 3 + 2] = z;
    const r = Math.hypot(x, y, z) || 1e-4;
    const back = z < 0 ? 0.96 : 1;
    const k = (FORM_RADIUS * back) / r;
    home[i * 3] = x * k;
    home[i * 3 + 1] = y * k;
    home[i * 3 + 2] = z * k;
    seed[i] = seedOf(x, y, z);
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new BufferAttribute(home, 3));
  out.setAttribute("normal", geo.getAttribute("normal").clone());
  out.setAttribute("uv", geo.getAttribute("uv").clone());
  out.setAttribute("aTarget", new BufferAttribute(target, 3));
  out.setAttribute("aSeed", new BufferAttribute(seed, 1));
  if (geo.index) out.setIndex(geo.index.clone());
  return out;
}

/** The canvas — a tessellated slab at the reference aspect (1:1; uAspX resizes). */
function buildCanvas(): BufferGeometry {
  const g = new BoxGeometry(2 * PLATE_H, 2 * PLATE_H, 2 * PLATE_T, 48, 48, 1);
  const rMax = Math.hypot(PLATE_H, PLATE_H);
  return toMorph(g, (x, y) => (Math.hypot(x, y) / rMax) * CANVAS_SEED);
}

/*
 * LE POSTE. Un ordinateur des années 80 — moniteur, boîtier, clavier — et non plus un
 * téléviseur. SEPT meshes, un par matériau UDIM (les peaux default_1001…1007), d'où
 * l'architecture multi-parties de ce fichier : partsFrame les normalise dans un repère
 * commun, chaque partie a son matériau et sa peau.
 *
 * Le fichier livré pesait 68,7 Mo (21 textures PBR, 174 778 sommets). Servi : 1,0 Mo —
 * baseColor seules (le shader n'échantillonne qu'elles), WebP 1k, simplification
 * meshopt à 0,35 (67 089 sommets), compression meshopt. Les noms TV_* restent : le
 * rôle est le même, renommer trente symboles n'aurait documenté que le churn.
 *
 * Un NOUVEAU nom de fichier plutôt qu'un ?v=3 : les en-têtes de cache du projet
 * donnent trente jours à /models/* et un nom neuf ne peut pas être servi périmé. Le
 * preload de layout.tsx doit rester identique à l'octet près.
 *
 * LICENCE À ÉTABLIR AVANT PUBLICATION. Export Sketchfab sans champ copyright — voir
 * l'entrée « ⚠ » d'ATTRIBUTIONS.md, qui bloque le déploiement tant qu'elle n'est pas
 * complétée ou le modèle remplacé.
 */
const FRAME_SRC = "/models/computer.glb";

/**
 * LE REPÈRE PARTAGÉ DES PARTIES. Le poste n'est plus un mesh : l'ordinateur en a SEPT
 * (moniteur, verre, boîtier, clavier…), un par matériau UDIM. La normalisation —
 * centre, échelle, cap — doit être calculée sur l'UNION de leurs boîtes et appliquée
 * à toutes : normaliser chaque partie sur sa propre boîte les aurait empilées au
 * centre, toutes à la même taille.
 *
 * Le cap (TV_YAW) s'applique AVANT la mesure : une échelle prise sur une boîte de
 * travers cisaillerait l'objet. Et UNE seule échelle pour les trois axes — les
 * proportions de l'objet sont les siennes.
 */
function partsFrame(srcs: Mesh[]): Matrix4[] {
  const frameRef = 2 * (PLATE_H + LINER_W + 2 * FRAME_W);
  const orient = new Matrix4().makeRotationY(TV_YAW);
  const union = new Box3();
  const per: Matrix4[] = [];
  const box = new Box3();
  for (const src of srcs) {
    src.updateWorldMatrix(true, false);
    const m = new Matrix4().copy(orient).multiply(src.matrixWorld);
    per.push(m);
    box.setFromBufferAttribute(src.geometry.getAttribute("position") as BufferAttribute);
    box.applyMatrix4(m);
    union.union(box);
  }
  const centre = union.getCenter(new Vector3());
  const span = union.getSize(new Vector3());
  const s1 = frameRef / Math.max(span.x || 1, span.y || 1);
  const norm = new Matrix4()
    .makeScale(s1, s1, s1)
    .multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
  return per.map((m) => new Matrix4().copy(norm).multiply(m));
}

function buildPart(src: Mesh, toForm: Matrix4): BufferGeometry {
  const srcPos = src.geometry.getAttribute("position") as BufferAttribute;
  const srcNrm = src.geometry.getAttribute("normal") as BufferAttribute;
  const toFormNrm = new Matrix3().getNormalMatrix(toForm);

  const n = srcPos.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const p = new Vector3();
  const v = new Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(srcPos, i).applyMatrix4(toForm);
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    v.fromBufferAttribute(srcNrm, i).applyMatrix3(toFormNrm).normalize();
    nrm[i * 3] = v.x;
    nrm[i * 3 + 1] = v.y;
    nrm[i * 3 + 2] = v.z;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new BufferAttribute(nrm, 3));
  const srcUv = src.geometry.getAttribute("uv");
  g.setAttribute(
    "uv",
    srcUv ? (srcUv.clone() as BufferAttribute) : new BufferAttribute(new Float32Array(n * 2), 2)
  );
  if (src.geometry.index) g.setIndex(src.geometry.index.clone());

  const inr = PLATE_H + LINER_W + FRAME_W;
  return toMorph(g, (x, y) => 0.55 + 0.45 * Math.min(1, (Math.abs(x) + Math.abs(y)) / (2 * inr)));
}

/**
 * THE LINING. The disguise's sphere is a SHELL of projected homes — the canvas's
 * faces and the moulding's band — and radial projection leaves the cap behind them
 * bare: seen alone (the corridor, where the raymarcher stays dark on purpose), the
 * resting "sphere" read as a glass bauble with its back missing. The liquid used to
 * hide this by accident, at fullscreen-march price, whenever its fade leaked back in.
 *
 * So the frame carries a lining: a real sphere, HALF A PERCENT under the homes so
 * the shell always wins the depth test where it exists, filling the holes where it
 * does not. Its seats tuck it inside the canvas slab — an ellipsoid the closed box
 * hides at every aspect — so the settled work carries no trace of it, and its seeds
 * sit with the moulding's crowd: the sheets pour OUT of a mass that is still whole,
 * and the mass itself drains into the work behind them.
 */
const LINING_R = 0.995;

function withLining(geo: BufferGeometry): BufferGeometry {
  const sph = new SphereGeometry(FORM_RADIUS * LINING_R, 96, 64);
  const sp = sph.getAttribute("position") as BufferAttribute;
  const gp = geo.getAttribute("position") as BufferAttribute;
  const gn = geo.getAttribute("normal") as BufferAttribute;
  const gu = geo.getAttribute("uv") as BufferAttribute;
  const gt = geo.getAttribute("aTarget") as BufferAttribute;
  const gs = geo.getAttribute("aSeed") as BufferAttribute;
  const n0 = gp.count;
  const n1 = sp.count;
  const n = n0 + n1;

  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const tgt = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  // Copied by accessor, not by buffer: the glb's attributes are quantized
  // (KHR_mesh_quantization) and a raw concat would splice int16 into float32.
  for (let i = 0; i < n0; i++) {
    pos[i * 3] = gp.getX(i);
    pos[i * 3 + 1] = gp.getY(i);
    pos[i * 3 + 2] = gp.getZ(i);
    nrm[i * 3] = gn.getX(i);
    nrm[i * 3 + 1] = gn.getY(i);
    nrm[i * 3 + 2] = gn.getZ(i);
    uv[i * 2] = gu.getX(i);
    uv[i * 2 + 1] = gu.getY(i);
    tgt[i * 3] = gt.getX(i);
    tgt[i * 3 + 1] = gt.getY(i);
    tgt[i * 3 + 2] = gt.getZ(i);
    seed[i] = gs.getX(i);
  }
  for (let i = 0; i < n1; i++) {
    const j = n0 + i;
    const x = sp.getX(i);
    const y = sp.getY(i);
    const z = sp.getZ(i);
    const r = Math.hypot(x, y, z) || 1e-4;
    pos[j * 3] = x;
    pos[j * 3 + 1] = y;
    pos[j * 3 + 2] = z;
    // A sphere's normal is its own direction — true at the home AND at the seat.
    nrm[j * 3] = x / r;
    nrm[j * 3 + 1] = y / r;
    nrm[j * 3 + 2] = z / r;
    // The seat: an ellipsoid tucked inside the canvas slab. x rides uAspX in the
    // shader exactly as the slab's own width does, so it fits at every aspect.
    tgt[j * 3] = (x / r) * PLATE_H * 0.7;
    tgt[j * 3 + 1] = (y / r) * PLATE_H * 0.7;
    tgt[j * 3 + 2] = (z / r) * PLATE_T * 0.5;
    seed[j] = 0.55 + 0.3 * Math.min(1, Math.max(0, 0.5 + y / (2 * FORM_RADIUS)));
  }

  const gi = geo.index;
  const si = sph.index!;
  const giCount = gi ? gi.count : n0;
  const idx = new Uint32Array(giCount + si.count);
  if (gi) for (let i = 0; i < giCount; i++) idx[i] = gi.getX(i);
  else for (let i = 0; i < n0; i++) idx[i] = i;
  for (let i = 0; i < si.count; i++) idx[giCount + i] = n0 + si.getX(i);
  sph.dispose();

  const out = new BufferGeometry();
  out.setAttribute("position", new BufferAttribute(pos, 3));
  out.setAttribute("normal", new BufferAttribute(nrm, 3));
  out.setAttribute("uv", new BufferAttribute(uv, 2));
  out.setAttribute("aTarget", new BufferAttribute(tgt, 3));
  out.setAttribute("aSeed", new BufferAttribute(seed, 1));
  out.setIndex(new BufferAttribute(idx, 1));
  return out;
}

/* -------------------------------------------------------------------------- */

export function ChromeTableau({ reduced }: Props) {
  const group = useRef<Group>(null);
  const { camera, size } = useThree();
  /*
   * L'ENVIRONNEMENT, commutable depuis le panneau — « local » est le .hdr du dépôt, celui
   * que la PROD sert ; tout le reste est un preset drei tiré d'un CDN, réservé au réglage
   * (voir POSTE_ENVS). Un abonnement étroit au seul nom : c'est la seule molette qui
   * change une ressource, donc la seule qui a le droit de faire re-rendre cette scène.
   *
   * Changer d'environnement fait RE-SUSPENDRE le hook de drei, donc le <Suspense> de
   * ChromeCanvas montre son fallback (null) le temps du téléchargement : le poste
   * disparaît une seconde puis revient. Coût assumé d'un outil de dev — pas un chemin de
   * prod, où `env` ne quitte jamais "local".
   */
  const env = usePosteEnv();
  const envMap = useEnvironment(env === "local" ? { files: ENV_FILE } : { preset: env });
  const appear = useRef(0);
  const modeVis = useRef(0);
  const colScratch = useMemo(() => new Color(), []);
  const frameBox = useRef({ w: 0, h: 0, cx: 0 });
  /**
   * LA ROTATION APPLIQUÉE, tenue à part de `s.spin` — voir son useFrame pour le
   * pourquoi : `s.spin` appartient au blob (le crâne et le liquide le lisent tel
   * quel, et doivent continuer à le faire), le poste n'en garde qu'une part qui
   * DÉCROÎT à mesure qu'il se forme.
   */
  const heldSpin = useRef(0);

  const canvasGeo = useMemo(() => buildCanvas(), []);

  // meshopt-compressed glb (EXT_meshopt_compression) — the decoder ships with drei.
  const { scene: frameScene } = useGLTF(FRAME_SRC, false, true);
  // TOUTES les parties — l'ordinateur est sept meshes (un par matériau UDIM), et n'en
  // prendre que le premier, l'habitude du modèle mono-mesh, n'affichait qu'un septième
  // de l'objet.
  const frameSrcs = useMemo<Mesh[]>(() => {
    const out: Mesh[] = [];
    frameScene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.geometry) out.push(m);
    });
    return out;
  }, [frameScene]);

  /**
   * LE CANVAS DU TUBE — sa fabrication et son pinceau (`draw`) ont déménagé dans
   * src/lib/tubeScreen.ts, avec toute la justification (canvas 2D et non géométrie de texte,
   * discipline de repeinture, résolution) : le tunnel de pixels (à venir) doit peindre et lire
   * EXACTEMENT le même canvas que ce tube, donc ce n'est plus une ressource qu'un seul
   * composant possède. `TV_LINES` — la constante qui vit dans CE fichier — tient lieu de
   * `lines` ; tubeScreen ne consulte cet argument qu'à sa toute première invocation (voir son
   * commentaire pour la précondition que ça impose).
   */
  const screen = useMemo(() => tubeScreen(TV_LINES), []);
  /**
   * Le dernier état dessiné, et l'horloge du tube — voir la séquence dans le useFrame.
   * `nonce` est la mise en page du texte déjà peinte (le panneau la bouge), `replay` le
   * dernier rembobinage honoré.
   */
  const tube = useRef({ t: 0, line: -1, chars: -1, cursor: false, nonce: -1, replay: 0 });

  /**
   * LA TEXTURE DU POSTE, prise sur le matériau du glb.
   *
   * Le reste du projet n'utilise jamais les textures des modèles — le crâne et l'ancien
   * cadre étaient re-chromés, géométrie seule. Le poste est le premier objet dont la
   * MATIÈRE est le sujet : ce qui apparaît sous le chrome est le vrai boîtier, ses usures
   * et ses sérigraphies. D'où les textures conservées dans le fichier (WebP 1k :
   * 11,7 Mo livrés → 231 Ko).
   *
   * Le memo LIT seulement ; les mutations (colorSpace) vivent dans l'effet dessous —
   * muter un objet sorti d'un hook dans un useMemo est ce que le lint interdit, à raison.
   * Et pas de flipY ici : GLTFLoader pose déjà flipY = false (la convention glTF) ;
   * c'est la CanvasTexture du tube, plus haut, qui a besoin du sien.
   */
  const tvTexs = useMemo<(Texture | null)[]>(
    () =>
      frameSrcs.map((m) => {
        const raw = m.material;
        const mat = (Array.isArray(raw) ? raw[0] : raw) as { map?: Texture } | undefined;
        return mat?.map ?? null;
      }),
    [frameSrcs]
  );
  /*
   * L'ESPACE COULEUR DE LA PEAU, et pourquoi il est réglable.
   *
   * NoColorSpace était posé ici sans justification — le seul override non commenté du
   * fichier. Ce qu'il fait : GLTFLoader marque un baseColor en SRGBColorSpace, donc le
   * sampler décode sRGB→linéaire ; le forcer à NoColorSpace SAUTE ce décodage, les octets
   * sRGB passent pour du linéaire, et la sortie du renderer les ré-encode — la peau sort
   * plus claire et moins saturée que le fichier. C'est peut-être le choix voulu (un
   * boîtier beige pâli par vingt ans de lumière) mais rien ne le disait, donc le panneau
   * permet de voir les deux et de trancher. Le défaut reste NoColorSpace : ce commit ne
   * change pas l'image.
   */
  const skinSrgb = usePosteSkinSrgb();
  useEffect(() => {
    for (const tex of tvTexs) {
      if (!tex) continue;
      tex.colorSpace = skinSrgb ? SRGBColorSpace : NoColorSpace;
      tex.needsUpdate = true;
    }
  }, [tvTexs, skinSrgb]);
  const frameGeos = useMemo(() => {
    if (!frameSrcs.length) return null;
    const forms = partsFrame(frameSrcs);
    const parts = frameSrcs.map((src, i) => buildPart(src, forms[i]));
    /*
     * PAS DE DOUBLURE. Elle bouchait la calotte que la plaque — un slab et un anneau,
     * OUVERTS — laissait nue derrière sa coquille de homes projetés. L'ordinateur est
     * sept coques FERMÉES autour de l'origine : leur projection radiale couvre la
     * sphère entière, et la doublure ne servait plus qu'à dépasser — son siège,
     * l'ellipsoïde taillé pour la plaque, sortait du moniteur (le « disque » visible
     * à droite du poste : la souris élargit la boîte, le moniteur n'est pas au
     * centre). withLining reste défini pour le jour où un modèle ouvert reviendra.
     */
    return parts;
  }, [frameSrcs]);
  // A swapped-out frame geometry is not auto-disposed: R3F frees on unmount, and this
  // mesh never unmounts — without this, a glb arriving late leaks the old 132k verts.
  useEffect(() => () => frameGeos?.forEach((g) => g.dispose()), [frameGeos]);

  /**
   * Les demi-étendues RÉELLES du poste posé, mesurées sur ses sièges (aTarget), en
   * unités de forme. Tout ce qui doit coller à l'objet en découle — le cadrage
   * (TV_FILL) et le rectangle DOM publié — au lieu de constantes qui supposaient
   * l'ancienne plaque : la revue a montré la hit-box ~60 % trop large et le cadrage
   * dérivé de la mauvaise dimension (le glb est normalisé sur sa LARGEUR, l'axe le
   * plus long, pas sur sa hauteur). Mesuré, il ne peut pas dériver du glb.
   * (La doublure interne participe au scan et ne change pas les maxima : ses sièges
   * sont un ellipsoïde enfoui sous la coque.)
   */
  /*
   * `glassZ` — LE FRONT DU VERRE SOUS LE RECTANGLE DU TUBE, PAS LE FRONT DE L'OBJET.
   * Nécessaire pour T6 (l'invariant du fondu : le poste doit être ENTIÈREMENT éteint avant
   * que le plan proche de la caméra ne franchisse le verre — voir tubeMouth.ts et le
   * useFrame plus bas).
   *
   * DEUX FAUSSES PISTES MESURÉES avant celle-ci, gardées en note parce qu'elles ne se
   * voient qu'au calcul, jamais à l'œil sur le poste au repos :
   *
   *  - le maximum sur TOUTES les parties (comme halfW/halfH ci-dessus) vaut ~6.18, contre
   *    un halfW de 4.38 : le point le plus proche de la caméra sur l'objet ENTIER n'est pas
   *    le verre, c'est le bord avant du clavier, qui déborde vers +Z sous le moniteur.
   *  - filtrer sur le SEUL matériau `default_1003` (la pièce que le shader appelle « verre »
   *    — même test que `uTube` un peu plus bas) ne suffit pas non plus : ce mesh à lui seul
   *    va de z=−1.79 à z=6.10, quasiment la même plage que l'objet entier. Le glb assigne ce
   *    matériau à plus que la vitre du tube (probablement une autre surface sombre du
   *    boîtier) ; s'y fier aurait repris exactement le même défaut sous un autre nom.
   *
   * CE QUI MARCHE : filtrer par POSITION (x, y), pas par matériau — les mêmes bornes
   * scrX/scrY/scrW/scrH que le rectangle lumineux (voir posteTweak et uScrMin/uScrMax plus
   * bas), en ne gardant QUE le Z maximum parmi les sièges qui tombent dans ce rectangle. À
   * l'intérieur de l'empreinte du tube, ce qui est le plus proche de la caméra est
   * nécessairement le verre — tout le reste (l'intérieur du boîtier, l'électronique) est
   * plus loin. MESURÉ ainsi : z≈3.19, porté par un vrai plateau (les vingt sommets les plus
   * proches du maximum s'étalent sur moins de 0.03, pas un sommet isolé) — voir le rapport
   * de tâche pour le relevé complet.
   *
   * FIGÉ AU CHARGEMENT DU GLB (ce memo ne dépend que de `frameGeos`), PAS RÉACTIF au
   * panneau dev : si quelqu'un déplace Centre X/Y ou Largeur/Hauteur en direct, cette
   * mesure ne suit pas avant un rechargement — lire `posteTweak` par un hook ici
   * re-rendrait ChromeTableau à chaque glissement de N'IMPORTE quelle barre du panneau
   * (posteTweak est lu IMPÉRATIVEMENT par frame ailleurs dans ce fichier précisément pour
   * éviter ça — voir son en-tête). Un décalage entre cette mesure et le rectangle vivant
   * n'existe donc que pendant une session de réglage active du panneau — jamais en usage
   * normal ni en prod, où le rectangle est un défaut figé.
   */
  const tvExt = useMemo(() => {
    if (!frameGeos) return { halfW: PLATE_H, halfH: PLATE_H, glassZ: PLATE_T };
    const pt0 = posteTweak.get();
    const minX = pt0.scrX - pt0.scrW / 2;
    const maxX = pt0.scrX + pt0.scrW / 2;
    const minY = pt0.scrY - pt0.scrH / 2;
    const maxY = pt0.scrY + pt0.scrH / 2;
    let hw = 0;
    let hh = 0;
    let glassZ = 0;
    for (const g of frameGeos) {
      const a = g.getAttribute("aTarget");
      for (let j = 0; j < a.count; j++) {
        const x = a.getX(j);
        const y = a.getY(j);
        hw = Math.max(hw, Math.abs(x));
        hh = Math.max(hh, Math.abs(y));
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          glassZ = Math.max(glassZ, a.getZ(j));
        }
      }
    }
    return { halfW: hw, halfH: hh, glassZ };
  }, [frameGeos]);

  const { canvasMat, frameMats } = useMemo(() => {
    const blank = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    blank.needsUpdate = true;
    /*
     * Le rectangle du tube en instances PARTAGÉES : shared() fabrique des objets
     * frais par matériau, et il y a désormais SEPT matériaux de coque — sept
     * Vector2 distincts, et la poignée dev n'en aurait déplacé qu'un. Un seul
     * couple d'objets, référencé partout : une écriture les règle tous.
     */
    /*
     * CALCULÉ, pas réglé à l'origine : bords du verre relevés sur capture, convertis en
     * unités de forme par le rectangle DOM publié (--plate-px-*) et les étendues
     * mesurées (tvExt) — la conversion est exacte par construction puisque les deux
     * dérivent des mêmes nombres. Retrait de 5 % pour ne pas lécher le biseau. À
     * RECALCULER si le glb change (la méthode est en commentaire d'historique de
     * session) : le panneau permet de le corriger à l'œil, il ne remplace pas la mesure.
     *
     * Les nombres eux-mêmes vivent dans posteTweak (centre + taille) et setShared les
     * réécrit à chaque frame ; ici on ne fait qu'ouvrir les deux Vector2 sur l'état
     * courant, plutôt que de recopier des coins qui dériveraient du store.
     */
    const pt0 = posteTweak.get();
    const scrMin = new Vector2(pt0.scrX - pt0.scrW / 2, pt0.scrY - pt0.scrH / 2);
    const scrMax = new Vector2(pt0.scrX + pt0.scrW / 2, pt0.scrY + pt0.scrH / 2);
    const shared = () => ({
      uTime: { value: 0 },
      uDistort: { value: 0.25 },
      uFreq: { value: 0.5 },
      uPres: { value: 0 },
      uFly: { value: FLY },
      uAspX: { value: 1 },
      uSeatK: { value: 1 },
      uSkinFres: { value: 0.55 },
      // Un Color par matériau (shared() en fabrique de frais) : setShared les écrit tous
      // par frame, donc pas d'instance partagée à synchroniser comme pour le rect du tube.
      uSkinTint: { value: new Color(1, 1, 1) },
      uSkinSat: { value: 1 },
      uSkinGain: { value: 1 },
      uFade: { value: 0 },
      uRough: { value: 0.12 },
      uTv: { value: 0 },
      /* Tout sampler est LIÉ dès la construction, au gris 1×1 ci-dessus : un sampler2D non
         lié est un comportement non défini que certains pilotes refusent de valider — le
         programme devient invalide et la scène disparaît. Même doctrine que LiquidDna, qui
         documente le même piège pour ses uPhoto. Le placeholder n'est jamais VU : uReveal et
         uGlow valent zéro tant que rien n'est révélé. */
      uReveal: { value: 0 },
      uScreen: { value: blank as Texture },
      uGlow: { value: 0 },
      uScrMin: { value: scrMin },
      uScrMax: { value: scrMax },
      uEnv: { value: null as Texture | null },
      uEnvInt: { value: ENV_INTENSITY },
      uEnvRot: { value: ENV_ROT_Y },
      uLo: { value: new Color(0.5, 0.5, 0.5) },
      uHi: { value: new Color(0.98, 0.98, 0.95) },
      uCamPos: { value: new Vector3() },
    });
    const canvasMat = new ShaderMaterial({
      uniforms: {
        ...shared(),
        uCar: { value: 0 },
        uPhotoOn: { value: 0 },
        /* NEUTRES, et plus écrits : l'approche-par-derrière et l'ombre du cadre étaient
           les molettes « recul » / « ombre » du panneau toile, toutes deux essayées et
           rejetées (1 = aucun effet). Elles survivent à 1 parce qu'elles appartiennent au
           pipeline photo laissé intact derrière uPhotoOn = 0, ci-dessous. */
        uDevZoom: { value: 1 },
        uDevDim: { value: 1 },
        uPrint: { value: new Vector3(PLATE_LOOK.exposure, PLATE_LOOK.sheen, PLATE_LOOK.gloss) },
        uContrast: { value: PLATE_LOOK.contrast },
        uShade: { value: PLATE_LOOK.shade },
        uColour: { value: 0 },
        uGrain: { value: PLATE_LOOK.grain },
        uAber: { value: PLATE_LOOK.aber },
        uWarp: { value: 0 },
        uPhotoReady: { value: works.map(() => 0) },
        ...Object.fromEntries(works.map((_, i) => [`uPhoto${i}`, { value: blank }])),
      },
      vertexShader: VERT,
      fragmentShader: FRAG_CANVAS,
      transparent: true,
      side: DoubleSide,
    });
    /*
     * UN MATÉRIAU PAR PARTIE — la seule chose qui les distingue est uSkin, la peau de
     * cette partie, cuite ici à la création : elle ne change jamais, donc l'écrire
     * par frame dans setShared (qui est partagé) aurait de toute façon été faux dès
     * la deuxième partie. Tout le reste des uniformes est identique et setShared les
     * balaie tous.
     */
    const frameMats = tvTexs.map((tex, i) => {
      /*
       * uTube : le « hello world » n'appartient qu'à la pièce VERRE (le matériau
       * default_1003 du glb — l'atlas au grand rectangle sombre). Sans ce verrou, la
       * projection planaire s'imprimait en fantôme sur tout fragment d'une autre
       * pièce tourné vers +Z dans le rectangle — le biseau du moniteur, en pente,
       * en attrapait une copie décalée par le warp de normale.
       */
      const raw = frameSrcs[i]?.material;
      const name = ((Array.isArray(raw) ? raw[0] : raw) as { name?: string } | undefined)?.name;
      return new ShaderMaterial({
        uniforms: {
          ...shared(),
          uSkin: { value: tex ?? blank },
          uTube: { value: name === "default_1003" ? 1 : 0 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG_FRAME,
        transparent: true,
        side: DoubleSide,
      });
    });
    return { canvasMat, frameMats };
  }, [tvTexs, frameSrcs]);

  /*
   * Le rectangle de l'écran, réglable depuis la console — la méthode du repo pour
   * trouver des nombres (voir blobTweak) :
   *   __scr.min.set(x, y) / __scr.max.set(x, y)   en unités de forme
   * Les valeurs retenues se cuisent ensuite dans shared(). Mort en prod.
   *
   * Dans un EFFET, pas dans le memo qui crée les matériaux : StrictMode exécute le
   * render deux fois, donc le memo fabrique DEUX paires de matériaux et n'en
   * committe qu'une — une poignée posée dans le memo peut pointer la paire fantôme,
   * jamais rendue, jamais écrite. Une heure de diagnostic est partie dans une sonde
   * qui mesurait le mauvais objet ; l'effet, lui, ne court que sur la valeur
   * commitée.
   */
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as Record<string, unknown>).__scr = {
      min: frameMats[0]?.uniforms.uScrMin.value,
      max: frameMats[0]?.uniforms.uScrMax.value,
      ext: tvExt,
      mouth: tubeMouth,
      mats: () =>
        frameMats.map((m, i) => ({
          name: (() => {
            const raw = frameSrcs[i]?.material;
            return ((Array.isArray(raw) ? raw[0] : raw) as { name?: string } | undefined)?.name;
          })(),
          tube: m.uniforms.uTube.value as number,
          glow: +(m.uniforms.uGlow.value as number).toFixed(3),
          screenW: (m.uniforms.uScreen.value as { image?: { width?: number } })?.image?.width,
        })),
    };
  }, [frameMats, tvExt, frameSrcs]);


  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const s = formState();
    const tw = blobTweak.get();
    const pt = posteTweak.get();

    appear.current += (1 - appear.current) * (1 - Math.pow(0.04, delta));
    const modeTarget = tw.mode === "blob" ? 1 : 0;
    modeVis.current += (modeTarget - modeVis.current) * (1 - Math.pow(0.06, delta));

    // On for the whole corridor (see tableauOn in formClock): the baton passes MESH TO
    // MESH — the skull reforms its sphere at About's end and this mesh, wearing its own
    // sphere disguise, takes the stage from there. It TRAVELS as that sphere (the dock
    // below is the clock's), and only unrolls where the roll-out scrub says so.
    const workOn = reduced ? (s.tableauOn > 0.5 ? 1 : 0) : s.tableauOn;
    // LA PLONGÉE ÉTEINT LE POSTE — voir DIVE_FADE_START/END et l'invariant du fondu
    // ci-dessus. `on` en découle (comme du reste des facteurs de `fade`), donc au-delà de
    // DIVE_FADE_END ce mesh n'est même plus rendu (`g.visible = false`) : double
    // protection, alpha ET présence, pas seulement l'une des deux.
    const diveFade = 1 - smoothstep(DIVE_FADE_START, DIVE_FADE_END, s.dive);
    const fade = (reduced ? 1 : appear.current) * modeVis.current * workOn * diveFade;
    const on = fade > 0.004;
    g.visible = on;
    if (!on) return;

    /*
     * LE CADRAGE, borné par l'axe LIMITANT. La première version cadrait sur la seule
     * demi-hauteur visible — la revue a montré qu'en viewport portrait (aspect < la
     * fraction demandée) le poste débordait des deux bords, tronqué en permanence :
     * le glb est normalisé sur sa LARGEUR (son axe le plus long), pas sur sa hauteur.
     * Ici le poste occupe pt.fill de la dimension visible qui le contraint le plus,
     * mesuré sur ses étendues réelles (tvExt) — exact par construction, dans les
     * deux orientations d'écran. (pt.fill est l'ancien TV_FILL, passé au panneau.)
     *
     * GELÉ SUR CAM_REST, PAS SUR LA CAMÉRA VIVANTE — changement de T6. Avant la plongée,
     * `camera.position.z`/`fov` valaient TOUJOURS CAM_REST.z/CAM_REST.fov (la pose Theatre
     * de l'entrée est inerte — voir formClock), donc ce gel ne change RIEN à l'image
     * d'avant T6 : même résultat, au bit près, partout hors du corridor de plongée.
     *
     * DANS le corridor, en revanche, la différence est le point entier du changement.
     * `k` (uSeatK) est l'échelle GÉOMÉTRIQUE du poste, appliquée à sa géométrie avant même
     * `s.scale` — donc si `k` suit la caméra vivante, il se RÉTRÉCIT exactement quand la
     * caméra avance (`halfHeightLocal` est proportionnel à `camera.position.z`), ce qui
     * ANNULE le grossissement de perspective qu'une caméra qui avance produit normalement :
     * `atan(tvExt.halfH · k · s.scale / camera.position.z)` reste constant quel que soit
     * `camera.position.z` si `k` en est une fonction linéaire — c'est LITTÉRALEMENT ce que
     * ce cadrage a toujours fait, et c'est voulu tant que rien ne bouge la caméra à part de
     * petites variations d'entrée. Une plongée n'est pas une petite variation : c'est le
     * mouvement qu'on veut voir. Geler `k` sur CAM_REST laisse la caméra produire une VRAIE
     * perspective (le poste grossit parce qu'on s'en approche, pas par un zoom déguisé) —
     * voir le commentaire de CAM_REST dans formClock.ts pour le même argument de l'autre
     * bout.
     *
     * GELÉ SUR WORK_SCALE AUSSI, PAS SUR s.scale VIVANT — second désaccord avec le crâne,
     * celui-ci sur la TAILLE plutôt que sur le champ (voir uPres plus haut dans ce fichier).
     *
     * Le crâne n'a pas d'équivalent de `k` : il applique `s.scale` UNE fois
     * (`m.scale.setScalar(s.scale)` dans ChromeSkull), sur un mélange où repos (la
     * sphère, FORM_RADIUS) et cible (le crâne assemblé) sont déjà à la même échelle —
     * le gonflement de la sortie d'About (`grow · EXIT_SCALE`, jusqu'à 1.2 — voir
     * formChoreo) grossit donc les deux bouts du mélange PAREIL, et rien ne diverge
     * quel que soit l'instant où `w` (l'avancement crâne↔sphère) passe entre les deux.
     *
     * Le poste, lui, mélange une sphère qui SUIT s.scale (`home`, non affecté par `k`)
     * avec un siège que `k` rend délibérément INVARIANT à s.scale — MESURÉ : `--plate-px-w`
     * publié valait 668.7px à s.scale = 1.2 (le pic du gonflement) et 667.2px à
     * s.scale = 0.62 (posé), un écart de 0.2 %, la tolérance de l'anti-scintillement
     * plus bas — c'est voulu et ça marche, il ne faut pas y toucher. Mais tant que `k`
     * chassait s.scale EN DIRECT (`/ s.scale` ci-dessous), cette invariance ne
     * s'établissait qu'UNE FOIS s.scale déjà revenu à WORK_SCALE : pendant le
     * gonflement (s.scale jusqu'à 1.2) le siège représentait toujours la taille
     * posée, MESURÉE INVARIANTE, tandis que la sphère avec laquelle il se mélange
     * grossissait avec le direct — deux bouts d'un même mélange qui ne bougent plus
     * ensemble, contrairement au crâne. `s.scale` atteint TOUJOURS exactement
     * WORK_SCALE une fois le poste posé (voir formChoreo : `WORK_SCALE · w` sans terme
     * de gonflement une fois `w` — la présence de Work — à 1), donc geler la référence
     * dessus au lieu du direct restaure le même principe que le crâne (les deux bouts
     * du mélange bougent ensemble) SANS RIEN CHANGER à la taille posée : au repos
     * s.scale vaut déjà WORK_SCALE, donc l'ancienne et la nouvelle formule coïncident
     * au bit près une fois le poste formé — seule la TRAJECTOIRE pendant le gonflement
     * change.
     */
    const tanHalf = Math.tan((CAM_REST.fov * Math.PI) / 180 / 2);
    const halfHeightLocal = (tanHalf * CAM_REST.z) / WORK_SCALE;
    const halfWidthLocal = halfHeightLocal * (size.width / size.height);
    const k =
      pt.fill * Math.min(halfHeightLocal / tvExt.halfH, halfWidthLocal / tvExt.halfW);

    /*
     * PUBLIE LE RECTANGLE-MONDE DE L'ÉCRAN — voir tubeMouth.ts pour le pourquoi (formClock
     * vise la caméra de plongée dessus, PixelTunnel y fait naître le corridor). `pt.scrX/Y`
     * sont en espace de forme (aTarget brut, comme `vSeat` dans le shader — voir uScrMin/Max
     * plus bas) : `s.scale · k · pt.scrX` les porte en monde, sans `uAspX` (figé à 1, voir
     * plus bas) et sans rotation (le tube n'est lisible que quand `s.spin` est un multiple
     * exact de 2π — voir formClock, state.spin — donc une rotation identité est correcte ici
     * par construction, pas par approximation). `s.dockX/dockY` valent 0 dans tout Work
     * (DOCK_X_WORK/DOCK_Y_WORK — voir formChoreo), mais lus plutôt que supposés : ce calcul
     * reste vrai si l'un des deux change un jour.
     */
    tubeMouth.cx = s.dockX + s.scale * k * pt.scrX;
    tubeMouth.cy = s.dockY + s.scale * k * pt.scrY;
    tubeMouth.hw = s.scale * k * (pt.scrW / 2);
    tubeMouth.hh = s.scale * k * (pt.scrH / 2);
    tubeMouth.frontZ = s.scale * k * tvExt.glassZ;

    /*
     * LE VERROU DE SORTIE. uTv seul ne suffit pas : à la sortie de Work, md.flat
     * fond sous le scrub en ~100 ms pendant que md.dev décroît sur SON temps
     * (~1 s, DEV_RATE dans formClock) — sans fenêtre, la peau et le texte vert restaient à
     * mi-valeur des dizaines de frames et s'imprimaient sur la forme en pleine
     * fonte. `dressed` n'ouvre la peau et le tube que sur le dernier dixième de la
     * planéité : à l'entrée il vaut déjà 1 quand dev démarre (dev n'existe qu'à
     * flat === 1), donc l'arrivée est inchangée ; à la sortie il tombe pendant que
     * la forme est encore visuellement un poste — le chrome reprend la matière
     * AVANT qu'elle ne fonde.
     */
    const dressed = Math.max(0, Math.min(1, (s.mood.flat - 0.9) / 0.1));

    /*
     * LA SÉQUENCE DU TERMINAL — une horloge, un état, un pinceau.
     *
     * L'horloge ne court que tube allumé (dev au-delà du seuil où l'écran commence
     * à luire) et se REMBOBINE sinon : re-rentrer dans la section, ou rejouer le
     * révélateur au panneau, rejoue l'attente puis la frappe. Elle est avancée ici
     * — une fois par frame, jamais dans setShared qui tourne deux fois — et le
     * canvas n'est repeint QUE si (caractères, curseur) a changé (voir le pinceau).
     *
     * En reduced motion il n'y a ni attente ni frappe ni clignotement : la ligne
     * complète, curseur fixe — le texte est une information, son arrivée est un
     * mouvement.
     */
    const tb = tube.current;
    // Le rembobinage du panneau : l'attente puis la frappe rejouent sur un poste déjà
    // posé, sans re-scrubber la section d'un bout à l'autre.
    if (pt.replayNonce !== tb.replay) {
      tb.replay = pt.replayNonce;
      tb.t = 0;
    }
    // L'horloge est sortie du fichier (tubeSequence) : c'était de la logique pure enfouie
    // dans un useFrame, donc intestable, dans un fichier qui n'avait pas besoin de grossir.
    //
    // `forced` réunit deux conditions qui atterrissent au même endroit — la ligne finale,
    // curseur fixe — mais par COÏNCIDENCE, pas par nécessité logique commune : `textFull`
    // est la position de réglage, pour caler un texte sur son état FINAL plutôt que sur une
    // frappe en cours dont la largeur bouge sous la molette (voir posteTweak.ts) ; reduced
    // motion y atterrit pour une autre raison — le texte est une information, son arrivée
    // est un mouvement (voir « LA SÉQUENCE DU TERMINAL » ci-dessus).
    const forced = reduced || pt.textFull;
    // Sortie une fois, réutilisée par sequenceAt ET sequenceDuration ci-dessous : les
    // construire séparément marcherait tout aussi bien aujourd'hui, mais laisserait la
    // porte ouverte à ce que l'un des deux dérive de l'autre au premier réglage du
    // panneau touché d'un seul côté.
    const cadence = { idle: TYPE_IDLE, char: pt.textChar, hold: pt.textHold };
    let seq: SequenceState;
    if (forced) {
      const l = TV_LINES.length - 1;
      seq = { line: l, chars: TV_LINES[l].length, typing: false, done: true };
      // Le rembobinage du panneau ou un reduced motion arrivé pendant que le lecteur
      // molettait laisserait sinon un boost accumulé, prêt à faire sauter tb.t en avant
      // dès que `forced` retombe — un rembobinage n'est pas rembobiné s'il repart déjà
      // en marche avant.
      tubeGate.boost = 0;
    } else {
      // Le garde compare flat — le nombre qui SNAPPE exactement à 1 dans formClock — et
      // jamais `dressed === 1` : la fenêtre dérivée (flat − 0.9) / 0.1 vaut
      // 0.9999999999999998 en flottant quand flat vaut exactement 1, et l'horloge ne
      // démarrait jamais. Une égalité stricte n'est licite que sur une valeur snappée.
      //
      // CETTE CONDITION EST DUPLIQUÉE dans Work.tsx (la retenue du scroll), et c'est
      // délibéré plutôt qu'oublié : les deux fichiers répondent à des questions
      // différentes de la même horloge — ici « dois-je avancer tb.t ? », là-bas « dois-je
      // tenir le verrou ? » — et formClock n'a pas de raison d'exposer un booléen pour un
      // test qui n'existe que pour ces deux appelants. Si l'un des deux membres change,
      // l'autre doit suivre.
      if (s.mood.dev > 0.55 && s.mood.flat === 1) {
        /*
         * L'ACCÉLÉRATION AU SCROLL — voir tubeGate. Bornée par ce qu'il reste jusqu'à la
         * fin de la séquence (sequenceDuration), JAMAIS au-delà, sur consigne explicite :
         * Work.tsx ne DÉCOUVRE `tubeGate.done` que sur son prochain passage de ticker, pas
         * à l'instant où il devient vrai ici — donc au moins une frame après que tb.t a
         * franchi la fin, le verrou est encore tenu et un cran de molette peut encore
         * arriver. À cet instant tb.t DÉPASSE déjà `sequenceDuration` (le `delta` seul,
         * jamais borné, l'y a poussé dès la frame du franchissement) : sans le
         * `Math.max(0, …)`, `remaining` serait négatif et `Math.min(boost, remaining)`
         * ferait RECULER tb.t d'un coup — la frappe reviendrait en arrière au moment même
         * où elle se termine.
         */
        const remaining = Math.max(0, sequenceDuration(TV_LINES, cadence) - tb.t);
        tb.t += delta + Math.min(tubeGate.boost, remaining);
      } else {
        tb.t = 0;
      }
      tubeGate.boost = 0;
      seq = sequenceAt(tb.t, TV_LINES, cadence);
    }
    // LE PONT VERS LA RETENUE — voir tubeGate. Écrit que la branche ait été `forced` ou
    // non : Work.tsx doit voir `done` passer vrai aussi bien quand la séquence s'est
    // réellement terminée que quand le panneau ou reduced motion l'a forcée à sa ligne
    // finale, sinon un dev qui bascule `textFull` en cours de route verrouillerait la
    // page sur un `done` resté faux.
    //
    // NE COURT QUE SI CE MESH EST `on` (voir le `if (!on) return;` plus haut dans cette
    // fonction) : hors de ce cas — en pratique, seulement le panneau dev qui pousse
    // `blobTweak.mode` hors de "blob" pendant le corridor — `done` reste figé à sa
    // dernière valeur écrite plutôt que d'être mis à jour. Sans danger pour un lecteur
    // normal : `flat` ne peut atteindre 1 (la condition que Work.tsx teste avant de
    // regarder `done`) qu'après que `tableauOn` a substantiellement grimpé, ce qui
    // maintient `on` vrai par construction. Le seul chemin qui casse cette implication
    // est un réglage dev délibéré, réversible dès qu'il repasse sur "blob".
    tubeGate.done = seq.done;
    const line = seq.line;
    const chars = seq.chars;
    // Le curseur ne clignote qu'au repos — pendant la frappe il reste allumé, comme un vrai
    // terminal : c'est l'écho qui bat la mesure, pas le curseur.
    const cursorOn = seq.typing || forced || tb.t % (2 * BLINK) < BLINK;
    // L'état comprend maintenant la MISE EN PAGE : sans le nonce, traîner « Texte X »
    // ne se verrait qu'au clignotement suivant — jusqu'à une demi-seconde de retard sur
    // la molette, ce qui rend le réglage illisible. Le canvas reste repeint au seul
    // changement d'état, jamais à la frame.
    if (
      line !== tb.line ||
      chars !== tb.chars ||
      cursorOn !== tb.cursor ||
      pt.textNonce !== tb.nonce
    ) {
      tb.line = line;
      tb.chars = chars;
      tb.cursor = cursorOn;
      tb.nonce = pt.textNonce;
      screen.draw(line, chars, cursorOn);
    }

    const setShared = (m: ShaderMaterial) => {
      const u = m.uniforms;
      u.uTime.value = s.time;
      /*
       * uPres NOURRIT LE CHAMP PARTAGÉ (formOffset, via VERT), PAS L'ASSEMBLAGE DU
       * POSTE — voir les commentaires de `w` et `alive` dans VERT pour ce second rôle,
       * maintenant tenu par uTv.
       *
       * max(s.pres, s.mood.flat), pas s.mood.flat seul. Le crâne alimente SON champ
       * partagé avec s.pres (ChromeSkull, u.uPres.value = s.pres) ; tant que le poste
       * lisait md.flat ici, les deux sphères déguisées montraient des grains
       * DIFFÉRENTS au même instant du relais — mesuré au navigateur : à s.pres = 0.41
       * (crâne déjà lissé à 59 %) le poste, à md.flat = 0 pendant tout le relais,
       * restait à 100 % de lump, visiblement plus grumeleux que le crâne qui
       * s'effaçait dessus. max() fait suivre le poste sur le degré de lissage du
       * crâne tant que md.flat n'a pas commencé à monter (donc pendant tout le
       * relais, où md.flat vaut exactement 0 — le déroulé du poste ne démarre
       * qu'une fois le crâne déjà parti, voir le déclencheur "top 92%" de
       * Work.tsx) ; une fois md.flat > s.pres, le max redevient md.flat et le
       * déroulé du poste n'est pas retouché par ce correctif.
       */
      u.uPres.value = Math.max(s.pres, s.mood.flat);
      u.uDistort.value = tw.distort * DISTORT_MAX;
      u.uFreq.value = tw.freq;
      u.uRough.value = tw.roughness;
      u.uTv.value = s.mood.flat;
      /*
       * Le décapage, et le seul endroit du panneau qui DÉBRANCHE l'horloge. Nécessaire, pas
       * décoratif : à uReveal = 1 le mix du fragment jette tout le chrome (voir FRAG_FRAME),
       * donc l'HDRI n'a littéralement aucun effet sur un poste posé — mesuré en comparant
       * deux environnements sur un poste settled, images identiques. Figer le décapage est
       * ce qui rend les molettes HDRI observables.
       */
      u.uReveal.value = pt.revealAuto ? s.mood.dev * dressed : pt.reveal;
      u.uFly.value = reduced ? 0 : FLY;
      /*
       * 1 : uAspX étirait la toile aux proportions de chaque photographie, et le
       * poste — mis à l'échelle uniformément dans buildFrameFrom — se faisait
       * déformer par l'aspect d'une image qui n'est plus à l'écran. La machinerie
       * qui glissait aspect et taille d'accrochage par œuvre (aspNow, sizeNow, le
       * loader des photos) a été RETIRÉE, pas seulement contournée : la revue a
       * montré qu'elle publiait encore la hit-box DOM aux dimensions de l'ancienne
       * plaque 16:9 — un lien cliquable ~60 % plus large que le poste — et
       * téléchargeait quatre photos par visite pour un mesh invisible. Le pipeline
       * photo SHADER (formPhoto, uPhoto*) reste compilé derrière uPhotoOn = 0.
       */
      u.uAspX.value = 1;
      u.uSeatK.value = k;
      // Le tube, allumé sur la SECONDE moitié du révélateur : la peau d'abord
      // (uReveal, 0→1 sur tout dev), l'écran ensuite — trois beats sur un signal,
      // échelonnés par des fenêtres, le motif du fichier (voir uPhotoOn et son ramp).
      u.uScreen.value = screen.tex;
      const lit = Math.max(0, (s.mood.dev - 0.5) / 0.5);
      u.uGlow.value = lit * lit * (3 - 2 * lit) * dressed;
      u.uFade.value = fade;
      /*
       * L'HDRI ET LE RECTANGLE DU TUBE, écrits par frame depuis le panneau.
       *
       * uEnvInt/uEnvRot ne concernent QUE le poste : le crâne et le liquide lisent la
       * même constante ENV_INTENSITY à leur propre construction, donc régler ici ne les
       * suit pas — c'est voulu, ce panneau règle une scène. Le <Environment> de
       * ChromeCanvas est encore une troisième chose (l'éclairage des matériaux standard).
       *
       * Le rectangle passe du centre + taille du panneau aux deux coins que le shader
       * lit. Écrit via .set() sur les Vector2 déjà en place — les matériaux les
       * PARTAGENT par référence (voir leur création), donc ces écritures répétées visent
       * le même objet : redondant, et strictement plus sûr que de compter sur l'alias.
       */
      u.uEnvInt.value = pt.envInt;
      u.uEnvRot.value = pt.envRot;
      u.uSkinFres.value = pt.skinFres;
      (u.uSkinTint.value as Color).set(pt.skinTint);
      u.uSkinSat.value = pt.skinSat;
      u.uSkinGain.value = pt.skinGain;
      (u.uScrMin.value as Vector2).set(pt.scrX - pt.scrW / 2, pt.scrY - pt.scrH / 2);
      (u.uScrMax.value as Vector2).set(pt.scrX + pt.scrW / 2, pt.scrY + pt.scrH / 2);
      u.uEnv.value = envMap;
      (u.uCamPos.value as Vector3).copy(camera.position);
      colScratch.set(tw.color);
      (u.uHi.value as Color).setRGB(colScratch.r, colScratch.g, colScratch.b);
      (u.uLo.value as Color).setRGB(colScratch.r * 0.5, colScratch.g * 0.5, colScratch.b * 0.5);
    };
    setShared(canvasMat);
    for (const m of frameMats) setShared(m);
    const cu = canvasMat.uniforms;
    cu.uCar.value = s.mood.car;
    /*
     * LES PHOTOGRAPHIES SONT ÉTEINTES. Le poste remplace le tableau, donc l'affichage des
     * projets n'a plus lieu ici — et la question de ce que la télé montre est ouverte, pas
     * répondue. Le pipeline est laissé INTACT derrière ce zéro plutôt que retiré : il pèse
     * ~460 lignes dans formPhoto, il marche, et c'est probablement lui qui portera l'image du
     * tube quand cette question sera tranchée. Un zéro se réveille ; du code supprimé se
     * réécrit.
     */
    cu.uPhotoOn.value = 0;
    /*
     * LE TUBE S'ALLUME EN DERNIER, et le décalage est voulu.
     *
     * dev court de 0 à 1 pour révéler la peau ; le tube n'entre que sur sa seconde moitié,
     * remise à l'échelle 0→1. La séquence lue est donc : la forme devient un poste, le chrome
     * s'efface, PUIS l'écran s'allume — trois beats sur un seul signal, échelonnés par des
     * fenêtres, ce qui est le motif que ce fichier emploie déjà partout (voir uPhotoOn et son
     * ramp). Un second signal aurait pu dériver du premier ; une fenêtre ne peut pas.
     */
    cu.uColour.value = s.mood.hover * PLATE_LOOK.colour;

    g.position.set(s.dockX, s.dockY, 0);
    /*
     * LA ROTATION S'ÉTEINT À MESURE QUE LE POSTE SE FORME — pas d'un coup, et pas dans
     * formClock (qui reste inchangé : le crâne et le liquide continuent de lire
     * `s.spin` brut, comme avant).
     *
     * `s.spin` PORTE DEUX CHOSES qui n'intéressent que le crâne/liquide : la dérive
     * d'ambiance (`drift`, freinée mais jamais nulle) ET LE TOUR DE PAGE — chaque
     * changement d'œuvre ajoute exactement 2π à `turnTarget`, un geste hérité de
     * l'ancienne plaque photo (« la page tourne pour présenter le prochain tirage »).
     * Le poste n'a plus de tirage à présenter (uPhotoOn = 0), mais `state.spin`
     * continue d'inclure `turn · md.flat` que le poste soit posé ou pas.
     *
     * MESURÉ : poste posé (md.flat = 1), immobile, sans scroller — `s.spin` ne bouge
     * pas d'un bit sur 6 s (18.8495559… constant), donc la dérive d'ambiance est déjà
     * bien freinée par le mécanisme existant (`frz = max(holdEased, md.flat)` dans
     * formClock). En revanche, en scrollant jusqu'à un CHANGEMENT D'ŒUVRE une fois
     * posé, `s.spin` saute d'environ 2π sur quelques centaines de ms (mesuré : +4.8 puis
     * +5.1 rad sur deux changements consécutifs, soit le tour de page en vol) — le
     * poste tournait donc bel et bien sur lui-même à chaque œuvre, sans plus rien à
     * montrer en tournant.
     *
     * Le correctif vit ICI plutôt que dans formClock (qui reste la même horloge pour
     * toutes les sections) : `heldSpin` chasse `s.spin` à une vitesse qui retombe à
     * zéro avec (1 − md.flat). À md.flat = 0 (encore un blob) elle vaut `s.spin` EXACTEMENT
     * chaque frame — aucune latence, la dérive du blob n'est pas amputée pendant qu'il
     * en est un. À md.flat = 1 (posé) le facteur de chasse est nul : `heldSpin` reste
     * figé à l'angle qu'il tenait à cet instant-là — un multiple de 2π par construction
     * de `state.spin` (voir `faced` dans formClock), donc un poste FACE À LA CAMÉRA,
     * pas figé de travers — et aucun tour de page ultérieur ne le fait plus bouger.
     * Entre les deux, la sensibilité décroît avec md.flat : la rotation s'éteint
     * progressivement, elle n'est pas coupée au dernier centile comme `alive` (qui
     * répond à une question différente : la vivacité du CHAMP, pas l'angle de l'OBJET).
     */
    heldSpin.current += (s.spin - heldSpin.current) * (1 - s.mood.flat);
    g.rotation.set(0, heldSpin.current, 0);
    g.scale.setScalar(s.scale);

    // The DOM's hit link, published from here now — the field goes dark in Work and
    // stale numbers would park the link on the wrong rectangle.
    const pxPerWorld = size.height / (2 * tanHalf * (camera.position.z - PLATE_T * s.scale));
    /*
     * Le rectangle publié est celui de la GÉOMÉTRIE posée (tvExt·k), plus celui d'une
     * plaque théorique : l'ancienne formule gardait l'aspect des PHOTOS (aspNow) et la
     * taille d'accrochage par œuvre (sizeNow) — les trois lentilles de la revue ont
     * convergé dessus : lien cliquable ~60 % plus large que l'objet, mobilier posé sur
     * une hauteur gonflée de moitié. Ce que le shader dessine et ce que le DOM reçoit
     * dérivent désormais des mêmes nombres.
     */
    const h = 2 * tvExt.halfH * k * s.scale * pxPerWorld;
    const w = 2 * tvExt.halfW * k * s.scale * pxPerWorld;
    const cx = s.dockX * pxPerWorld;
    if (
      Math.abs(w - frameBox.current.w) > 0.75 ||
      Math.abs(h - frameBox.current.h) > 0.75 ||
      Math.abs(cx - frameBox.current.cx) > 0.75
    ) {
      frameBox.current = { w, h, cx };
      const root = document.documentElement.style;
      root.setProperty("--plate-px-w", `${w.toFixed(1)}px`);
      root.setProperty("--plate-px-h", `${h.toFixed(1)}px`);
      root.setProperty("--plate-px-cx", `${cx.toFixed(1)}px`);

      // …et le relèvement du mobilier, dérivé de la MÊME source que le reste.
      //
      // Il était en dur dans le CSS (0.0912 · --form-dim), calculé à la main depuis un
      // DOCK_Y_WORK de 0.7 qui vaut 0 depuis l'index — le token disait donc de relever le
      // mobilier de ~108px au-dessus d'une forme qui est à plomb au centre. Son propre
      // commentaire disait « MOVE THIS WITH DOCK_Y_WORK, never on its own », et ça n'a pas
      // été fait. Écrit ici, il ne peut plus mentir : il est une fonction de la position
      // réelle de la forme et du pxPerWorld vivant, donc il suit aussi la caméra.
      // Négatif parce que dockY monte en y-monde et que `top` descend en pixels.
      root.setProperty("--form-lift", `${(-s.dockY * pxPerWorld).toFixed(1)}px`);
    }
  });

  if (!frameGeos) return null;
  return (
    <group ref={group} visible={false}>
      {/* LA DALLE PROCÉDURALE EST MASQUÉE, pas retirée. C'était le porte-photographie
          (un slab 16:9 devant la moulure) : le poste a son écran dans sa propre
          géométrie, et le tube est projeté sur le corps (voir FRAG_FRAME) — un slab
          flottant à travers le boîtier n'aurait fait que dépasser. Elle reste montée
          pour le jour où une surface dédiée redeviendra utile ; ses uniformes se
          mettent à jour pour rien, ce qui coûte des écritures de nombres, pas un draw. */}
      <mesh geometry={canvasGeo} material={canvasMat} frustumCulled={false} visible={false} />
      {frameGeos.map((g, i) => (
        <mesh key={i} geometry={g} material={frameMats[i]} frustumCulled={false} />
      ))}
    </group>
  );
}

useGLTF.preload(FRAME_SRC, false, true);
