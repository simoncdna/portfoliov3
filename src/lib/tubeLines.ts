/**
 * LA SÉQUENCE DU TERMINAL — le texte, et rien que le texte. Le poste apparaît, le curseur
 * clignote À VIDE — l'attente est un état qu'on doit voir, d'où presque trois clignotements
 * avant la première lettre — puis les phrases se FRAPPENT l'une après l'autre, curseur en
 * bout de ligne, et l'invite reste à clignoter sur la dernière.
 *
 * DEUX PHRASES, CHACUNE HABILLÉE SUR DEUX LIGNES — donc quatre lignes et DEUX invites. Ce n'est
 * ni trois phrases qui s'effacent l'une l'autre (le régime d'origine) ni un seul énoncé continu :
 * deux propositions qui se répondent, la seconde ouvrant sa propre invite comme un second tour de
 * parole. Les lignes s'EMPILENT (`textStack` à vrai dans posteTweak), donc les quatre restent à
 * l'écran.
 *
 * POURQUOI PAS UNE LIGNE PAR PHRASE, ce qui était l'intention : la seconde fait 55 caractères,
 * 57 avec l'invite, soit 755 px à un corps de 22 px — le canvas en fait 512. Il faudrait
 * redescendre à ~14 px, un corps auquel le texte ne se lit plus sur l'écran du poste en plan
 * large (essayé, écarté). D'où l'habillage en deux, qui garde les deux invites ET la lisibilité.
 *
 * LES LARGEURS, MESURÉES À 22 px (avance 13.25 px), invite ou alinéa compris : 30 / 15 / 31 / 28
 * caractères effectifs, soit 410 / 211 / 423 / 383 px — tous loin des 512.
 *
 * C'EST AUSSI LA PHRASE DONT LE TUNNEL PREND LA LETTRE : tubeHole.ts y cherche le « o » de
 * « network » — le dernier mot, et la destination même de l'énoncé. Changer ce mot, ou le
 * pousser hors de la DERNIÈRE ligne, casse la cible sans rien signaler : le repli de tubeHole
 * sur le centre de l'écran est silencieux.
 *
 * ICI, DANS SON PROPRE FICHIER, PLUTÔT QUE DANS ChromeTableau (où cette constante vivait
 * jusqu'à ce que tubeHole.ts apparaisse) — TROIS lecteurs désormais : ChromeTableau (qui
 * PEINT le canvas via tubeScreen(TV_LINES)), PixelTunnel (qui doit lire le MÊME canvas,
 * jamais une texture qui lui ressemble), et tubeHole (qui cherche la lettre dans la MÊME
 * phrase que celle réellement peinte). Importer depuis ChromeTableau suffisait à deux
 * lecteurs (PixelTunnel n'est jamais importé PAR ChromeTableau, donc pas de cycle) ; le
 * troisième aurait fermé la boucle, puisque ChromeTableau doit lui-même lire tubeHole (pour
 * publier tubeMouth.holeX/holeY — voir ce fichier) : ChromeTableau → tubeHole → ChromeTableau.
 * Un cycle ESM entre deux modules qui ne se lisent qu'à l'intérieur d'un corps de fonction
 * (jamais au niveau module) reste correct — les liaisons sont vivantes, la valeur existe
 * bien au moment où elle est enfin lue — mais c'est le genre de correction qui ne tient que
 * tant qu'aucun des deux fichiers ne déplace une ligne au niveau module. Un fichier neutre,
 * sans import, que les trois consomment, n'a pas cette fragilité à surveiller.
 *
 * `tubeScreen(lines)` n'utilise `lines` qu'à son tout premier appel (voir ce fichier) : une
 * copie locale à un des trois lecteurs, même identique aujourd'hui, dériverait silencieusement
 * de celle-ci au premier mot changé — et si un lecteur se montait avant un autre, une copie
 * DIFFÉRENTE gagnerait la course et s'imprimerait dans le canvas pour de bon, sans erreur.
 * Partager la même constante rend le résultat correct quel que soit l'ordre de montage.
 *
 * La cadence de frappe (TYPE_IDLE, BLINK — dans ChromeTableau) reste là où elle vit : ce
 * n'est pas une géométrie de canvas, seulement ChromeTableau en a besoin.
 */
/**
 * UNE LIGNE DU TERMINAL : son texte, et si elle OUVRE une phrase.
 *
 * L'invite appartient à la donnée, pas à une règle du pinceau — parce que la règle qu'on
 * aurait écrite (« la première ligne porte l'invite, les autres non ») ne sait pas distinguer
 * une phrase qui commence d'une ligne qui continue la précédente. Ici il y a DEUX phrases, et
 * chacune tient sur deux lignes : l'invite doit donc revenir à la troisième.
 *
 * Elle n'entre pas dans le texte frappé pour autant (voir tubeScreen.draw, qui la préfixe) :
 * une invite qui s'écrirait caractère par caractère ne serait plus une invite.
 */
export type TubeLine = {
  text: string;
  /** true = cette ligne ouvre une phrase (« > ») ; false = elle continue la précédente. */
  prompt: boolean;
};

export const TV_LINES: readonly TubeLine[] = [
  { text: "Yesterday I stood on feet of", prompt: true },
  { text: "fragile flesh", prompt: false },
  { text: "And today I am the light that", prompt: true },
  { text: "flows through the network.", prompt: false },
];

/**
 * LES SEULS TEXTES, dérivés une fois au chargement du module — ce que l'HORLOGE de frappe
 * consomme (`sequenceAt`, `sequenceDuration`), qui n'a que faire des invites : elle ne compte
 * que des caractères. Dérivé ici plutôt que `map()` à chaque frame chez l'appelant, et surtout
 * plutôt que d'apprendre l'invite à tubeSequence — cette horloge est pure et testée sur des
 * chaînes, il n'y a aucune raison de lui faire porter une décision de mise en page.
 */
export const TV_TEXTS: readonly string[] = TV_LINES.map((l) => l.text);

/**
 * LA PREMIÈRE LIGNE DE LA PHRASE QUI CONTIENT `line` — la ligne portant l'invite la plus
 * récente. C'est ce qui fait qu'une phrase habillée sur deux lignes s'affiche et s'effacent
 * ENSEMBLE : le pinceau dessine de ce début jusqu'à la ligne courante, et la phrase suivante
 * repart de son propre début, effaçant la précédente.
 *
 * PARTAGÉE ENTRE LE PINCEAU ET LA MESURE (tubeScreen et tubeHole) : les deux doivent placer la
 * même ligne au même Y, sinon la cible du tunnel dérive d'une hauteur de ligne sans que rien ne
 * le signale.
 */
export function sentenceStart(line: number): number {
  for (let i = Math.min(line, TV_LINES.length - 1); i >= 0; i--) if (TV_LINES[i].prompt) return i;
  return 0;
}
