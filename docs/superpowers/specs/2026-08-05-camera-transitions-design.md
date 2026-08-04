# La caméra entre dans la chorégraphie — design

**Date** : 2026-08-05
**Branche** : `feat/work-tableau-mesh`
**Statut** : design validé, prêt pour le plan d'implémentation

## Le problème

Toute la chorégraphie de la forme est un **scale** plus un **dock**, joués sous une caméra
immobile (`ChromeCanvas` : `position: [0, 0, 10]`, `fov: 42`, jamais touchée).

Deux limites en découlent.

**Le scale ne peut pas jouer la perspective.** Grossir un mesh ne change pas la façon dont
sa profondeur se projette ; avancer la caméra, si. Sur une sphère dans l'axe les deux sont
visuellement indiscernables — mais le tableau a une moulure avec une épaisseur réelle et un
biseau, et le crâne a un volume. Sur ces deux-là, un dolly montre quelque chose qu'aucun
scale n'atteint. C'est le gain expressif qui motive ce travail.

**Et la chorégraphie est appliquée quatre fois.** `s.scale` / `s.dockX` sont re-appliqués
dans `ChromeTableau` (`g.position.set` + `g.scale.setScalar`), `ChromeSkull`, `DnaParticles`,
et `LiquidDna` (via ses uniformes). Les commentaires de `formClock` s'inquiètent à répétition
de ces représentations qui doivent « être d'accord ». Une caméra, par construction, s'applique
une fois.

## L'objectif

Ajouter un mouvement de caméra à **l'entrée de la section Work**, réglable à la main dans un
atelier visuel, sans toucher aux nombres déjà tunés et sans risque pour les autres sections.

## Hors périmètre, explicitement

- **Les autres sections.** Hero, About et Contact ne sont pas touchés.
- **Le remplacement du `scale`.** Le dolly s'ajoute ; `s.scale` continue exactement comme
  aujourd'hui. Retirer le scale au profit du dolly est une étape ultérieure, conditionnée à ce
  que des valeurs satisfaisantes soient trouvées ici.
- **Toute rotation de caméra, et tout `lookAt`.** Voir « Le rectangle » ci-dessous.
- **`leva`.** Theatre couvre le besoin ; une seule surface de réglage suffit.

## Architecture

Theatre.js est une **table de correspondance scroll → pose de caméra**, et rien d'autre. Il ne
joue pas, ne tient aucun temps, n'anime aucune forme. `formClock` reste l'unique autorité
runtime.

```
scroll (Lenis)
   │
   ├──► workReveal.form ──► sheet.sequence.position   (le playhead EST le scrub)
   │                              │
   │                              ▼
   │                       camObj.value.{z,y,x,fov}   (Theatre évalue la courbe)
   │                              │
   └──► formClock.advance() ◄─────┘   lu comme toileTweak.get() l'est déjà
                │
                ├──► state.camZ / camY / camX / camFov
                │        └──► FormDriver écrit camera.position + camera.fov
                └──► state.scale / dock / spin …        (inchangés)
```

### Pourquoi il n'y a pas de seconde horloge

L'objection habituelle contre l'ajout d'une librairie d'animation ici est qu'une deuxième
source de temps désynchronise les passages de relais entre formes — c'est la raison d'être de
`formClock`, documentée longuement dans ce fichier.

Elle ne s'applique pas : le playhead est piloté par `sequence.position`, une **position**, pas
une lecture. Theatre et `formClock` sont alors deux fonctions du même scroll et ne peuvent pas
dériver. Corollaire utile : le rewind est exact, reculer à la molette rejoue la trajectoire à
l'envers, comme le reste du scrub.

### Le confinement

Aucune des quatre props ne quitte sa valeur d'identité **hors du corridor de Work**, par une
multiplication et non par une condition — chacune est interpolée depuis son identité, pas
depuis zéro :

```
camZ   = 10 + (theatre.z   - 10) * tableauOn
camFov = 42 + (theatre.fov - 42) * tableauOn
camY   =       theatre.y        * tableauOn     // identité = 0
camX   =       theatre.x        * tableauOn     // identité = 0
```

`tableauOn` existe déjà, vaut exactement 0 hors de Work, et est lissé aux deux bords (il pilote
un crossfade de deux formes, donc tout palier y flasherait). Donc :

- Hero, About et Contact gardent au bit près le frustum contre lequel tout le CSS a été réglé ;
- le `7.677` de `globals.css` (= `2·tan(21°)·10`, la hauteur de monde vue) reste vrai en dehors
  de Work ;
- la caméra entre et sort du dolly sur la même courbe qui fait entrer le tableau ;
- le confinement n'est pas une promesse, c'est une identité arithmétique — et c'est testable.

