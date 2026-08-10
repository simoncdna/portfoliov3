import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPROACH,
  PIECE_OF_WORK,
  RING_RADIUS,
  STATIONS,
  shortestDelta,
  stationBirth,
  stationPosition,
  theatreCamera,
} from "../src/lib/theatre.ts";
import { buildPiece } from "../src/lib/theatreShapes.ts";

const TAU = Math.PI * 2;

/**
 * L'INVARIANT DE LA SALLE. Si le rayon passe sous la distance d'approche, la caméra
 * traverse le centre et se retrouve de l'autre côté, dos à la pièce visée. C'est
 * exactement l'erreur qui a été commise une fois, et elle ne se voit pas dans le code —
 * seulement à l'écran, sous la forme d'une salle vide.
 */
test("le rayon de la salle reste plus grand que la distance d'approche", () => {
  assert.ok(RING_RADIUS > APPROACH, `${RING_RADIUS} doit dépasser ${APPROACH}`);
});

test("la caméra se tient dehors, à la distance d'approche de la pièce visée", () => {
  for (const s of STATIONS) {
    const piece = stationPosition(s, 0, 0, 0);
    const cam = theatreCamera(s.phi, 0, 0, 0, 0);
    const rCam = Math.hypot(cam.x, cam.z);
    assert.ok(rCam > RING_RADIUS, `caméra à ${rCam}, dedans le cercle ${RING_RADIUS}`);
    // à la hauteur près, qui est le décalage vertical propre de la pièce
    const d = Math.hypot(cam.x - piece.x, cam.z - piece.z);
    assert.ok(Math.abs(d - APPROACH) < 1e-9, `distance ${d} ≠ ${APPROACH}`);
  }
});

test("la caméra regarde le centre de la salle", () => {
  for (const s of STATIONS) {
    const cam = theatreCamera(s.phi, 0, 0, 0, 0);
    // Une rotation de rotY autour de Y appliquée à la direction de vue par défaut (0,0,-1)
    const fx = -Math.sin(cam.rotY);
    const fz = -Math.cos(cam.rotY);
    // …doit pointer de la caméra vers le centre
    const toCentre = Math.hypot(cam.x, cam.z);
    assert.ok(Math.abs(fx - -cam.x / toCentre) < 1e-9, "l'axe de visée s'écarte du centre en x");
    assert.ok(Math.abs(fz - -cam.z / toCentre) < 1e-9, "l'axe de visée s'écarte du centre en z");
  }
});

/**
 * LE TRAJET SUIT L'ARC, PAS LA CORDE. C'est la raison d'être de l'interpolation
 * polaire : à mi-chemin entre deux stations, une corde rapprocherait la caméra du
 * centre, l'arc la garde à distance constante.
 */
test("interpoler l'angle garde la caméra à rayon constant, une corde ne le ferait pas", () => {
  const a = STATIONS[0].phi;
  const b = STATIONS[1].phi;
  const rCam = RING_RADIUS + APPROACH;
  const camA = theatreCamera(a, 0, 0, 0, 0);
  const camB = theatreCamera(b, 0, 0, 0, 0);

  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const arc = theatreCamera(a + shortestDelta(a, b) * t, 0, 0, 0, 0);
    assert.ok(Math.abs(Math.hypot(arc.x, arc.z) - rCam) < 1e-9, "l'arc quitte le cercle");
  }

  const midChord = { x: (camA.x + camB.x) / 2, z: (camA.z + camB.z) / 2 };
  assert.ok(
    Math.hypot(midChord.x, midChord.z) < rCam - 0.4,
    "la corde devrait couper vers le centre — sinon ce test ne prouve rien"
  );
});

test("le plus court chemin ne repart jamais en arrière d'un tour", () => {
  for (const [from, to] of [
    [STATIONS[3].phi, STATIONS[0].phi],
    [STATIONS[0].phi, STATIONS[3].phi],
    [0, Math.PI * 1.9],
  ]) {
    const d = shortestDelta(from, to);
    assert.ok(Math.abs(d) <= Math.PI + 1e-9, `écart de ${d}, plus d'un demi-tour`);
    const arrived = ((from + d) % TAU + TAU) % TAU;
    const wanted = ((to % TAU) + TAU) % TAU;
    assert.ok(Math.abs(arrived - wanted) < 1e-9, `arrive à ${arrived} au lieu de ${wanted}`);
  }
});

/**
 * Le seuil vaut 14° et n'est pas arbitraire : voir le calcul de recouvrement sur
 * ANGLES_DEG. En dessous, la pièce du fond se superpose à celle qu'on regarde.
 */
