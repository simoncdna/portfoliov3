# Les planches — le métal devient photographie

> Version expérimentale de la section Work. Le blob s'aplatit en plaque 16:9 et
> **devient** la photo du projet ; les quatre projets sont un ruban qu'on fait défiler,
> une image sort d'un côté de l'écran pendant que la suivante entre de l'autre. La
> matière transite du liquide au drapeau flottant.

## Intention

Jusqu'ici chaque projet était un OBJET : une caméra pour Pictarine, un maillet pour
Forma, un burger, une amphore — quatre champs de distance mixés dans celui du blob
(`formShapes`). La section change de sujet : chaque projet est désormais son **image**.

Le métal sort de la tête de mort, redevient boule, grossit (comportement actuel,
inchangé), puis **se déroule** en une feuille 16:9 et prend la photographie du premier
projet. Ce n'est pas une image posée devant une pièce de métal : l'image EST la surface
que le raymarcher a touchée, donc elle gonfle avec le relief, elle est tirée par
l'inclinaison, elle ondule avec l'onde. Noir et blanc pour l'instant.

## Ce qu'on ne fait pas

- **Pas de mesh, pas de handover.** La plaque est un SDF mixé dans celui du blob, comme
  les objets l'étaient : le métal coule dedans, il ne coupe pas. Un plan texturé
  cross-fadé avec le liquide aurait été deux rendus à raccorder, comme le crâne.
- **Pas de fondu entre projets.** Voir le ruban ci-dessous : une image quitte l'écran,
  l'autre arrive. Deux feuilles réelles en même temps, jamais un dissolve.
- **Pas de tour de plaque.** Une photo vue de profil est une planche — l'objection qui
  avait écarté le tirage encadré de `formShapes`. Le tourne-disque est gelé tant que la
  matière est plate, et la plaque est *amenée* face caméra (voir `faced`).
- **Pas de suppression des objets.** Les quatre SDF restent dans `formShapes`, réglés,
  mixés à quantité 0 par les deux rendus. En remettre un est un mot dans `MOODS`.

## Les unités

### `src/lib/formPhoto.ts` — la plaque, le ruban, l'image

Frère de `formShapes` : du GLSL partagé, plus les constantes que le JS doit connaître.

- `PLATE_HALF = [3.9, 2.194, 0.16]` — demi-étendues locales, 16:9 par construction.
  Solidaire de `--plate-frame` dans `globals.css` : la plaque remplit ~¾ du cadre de
  notches. Bouger l'un sans l'autre décale les repères de coupe. Les deux ont grandi
  ensemble (2.8 / 0.62 au départ) à mesure que la photographie prenait la section.
  Le plafond est le **groupe**, pas le cadre : le nom et les quatre numéros pendent
  dessous, et sur écran étroit les notches sortiraient de l'écran — d'où l'override en
  media query.
- **L'image est PLATE, et rien ne lui est appliqué.** Tout ce qui la touchait est à zéro :
  la vague, le relief liquide, la traînée UV, l'aberration chromatique, le reflet. Le
  balancement de ±6° a sauté aussi (voir `formClock`) : sur une caméra en perspective, la
  moindre inclinaison projette la photo en trapèze, et une photographie accrochée d'aplomb
  n'est pas sans vie — elle est accrochée droit. Reste une photographie, en noir et blanc, à
  une exposition et un contraste.

  Tout est conservé, réglé, et revient avec **un** chiffre : la vague (`flagAmp`, avec
  `cloth`/`wind` comme réglages) et le verre (`aber` à 0.006 — une séparation RVB radiale
  comme une lentille, qui **survit en noir et blanc** sous forme de liseré rouge/cyan, parce
  que ce sont trois luminances, une par canal). Le shader court-circuite chaque effet dont
  l'amplitude est nulle : les porter ne coûte rien par frame.
- **Présentation galerie** : le champ unit **quatre** slots autour de la position, pas deux. Avec
  deux, garé sur une planche — l'état de repos de la section — une seule photo existait et la
  galerie était une image seule dans le noir. Les voisines doivent être là quand rien ne bouge,
  c'est tout l'intérêt d'une galerie. Le pas se mesure sur la **planche** (1,3 largeur) et non
  sur l'écran, et `uShrink` dessine les voisines plus petites — le seul indice de profondeur
  qui reste, maintenant que rien n'est incliné ni déformé.
- **`md.flat` claque en haut et en bas de sa plage** (0,995 → 1). Un lissage exponentiel
  n'atterrit jamais, et ici le dernier demi-pourcent coûtait deux fois : le champ gardait 0,5 %
  de la distance du **blob** mixée dans celle des planches — négligeable au centre de l'écran,
  supérieur au seuil d'impact du marcheur à quelques unités de là, ce qui rendait les voisines
  **invisibles** — et le tourne-disque gardait quelques milliradians, ce qui projette une
  photographie en trapèze. Être *exactement* plat est porteur.
