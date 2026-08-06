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
};

/*
 * PAS DE `boost` ICI, ET C'EST UNE DÉCISION D'AUTEUR. Il y en a eu un : des secondes que
 * Work.tsx ajoutait à chaque cran de molette pendant la retenue, pour que « retenir sans rien
 * répondre au geste » ne se lise pas comme une page cassée. La direction artistique a tranché
 * l'inverse — « on ne fait que jouer des animations comme un film, en gros on ne peut pas
 * accélérer » : la frappe tient sa durée quoi que fasse la molette, et la plongée qui la suit
 * est un film joué dans le temps (voir DIVE_EASE dans Work.tsx), pas un scrub.
 *
 * Si le silence pendant la retenue redevient un problème, la réponse est un SIGNE (un curseur,
 * un indice « ça arrive ») et non un raccourci : accélérer, c'est laisser sauter le dialogue.
 */
