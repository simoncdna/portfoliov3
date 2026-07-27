# Le développé — l'entrée de Work en trois temps, et le ruban en lisière

> Design validé. La galerie reste ; sa mise en scène change. Trois reproches y répondent :
> la métamorphose blob→photo n'a pas de moment fort et mélange deux événements ; l'entrée
> est longue avant le premier payoff ; la composition fait carrousel.

## Intention

La section garde son concept — le métal se déroule en planches photographiques sur un
ruban — mais l'entrée devient une séquence lisible en trois temps, **un événement à la
fois**, tout scrubbé au scroll (règle de la maison : réversible) :

1. **L'arrivée**, raccourcie : la part d'entrée de la bande passe de 18 % à ~12 %.
2. **Le pic** : le déroulement cesse d'être un fondu. Pendant que la plaque se déroule,
   la matière se déchaîne à mi-course puis retombe — et la violence est **dérivée de la
   platitude elle-même** : `pulse = flat·(1−flat)·4`, l'impulsion de la spec rafale.
   Un nombre dérivé, zéro état neuf, désynchronisation impossible. La sortie de section
   rejoue le pic à l'envers, gratuitement.
3. **La pose, puis le développé** : la plaque atteint `flat = 1` encore chrome,
   immobile. Alors seulement la photo monte, comme un tirage dans le révélateur.

Et le ruban assume sa lisière : la planche montrée domine franchement, les voisines ne
font que percer le bord, éteintes, et s'allument en entrant.

## Ce qu'on ne fait pas

- **Pas de re-fusion entre les planches.** Le changement reste une translation (deux
  photos réelles à l'écran en même temps) — c'est la doctrine du ruban, et le reproche
  était l'attente, pas la grammaire. Le voyage gagne un souffle, pas une métamorphose.
- **Pas de nouveau mode de contrôle.** Le scroll reste le seul maître de la sélection.
- **La rafale (clic→fiche) n'est pas touchée.** Le pic d'entrée est dérivé de `flat`,
  la rafale écrase via `formChoreo` : mécanismes disjoints. Pendant la fiche, `flat = 1`
  et `dev = 1` — rien ne bouge.

## Les unités

### `src/lib/formClock.ts` — trois nombres de plus

- **`state.pulse`** : `md.flat · (1 − md.flat) · 4`, dérivé après l'easing du mood.
  Les formes le composent en lecture (`uMoodD`, `uSpike`) — il n'est PAS réinjecté dans
  `md`, dont les champs sont la base d'easing de la frame suivante.
- **`state.mood.dev`** : ease vers 1 quand `flat === 1` et une planche est montrée,
  vers 0 sinon. ~1 s de feel (90 % en une seconde). Reduced motion : snap, comme tout.
- **`state.mood.slide`** : `min(1, |carTarget − car|)` — la vitesse du ruban, déjà
  connue de l'horloge. Le vent se lève pendant le voyage : le **clock** de la vague
  accélère (`state.wave += … · (1 + 1.5·slide)`) et l'amplitude gonfle. On ne touche
  JAMAIS `uWind` en vol : il multiplie la phase accumulée, le changer est un saut.

### `src/lib/formPhoto.ts` — le développé et l'extinction

- `photoShade` prend l'`uv` (le grain est spatial) et un facteur `dim` (l'extinction).
- **Le développé** : tant que `uPhotoOn < 1`, l'exposition monte
  (`×(0.55 + 0.45·on)`) et un **grain photographique** troue l'image — seuil de bruit
  sur le snoise déjà en scope, balayé par `on` (révélation dithered, bords doux). À
  `on = 1` la branche est morte (uniform → cohérente, coût nul développé).
- **L'extinction** : les voisines à ~40 % d'exposition d'émulsion (le gloss — le reflet
  — reste), interpolé continûment par `|slot − uCar|` : la planche qui arrive s'allume
  en entrant, celle qui part s'éteint en sortant.

### `src/components/chrome/LiquidDna.tsx` — la lisière et la composition

- `uPhotoOn = s.mood.dev` — la fenêtre `PHOTO_IN`/`PHOTO_FULL` disparaît (c'était la
  confusion chrome→image : la photo arrivait à 20 % de platitude, pendant que la
  matière bougeait encore).
- `uMoodD = mood.distort · (1 + 2·pulse)`, `uSpike = mood.spike + 0.45·pulse`.
- **Le pack en lisière** : la distance entre deux slots voisins n'est plus
  largeur+gap+largeur mais `halfLocal + 0.76 · S · max(halfᵢ, halfⱼ)` — le voisin perce
  toujours ~12 % au bord de l'écran, quel que soit son aspect ou la fenêtre
  (S = l'échelle d'une voisine, soit 1 − shrink). `PLATE_GAP` disparaît. Sur un écran
  étroit le cap `uPlateK` mord déjà : les voisines sortent entièrement.
- `uFlagAmp` gonflé par `slide` (~×1.8 au plus fort du voyage).

### `src/lib/plateLook.ts` et `src/lib/formPhoto.ts` — la dominance

- `shrink` 0.32 → **0.45** : les voisines à 55 % de la montrée.
- `PLATE_H` 3.2 → **3.4** : la montrée regagne le cran que la lisière lui rend.

### `src/sections/Work.tsx` et `src/components/ScrambleText.tsx` — le rythme

- `ENTER` 0.18 → **0.12**.
- `DWELL` 1400 → **900 ms**, ET le brouillage du nom accéléré d'autant (LEAD ~330,
  verrous ~70 ms) : l'invariant « le nom finit de se décoder avant la planche
  suivante » tient toujours — les deux nombres bougent ensemble ou pas du tout.

## Les pièges

- **Le moucheté au pic.** Le pulse gonfle `distort`/`spike`, que la borne de foulée du
  raymarcher voit déjà (uniforms) — elle raccourcit d'elle-même. Si ça mouchette :
  baisser le pulse, ne pas toucher `stepK` (même règle que la rafale).
- **Le pulse ne doit jamais s'écrire dans `md`.** Les champs de `md` sont la base
  d'easing de la frame suivante ; un pulse réinjecté se compose avec lui-même.
- **`uWind` en vol.** Voir plus haut : phase multipliée, saut garanti. Le souffle passe
  par le clock de la vague et l'amplitude, jamais par le vent.
- **Le développé n'a lieu qu'à l'ouverture.** Les planches suivantes arrivent déjà
  tirées : `dev` est global, pas par slot — c'est le moment d'ouverture de la section,
  pas un effet répété.

## Critères de réussite

1. À l'entrée : la matière se déchaîne à mi-déroulement puis se pose ; la plaque est
   chrome et immobile AVANT que l'image monte ; le grain se résorbe en ~1 s.
2. Scroll arrière depuis la planche 1 : l'image se dissout dans le chrome, la plaque
   refond en repassant par le pic. Aucune frame où la photo coexiste avec la fusion.
3. Les voisines percent ~12 % au bord, à 55 % de taille, éteintes ; la planche qui
   arrive s'allume pendant le voyage.
4. Un changement de planche répond dans les 900 ms, nom décodé compris.
5. La rafale (quand elle sera construite) et le hover (couleur + calme + pas en avant)
   fonctionnent inchangés.
6. Reduced motion : plaque directe, photo directe, pas de pic — états instantanés.

## Note de style

Les commentaires du code sont en anglais, comme tout le repo. Ce document et les commits
sont en français.
