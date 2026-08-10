# La condensation des pièces — design

**Date** : 2026-08-10
**Branche** : `feat/work-tableau-mesh`
**Statut** : design validé, non implémenté
**Suite de** : `2026-08-05-plongee-dans-lecran-design.md` (spec #1, la plongée) — c'est ici le
« spec #2, plus tard : la scène des projets » qu'il annonçait, réduit à la seule question de
l'APPARITION. La salle, les quatre pièces, leur effritement et la caméra en arc existent déjà.

## L'intention

À la sortie du tunnel, les quatre projets **s'allument** au lieu de se former. On voudrait qu'ils
naissent de la poussière qui est déjà là — que la matière de la salle devienne les objets.

## Le constat, mesuré

Dans `TheatrePieces.tsx`, le vertex finit par :

```glsl
vAlpha = alpha * RT.z;      // RT.z = uRot[pi].z = la présence
```

`RT.z` vaut `state.theatre.on` pour les quatre pièces, et `on = smoothstep(0.915, 0.99, dive)`.
Chaque grain d'une pièce est donc **déjà à sa place finale** dès l'ouverture de la fenêtre, et
seule son opacité monte. Vérifié au navigateur à `on = 0.45` : la pièce est entière, simplement
plus sombre. C'est un fondu plat — le fantôme de l'objet fini qui s'allume.

`formClock.ts` **prétend déjà** le contraire dans la table du film :

> `0,915 → 0,99   les pièces   —   elles se condensent hors de cette poussière`

L'intention était écrite, l'implémentation est un `mix` d'alpha. Ce spec comble l'écart.

## Le geste retenu

Trois choix, tranchés :

1. **La poussière converge.** Les grains d'une pièce naissent dispersés et **voyagent** vers leur
   place. Écarté : la décomposition jouée à l'envers (les grains rentreraient depuis leurs
   panaches — moins de code neuf, mais la naissance parlerait la même langue que l'effritement
   permanent, donc ne se distinguerait pas de lui), et la densification sur place (un fondu
   structuré reste un fondu).
2. **Depuis un halo local**, à quelques rayons de pièce de la destination — pas depuis tout le
   volume de la salle. La fenêtre du film vaut ≈ 0,84 s (voir « Le budget de temps ») : une
   course longue y produit des traînées, et une pièce lointaine recevrait de la matière venue de
   hors-cadre.
3. **Une vague par pièce, les quatre en cascade**, la plus proche du regard d'abord. Tout tient
   dans la fenêtre existante : les pièces sont entières avant que le scroll soit rendu, ce que la
   règle actuelle exige (« arriver sur une image encore en train de se résoudre fait lire la fin
   du plan comme un chargement »).

## Le budget de temps

Le troisième temps du film couvre `dive` 0,90 → 1 en 16 % de `diveSeconds`, sans ease (voir
`Work.tsx`). À `diveSeconds = 7`, ce segment vaut 1,12 s, donc un centième de `dive` y vaut
0,11 s. La fenêtre des pièces (0,915 → 0,99) vaut donc **≈ 0,84 s**, et c'est dans ce budget que
tiennent la cascade des quatre ET la vague interne de chacune.

Conséquence de dimensionnement : `birthCascade` mange une part de la fenêtre au détriment de
`birthWave`, et inversement. Les deux ne peuvent pas être généreux à la fois.

## Le mécanisme, dans le vertex

Un terme de naissance, ajouté exactement là où vit `esc`, et soumis à la même doctrine que tout
ce fichier — *« rien ne s'intègre d'une frame à l'autre : tout le mouvement se déduit du temps et
de deux graines tirées une fois »*. La naissance est donc une fonction pure de la présence et des
graines, sans état.