const MARGE_OPPOSITION = (14 * Math.PI) / 180;

test("aucune station ne se cache derrière une autre", () => {
  for (let i = 0; i < STATIONS.length; i++) {
    for (let j = i + 1; j < STATIONS.length; j++) {
      const d = Math.abs(shortestDelta(STATIONS[i].phi, STATIONS[j].phi));
      const ecart = Math.abs(d - Math.PI);
      assert.ok(
        ecart > MARGE_OPPOSITION,
        `stations ${i} et ${j} à ${((ecart * 180) / Math.PI).toFixed(1)}° de l'opposition`
      );
    }
  }
});

/* --- les nuages ---------------------------------------------------------- */

test("chaque pièce tient dans le cube unité et sature à 1 sur au moins un axe", () => {
  for (const kind of PIECE_OF_WORK) {
    const c = buildPiece(kind, 24);
    let max = 0;
    for (let i = 0; i < c.pos.length; i++) max = Math.max(max, Math.abs(c.pos[i]));
    assert.ok(max <= 1 + 1e-6, `${kind} déborde à ${max}`);
    assert.ok(max > 1 - 1e-6, `${kind} ne remplit pas le cube (${max}) — mise à l'échelle ratée`);
  }
});

test("la saillance reste dans [0,1] et désigne vraiment une minorité de points", () => {
  for (const kind of PIECE_OF_WORK) {
    const c = buildPiece(kind, 24);
    assert.equal(c.sal.length, c.count);
    assert.equal(c.pos.length, c.count * 3);
    let hot = 0;
    for (const v of c.sal) {
      assert.ok(v >= 0 && v <= 1, `${kind} : saillance ${v} hors bornes`);
      if (v > 0.8) hot++;
    }
    // Une pièce dont TOUT est saillant n'a plus de pointes : la décomposition n'aurait
    // plus rien à désigner et rongerait le volume entier d'un coup.
    assert.ok(hot / c.count < 0.6, `${kind} : ${((hot / c.count) * 100) | 0}% de points saillants`);
  }
});

test("la densité fait varier le nombre de points, pas l'encombrement", () => {
  for (const kind of PIECE_OF_WORK) {
    const lo = buildPiece(kind, 16);
    const hi = buildPiece(kind, 32);
    assert.ok(hi.count > lo.count * 2, `${kind} : ${lo.count} → ${hi.count}, la densité ne porte pas`);
  }
});

/**
 * LA NEUTRALITÉ, ET C'EST LE TEST QUI COMPTE LE PLUS. À cascade nulle, la naissance vaut
 * exactement la présence partagée — donc la cascade est strictement opt-in, et l'image
 * d'avant cette mécanique se retrouve en mettant un seul nombre à zéro. Sans ce test, une
 * refonte de la formule pourrait décaler les quatre pièces d'un cheveu sans que rien ne le
 * dise.
 */
test("à cascade nulle, la naissance vaut exactement la présence", () => {
  for (const s of STATIONS) {
    for (const on of [0, 0.25, 0.5, 0.75, 1]) {
      const b = stationBirth(0, s.phi, on, 0);
      assert.equal(b, on, `φ=${s.phi} on=${on} : ${b}`);
    }
  }
});

/**
 * ET LA BORNE DE `cascade` EST EXERCÉE ICI. Avec les seules valeurs raisonnables (0 → 0,9) le
 * `Math.max(0, Math.min(0.999, …))` de stationBirth était mort : on pouvait le SUPPRIMER sans
 * qu'un test bronche. 1 est le cas qu'il existe pour attraper (le quotient y divise par zéro),
 * 2 et −1 sont ce qu'un panneau de réglage mal borné enverrait.
 */
test("les deux bouts sont exacts, quelle que soit la cascade", () => {
  for (const s of STATIONS) {
    for (const cascade of [0, 0.2, 0.35, 0.6, 0.9, 0.999, 1, 2, -1]) {
      assert.equal(stationBirth(0, s.phi, 0, cascade), 0, `φ=${s.phi} cascade=${cascade}`);
      assert.equal(stationBirth(0, s.phi, 1, cascade), 1, `φ=${s.phi} cascade=${cascade}`);
    }
  }
});

test("la naissance ne repart jamais en arrière quand la présence monte", () => {
  for (const s of STATIONS) {
    let last = -1;
    for (let i = 0; i <= 40; i++) {
      const b = stationBirth(0, s.phi, i / 40, 0.35);
      assert.ok(b >= last, `φ=${s.phi} on=${i / 40} : ${b} après ${last}`);
      last = b;
    }
  }
});

