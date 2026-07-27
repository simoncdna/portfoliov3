# La rafale — planche → fiche projet

> Design validé. Clic sur le nom du projet dans Work : le métal se déchaîne, noie
> l'écran, et se reforme sur la fiche détails. Retour par la même courbe à l'envers.

## Intention

La bande Work présente quatre planches : une pièce de métal au centre d'un cadre de
notches, son nom dessous, `01–04` sous le nom. Le nom est aujourd'hui un lien sortant
vers le site live. Il devient le déclencheur de la **fiche** du projet : une couche
plein écran, sans route ni navigation, où la pièce se repose à gauche et où le projet
se lit à droite.

La transition n'est pas un fondu ni un zoom. C'est la **matière** qui part en éclats :
le champ de distance se déchaîne pendant que la pièce grandit, le chrome noie le cadre,
et de cette noyade la pièce ressort plus petite, dans sa forme de projet, à côté de son
texte. Le site dit partout que « le métal voyage à travers le blob, il ne coupe jamais »
— la rafale est cette phrase poussée à son extrême, pas une exception à elle.

## Ce qu'on ne fait pas

- **Pas de route.** Pas de `/work/[slug]`, pas d'URL partageable. Une route imposerait
  de remonter `ChromeStage` dans le layout et de faire survivre le canvas à une
  navigation ; la continuité de la pièce est tout le sujet.
- **Pas de particules.** `ParticleBlob` n'est même pas monté dans le canvas, et il ne
  reproduit qu'une sphère mode-0 : les particules partiraient d'une boule, pas de la
  caméra de Pictarine ni du maillet de Forma. Une vraie gerbe demande d'écrire
  l'échantillonnage de surface du SDF courant — un chantier à part.
- **Pas de case study.** La fiche rend ce que la donnée contient déjà. Pas de nouveau
  champ dans `Work`, pas de captures, pas de prose inventée.
- **Pas de scroll interne à la fiche.** Elle tient en un écran. Le geste de molette est
  le geste de sortie.

## Les unités

### `src/lib/plateBurst.ts` — le signal

Un singleton mutable, comme `aboutReveal` et `workReveal` : écrit par un timeline, lu
une fois par frame par l'horloge.

```ts
export const plateBurst = {
  /** 0 = la planche, 1 = la fiche. Le voyage, pas l'état. */
  t: 0,
  /** la fiche est-elle demandée (pour le verrou de scroll et le DOM) */
  open: false,
  /** le projet montré, "" hors fiche */
  title: "",
  subscribe(fn: () => void): () => void,
}
```

**Un seul nombre pilote la matière.** La violence du champ n'est pas un second
paramètre : elle est dérivée dans `formClock` par `t · (1 − t) · 4`, une impulsion à pic
médian. C'est le précédent exact de `spinBoost` dans `formChoreo` — « a pulse, not a
level ». Deux nombres pourraient se contredire (une rage à son pic sur une pièce déjà
reformée) ; un seul ne peut pas.

`subscribe` existe pour le verrou de scroll, qui vit hors React (`SmoothScroll`).

### `src/lib/formChoreo.ts` — ce que la matière en fait

`formChoreo` prend un 5ᵉ argument `burst` (0..1, le `t` du singleton) et l'**écrase**
par-dessus `work`, exactement comme `after` le fait déjà : dernier terme gagnant, pas
additionné.

| Constante | Valeur | Pourquoi |
|---|---|---|
| `DOCK_X_DETAILS` | `-3.6` | Le dock d'About, réutilisé : la fiche lit à droite, la pièce tient la gauche. C'est la mise en page de lecture du site. |
| `DETAILS_SCALE` | `0.5` | Sous `WORK_SCALE` (0.62) : sur la fiche la pièce n'est plus le sujet, les mots le sont. |
| `BURST_PEAK_SCALE` | `3.6` | Voir le calcul ci-dessous. |
| `BURST_DISTORT` | `×3` sur `mood.distort` | La distorsion du projet, poussée. Multiplicateur, pas remplacement — le panneau garde la main sur l'allure de base, comme partout ailleurs. |
| `BURST_SPIKE` | `0.45` | Les éclats. Valeur de départ, voir « Les pièges ». |

`dockY → 0` (la pièce est à côté de son texte, plus au-dessus de lui) et le lift
`DOCK_Y_WORK` est relâché sur le même signal — la pièce quitte la planche d'un seul
geste, pas de trois.