## Fichiers

| fichier | rôle |
|---|---|
| `src/lib/cameraStage.ts` *(nouveau)* | projet Theatre, sheet, objet `Camera`, chargement du JSON d'état, gate dev de `@theatre/studio` |
| `src/lib/cameraStage.state.json` *(nouveau)* | l'état exporté du studio, commité |
| `src/lib/formChoreo.ts` | `camZ` / `camY` / `camX` / `camFov` entrent dans `FormChoreo` |
| `src/lib/formClock.ts` | lit `cameraStage`, applique le confinement par `tableauOn` |
| `src/components/chrome/FormDriver.tsx` | écrit `camera.position` et `camera.fov` une fois par frame |
| `src/components/chrome/ChromeTableau.tsx` | écrit `--form-lift` depuis le JS (voir plus bas) |
| `src/app/globals.css` | `--form-lift` passe à `0px` (fallback avant premier rendu) |

`FormDriver` est déjà « monté avant les formes, avance l'horloge une fois par frame, les autres
ne font que lire ». Écrire la caméra là respecte ce contrat, et le raymarcher la relit
gratuitement — il lit déjà `uCamPos` / `uCamRot` depuis la caméra vivante à chaque frame.

## L'atelier

### Les props réglables

| prop | plage | défaut | effet |
|---|---|---|---|
| `z` | 4 → 16 | **10** | le dolly. Approche / recul. C'est lui qui fait lire la profondeur de la moulure. |
| `y` | ±3 | **0** | translation verticale. La caméra qui s'élève pendant que la plaque se pose. |
| `x` | ±3 | **0** | translation latérale. Se **compose** avec `DOCK_X_WORK` — les deux poussent dans le même axe. |
| `fov` | 20 → 60 | **42** | avec `z`, le dolly-zoom : sujet à taille constante, perspective qui se tord. Injouable au scale. |

### Le rectangle

En projection perspective, un plan perpendiculaire à l'axe de vue projette un **rectangle
quelle que soit la position x/y/z de la caméra** : tous ses points partagent le même `z`, donc
le même facteur d'échelle. Translater la caméra est donc sûr pour la planéité de la
photographie.

Le trapèze vient de la **rotation** — et c'est exactement ce que `formClock` élimine à grands
frais : `faced` snappé sur des multiples exacts de 2π, `md.flat` snappé sur exactement 1, parce
qu'« une photographie tournée de quelques milliradians sur une caméra perspective est un
trapèze, pas une image ». D'où l'exclusion de toute rotation ci-dessus. Si une rotation est
voulue un jour, ce sera une décision séparée avec la plaque pour sujet, pas un réglage de
molette.

`fov` est sûr côté DOM : `pxPerWorld` recalcule `tanHalf` depuis `camera.fov` **vivant** à
chaque frame, donc le cadre suit même un dolly-zoom.

### La boucle de travail

```
dev  →  studio ouvert, scrub à la molette, keyframes sur z/y/x/fov
     →  bouton "export" du studio → un JSON tombe dans les téléchargements
     →  remplacer src/lib/cameraStage.state.json
     →  git commit
prod →  getProject('Portfolio', { state }) rejoue exactement ce JSON
```

API confirmée sur la doc de la version installée : `obj.value.z` pour la lecture impérative
par frame, `getProject(name, { state })` pour charger un état commité.

### Garde-fou 1 — l'état par défaut est l'identité

Sans JSON commité : `z = 10`, `fov = 42`, `x = y = 0`, c'est-à-dire **exactement le site
d'aujourd'hui**. La feature est inerte jusqu'à ce que quelque chose ait été auteuré. C'est ce
qui la rend réversible sans discussion : supprimer le JSON suffit à revenir en arrière.

### Garde-fou 2 — `@theatre/studio` ne doit jamais entrer dans le bundle de prod

Le paquet fait 22,3 Mo décompressés. Un import statique en tête de module l'embarquerait.

```ts
if (process.env.NODE_ENV === "development") {
  import("@theatre/studio").then((m) => m.default.initialize());
}
```

Même motif que `ToileDevPanelMount`. **À vérifier par la mesure**, pas sur la foi de la doc.

### Note de dépendance

`@theatre/core` 0.7.2 (publié le 2024-05-19) a **zéro peer dependency** React ou R3F — seul
`@theatre/dataverse`. Il s'installe donc proprement sur React 19.2.4 / R3F 9.6.1.

`@theatre/r3f` est en revanche **inutilisable ici** : il épingle `@react-three/fiber ^8.13.6`
contre le 9.6.1 du projet. On perd donc les gizmos de viewport — la caméra se place par des
nombres dans le panneau, pas à la souris. Le paquet n'a pas eu de release depuis deux ans ;
c'est un risque assumé, atténué par le fait que seul l'outillage de dev en dépend et que
l'état runtime est un JSON qu'on possède.

