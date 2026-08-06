import { test } from "node:test";
import assert from "node:assert/strict";
import { letterIndex } from "../src/lib/letterTarget.ts";

test("trouve le « a » de « rabbit » dans la dernière phrase du terminal", () => {
  const line = "> Follow the white rabbit.";
  const idx = letterIndex(line, "rabbit", 1);
  assert.equal(idx, 20);
  assert.equal(line[idx], "a");
});

test("rend -1 si le mot n'est pas dans la ligne — pas d'exception, un repli explicite", () => {
  assert.equal(letterIndex("wake up...", "rabbit", 1), -1);
  assert.equal(letterIndex("", "rabbit", 1), -1);
});

test("l'offset vise n'importe quel caractère du mot, pas seulement le second", () => {
  const line = "abc rabbit xyz";
  const at = line.indexOf("rabbit");
  assert.equal(letterIndex(line, "rabbit", 0), at); // le « r »
  assert.equal(letterIndex(line, "rabbit", 5), at + 5); // le « t » final
});

// Un mot qui apparaît plusieurs fois : indexOf (donc letterIndex) prend TOUJOURS la
// première occurrence — cohérent avec l'usage réel (une seule "rabbit" dans TV_LINES),
// documenté ici pour que ce choix soit visible plutôt que supposé.
test("prend la première occurrence du mot si plusieurs existent", () => {
  const line = "rabbit and another rabbit";
  assert.equal(letterIndex(line, "rabbit", 1), 1);
});