**Le calcul du pic.** `FORM_RADIUS` = 2.1, caméra à z = 10, fov 42 → le monde vu fait
7.677 de haut, soit une demi-diagonale ≈ 7.8 en 16:9 au plan z = 0. À `scale` 3.6 le
rayon vaut 2.1 × 3.6 ≈ 7.6, plus la surcharge de distorsion : l'écran est noyé. Et 7.6
reste franchement en deçà des 10 du plan caméra — une pointe qui atteint la caméra fait
démarrer le rayon *à l'intérieur* du champ, donc un aplat de couleur.

Toucher `FORM_RADIUS`, le z ou le fov de la caméra oblige à revoir ce nombre. Il est
dérivable, il n'est pas arbitraire.

**Corollaire gratuit** : parce que tout passe par `formChoreo`, chaque représentation
(liquide, skull, mesh, particules) suit la rafale sans une ligne de plus. C'est la
raison d'être de ce fichier.

### `src/lib/formClock.ts` — l'intégration

Trois lignes de plus dans `advanceFormClock` :

- un `easedBurst` chassant `plateBurst.t`, au même rythme que ses voisins ;
- la rage, `rage = easedBurst · (1 − easedBurst) · 4`, appliquée aux termes `distort` /
  `spike` de `state.mood` **après** l'easing du mood, pas avant : la rafale surcharge la
  silhouette du projet, elle ne la remplace pas ;
- `easedBurst` passé à `formChoreo`.

Rien d'autre. L'horloge ne connaît pas la fiche, elle ne connaît qu'un nombre.

### `src/lib/pageScroll.ts` — le verrou, refactoré

Aujourd'hui `SmoothScroll` arrête Lenis en lisant `blobTweak.open`, avec son propre
`prevOpen` pour détecter les fronts. Un deuxième propriétaire de `lenis.stop()` avec sa
propre mémoire, c'est un panneau qui rend le scroll qu'une fiche est en train de
retenir.

Donc : `lockPageScroll(reason: string)` / `unlockPageScroll(reason: string)` comptés dans
`pageScroll.ts`, qui possède déjà l'instance Lenis. Lenis est arrêté tant qu'il reste au
moins une raison. `ControlPanel` devient un client comme la rafale — c'est une
amélioration ciblée du code qu'on touche, pas un refactor opportuniste : sans elle la
fonctionnalité est cassée par construction.

La page ne repart **qu'après** l'implosion, comme `PANEL_CLOSE_MS` le fait déjà pour la
retraite en piano inversé du panneau.

### `src/components/PlateDetails.tsx` — la fiche

Portalisée dans `body`. Ce n'est pas une préférence : `.plate-screen` est en
`overflow: hidden`, et `.plate-group` porte un `transform: translateX(-50%)` qui fait
d'elle un **containing block pour `position: fixed`**. Rendue dans l'arbre de Work, la
fiche serait rognée et mal placée.

`z-index: 100` — au-dessus du header (50) et du papier du MailSeal (90), sous le
ControlPanel (200). La pièce reste dessous, dessinée par la scène fixe à `z-index: 4`,
comme dans About.

Contenu, colonne de droite, dans le registre poster du site :

- le numéro de planche (`01`) en display, en tête ;
- le titre ;
- le `timeline` en mono ;
- le `summary` (absent pour Pictarine : le bloc ne se rend pas, il ne se rend pas vide) ;
- `languages` et `tools` en chips pill — enfin rendus. Le commentaire de `site.ts` dit
  précisément que leur place est « une page case-study, où quelqu'un est venu les
  chercher » ; c'est ici.
- `VOIR LE SITE ↗` vers `url`, en ligne meta explicite. Une affordance = une action, et
  le geste coûteux (quitter le site) redevient délibéré au lieu d'être le clic par
  défaut.

### `src/sections/Work.tsx` — le déclencheur

Le nom cesse d'être un `<a target="_blank">` et devient un `<button>`. Le timeline de la
rafale est construit une fois (`useGSAP`), joué à l'ouverture, `reverse()` à la
fermeture.

Il écrit sur **un wrapper de `.plate-group` uniquement** — jamais sur `[data-name]`,
`[data-notch]`, `[data-pick]`. Ces éléments appartiennent à `inTl` / `outTl`, dont GSAP
écrit l'`autoAlpha` en inline ; deux propriétaires de la même propriété, c'est un
`ScrollTrigger.refresh()` (un resize suffit) qui ré-applique la valeur scrubbée et
écrase la rafale.

À l'ouverture, la marche des planches est gelée : `target.current = shown.current` et
`clearTimeout(timer.current)`. Lenis étant arrêté il n'arrive plus d'événement scroll,
mais un `DWELL` déjà armé changerait la planche **sous** la fiche ouverte. `workPlate`
n'est pas touché : la pièce garde la forme du projet, c'est tout l'intérêt.

