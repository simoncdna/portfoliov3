/**
 * OÙ, DANS UNE LIGNE DE TEXTE, SE TROUVE UNE LETTRE DONNÉE D'UN MOT DONNÉ.
 *
 * Zéro import, comme tunnelGeom / formChoreo / tubeSequence, et pour la même raison :
 * une recherche de sous-chaîne n'a besoin ni de canvas ni de navigateur, donc elle se
 * teste sous Node (voir tests/letterTarget.test.ts). La partie qui A besoin d'un canvas —
 * mesurer la largeur en pixels du préfixe jusqu'à cet index, via ctx.measureText — vit à
 * côté, dans tubeHole.ts : ce fichier ne fait que dire À QUEL INDEX chercher, jamais À
 * QUELLE LARGEUR ni À QUELLE POSITION ÉCRAN.
 */

/**
 * L'index, dans `line`, du caractère situé `offset` positions après le début de `word` —
 * par exemple `letterIndex("> Follow the white rabbit.", "rabbit", 1)` trouve le « a » de
 * « rabbit » (le premier caractère de « rabbit » est à l'offset 0, donc son « a » est à
 * l'offset 1).
 *
 * -1 SI `word` N'EST PAS DANS `line` — un repli explicite plutôt qu'une exception : la
 * dernière phrase du terminal (TV_LINES, dans ChromeTableau) est une constante éditoriale
 * qui peut changer de mot un jour sans que ce calcul de géométrie soit dans la boucle de
 * revue de ce changement-là. `String.indexOf` rend déjà -1 pour « non trouvé » ; l'envelopper
 * ici documente que c'est un CAS ATTENDU côté appelant (tubeHole retombe sur le centre de
 * l'écran, voir son commentaire), pas une valeur d'erreur qui filtrerait en silence dans un
 * calcul de pixel.
 */
export function letterIndex(line: string, word: string, offset: number): number {
  const at = line.indexOf(word);
  return at < 0 ? -1 : at + offset;
}
