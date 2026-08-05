# La caméra entre dans la chorégraphie — design

**Date** : 2026-08-05 (réécrit le même jour, voir « Historique »)
**Branche** : `feat/work-tableau-mesh`
**Statut** : design validé, une partie déjà implémentée

## Le problème

Toute la chorégraphie de la forme est un **scale** plus un **dock**, joués sous une caméra
immobile (`ChromeCanvas` : `position: [0, 0, 10]`, `fov: 42`).

**Le scale ne peut pas jouer la perspective.** Grossir un mesh ne change pas la façon dont sa
profondeur se projette ; s'en approcher, si. Sur une sphère dans l'axe les deux sont
indiscernables — mais le tableau a une moulure avec une épaisseur réelle et un biseau, et le
crâne a un volume. Sur ceux-là, un mouvement de caméra montre ce qu'aucun scale n'atteint.

**Et on ne peut pas tourner autour.** Ni aujourd'hui, ni avec la première version de ce design.
C'est ce qui a motivé la réécriture ci-dessous.

**Et la chorégraphie est appliquée quatre fois** : `s.scale`/`s.dockX` sont re-appliqués dans
`ChromeTableau`, `ChromeSkull`, `DnaParticles` et `LiquidDna` (par uniformes). Une caméra
s'applique une fois, par construction.

## L'objectif

Un mouvement de caméra réglable à la main sur **l'entrée de la section Work**, confiné à ce
corridor, auteuré dans Theatre.js et persisté en JSON.

## Prérequis, et il a été raté une fois

**`<Work/>` doit être monté dans `src/app/page.tsx`.** Le playhead est piloté par
`workReveal.form`, qui n'est écrit que par `src/sections/Work.tsx:267`. Sans cette section,
`workReveal.form` vaut 0 sur toute la page — mesuré — donc le playhead est cloué à 0 et aucune
keyframe ne peut jouer.

C'est une erreur de la première version de ce design, qui affirmait le contraire. Le corridor
lui-même EST atteignable sans Work (`tableauOn` monte à 1 par le `claim` sur
`aboutReveal.exit`), et c'est ce qui a induit en erreur : la présence du corridor et le scrub
de l'entrée sont deux signaux différents, et seul le second dépend de la section.

## Hors périmètre, explicitement

- **Les autres sections.** Hero, About et Contact ne sont pas touchés.
- **Le remplacement du `scale`.** La caméra s'ajoute ; `s.scale` continue tel quel. Le
  remplacer est une étape ultérieure, conditionnée à ce que des valeurs satisfaisantes soient
  trouvées ici.
- **`@theatre/r3f`.** Il épingle `@react-three/fiber ^8.13.6` contre le 9.6.1 du projet. On
  perd les gizmos de viewport : la caméra se règle par des nombres, pas à la souris.
- **Le tremblement caméra-épaule.** La DA est instrumentale, usinée, tenue au dixième de
  milliseconde. Un wobble se battrait contre elle.
- **Tout amortissement dans le rig.** `formClock` possède le lissage. Une seconde intégration
  est précisément le bug que ce fichier existe pour empêcher.

## Le modèle : un rig autour de la forme, pas un point dans le monde

C'est le cœur de la réécriture. La première version exposait `camX`/`camY`/`camZ` en
coordonnées **monde**. Trois problèmes en découlaient :

1. **Les valeurs ne survivaient à rien.** La forme est dockée — `DOCK_X = -3.6` dans About,
   `DOCK_X_WORK = 2.6` dans Work — donc une pose auteurée contre un dock devient fausse dès
   que le dock change.
2. **On ne pouvait pas tourner autour**, faute d'orientation : R3F appelle `camera.lookAt(0,0,0)`
   **une seule fois à la création** et personne ne réécrit jamais l'orientation. Pousser `x`
   faisait donc glisser la caméra en gardant son regard sur −Z : un travelling latéral, pendant
   lequel la forme sort du cadre.
3. **La distance en unités monde cadre différemment selon la fenêtre**, alors que le projet
   pense déjà en fraction d'écran (`PLATE_FILL = 0.92`, `uPlateK`).

Le rig corrige les trois. **Le pivot est la forme** : `T = (s.dockX, s.dockY, 0)`, déjà sur
`FormState`.

### Les quatre props

| prop | plage | défaut | effet |
|---|---|---|---|
| `orbit` | ±60° | **0** | lacet autour de la forme |
| `elevation` | ±35° | **0** | tangage autour de la forme |
| `fill` | 0.30 → 0.95 | **0.547** | le CADRAGE : la fraction de la demi-hauteur visible qu'occuperait une forme de rayon unité |
| `fov` | 20 → 60 | **42** | l'objectif — et, à `fill` constant, **le dolly-zoom** |

