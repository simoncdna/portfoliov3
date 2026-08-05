/**
 * Bridge between the Work section's putting-away timeline (DOM/GSAP) and the chrome
 * form's clock (WebGL) — the counterpart to aboutReveal at the other end of the
 * section.
 *
 * `away` (0..1) is the LAST beat of that timeline: the piece leaves the middle and
 * steps aside to the right, where it can sit beside Contact's full-width text.
 *
 * It is scrubbed by the timeline rather than read off the section's position, for the
 * same reason About's exit is: the move has to come after the type has faded, after
 * the metal has been released, and after the four notches have retracted. Those three
 * beats live in a GSAP timeline, so the fourth has to be measured in the same units —
 * a smoothstep on the band's bottom edge (which is what this replaces) had no way of
 * knowing where the notches had got to, and drifted out of order the moment any beat
 * above it was re-timed.
 *
 * A plain mutable singleton, like aboutReveal: read every frame by the form clock,
 * written by the scrubbed timeline.
 *
 * `form` (0..1) is the ENTRANCE's counterpart: how far the blob has been rolled out
 * into the plate, scrubbed by the entrance timeline. Scrubbed and not time-played,
 * because the metamorphosis is the section's opening spectacle and a spectacle should
 * advance under the reader's hand — each notch of the wheel rolls the metal a little
 * further, backing up melts it back. The clock chases this with a tight ease (see
 * formClock), so the matter keeps its weight without lagging the gesture.
 *
 * `dive` (0..1) est la PLONGÉE : la traversée de l'écran du poste, après que le terminal a
 * fini de parler. Quatrième scrub de la section, du même genre que les trois autres — écrit
 * par une timeline GSAP, lu une fois par frame par l'horloge de la forme.
 *
 * Il ne démarre PAS tant que la séquence du terminal n'est pas finie : la section est
 * épinglée et Lenis arrêté jusque-là (voir Work.tsx). C'est le seul endroit du site où le
 * scroll est retenu, et c'est un choix assumé — atténué par le fait que scroller accélère
 * la frappe au lieu de ne rien faire.
 */
export const workReveal = { away: 0, form: 0, dive: 0 };
