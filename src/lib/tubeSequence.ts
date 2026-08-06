/**
 * L'HORLOGE DU TERMINAL, en fonction pure — AUCUN IMPORT, comme formChoreo, et pour la
 * même raison : ce module est importable depuis Node, donc son invariant se teste sans
 * navigateur ni framework. Voir tests/tubeSequence.test.ts.
 *
 * L'état est une FONCTION de l'instant, jamais un compteur avancé à la frame. Un compteur
 * dériverait, ne saurait pas rejouer, et ne saurait surtout pas répondre deux fois la même
 * chose au même temps — ce que le rembobinage du panneau et le scrub de la section exigent
 * tous les deux.
 */

export type Cadence = {
  /** L'attente au curseur nu avant la première lettre, secondes. */
  idle: number;
  /** Une lettre toutes les… secondes. */
  char: number;
  /** La pause après une ligne avant que la suivante commence, secondes. */
  hold: number;
  /**
   * LA PAUSE, LIGNE PAR LIGNE — optionnelle, et `hold` sert de défaut quand elle manque.
   *
   * Elle existe parce que toutes les fins de ligne ne se valent pas : une ligne qui n'est que
   * l'HABILLAGE de la précédente (une phrase trop longue pour le canvas) ne doit pas marquer
   * de pause, sinon la phrase hésite en son milieu ; une ligne qui termine une PHRASE, elle,
   * doit tenir en place avant de s'effacer. L'horloge ne connaît ni invites ni phrases — elle
   * ne compte que des caractères — donc c'est l'appelant qui répond, index par index.
   */
  holdAt?: (i: number) => number;
};

export type SequenceState = {
  /** L'indice de la ligne courante. */
  line: number;
  /** Combien de caractères de cette ligne sont frappés. */
  chars: number;
  /** Une frappe est en cours (le curseur ne clignote pas pendant). */
  typing: boolean;
  /**
   * La séquence est arrivée au bout. C'EST CE QUI DÉVERROUILLE LA PLONGÉE — il vaut faux
   * une frame de trop et la plongée part sur un texte inachevé, il ne bascule jamais et la
   * page reste bloquée. Testé aux deux bords.
   */
  done: boolean;
};

/** La pause après la ligne i — `holdAt` si l'appelant en fournit une, `hold` sinon. */
const holdOf = (r: Cadence, i: number): number => (r.holdAt ? r.holdAt(i) : r.hold);

/** Combien de temps la séquence entière prend. Les pauses sont INTERMÉDIAIRES : n-1, pas n. */
export function sequenceDuration(lines: readonly string[], r: Cadence): number {
  let d = r.idle;
  for (let i = 0; i < lines.length; i++) {
    d += lines[i].length * r.char;
    if (i < lines.length - 1) d += holdOf(r, i);
  }
  return d;
}

export function sequenceAt(t: number, lines: readonly string[], r: Cadence): SequenceState {
  // Aucune ligne : rien à frapper. Sans ce garde `last` vaut -1, la boucle ne tourne jamais
  // et le repli du bas lit `lines[-1].length` — un plantage constaté par exécution, pas
  // une panne silencieuse mais un plantage quand même sur un module qui se veut un contrat
  // autonome. `done: true` et non `false` : une séquence vide n'a rien à finir, elle ne
  // doit rien bloquer derrière elle — c'est exactement l'esprit de `done`, appliqué au cas
  // dégénéré. Symétrique au traitement de `lines = []` dans sequenceDuration, plus haut.
  if (lines.length === 0) return { line: 0, chars: 0, typing: false, done: true };
  const last = lines.length - 1;
  let rest = t - r.idle;
  if (rest <= 0) return { line: 0, chars: 0, typing: false, done: false };

  for (let i = 0; i <= last; i++) {
    const dur = lines[i].length * r.char;
    if (rest < dur) {
      const chars = Math.floor(rest / r.char);
      return { line: i, chars, typing: chars > 0, done: false };
    }
    rest -= dur;
    // La dernière ne cède pas la main : pas de pause à consommer, l'état se pose.
    if (i === last) return { line: i, chars: lines[i].length, typing: false, done: true };
    const hold = holdOf(r, i);
    if (rest < hold) return { line: i, chars: lines[i].length, typing: false, done: false };
    rest -= hold;
  }
  // Inatteignable : la branche `i === last` retourne toujours. Présent pour le typage.
  return { line: last, chars: lines[last].length, typing: false, done: true };
}
