import { test } from "node:test";
import assert from "node:assert/strict";
import { sequenceAt, sequenceDuration } from "../src/lib/tubeSequence.ts";

const LINES = ["ab", "cde"];
const R = { idle: 1, char: 0.1, hold: 0.5 };

test("avant la fin de l'attente : rien de frappé", () => {
  assert.deepEqual(sequenceAt(0, LINES, R), { line: 0, chars: 0, typing: false, done: false });
  assert.deepEqual(sequenceAt(0.99, LINES, R), { line: 0, chars: 0, typing: false, done: false });
});

test("pendant la frappe de la première ligne", () => {
  // t = 1 + 0.15 → 1 caractère et demi de « ab » → 1
  const s = sequenceAt(1.15, LINES, R);
  assert.equal(s.line, 0);
  assert.equal(s.chars, 1);
  assert.equal(s.typing, true);
  assert.equal(s.done, false);
});

test("pendant la pause : la ligne est entière, la frappe est finie", () => {
  // « ab » = 0.2s, donc frappée à t = 1.2 ; pause jusqu'à 1.7
  const s = sequenceAt(1.4, LINES, R);
  assert.equal(s.line, 0);
  assert.equal(s.chars, 2);
  assert.equal(s.typing, false);
  assert.equal(s.done, false);
});

test("la ligne suivante démarre après la pause", () => {
  // 1 + 0.2 + 0.5 = 1.7 ; à 1.85 → 1 caractère de « cde »
  const s = sequenceAt(1.85, LINES, R);
  assert.equal(s.line, 1);
  assert.equal(s.chars, 1);
});

// L'INVARIANT QUI PORTE LA PLONGÉE. `done` est ce qui déverrouille le scroll : s'il
// arrivait trop tôt, la plongée démarrerait sur un texte inachevé ; s'il n'arrivait
// jamais, la page resterait bloquée. Les deux sont des pannes silencieuses.
test("done : faux jusqu'au dernier caractère de la dernière ligne, vrai ensuite", () => {
  const end = sequenceDuration(LINES, R); // 1 + 0.2 + 0.5 + 0.3 = 2.0
  assert.equal(end, 2);
  assert.equal(sequenceAt(1.99, LINES, R).done, false);
  assert.equal(sequenceAt(2, LINES, R).done, true);
  assert.equal(sequenceAt(999, LINES, R).done, true);
});

test("la dernière ligne se POSE : plus rien ne change après elle", () => {
  const a = sequenceAt(2.5, LINES, R);
  const b = sequenceAt(60, LINES, R);
  assert.deepEqual(a, b);
  assert.equal(a.line, 1);
  assert.equal(a.chars, 3);
});

// Deux lectures du même instant doivent dessiner la même image — c'est ce qui
// permet le rembobinage du panneau et le scrub de la section.
test("pure : même t, même résultat", () => {
  for (const t of [0, 0.5, 1.13, 1.7, 1.95, 3]) {
    assert.deepEqual(sequenceAt(t, LINES, R), sequenceAt(t, LINES, R));
  }
});

test("sequenceDuration somme attente, frappes et pauses intermédiaires", () => {
  // une seule ligne : pas de pause du tout
  assert.equal(sequenceDuration(["abc"], R), 1 + 0.3);
  // trois lignes : deux pauses
  assert.equal(sequenceDuration(["a", "b", "c"], R), 1 + 0.1 + 0.5 + 0.1 + 0.5 + 0.1);
});