/**
 * LA CASCADE EXISTE VRAIMENT — et l'invariant est CONDITIONNEL, pas absolu.
 *
 * Le devant est strictement plus avancé que le fond TANT QUE le fond n'est pas né ; une fois le
 * fond arrivé, les deux valent 1 et il n'y a plus d'écart à mesurer.
 *
 * Une première rédaction affirmait « le fond ne peut saturer qu'à on = 1 ». C'est vrai d'un
 * antipode exact et faux des stations réelles : la plus lointaine vue de φ = 0 est à 148°, donc
 * d = 0,822, et elle sature dès on = 1 − cascade·(1 − d) ≈ 0,938. Le test échouait à on = 0,95,
 * où les deux valent 1 — et il aurait fait accuser la formule, qui est correcte : une pièce née
 * reste née. La forme ci-dessous ne dépend d'aucun seuil et balaie toute la rampe.
 */
test("la pièce dans l'axe naît avant celle du fond", () => {
  const phi = STATIONS[0].phi;
  // La plus lointaine en écart angulaire, mesurée et non supposée.
  const far = STATIONS.reduce((a, s) =>
    Math.abs(shortestDelta(phi, s.phi)) > Math.abs(shortestDelta(phi, a.phi)) ? s : a
  );
  assert.notEqual(far.phi, phi, "il faut deux stations distinctes pour comparer");
  for (let i = 0; i <= 40; i++) {
    const on = i / 40;
    const front = stationBirth(phi, phi, on, 0.35);
    const back = stationBirth(phi, far.phi, on, 0.35);
    if (on === 0) {
      assert.equal(front, 0, "rien n'est né à présence nulle");
      assert.equal(back, 0, "rien n'est né à présence nulle");
    } else if (back < 1) {
      assert.ok(front > back, `on=${on} : devant ${front} n'est pas devant le fond ${back}`);
    } else {
      assert.equal(front, 1, `on=${on} : le fond est né (${back}) mais pas le devant (${front})`);
    }
  }
});

/**
 * L'ANGLE DE L'HORLOGE S'ACCUMULE ET N'EST PAS RAMENÉ DANS UN TOUR — mesuré au navigateur :
 * `theatrePhi` valait −22 rad après quelques allers-retours. Une naissance calculée sur un
 * écart non replié sortirait de [0,1] et la salle s'éteindrait sans raison visible.
 */
test("un angle accumulé hors d'un tour ne sort pas la naissance de [0,1]", () => {
  for (const phi of [-22, -6.5, 0, 7.1, 43.9]) {
    for (const s of STATIONS) {
      const b = stationBirth(phi, s.phi, 0.5, 0.35);
      assert.ok(b >= 0 && b <= 1, `φ=${phi} station=${s.phi} : ${b}`);
    }
  }
});

/**
 * L'ORDRE EST CE QUE LE COMMENTAIRE PROMET, ET RIEN NE LE TENAIT. Le doc de stationBirth
 * annonce l'ordre « 0, 1, puis 3 (142°) et 2 (148°) » et se targue de « rester juste si les
 * angles changent » — or le test de la cascade ne compare que la station de tête à la plus
 * lointaine : les deux du milieu n'étaient comparées à rien, et une retouche d'angle aurait pu
 * casser la promesse sans qu'un test bronche.
 *
 * Ce qui est vérifié ici est la propriété GÉNÉRALE dont cet ordre découle : la naissance
 * décroît (au sens large) avec l'écart angulaire. Vérifiée depuis chaque station, donc pas
 * seulement depuis celle de l'arrivée — à la sortie de salle la caméra peut être n'importe où.
 */
test("plus une pièce est loin du regard, plus elle naît tard", () => {
  for (const from of STATIONS) {
    const byDistance = [...STATIONS].sort(
      (a, b) => Math.abs(shortestDelta(from.phi, a.phi)) - Math.abs(shortestDelta(from.phi, b.phi))
    );
    for (const on of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (let i = 1; i < byDistance.length; i++) {
        const near = stationBirth(from.phi, byDistance[i - 1].phi, on, 0.35);
        const far = stationBirth(from.phi, byDistance[i].phi, on, 0.35);
        assert.ok(
          near >= far,
          `depuis φ=${from.phi}, on=${on} : ${byDistance[i].phi} (${far}) devance ${byDistance[i - 1].phi} (${near})`
        );
      }
    }
  }
});
