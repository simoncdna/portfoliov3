/**
 * LA SÉQUENCE DU TERMINAL — le texte, et rien que le texte. Le poste apparaît, le curseur
 * clignote À VIDE — l'attente est un état qu'on doit voir, d'où presque trois clignotements
 * avant la première lettre — puis les phrases se FRAPPENT l'une après l'autre, curseur en
 * bout de ligne, et l'invite reste à clignoter sur la dernière.
 *
 * TROIS PHRASES, PAS UNE, et la dernière est un état de repos choisi : « Follow the white
 * rabbit. » est une invitation, ce qui est exactement ce qu'une section de projets doit
 * laisser à l'écran quand le lecteur arrive dessus. La séquence ne boucle donc pas — elle
 * se pose. C'EST AUSSI LA PHRASE DONT LE TUNNEL PREND LA LETTRE : tubeHole.ts y cherche le
 * « a » de « rabbit » — encore une raison, en plus de celle ci-dessous, pour laquelle ce mot
 * ne doit pas changer sans revoir tubeHole.ts (son repli sur le centre de l'écran, documenté
 * là-bas, est silencieux : rien ne signalera qu'il s'est déclenché).
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
export const TV_LINES = ["wake up...", "The matrix has you.", "Follow the white rabbit."];
