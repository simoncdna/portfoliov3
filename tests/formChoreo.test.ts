import { test } from "node:test";
import assert from "node:assert/strict";
import { confine } from "../src/lib/formChoreo.ts";

// L'INVARIANT PORTEUR. Hors du corridor de Work, la caméra doit valoir sa valeur
// d'origine EXACTEMENT — pas « à peu près ». Tout le CSS du site (le 7.677 de
// globals.css, --plate-frame, le mobilier) a été réglé contre un frustum figé ;
// une dérive d'un millième ici décale des sections qui n'ont rien demandé.
// D'où l'égalité stricte, jamais une comparaison approchée.
test("présence 0 → l'identité, au bit près", () => {
  assert.equal(confine(10, 4, 0), 10);   // camZ : identité non nulle
  assert.equal(confine(42, 20, 0), 42);  // camFov
  assert.equal(confine(0, 3, 0), 0);     // camY / camX : identité nulle
});

test("présence 1 → la cible, au bit près", () => {
  assert.equal(confine(10, 4, 1), 4);
  assert.equal(confine(0, -2.5, 1), -2.5);
});

test("présence intermédiaire → interpolation linéaire", () => {
  assert.equal(confine(10, 4, 0.5), 7);
  assert.equal(confine(0, 3, 0.25), 0.75);
});

// Une cible égale à l'identité ne doit jamais bouger, quelle que soit la présence :
// c'est le cas de l'état par défaut, avant qu'aucune pose n'ait été auteurée.
test("cible = identité → inerte à toute présence", () => {
  for (const p of [0, 0.13, 0.5, 0.87, 1]) {
    assert.equal(confine(10, 10, p), 10);
    assert.equal(confine(42, 42, p), 42);
  }
});
