"use client";

import { getProject, types } from "@theatre/core";

/**
 * LA CAMÉRA, AUTEURÉE À LA MAIN — et le seul fichier du projet qui connaît Theatre.js.
 *
 * Theatre n'est pas une horloge ici, c'est une TABLE DE CORRESPONDANCE scroll → pose. Son
 * playhead est piloté par workReveal.form (voir formClock), donc Theatre et l'horloge de la
 * forme sont deux fonctions du même scroll : elles ne peuvent pas dériver. C'est ce qui rend
 * l'ajout compatible avec la doctrine de formClock, dont tout l'intérêt est qu'il n'existe
 * qu'UNE intégration — une seconde source de temps désynchroniserait les passages de relais
 * entre formes, ce que ce fichier-là documente longuement.
 *
 * L'isolement est volontaire : formClock ne voit qu'une pose de quatre nombres. Si Theatre
 * doit partir un jour, c'est ce fichier et lui seul.
 */

/**
 * La séquence fait UNE SECONDE, et cette durée n'a aucun sens temporel : rien ne joue.
 *
 * `sequence.position` s'exprime en secondes (la doc est explicite là-dessus), alors que ce
 * qui la pilote est un scrub 0→1. Fixer la longueur à 1 rend le facteur de conversion égal
 * à 1, donc la correspondance est directe et l'axe du studio se lit comme une progression
 * 0→1 — ce qu'il est réellement.
 */
export const SEQ_LENGTH = 1;

/**
 * LA POSE AU REPOS, qui est aussi l'état par défaut de l'objet Theatre.
 *
 * C'est le garde-fou de toute la feature : sans JSON d'état commité, ces valeurs SONT celles
 * que ChromeCanvas déclare sur son `<Canvas camera>`, donc la feature est inerte et le site
 * est exactement celui d'avant. Revenir en arrière, c'est supprimer le JSON.
 */
const REST = { z: 10, y: 0, x: 0, fov: 42 };

const project = getProject("Portfolio — caméra");
const sheet = project.sheet("Work entrance");

/**
 * Les quatre props réglables. Pas de rotation, pas de lookAt : un plan perpendiculaire à
 * l'axe de vue projette un rectangle quelle que soit la POSITION de la caméra, mais une
 * rotation en fait un trapèze — et la photographie est le sujet de cette section.
 */
const camera = sheet.object("Camera", {
  z: types.number(REST.z, { range: [4, 16], nudgeMultiplier: 0.05 }),
  y: types.number(REST.y, { range: [-3, 3], nudgeMultiplier: 0.02 }),
  x: types.number(REST.x, { range: [-3, 3], nudgeMultiplier: 0.02 }),
  fov: types.number(REST.fov, { range: [20, 60], nudgeMultiplier: 0.1 }),
});

/** La pose évaluée à la position courante du playhead. Lue une fois par frame. */
export function pose(): { z: number; y: number; x: number; fov: number } {
  return camera.value;
}

/**
 * Place le playhead. Le scrub est borné ici et pas seulement chez l'appelant : formClock
 * clampe déjà workReveal.form là où il le consomme, ce qui veut dire que la valeur brute
 * peut sortir de [0,1], et un playhead hors bornes est un comportement non défini.
 *
 * ET IL N'ÉCRIT QUE SI LA VALEUR A CHANGÉ. C'est appelé à chaque frame ; écrire
 * `sequence.position` déclenche la machinerie de dérivation de Theatre, qui n'a rien à
 * recalculer quand le scroll est immobile — c'est-à-dire la plupart du temps. Le Hero de ce
 * site a été ramené de 30 à 51 FPS en supprimant exactement ce genre de travail inutile par
 * frame ; on ne va pas en réintroduire par la porte de derrière.
 */
let seeked = -1;
export function seek(scrub: number) {
  const p = Math.max(0, Math.min(1, scrub));
  if (p === seeked) return;
  seeked = p;
  sheet.sequence.position = p * SEQ_LENGTH;
}

/**
 * LE STUDIO NE DOIT JAMAIS ENTRER DANS LE BUNDLE DE PROD — 22,3 Mo décompressés.
 *
 * D'où l'import DYNAMIQUE sous une condition constante à la compilation : le bundler évalue
 * `process.env.NODE_ENV` au build, la branche devient morte, et le chunk n'est jamais
 * demandé. Même motif que ToileDevPanelMount. À VÉRIFIER PAR LA MESURE et non sur la foi de
 * ce commentaire — voir le plan, tâche 5.
 */
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  import("@theatre/studio").then((m) => m.default.initialize());
}