## Le raccordement

### Le playhead

Le scrub de l'entrée, `workReveal.form`, est déjà ce qui déroule le métal. La trajectoire de
caméra devient donc **le même geste** que la métamorphose, pas un second événement par-dessus.

Deux précisions d'implémentation, parce qu'aucune des deux n'est gratuite :

- **`position` est en SECONDES**, pas en fraction — la doc est explicite : « for time-based
  sequences, this represents the current time in seconds ». Le scrub 0→1 doit donc être
  multiplié par la longueur de la séquence. Elle est fixée à **1 seconde**, ce qui rend le
  facteur égal à 1 et la correspondance directe : `position = scrub`. Une seconde n'a aucune
  signification temporelle ici — rien ne joue — c'est juste l'unité qui rend l'arithmétique
  transparente, et l'axe du studio se lit alors comme une progression 0→1.
- **`workReveal.form` doit être borné.** `formClock` le clampe déjà là où il le consomme
  (`Math.max(0, Math.min(1, workReveal.form))`), donc il peut sortir de l'intervalle. Un
  playhead hors bornes est un comportement non défini côté Theatre ; on applique le même clamp.

```ts
sheet.sequence.position = Math.max(0, Math.min(1, workReveal.form));
```

Piloté par la valeur **brute** du scrub, pas par la lissée (`md.flat`, qui la chase à
`FORM_RATE`) : le lissage est ce qui donne son poids à la matière, et l'appliquer aussi à la
caméra doublerait le retard. La caméra suit la main, le métal traîne un peu derrière — c'est la
bonne répartition.

### `--form-lift`, réparée au passage

`DOCK_Y_WORK = 0` depuis l'index, mais `--form-lift` porte encore `0.0912`, dérivé de l'ancien
`0.7` (`0.7 / 7.677 = 0.09118`). Le commentaire dit « MOVE THIS WITH DOCK_Y_WORK, never on its
own » — et ça n'a pas été fait. Le mobilier DOM est donc relevé d'environ 108 px (à
`--form-dim` 1188) alors que la forme est à plomb au centre.

Plutôt que de corriger la constante à la main — elle re-dérivera au prochain changement — elle
devient écrite depuis le JS, dans le même bloc que les `--plate-px-*` de `ChromeTableau` :

```ts
root.setProperty("--form-lift", `${(-s.dockY * pxPerWorld).toFixed(1)}px`);
```

Elle est alors une fonction de `s.dockY` et du `pxPerWorld` vivant : elle ne peut plus dériver
de la chorégraphie, **et** elle suit le dolly gratuitement. C'est la dernière dépendance
statique au frustum dans le mobilier de Work. La valeur CSS reste comme fallback avant le
premier rendu, à `0px` pour être cohérente avec `DOCK_Y_WORK = 0` — exactement le rôle que
`--plate-frame` joue déjà pour `--plate-px-w`.

### Ce qui suit déjà tout seul

Le rectangle de la plaque à l'écran est **déjà entièrement piloté par le JS** :
`globals.css:363` lit `var(--plate-px-w, var(--plate-frame))`, et les `--plate-px-*` sont
écrits par `ChromeTableau:626-628` depuis `pxPerWorld`, qui lit déjà `camera.position.z`. Le
cadre DOM et sa hit-box suivent donc un dolly sans une ligne de plus.

## Critères de vérification

1. **Le confinement est arithmétique** : `tableauOn === 0` ⟹ `camZ === 10`, `camFov === 42`,
   `camX === camY === 0`, exactement. Vérifié par le calcul sur les quatre props, pas à l'œil.
2. **`@theatre/studio` absent du bundle de prod** : grep du bundle + comparaison du JS initial
   avant / après (référence actuelle : 239 Ko gzip).
3. **Le Hero est inchangé** : 51 FPS / 16,8 ms p50 à dpr 1,75. Rien de ce design ne doit le
   toucher.
4. **Le cadre DOM reste collé à la plaque pendant un dolly** — c'est le point qui casserait le
   plus visiblement.
5. **Le rewind est exact** : reculer à la molette rejoue la trajectoire à l'envers, sans
   décalage accumulé.

## Retour arrière

Trois niveaux, du moins au plus radical :

1. supprimer `cameraStage.state.json` → l'identité reprend, le site est celui d'aujourd'hui ;
2. mettre `camZ` à `10` en dur dans `formChoreo` → Theatre reste installé mais inerte ;
3. désinstaller les deux paquets → il ne reste que `--form-lift` écrit depuis le JS, qui est
   une correction de bug indépendante et souhaitable en soi.