### Le flash

Une couche CSS en `--grad-chrome`, `z-index: 99`, qui monte à 1 sur ~120 ms au pic du
voyage. Elle fait deux choses : elle couvre l'échange de DOM, et elle dispense le
raymarcher d'être irréprochable à l'instant précis où il est le plus chargé.

## Le voyage

Ouverture, ~1150 ms au total. Les reveals sont exemptés du plafond de 500 ms des tokens
de motion ; c'en est un.

| ms | ce qui se passe | courbe |
|---|---|---|
| 0 → 520 | `t` 0 → 0.5. La pièce grandit, le champ se déchaîne, le cadre est noyé. | `power2.in` — une masse qu'on arrache accélère |
| 0 → 160 | Le groupe de la planche s'efface. | `sine.in` |
| ~420 → 540 | Le flash chrome au pic. L'échange de DOM a lieu dedans. | — |
| 520 → 1150 | `t` 0.5 → 1. La rage retombe, le métal se reforme à gauche, en petit. | `--ease-out` (expo-out) |
| 700 → 1150 | Les lignes de la fiche, en stagger 70 ms (`--stagger`). | `--ease-out` |

Fermeture : `tl.reverse()`. La même courbe à l'envers — le métal se déchaîne, avale
l'écran, se repose sur la planche. Déclenchée par la croix, `Escape`, ou un geste de
molette (l'idiome du ControlPanel).

## La forme dans laquelle elle se reforme

Celle du projet : la caméra pour Pictarine, le maillet pour Forma. C'est sa fiche. Rien
à faire pour l'obtenir — ne pas toucher `workPlate` suffit.

## Les pièges

**Les éclats peuvent moucheter.** `spike` est le seul paramètre à coût de rendu : il est
raide, donc `stepK` raccourcit la foulée (terme `uSpike * 9.0`) et le raymarcher n'a que
96 pas. À `BURST_SPIKE` 0.45 la foulée devient courte — mais au pic la pièce remplit
l'écran, donc les rayons touchent presque immédiatement après l'entrée dans la sphère
englobante, et la distance à parcourir est faible. Si ça mouchette quand même : **baisser
`BURST_SPIKE` avant de toucher `stepK`**, parce que le flash couvre déjà la pire frame et
que `stepK` est réglé pour tout le reste du site.

**Le pic est la seule frame coûteuse.** Plein écran, `stepK` au plus court, 96 pas. Elle
dure ~120 ms et elle est sous le flash. Si le budget saute quand même, la sortie est de
baisser le dpr pendant la rafale — pas de désarmer la rafale.

**Deux propriétaires de `autoAlpha`.** Traité par le wrapper, voir Work ci-dessus. C'est
le piège le plus probable de tout ce design.

**Un `DWELL` armé sous la fiche.** Traité par le gel de la marche, voir Work ci-dessus.

## Accessibilité

- La fiche est un `role="dialog"` `aria-modal="true"`, avec `aria-labelledby` sur son
  titre. Focus déplacé dedans à l'ouverture, piégé, rendu au bouton du nom à la
  fermeture. `Escape` ferme.
- Le déclencheur est un `<button>`, pas un lien : il n'ouvre pas un document.
- La scène WebGL reste `aria-hidden` : la fiche se lit entièrement sans elle.
- `prefers-reduced-motion` : pas de rafale, pas de flash. La fiche s'ouvre sèchement et
  la pièce se pose à son dock sans voyage. La règle du repo (`reduced` coupe les
  reveals, montre le chrome statique, états instantanés).

## Critères de réussite

1. Le clic sur le nom ouvre la fiche ; le métal ne coupe jamais — aucune frame où la
   pièce disparaît puis réapparaît.
2. La croix, `Escape` et la molette ferment, et rendent la planche exactement où elle
   était : même projet, même forme, même cadre.
3. Pendant la fiche, la page ne bouge pas. Après la fermeture, elle bouge — et le
   ControlPanel verrouille et déverrouille toujours correctement.
4. Ouvrir puis fermer trois fois de suite ne laisse rien derrière : pas de planche
   changée, pas de `autoAlpha` bloqué, pas de scroll resté verrouillé.
5. Un resize pendant que la fiche est ouverte ne fait pas revenir la planche par-dessus.
6. Sous `prefers-reduced-motion`, tout ce qui précède marche sans mouvement.

## Note de style

Les commentaires du code sont en anglais, comme tout le repo. Ce document et les commits
sont en français.
