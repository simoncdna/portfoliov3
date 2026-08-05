"use client";

import { CanvasTexture } from "three";
import { posteTweak } from "./posteTweak";

/**
 * LE CANVAS DU TUBE, sorti de ChromeTableau parce qu'il a maintenant DEUX consommateurs : le
 * tube du poste et le tunnel de pixels. Ce n'est pas une optimisation, c'est le sens de la
 * séquence — on entre dans les pixels de CETTE phrase-là, pas dans une texture qui lui
 * ressemble. Deux canvas se seraient désynchronisés à la première molette du panneau.
 *
 * UN CANVAS 2D, PAS DE LA GÉOMÉTRIE DE TEXTE. Un terminal est du texte monospace sur fond
 * noir : c'est exactement ce qu'un canvas 2D fait le mieux, et le faire en géométrie (drei
 * Text, MSDF) coûterait un atlas de police, des draw calls de plus et le placement de chaque
 * glyphe dans l'espace du poste — pour un rendu moins fidèle, parce qu'un phosphore n'a pas
 * de contours nets.
 *
 * LE TEXTE S'ANIME, ET LE COÛT A ÉTÉ MESURÉ comme la version statique l'exigeait (« ce sera
 * un coût à mesurer, pas à supposer ») : `draw` repeint TOUT — fond, invite, texte tronqué,
 * curseur en bout de ligne — plutôt que d'incrémenter, ce qui rend l'état impossible à
 * désynchroniser. `draw` lui-même ne fait AUCUN diff : appelé, il repeint. C'est l'APPELANT
 * (le useFrame de ChromeTableau) qui décide QUAND l'appeler, au changement d'état et jamais à
 * la frame — le clignotement re-uploade 512×384 RGBA (~0,8 Mo) deux fois par seconde, la
 * frappe ~quatorze fois pendant les huit dixièmes de seconde qu'elle dure : trois ordres de
 * grandeur sous ce que la scène uploade par frame en dpr plein.
 *
 * 512×384 : le 4:3 du tube, et une résolution qui laisse le monospace net sans peser. Le vert
 * est le P1 des phosphores de terminal, pas un vert d'écran moderne.
 *
 * CRÉÉ PARESSEUSEMENT, et pas pour la raison que le plan avançait. Il disait « ce module est
 * importé par des composants rendus côté serveur » : c'est FAUX aujourd'hui — ChromeMount
 * monte toute la scène en `ssr: false`, donc rien de ce graphe n'est évalué côté serveur.
 *
 * La vraie raison est plus solide que celle-là : un `document.createElement` au niveau du
 * module s'exécuterait à l'IMPORT, ce qui ferait dépendre la simple importabilité de ce
 * fichier de la présence d'un DOM. Cette garantie existe bien, mais elle vit dans un AUTRE
 * fichier (le `ssr: false` de ChromeMount) — un module n'a pas à hypothéquer sa propre
 * sûreté sur une configuration distante que personne ne pense à consulter en le déplaçant.
 * La paresse la rend locale et gratuite.
 */

/**
 * L'interligne, en multiples du corps. 1.5 est le pas d'un terminal — assez d'air pour que
 * le halo de phosphore d'une ligne ne vienne pas manger la suivante, ce qui compte
 * d'autant plus que le halo est réglé haut (22.5).
 */
export const LINE_STEP = 1.5;

type Screen = { tex: CanvasTexture; draw: (line: number, chars: number, cursorOn: boolean) => void };

/**
 * Mémorisé au niveau du MODULE, pas dans un state ni un ref React — c'est ce qui permet à deux
 * composants sans parent commun (le tube du poste et, bientôt, le tunnel de pixels) de demander
 * « le canvas » et de recevoir LE MÊME objet. Voir la précondition sur `lines` dans tubeScreen
 * ci-dessous.
 *
 * LE FAST REFRESH DU DEV NE LE VOIT PAS. Ce n'est pas neuf : le `useMemo` (déps `[]`) qui
 * fabriquait ce canvas dans ChromeTableau, avant cette extraction, avait déjà cette propriété —
 * éditer le corps de `draw` ne prenait déjà effet qu'après un rechargement complet, parce que
 * React ne rejoue pas la factory d'un useMemo à déps inchangées sur un Fast Refresh qui ne
 * remonte pas le composant. Ce que cette extraction ajoute est plus étroit : même un remount
 * de ChromeTableau (rare ici — il n'est jamais démonté/remonté par clé) redonnait avant un
 * canvas NEUF, et redonne maintenant l'ANCIEN, tant que ce module-ci n'a pas lui-même été
 * rechargé. Jugé sans conséquence : un F5 le corrige, comme pour le reste du WebGL construit
 * une fois dans ce fichier (géométries, ShaderMaterial) et qui ne se reconstruit pas à chaud
 * non plus.
 */
