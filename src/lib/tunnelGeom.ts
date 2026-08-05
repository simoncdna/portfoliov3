/**
 * LA GÉOMÉTRIE DU CORRIDOR — aucun import, testable sous Node (voir tests/tunnelGeom.test.ts),
 * sur le précédent de formChoreo : « il est donc importable depuis Node, et l'invariant peut
 * être testé sans navigateur ni framework ».
 *
 * Le tunnel est la grille de cellules du terminal RÉPÉTÉE en profondeur. La tranche k est à
 * z₀·(1+g)^k et à l'échelle (1+g)^k — GÉOMÉTRIQUE DES DEUX CÔTÉS, et c'est tout l'invariant :
 * échelle/distance est alors constant, donc chaque tranche sous-tend le même angle et le
 * corridor est DROIT. Un espacement linéaire avec une échelle géométrique donne un pavillon
 * évasé ; c'est l'erreur qu'a faite la première rédaction du spec, et le premier test de ce
 * module existe pour qu'elle ne revienne pas.
 *
 * Le recyclage tombe du même choix : une tranche dépassée repart au fond par une
 * multiplication, et seize tranches suffisent pour une profondeur illimitée.
 *
 * CES FORMULES SONT DUPLIQUÉES EN GLSL dans PixelTunnel, et c'est délibéré : le vertex
 * shader place les instances, mais il n'est pas testable. Les garder identiques ici et
 * là-bas est ce qui fait que ce test couvre réellement ce que le GPU dessine. Toute
 * modification ici doit être reportée là-bas, et l'inverse.
 */

/** La profondeur de la tranche k. z₀ est celle de l'image plate. */
export const sliceZ = (k: number, z0: number, g: number): number => z0 * Math.pow(1 + g, k);

/** L'échelle de la tranche k. La tranche 0 vaut 1 : c'est l'image telle qu'à l'écran. */
export const sliceScale = (k: number, g: number): number => Math.pow(1 + g, k);

/** Combien de tranches pour couvrir de z₀ jusqu'à `far`. */
export const sliceCount = (z0: number, g: number, far: number): number =>
  Math.max(0, Math.ceil(Math.log(far / z0) / Math.log(1 + g)));

/**
 * La profondeur d'une tranche après que la caméra a avancé de `travel`, repliée dans
 * l'intervalle d'un cycle.
 *
 * LE REPLI SE FAIT EN LOG, pas en linéaire, parce que l'espacement est géométrique :
 * soustraire une distance puis tester « suis-je passé derrière ? » demanderait une boucle
 * dont le nombre de tours dépend de `travel`, et raterait les grands déplacements. En
 * logarithmique, un cycle est une longueur CONSTANTE (D·ln(1+g)) et le repli est un seul
 * modulo.
 *
 * Le double modulo n'est pas une superstition : `%` rend un résultat négatif pour un
 * opérande négatif en JavaScript, et `travel` DEVIENT négatif dès que le lecteur remonte —
 * le scrub de la plongée est réversible par construction. Sans le second modulo, remonter
 * envoie les tranches derrière la caméra.
 */
export function recycle(z: number, travel: number, z0: number, g: number, slices: number): number {
  const lg = Math.log(1 + g);
  const span = slices * lg;
  // Position dans le cycle, en unités logarithmiques depuis le plancher z0.
  let u = Math.log(z / z0) - travel * lg;
  u = ((u % span) + span) % span;
  return z0 * Math.exp(u);
}