```glsl
// L'ÉCHELONNAGE PAR GRAIN. Hachage NEUF, pas `pick` réutilisé : sur bd = pick, les grains qui
// s'effritent (pick petit) seraient exactement les PREMIERS arrivés (bd petit).
float bd = fract(sin(r1 * 269.5 + r0 * 183.3) * 43758.5453) * uBirthWave;
float bk = ease(clamp((RT.z - bd) / max(1e-3, 1.0 - uBirthWave), 0.0, 1.0));

// LA POUSSIÈRE EST NÉE D'AVANCE — par le drapeau qui existe déjà (RT.w, voir vDust). C'est aussi
// ce qui l'empêche de voyager : bk vaut alors 1, donc le (1 − bk) du halo est nul. UN seul garde.
bk = mix(bk, 1.0, RT.w);

// LA DIRECTION DU HALO : une sphère uniforme. Uniforme et non « un vecteur de bruit normalisé » :
// normaliser trois bruits concentre les tirages sur les diagonales du cube, et la pièce se
// condenserait depuis huit coins.
//
// LA LATITUDE PREND SON PROPRE HACHAGE, ET C'EST MESURÉ — voir plus bas.
float bh = fract(sin(r0 * 96.7 + r1 * 41.3) * 43758.5453);
float cz = bh * 2.0 - 1.0;
float sr = sqrt(max(0.0, 1.0 - cz * cz));
float ca = r1 * TAU;
vec3 dir = vec3(sr * cos(ca), cz, sr * sin(ca));

vec3 born = dir * uBirthReach * (1.0 - bk);
```

**LA LATITUDE NE PEUT PAS ÊTRE `r0`** — corrigé après mesure, et la raison invalide une hypothèse
que ce spec portait. Une première rédaction posait `cz = 2·r0 − 1` en affirmant que naissance et
effritement « ne coexistent pas ». **Ils coexistent en permanence** : à `zone` = 2 le seuil vaut
`smoothstep(−1, 1, aSal)` avec `aSal` clampé dans [0,1], donc `w ≥ 0,5` pour TOUT grain, et `rate`
vaut 1 hors survol — les trois quarts du nuage s'effritent pendant qu'ils naissent.

Or `r0` **est** la phase du cycle (`ph = fract(uTime/uCycle + r0)`, et `uTime` ≈ 1,5 s contre
`uCycle` = 60 à la naissance, donc `ph ≈ r0`), donc l'alpha de l'effritement
`pow(1 − ph/uOut, 1.5)` devenait une fonction monotone de la latitude. Mesuré sur les vraies
constantes : hémisphère bas **1,64×** plus lumineux que le haut à `w` = 0,75, **2,53×** à `w` = 1.
La pièce ne se condensait pas hors de la poussière, elle se condensait hors d'une lueur posée
dessous.

L'azimut, lui, **reste sur `r1`** : `r1` n'entre dans `esc` que par un terme d'ouverture latérale,
jamais dans l'alpha — donc départ et arrivée gardent leur parenté sans le dégradé.

Et `(1 − RT.w)` a disparu du halo : `bk` valant déjà 1 pour la poussière, le facteur ne pouvait
rien changer. Deux gardes pour une condition font chercher au lecteur le cas qui demande les deux.

`born` s'ajoute **après** les rotations, au même endroit et pour la même raison que `esc` : le
fichier a déjà tranché que le panache calculé avant la rotation « s'inclinerait comme si la
pesanteur avait tourné avec l'objet ». Le halo d'où la matière arrive n'appartient pas plus à
l'objet que le panache.

```glsl
vec3 world = XF.xyz + (base + esc + born) * XF.w;
```

`born` est donc en **unités de pièce**, comme `esc` et `uReach` — un `birthReach` de 2,5 veut dire
deux rayons et demi, quelle que soit l'échelle de la station.

### L'alpha : l'arrivée REMPLACE le fondu, elle ne s'y ajoute pas

```glsl
// pièces : la présence EST l'arrivée du grain ; poussière : sa présence à elle, inchangée.
vAlpha = alpha * mix(bk, RT.z, RT.w);
```

C'est le point du choix (a) : un grain encore en l'air est faible et se révèle en arrivant, ce
qui lit « condensation ». Multiplier `bk` PAR `RT.z` aurait laissé le fondu plat par-dessus la
convergence — les deux ramps se seraient composées et on aurait revu, en plus faible, le défaut
qu'on corrige.

