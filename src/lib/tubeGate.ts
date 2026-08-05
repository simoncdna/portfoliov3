/**
 * LE PONT ENTRE LA RETENUE (DOM) ET LA SÉQUENCE DU TERMINAL (WebGL).
 *
 * `seq.done` — la séquence a fini de parler — est calculé dans le useFrame de
 * ChromeTableau, à partir de l'horloge du tube (tubeSequence.sequenceAt). Le verrou
 * qui retient le scroll pendant qu'elle parle vit dans Work.tsx, côté DOM. Il leur faut
 * un pont, et le dépôt en a déjà deux : workReveal (le DOM écrit `dive`/`form`/`away`,
 * l'horloge les lit) et workPlate (le DOM écrit la plaque montrée, l'horloge la lit).
 * Même motif ici — un singleton mutable, pas un store avec abonnement, parce que les
 * deux lecteurs (le useFrame de ChromeTableau et le ticker de Work.tsx) veulent la
 * valeur COURANTE à leur propre cadence, jamais une notification.
 *
 * CE PONT-CI EST BIDIRECTIONNEL, ce qui est inhabituel dans ce dépôt — workReveal et
 * workPlate ne le sont pas, ils n'ont qu'un sens (DOM → horloge). Ici :
 *
 *   - `done` : WebGL écrit, DOM lit — pour savoir s'il faut tenir le verrou.
 *   - `boost` : DOM écrit, WebGL lit — pour savoir de combien avancer l'horloge du tube.
 *
 * C'est acceptable parce que ChromeTableau publie déjà de la même façon dans l'AUTRE
 * sens que ce fichier n'existe pas pour changer : son useFrame écrit le rectangle
 * pixel du poste en variables CSS (--plate-px-*, --form-lift) pour que le DOM
 * s'aligne sur une géométrie que seul le shader connaît. WebGL → DOM a donc déjà un
 * précédent ici ; DOM → WebGL en a un autre (workReveal). Ce fichier ne fait
 * qu'assumer les deux sens à la fois, dans un seul objet, parce que c'est la même
 * paire de composants (Work.tsx ↔ ChromeTableau) qui négocie les deux faits à la fois
 * — un verrou qui dépend d'un état WebGL, et une horloge WebGL qu'un geste DOM veut
 * pouvoir bousculer.
 */
export const tubeGate = {
  /**
   * La séquence est arrivée au bout (tubeSequence.SequenceState.done), republié ici à
   * chaque frame par ChromeTableau. Faux par défaut : au montage, avant la toute
   * première frame WebGL, le verrou de Work.tsx ne doit rien tenir pour acquis — et de
   * toute façon `mood.flat` vaut 0 à cet instant, donc la retenue ne regarde `done` que
   * plus tard, une fois la plaque posée.
   */
  done: false,
  /**
   * Des SECONDES, ajoutées par Work.tsx à chaque cran de molette pendant que la
   * retenue tient, consommées puis remises à zéro par ChromeTableau une fois par
   * frame (`tb.t += delta + tubeGate.boost; tubeGate.boost = 0;`). Jamais négatif :
   * Work.tsx n'y ajoute que des increments positifs, dans un sens ou dans l'autre de
   * la molette — reculer l'horloge du tube ferait revenir des lettres déjà frappées,
   * ce que rien dans cette feature ne demande.
   */
  boost: 0,
};