- La machinerie de la vague reste en place et réglée (`plateWave`, `WAVE_REF`, `cloth`,
  `wind`) : la remettre est un chiffre. Elle est court-circuitée dans le shader quand son
  amplitude est nulle, donc elle ne coûte rien.
- **La vague est normalisée sur la feuille** (±1 aux bords) et sa profondeur suit
  `PLATE_HALF.x / WAVE_REF`. Écrite en unités locales, agrandir la plaque gardait les
  crêtes de la même taille et le creux de la même profondeur — l'effet s'aplatissait donc
  en proportion de la nouvelle taille. Un chiffre trouvé à l'œil dans le panneau garde son
  sens quand la plaque change de taille.
- `plateStrip` — l'**union** des deux slots qui encadrent la position courante. `min()`,
  pas d'union lisse : deux photographies qui se croisent ne doivent pas fondre l'une dans
  l'autre. Le second slot n'est évalué que si le ruban est entre deux (branche sur un
  uniforme, donc cohérente sur tout le draw).
- `plateSheet` — une feuille, déformée en liquide, en tissu, ou entre les deux. **Les deux
  effets ne sont pas deux amplitudes d'une même chose**, c'est ce qui permet de transiter
  de l'un à l'autre :
  - *tissu* = décalage du **domaine** en profondeur (`z - wave`) → la feuille plie en
    gardant son épaisseur et son contour rectangulaire ; un drapeau a un ourlet ;
  - *liquide* = bruit soustrait à la **distance** → ça gonfle dans toutes les directions,
    le contour part en lambeaux, la feuille peut se déchirer. Ce que le métal doit faire
    et ce que le tissu ne doit pas.
- `plateWave` — l'onde du vent : elle **voyage** (des phases qui courent contre l'horloge)
  et ses crêtes **ne sont pas parallèles** (trois ondes, trois angles, trois vitesses — une
  seule sinusoïde donne de la tôle ondulée, seul vrai mode d'échec de l'exercice). Elle
  n'est **pas ancrée** : un premier jet faisait croître l'amplitude depuis une hampe, ce
  qui est le comportement d'un vrai drapeau et n'est pas le sujet — la vague doit courir sur
  **toute** la photo, uniformément, pour se lire comme du vent sur l'image et non comme une
  bannière hissée.
- `photoLuma` / `photoHas` — un sampler par projet, adressé par **slot** et non mixé par
  poids : sur un ruban il n'y a qu'une image par feuille, donc rien à cross-fader. Chaîne
  de `if` générée, parce que GLSL ES exige un indice littéral pour un sampler.

### `src/lib/workPlate.ts` — la planche montrée

Ajoute `index` (le slot, -1 hors section) : la section continue de parler des planches par
leur nom, ce fichier seul sait que le shader les adresse par rang. Perd `turns` et le pas
signé — le ruban porte le sens du mouvement dans ses deux positions.

### `src/lib/formClock.ts` — deux nombres, et tout en découle

- `mood.flat` : 0 = sphère, 1 = feuille. Monte **une fois** à l'arrivée, descend une fois
  au départ. Changer de planche n'y touche pas. Tout ce qui doit s'accorder sur la
  platitude lit ce nombre : le champ, le gel du tourne-disque, la mise face caméra. Deux
  d'entre eux en désaccord = une plaque qui se présente de profil.
- `mood.car` : la position sur le ruban, en unités de planche. C'est **tout** le
  changement de planche.