let screen: Screen | null = null;

export function tubeScreen(lines: readonly string[]): Screen {
  /*
   * SINGLETON PARESSEUX, ET `lines` N'EST CONSULTÉ QU'AU PREMIER APPEL — tout appelant suivant
   * reçoit le canvas déjà peint, quels que soient les mots qu'il passe. Ce n'est PAS un oubli :
   * le tube du poste et le tunnel de pixels doivent peindre et lire EXACTEMENT le même canvas
   * (voir l'en-tête du fichier), donc un second appelant qui recevrait un canvas FRAIS serait
   * le vrai bug, pas celui-ci.
   *
   * Aujourd'hui un seul appelant existe (ChromeTableau, avec la constante TV_LINES), donc
   * l'argument ignoré est sans conséquence — même doctrine que les préconditions non gardées
   * de tunnelGeom : une valeur qui vient d'une constante de scène, pas d'une entrée, ne
   * justifie pas de blinder contre un appelant qui n'existe pas. Mais le piège est réel pour
   * qui lirait la seule signature sans lire ce commentaire : passer d'AUTRES phrases en croyant
   * amorcer un canvas indépendant se tromperait SANS SYMPTÔME — l'écran resterait celui du
   * premier appelant, silencieusement. Si un second canvas indépendant devient nécessaire un
   * jour, ce n'est pas cette fonction qu'il faut garder : c'est son contrat qui doit changer
   * (par exemple une clé de cache sur `lines`, ou deux fonctions distinctes).
   */
  if (screen) return screen;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 384;
  const x = c.getContext("2d")!;
  const tex = new CanvasTexture(c);
  tex.flipY = false;
  const draw = (line: number, chars: number, cursorOn: boolean) => {
    // Le placement est lu ICI, à l'instant de peindre, et non capturé à la création du
    // pinceau : le panneau bouge ces nombres pendant la session, et un pinceau qui
    // aurait fermé sur eux peindrait l'ancienne position pour toujours. C'est le
    // useFrame qui décide QUAND repeindre (le nonce du store) ; draw ne fait que lire.
    const pt = posteTweak.get();
    x.fillStyle = "#000";
    x.fillRect(0, 0, c.width, c.height);
    x.font = `600 ${pt.textSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    x.textBaseline = "top";
    // Du PHOSPHORE, pas du texte de canvas : un glyphe cathodique n'a pas de bord.
    // L'ombre portée verte dessine le halo dans la même passe que le trait — le
    // shader ajoutera l'halation du verre par-dessus, mais la douceur du glyphe
    // lui-même doit être dans la texture, sinon le bord crénelé du canvas reste
    // visible sous n'importe quel halo.
    x.shadowColor = "rgba(77, 255, 122, 0.9)";
    x.shadowBlur = pt.textGlow;
    x.fillStyle = "#5aff85";
    // En HAUT À GAUCHE — là où un terminal démarre. Le centre était un choix d'écran
    // de veille ; une invite naît au coin.
    //
    // `stack` : les phrases déjà dites restent à l'écran sous forme de lignes, comme dans
    // un vrai terminal. Sinon chacune EFFACE la précédente — le geste du film, où chaque
    // message est seul sur un écran noir. Les deux se lisent, d'où la molette.
    const step = pt.textSize * LINE_STEP;
    const first = pt.textStack ? 0 : line;
    for (let i = first; i <= line; i++) {
      // Seule la ligne COURANTE est tronquée ; celles d'avant sont entières.
      const txt = "> " + (i === line ? lines[i].slice(0, Math.max(0, chars)) : lines[i]);
      const y = pt.textY + (i - first) * step;
      x.fillText(txt, pt.textX, y);
      // Le curseur, ce qui fait la différence entre du texte et un terminal — il SUIT la
      // frappe : mesuré sur la ligne réellement affichée, pas sur la ligne finale. Ses
      // dimensions suivent le corps du glyphe, sinon régler la taille du texte laisse un
      // curseur de l'ancienne taille à côté.
      if (cursorOn && i === line) {
        const advance = x.measureText(txt + " ").width - x.measureText(" ").width;
        const pad = pt.textSize * 0.27;
        x.fillRect(pt.textX + advance + pad, y, pt.textSize * 0.53, pt.textSize);
      }
    }
    x.shadowBlur = 0;
    tex.needsUpdate = true;
  };
  draw(0, 0, true);
  screen = { tex, draw };
  return screen;
}
