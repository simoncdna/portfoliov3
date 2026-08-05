import { test } from "node:test";
import assert from "node:assert/strict";
import { sliceZ, sliceScale, sliceCount, recycle } from "../src/lib/tunnelGeom.ts";

const Z0 = 2;
const G = 0.35;

// L'INVARIANT DU TUBE DROIT. échelle / distance doit être CONSTANT : c'est ce qui fait que
// toutes les tranches sous-tendent le même angle, donc que le corridor est droit. Un
// espacement linéaire avec une échelle géométrique donne un pavillon évasé — c'était
// l'erreur de la première rédaction du spec, corrigée à la relecture. Ce test est là pour
// qu'elle ne revienne pas.
test("échelle / distance est constant sur toutes les tranches", () => {
  const ref = sliceScale(0, G) / sliceZ(0, Z0, G);
  for (let k = 1; k < 16; k++) {
    const ratio = sliceScale(k, G) / sliceZ(k, Z0, G);
    assert.ok(Math.abs(ratio - ref) < 1e-12, `tranche ${k} : ${ratio} ≠ ${ref}`);
  }
});

test("la tranche 0 est à z0, à l'échelle 1 — c'est l'image plate", () => {
  assert.equal(sliceZ(0, Z0, G), Z0);
  assert.equal(sliceScale(0, G), 1);
});

test("les tranches s'éloignent et grossissent", () => {
  for (let k = 1; k < 8; k++) {
    assert.ok(sliceZ(k, Z0, G) > sliceZ(k - 1, Z0, G));
    assert.ok(sliceScale(k, G) > sliceScale(k - 1, G));
  }
});

// Le recyclage est ce qui rend la profondeur illimitée pour 16 tranches : une tranche
// dépassée par la caméra repart au fond. Sans lui, le tunnel a un fond visible.
test("recycle ramène dans [z0, z0·(1+g)^D)", () => {
  const D = 16;
  const span = Math.pow(1 + G, D);
  for (const travel of [0, 1, 5, 17.3, 200]) {
    for (let k = 0; k < D; k++) {
      const z = recycle(sliceZ(k, Z0, G), travel, Z0, G, D);
      assert.ok(z >= Z0 - 1e-9, `z=${z} sous le plancher (travel=${travel}, k=${k})`);
      assert.ok(z < Z0 * span + 1e-9, `z=${z} au-dessus du plafond (travel=${travel}, k=${k})`);
    }
  }
});

// Un travel négatif arrive dès que le lecteur remonte : le scrub est réversible par
// construction, donc le modulo doit l'être aussi. Un `%` nu en JS rend un négatif.
test("recycle tient sur un travel négatif — le scrub se remonte", () => {
  const D = 16;
  const span = Math.pow(1 + G, D);
  for (const travel of [-0.5, -3, -21.7]) {
    for (let k = 0; k < D; k++) {
      const z = recycle(sliceZ(k, Z0, G), travel, Z0, G, D);
      assert.ok(z >= Z0 - 1e-9, `z=${z} sous le plancher (travel=${travel}, k=${k})`);
      assert.ok(z < Z0 * span + 1e-9, `z=${z} au-dessus du plafond (travel=${travel}, k=${k})`);
    }
  }
});

test("recycle à travel 0 est l'identité", () => {
  for (let k = 0; k < 16; k++) {
    const z = sliceZ(k, Z0, G);
    assert.ok(Math.abs(recycle(z, 0, Z0, G, 16) - z) < 1e-12);
  }
});

// Avancer d'exactement D tranches doit REVENIR au même endroit : c'est la propriété qui
// rend le cycle invisible. Si elle rate, le tunnel « saute » une fois par cycle.
test("recycle est périodique de période D", () => {
  const D = 16;
  for (let k = 0; k < D; k++) {
    const z = sliceZ(k, Z0, G);
    const a = recycle(z, 1.3, Z0, G, D);
    const b = recycle(z, 1.3 + D, Z0, G, D);
    assert.ok(Math.abs(a - b) < 1e-9, `k=${k} : ${a} ≠ ${b}`);
  }
});

test("sliceCount : combien de tranches pour couvrir une profondeur donnée", () => {
  // z0·(1+g)^D ≥ far  →  D = ceil(log(far/z0) / log(1+g))
  assert.equal(sliceCount(Z0, G, Z0), 0);
  assert.equal(sliceCount(2, 1, 16), 3); // 2·2³ = 16
});