- `mood.hover` : le lecteur pointe le nom du projet (ou l'a au clavier). **Un seul nombre
  pour tout le geste** — le vent s'arrête, la couleur monte, la photo avance d'un cran (+10%,
  via le `scale` de la chorégraphie, donc les bornes, le pas du ruban et le mappage suivent
  gratuitement). Trois effets sur un signal ne peuvent pas se désynchroniser, et le retour est
  gratuit : on relâche, les trois se rejouent à l'envers. Les notches se resserrent en même
  temps, côté CSS, depuis le geste qui existait déjà.
- `state.wave` : **une seconde horloge**, pour que le vent puisse s'arrêter alors que le métal
  continue de respirer. Elle s'intègre à `(1 − hover)` : geler n'est donc pas un saut — la
  crête qui était à l'écran y reste et repart de là. Lire l'horloge partagée en la multipliant
  dans le shader rembobinerait la vague à son origine, ce qui est une secousse.
- **Rien d'autre.** Il y avait un troisième signal — la distance au slot le plus proche —
  qui ajoutait une ridule et repassait la feuille en métal liquide pendant la traversée. Les
  deux **déformaient la photo au moment précis où on la tend au lecteur**, et ils ont été
  retirés : le changement de planche est une translation, la feuille qui part et celle qui
  arrive sont la même matière ondulant de la même façon. Comme sur un vrai ruban.
- Le gel : `frz = max(holdEased, flat)`. Le pin d'About et la platitude disent la même
  chose — « le tour ambiant n'est pas à toi » — et un `max` évite qu'additionnés ils
  dépassent 1 et fassent tourner la forme à l'envers.
- `faced` : geler le tour ne **présente** pas la plaque. L'angle entier est marché vers le
  multiple de 2π le plus proche (pas π : le dos porte l'image en miroir), la marche étant
  `flat`. La cible est verrouillée avant le début de l'aplatissement, sinon un arrondi
  ferait faire un tour complet à la pièce.
- `SWAY` : ±6° de balancement, substitut du tourne-disque. Une feuille tenue parfaitement
  immobile est une affiche.

### `src/components/chrome/LiquidDna.tsx`

- Les bornes analytiques deviennent une **union de sphères** (`span`), une par slot : une
  seule sphère autour du ruban ferait une largeur d'écran et paierait le bruit sur presque
  tous les pixels — l'inverse de ce à quoi sert une borne.
- `stepK` gagne un terme par déformation (relief liquide, décalage du domaine), tous deux
  bornés par leur gradient : une feuille agitée avance à petits pas, une feuille posée à
  grands, sans réglage à tenir à jour.
- `toLocal` / `dirToLocal` sont sortis de `map()` : l'ombrage a besoin du point **local**,
  puisque l'UV se lit sur la surface effectivement touchée.
- `uFlag = flat · (1 − travel)` : la boule sort d'About en liquide et **devient** drapeau
  en se déroulant ; une feuille qui traverse l'écran se liquéfie pour le voyage et se
  repose en tissu. Les deux termes sont des signaux de la section, donc l'état de matière
  ne peut pas contredire la forme qu'elle a.
- Les textures sont chargées impérativement (pas `useTexture`, qui suspend) : le liquide
  est la forme qui ne doit jamais attendre. Un slot non décodé reste chrome ; les samplers
  sont tous liés à un gris 1×1 dès le départ, un sampler non lié étant un comportement
  indéfini que certains pilotes commentent à chaque draw call.

### `src/lib/plateTweak.ts` + `src/components/PlateDevPanel.tsx` — l'établi

Store frère de `blobTweak` (lu impérativement chaque frame, aucun re-render, aucune
recompilation de shader) et son panneau, **séparé du `ControlPanel`** : celui-là fait
partie du site — un tableau de bord fini qu'on découvre depuis le code-barres du Hero —
alors que celui-ci est un établi. Curseurs bruts, chiffres, aucune animation, et il n'est
pas livré (monté sous `NODE_ENV === "development"`, donc éliminé du bundle de production).
Ouvert par ⌘/Ctrl+K depuis n'importe où, parce que ce qu'il règle est à quatre écrans du
Hero.

Dix réglages : `flagAmp` / `wind` / `cloth` (la bascule liquide↔tissu, en multiplicateur —
jamais en remplacement de la chorégraphie), `relief` / `warp`, puis l'étalonnage du tirage :
`exposure` / `shade` / `sheen` / `gloss` / `contrast`.

`sheen` et `gloss` **sont** le reflet, et les valeurs retenues les mettent à **zéro** : la
plaque est un tirage photographique, pas un miroir. C'est précisément pour ça que `shade`
existe — c'étaient les deux seuls termes qui dépendaient de la normale, donc à zéro la
vague devenait invisible : un rectangle plat de photo, ondulant et sans ombre. `shade` est
un demi-lambert dans le repère de la plaque : du modelé **mat**, ce qui montre le vent sans
une seule haute lumière.

`[ copy ]` sort les valeurs courantes en littéral `DEFAULTS`, pour finir la séance avec des
nombres dans la source plutôt qu'un panneau à re-régler — c'est par là que les valeurs
actuelles sont arrivées.

### `src/data/site.ts` / `globals.css`

`image` par projet (n'importe quel rapport d'aspect, recadré en `cover` vers le 16:9 par
`uPhotoFit`). Le cadre de notches passe en 16:9 et s'élargit à 0.62 de la boîte canvas :
les quatre marques deviennent les repères de coupe de la photographie, ce qui est le
registre du site (une édition imprimée).

## Reste à faire

- **Les quatre fichiers de `public/images/work/` sont des placeholders** : une photographie
  de test, plus un miroir et deux recadrages, pour pouvoir juger le parcours. À remplacer.
- La couleur. Le noir et blanc tient quatre images sans rapport dans un même registre ;
  c'est une décision, pas une limite technique (`photoShade`).
- `MeshDna` et `DnaParticles` ne connaissent pas la plaque : dans les modes *wire* et
  *particles* du panneau (dev), la pièce reste un blob dans Work.