`0.547` n'est pas un nombre choisi : c'est ce que vaut le cadrage actuel.
`fill = R / (tan(fov/2) · dist)` avec `R = FORM_RADIUS = 2.1` et `dist = 10` donne
`2.1 / (0.3839 × 10) = 0.547`. Le défaut EST donc l'état d'aujourd'hui, dans **toutes** les
sections.

**`R` est `FORM_RADIUS` seul, JAMAIS `FORM_RADIUS · s.scale`**, et c'est une décision, pas un
raccourci. Deux raisons :

- **Sinon la caméra se battrait contre la chorégraphie.** `s.scale` vaut `WORK_SCALE = 0.62`
  dans le corridor, et il *anime* — le gonflement pendant la traversée est un des trois beats
  de l'entrée. Un `fill` qui absorbe le scale tiendrait la taille apparente constante, donc
  **annulerait exactement ce gonflement**. La caméra cadre la scène ; le scale dimensionne la
  forme. Deux responsabilités, et elles ne doivent pas se disputer la taille à l'écran.
- **Sinon le défaut ne pourrait pas être une constante.** Avec le scale dedans, reproduire le
  cadrage actuel demanderait `fill = 0.339` dans Work et `0.547` au Hero — un défaut par
  section, donc plus de défaut du tout.

`fill` est donc un paramètre de CADRAGE, pas une mesure de la taille de l'objet. Le nom est un
raccourci ; la définition est celle du tableau.

### La rotation rigide, et pourquoi la composition survit

```
dist  =  (R / fill) / tan(fov / 2)          R = FORM_RADIUS (2.1), sans s.scale — voir ci-dessus
C0    =  (0, 0, dist)                        la pose de repos, regard sur −Z
C     =  T + Rot(orbit, elevation) · (C0 − T)
regard =      Rot(orbit, elevation) · (0, 0, −1)
```

La caméra ET son regard subissent **la même** rotation autour de `T`. C'est une rotation rigide
autour d'un point, donc **la position à l'écran de ce point est invariante** : la forme reste
exactement où la composition la veut — dockée à droite dans Work, avec l'index des noms à
gauche.

C'est ce qui rend l'orbite compatible avec la mise en page, et c'est aussi une correction : une
version intermédiaire de ce design proposait un `lookAt(la forme)` avec un « recentrage qui se
relâche ». Inutile et nuisible — un `lookAt` centre la forme et détruit la composition, alors
que la rotation rigide la préserve sans compensation.

À `orbit = elevation = 0`, `Rot` est l'identité : la caméra est à `(0, 0, dist)`, le regard sur
−Z. C'est le comportement actuel, au bit près.

### Le dolly-zoom est gratuit

Puisque la distance dérive de `fill`, faire varier `fov` **tient la taille du sujet par
construction** et tord la perspective. C'est exactement le dolly-zoom, sans prop dédiée :

| `fov` | `fill` | `dist` calculée |
|---|---|---|
| 24 | 0.547 | 18.06 |
| 42 | 0.547 | 10.00 |
| 60 | 0.547 | 6.65 |

## Deux confinements, parce qu'il y a deux risques

```
fill, fov              × tableauOn        libres partout dans le corridor
orbit, elevation       × (1 − md.flat)    ZÉRO dès que la plaque est plate
```

**`tableauOn`** vaut exactement 0 hors du corridor de Work, donc Hero, About et Contact gardent
au bit près le frustum contre lequel tout le CSS a été réglé (le `7.677` de `globals.css` est
`2·tan(fov/2)·dist`). Le confinement n'est pas une promesse, c'est une identité arithmétique —
c'est ce que teste `tests/formChoreo.test.ts`.

**`(1 − md.flat)`** est le second verrou, et il protège autre chose : **la photographie**. Voir
une plaque de biais la projette en trapèze, et `formClock` élimine ce keystoning à grands frais
(`faced` snappé sur des multiples exacts de 2π, `md.flat` snappé sur exactement 1) parce que le
sujet de cette section est une image. Mais le tirage ne monte **qu'une fois la plaque
exactement plate** (`devTarget = md.flat === 1 && workPlate.index >= 0`), donc pendant toute la
métamorphose il n'y a **rien à déformer**.

D'où la règle : **on tourne autour pendant que le métal se déroule, on est redressé pour la
lecture.** `md.flat` snappe à 1, donc « zéro » est vraiment zéro, et la machinerie `faced`
retrouve la caméra sur l'axe exactement comme elle l'a toujours supposée.

## Ce qui est déjà construit, et qui reste bon

| | statut |
|---|---|
| `confine(identity, target, presence)` dans `formChoreo.ts` + 4 tests `node:test` | ✅ livré, réutilisé tel quel |
| `--form-lift` écrite depuis le JS (`ChromeTableau`) | ✅ livré — dernière dépendance statique au frustum, elle bloquait le dolly |
| `FormDriver` écrit la caméra, une fois par frame, avant les formes | ✅ livré — l'ordre est garanti et documenté |
| `cameraStage.ts` : projet Theatre, sheet, état identité, studio gaté dev | ✅ livré — **seul fichier qui connaît Theatre** |
| `window.__form` en dev | ✅ livré — c'est lui qui a permis de diagnostiquer le playhead mort |
| `camZ`/`camY`/`camX`/`camFov` sur `FormState` | ⚠️ à **remplacer** par le rig |