Pour une pièce, `RT.z` ne sert donc plus à éteindre : il sert d'**horloge de naissance**. À
`RT.z = 0`, `bk = 0` pour tous les grains, donc la pièce est invisible — l'extinction reste
exacte, elle est simplement obtenue par l'arrivée plutôt que par l'opacité.

## La cascade, sans état ni tri

`uRot[i].z` portait `on`, le même pour les quatre. Il devient une naissance par pièce, calculée
depuis l'angle courant de la caméra :

```
d_i = |shortestDelta(phi, STATIONS[i].phi)| / π        // 0 = devant, 1 = au dos
b_i = clamp((on - d_i · cascade) / (1 − cascade), 0, 1)
```

Continu, **aucun classement, aucun état** : la pièce devant naît d'abord, celles derrière suivent.
Angles `[0, 62, 148, 218]` et caméra à `phi = 0` à l'arrivée (`theatreReveal.station` vaut 0) →
l'ordre sort du calcul : 0 (0°), 1 (62°), puis 3 (142°) et 2 (148°) quasi ex æquo. « La plus
proche d'abord » n'est donc pas une liste écrite à la main, et elle reste juste si les angles
changent.

**La sortie est gratuite.** Quand `workReveal.hallOut` fait retomber `on` (voir `hallLeft` dans
`formClock`), la même formule défait les pièces dans le même ordre, en commençant par le fond :
les grains repartent dans leur halo et la salle se rend à la poussière. Aucun code de sortie.

`d_i` est calculé sur `c.phi` **courant** et non sur celui de la station : pendant la fenêtre de
naissance la caméra est immobile sur la station 0 (le scroll est verrouillé par le film — voir
`tubeGate`), donc les deux coïncident alors ; mais à la sortie, prendre le courant fait défaire
la salle depuis là où on regarde vraiment.

### Où vit ce calcul

Dans `theatre.ts`, pur et testé, à côté de `stationSlide` et `theatreCamera` — le fichier porte
déjà cette discipline : *« la géométrie et la pose de caméra ne sont pas ici : elles sont dans
`theatre` et `theatreShapes`, purs et testés »*.

```ts
export function stationBirth(phi: number, stationPhi: number, on: number, cascade: number): number
```

**Neutralité prouvable** : à `cascade = 0`, `stationBirth` rend exactement `on` pour toute
station — donc la cascade est strictement opt-in, et un test le fixe.