Seule la définition des props change. Le reste de la plomberie est en place et mesuré.

## Ce qui reste à faire

1. `cameraStage.ts` : remplacer les quatre props par `orbit`/`elevation`/`fill`/`fov`.
2. `formClock.ts` : remplacer les quatre champs de `FormState` par le rig, appliquer les deux
   confinements, calculer `dist` et la rotation.
3. `FormDriver.tsx` : écrire `camera.position` **et l'orientation** (quaternion ou `lookAt` sur
   `C + regard`), plus `fov` avec `updateProjectionMatrix()`.
4. Monter `<Work/>` dans `page.tsx` (prérequis), ou accepter que seules des valeurs statiques
   soient réglables.
5. Auteurer une trajectoire et committer le JSON exporté.

## L'atelier

```
dev  →  studio ouvert, scrub à la molette, keyframes sur orbit/elevation/fill/fov
     →  export du projet → un JSON
     →  remplacer src/lib/cameraStage.state.json   (déjà importé, rien à coder)
prod →  getProject('Portfolio — caméra', { state }) rejoue ce JSON
```

### Garde-fou 1 — l'état par défaut est l'identité

Sans pose auteurée : `orbit = elevation = 0`, `fill = 0.547`, `fov = 42` — le site
d'aujourd'hui, exactement. La feature est inerte jusqu'à ce que quelque chose ait été auteuré.

### Garde-fou 2 — l'état doit TOUJOURS être fourni, même vide

`getProject` sans `state` émet un `console.error` dès que le studio n'est pas là pour
l'alimenter. En dev le studio est chargé, donc **c'est une erreur qui n'apparaît qu'en
production**, chez chaque visiteur. Le JSON identité commité l'empêche. Il a été produit par
`studio.createContentOfSaveFile()`, seule autorité sur ce schéma (qui porte un
`definitionVersion` que Theatre fait évoluer).

Conséquence sur le retour arrière : ce n'est pas « supprimer le JSON », c'est « revenir à la
version identité ».

### Garde-fou 3 — `@theatre/studio` ne doit jamais entrer dans le bundle de prod

22,3 Mo décompressés, 760 Ko de JS. Import dynamique sous condition constante à la
compilation. **Vérifié par la mesure** : quatre chaînes propres au studio, absentes de tous les
chunks ; JS initial inchangé à 242 Ko gzip ; Theatre core à ~31 Ko dans le chunk paresseux.

## Critères de vérification

1. **Le confinement est arithmétique** : `tableauOn === 0` ⟹ `fill === 0.547` et
   `fov === 42` exactement ; `md.flat === 1` ⟹ `orbit === elevation === 0` exactement. Par le
   calcul, sur les quatre props, pas à l'œil.
2. **`orbit = elevation = 0` reproduit le cadrage actuel au bit près** : caméra à `(0,0,10)`,
   regard sur −Z.
3. **La composition survit à l'orbite** : la forme garde sa position à l'écran quand `orbit`
   varie. C'est la propriété de la rotation rigide, et c'est ce qui casserait le plus
   visiblement — à vérifier en mesurant la position du cadre DOM (`--plate-px-cx`).
4. **`@theatre/studio` absent du bundle de prod**, et **zéro erreur console** sur le build de
   prod.
5. **Le Hero est inchangé** : ~51 FPS / 16,8 ms p50 à dpr 1,75.
6. **Le rewind est exact** : reculer à la molette rejoue la trajectoire à l'envers.

## Retour arrière

1. **revenir à la version identité de `cameraStage.state.json`** → le site d'avant ;
2. **forcer `pose()` aux défauts** → Theatre installé mais inerte ;
3. **`pnpm remove @theatre/core @theatre/studio`** + supprimer `cameraStage.ts` → il reste
   `confine()` et son test, `--form-lift`, et `window.__form`, qui sont des améliorations
   indépendantes et souhaitables en soi.

## Historique

Ce document a été réécrit après une première implémentation partielle. Trois choses l'ont
motivé, toutes découvertes en exécutant :

- **le playhead était mort** — `workReveal.form` dépend de `<Work/>`, non monté (mesuré à 0 sur
  toute la page). La première version affirmait qu'on pouvait auteurer sans cette section ;
- **on ne pouvait pas tourner autour** — la caméra n'avait aucune orientation, et des
  coordonnées monde ne permettaient de toute façon qu'un travelling ;
- **un `console.error` ne sortait qu'en production**, invisible en dev où le studio est chargé.