(La neutralité du *shader* est plus faible et il faut le dire : à `birthReach = 0` et
`birthWave = 0`, `bk` vaut `ease(on)` et non `on`. L'image est de la même famille que celle
d'aujourd'hui, pas identique au bit près. Aucun chemin ne redonne exactement l'ancien fondu, et ce
n'est pas demandé.)

## La poussière cède quelque chose

Choix (b). `dustGain` creuse pendant la convergence puis revient, sur une cloche calée sur `on` :

```ts
const give = 1 - g.dustGive * 4 * on * (1 - on);     // 1 aux deux bouts, creux au milieu
rot[DUST_SLOT].set(0, 0, dustOn * g.dustGain * give, 1);
```

À `on = 0` et `on = 1` le facteur vaut exactement 1 : la poussière posée et la poussière seule du
noir peuplé sont **inchangées**, seul le passage creuse. L'air a l'air d'avoir donné la matière.

Ce n'est pas une conservation — 30 000 grains de poussière contre ~140 000 pour les quatre pièces,
les comptes ne s'équilibrent pas et ne le peuvent pas. C'est un **effet de cause** : sans lui la
poussière reste indifférente à ce qui naît dedans, ce qui est exactement le lien que ce spec doit
établir.

Et c'est réversible gratuitement : à la sortie, `on` redescend par la même cloche.

## Reduced motion

`TheatrePieces` est le seul enfant de `ChromeCanvas` à ne pas recevoir le drapeau `reduced`, que
tous ses frères prennent (`LiquidDna`, `ChromeTableau`, `ChromeSkull`, `MeshDna`, `DnaParticles`).
Il le prend : `<TheatrePieces reduced={reduced} />`.

Sous *reduced motion*, `birthReach = 0` et `birthCascade = 0` : les grains naissent chez eux et les
quatre pièces ensemble. Il ne reste que la montée échelonnée d'alpha, c'est-à-dire l'image
d'aujourd'hui à un `smoothstep` près. Une convergence est du mouvement ; cette préférence demande
qu'il n'y en ait pas.

## Les nombres

Dans `theatreLook.ts`, avec les autres nombres de la salle — *« si un jour il faut les rerégler en
direct, c'est le store qu'on remet autour de ce littéral »*.

| champ | rôle | départ |
| --- | --- | --- |
| `birthReach` | rayon du halo de naissance, en unités de pièce | 2,5 |
| `birthWave` | part de la rampe passée à échelonner les grains (0 = tous ensemble) | 0,55 |
| `birthCascade` | décalage du dos par rapport au devant, en part de la rampe | 0,35 |
| `dustGive` | creux de `dustGain` au plus fort de la convergence | 0,30 |

Ces quatre-là étaient des **points de départ**. La passe de réglage a eu lieu (2026-08-10) et
**elle les a tous gardés**. Ce qu'elle a mesuré vaut plus que les nombres :

Luminance moyenne de la pièce de devant, dans une boîte de 480 px, en % de sa valeur posée :

| `on` | 0,10 | 0,20 | 0,30 | 0,40 | 0,50 | 0,65 | 1,00 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | 2 % | 10 % | 35 % | 63 % | 89 % | 102 % | 100 % |

**LE PREMIER CINQUIÈME EST NOIR, ET `birthReach` N'Y PEUT RIEN.** C'est la conclusion à retenir,
parce qu'elle est contre-intuitive et que le commentaire de `birthReach` invite justement à le
baisser. Essayé, mesuré : à 1,6 au lieu de 2,5, le point à `on` = 0,1 est **identique** (0,16), et
l'écart global de ~5 % est du bruit — à `on` = 1, `born` vaut 0 quel que soit `birthReach`, donc
un écart y est nécessairement la rotation des pièces entre deux relevés. `birthReach` gouverne la
TAILLE du halo, pas la rampe de luminosité.

**`birthWave` non plus.** Dérivé plutôt qu'essayé : `bk = ease((RT.z − bd)/(1 − wave))`, donc même
à `wave` = 0 on a `bk = ease(0,1) = 0,028` — 3 %. Tant que l'alpha suit l'arrivée, un grain qui
n'est pas arrivé ne peut pas être lumineux.

Le départ noir est donc une **conséquence du choix (a)** (« l'arrivée remplace le fondu »), pas un
défaut de réglage. Il a été gardé délibérément : la partie visible court sur `on` 0,2 → 0,65, soit
≈ 0,4 s, une durée franche pour un geste, et « la pièce n'est pas encore là » a le droit de
ressembler à « la pièce n'est pas encore là ».

**Le seul levier, s'il faut un jour ouvrir ce départ**, est la loi d'alpha elle-même :
`pow(bk, 0.7)` porte le point à `on` = 0,1 de 2 % à ~9 % et rend la matière visible EN VOL. C'est
une version douce de l'option écartée à la conception (« grains lumineux en vol »), donc un choix
de direction artistique, pas un réglage.

Le budget de 0,84 s reste la contrainte des deux autres : `birthWave + birthCascade` proche de 1
ne laisse plus de place à la course elle-même.

## Les fichiers

| fichier | ce qui change |
| --- | --- |
| `src/lib/theatre.ts` | `stationBirth()`, pure |
| `tests/theatre.test.ts` | ses invariants (voir ci-dessous) |
| `src/lib/theatreLook.ts` | les quatre nombres, documentés |
| `src/components/chrome/TheatrePieces.tsx` | les deux uniformes, le terme `born`, `vAlpha`, la naissance par pièce dans `uRot[i].z`, le creux de la poussière, la prop `reduced` |
| `src/components/chrome/ChromeCanvas.tsx` | `reduced={reduced}` sur `<TheatrePieces />` |

**Rien dans `formClock.ts`.** `state.theatre.on` reste la présence de la salle et garde son sens :
la cascade est un fait de *look*, par pièce, dérivé d'un angle que le composant a déjà sous la
main. L'horloge « intègre ce dont la chorégraphie dépend », pas ce qu'une pose peut déduire.

## Hors périmètre, explicitement

- Le cycle d'effritement (`esc`, `uRate`, `uZone`, `uOut`, `uReach`, `uFan`) — inchangé.
- La caméra, son arc, `THEATRE_FOV`.
- Le noir peuplé (`dive` 0,90 → 0,915) et les seuils de la table du film.
- Les fenêtres et le film dans `Work.tsx`.
- Le survol, l'ouverture d'un projet (`reveal`, `slide`, le souffle) et le DOM des projets.
- La densité et le volume de la poussière — on ne touche que son intensité, et seulement pendant
  le passage.

## Critères de vérification

Testés (`node --test`) :

1. `cascade = 0` → `stationBirth` rend exactement `on`, pour les quatre stations et pour
   `on ∈ {0, 0.25, 0.5, 0.75, 1}`.
2. `on = 0` → 0 et `on = 1` → 1 pour toute station et tout `cascade ∈ [0, 1)`.
3. Monotone croissante en `on`.
4. À `cascade > 0`, la station dans l'axe de la caméra est **strictement plus avancée** que la
   plus lointaine **tant que celle-ci n'est pas née** ; et dès que le fond vaut 1, le devant
   vaut 1 aussi.

   L'invariant est **conditionnel, et c'est la seule forme juste**. Une première rédaction
   affirmait « le fond ne peut saturer qu'à `on` = 1 » : vrai pour un antipode exact, faux
   pour les stations réelles. La plus lointaine vue de φ = 0 est à 148°, donc `d` = 0,822 et
   elle sature dès `on = 1 − cascade·(1 − d) ≈ 0,938`. Un test écrit sur la version absolue
   échouait à `on` = 0,95, où les deux valent 1 — et il aurait fait accuser la formule, qui
   est correcte : une pièce née reste née.
5. Le résultat reste dans `[0, 1]` pour un `phi` hors de `[0, 2π]` (l'angle de l'horloge
   s'accumule et n'est pas ramené dans un tour — `theatrePhi` peut valoir −22 rad, c'est
   mesuré).

Au navigateur, en poussant `workReveal.dive` :

6. À `on ≈ 0,2` : les pièces sont des halos épars, aucune silhouette lisible.
7. À `on ≈ 0,5` : la pièce de devant est presque prise, celle du dos encore en nuage — la
   cascade se voit.
8. À `on = 1` : les quatre sont identiques à aujourd'hui (les grains sont chez eux, la matière
   reprend son effritement normal).
9. La poussière est plus faible à `on ≈ 0,5` qu'à `on = 0` et qu'à `on = 1`, et identique à
   aujourd'hui à ces deux bouts.
10. En remontant (`hallOut`), les pièces se défont en repartant dans leur halo, le dos d'abord.
11. Le coût par frame ne bouge pas de façon mesurable : la naissance ajoute une dizaine
    d'opérations ALU par sommet et **aucune lecture de texture**, sur 140 000 points déjà
    dessinés. À vérifier tout de même dans la salle, médiane sur 40 à 120 frames, comme le repo
    le fait ailleurs.

## Risques

- **Le budget de 0,84 s.** C'est le vrai risque : la cascade et la vague se disputent la même
  fenêtre, et si le geste ne se lit pas, le levier n'est pas dans ce spec mais dans le film
  (`Work.tsx`) ou dans le seuil 0,915. Élargir la fenêtre a été écarté à la conception (ça finit
  après que le scroll est rendu) — si les réglages n'y arrivent pas, c'est cette décision qu'il
  faudra rouvrir, pas les nombres.
- **L'additif.** Le nuage est en `AdditiveBlending` et se règle « sur la somme, pas sur l'unité ».
  Un halo de naissance étalé sur un grand volume est plus SOMBRE par pixel qu'une pièce dense :
  la convergence pourrait donc paraître partir de trop bas. `birthReach` est le levier.
- **Le tirage de direction.** Une sphère mal tirée (trois bruits normalisés) concentre les
  départs sur les diagonales — d'où la méthode `cz`/`sr` explicitée plus haut. À ne pas
  « simplifier ».
