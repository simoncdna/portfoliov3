# La plongée dans l'écran — design

**Date** : 2026-08-05
**Branche** : `feat/work-tableau-mesh`
**Statut** : design validé, non implémenté
**Référence visuelle** : capture d'écran fournie (4,57 s), analysée image par image — voir
« La référence, et pourquoi on la joue à l'envers ».

## L'intention

Le terminal du poste dit « Follow the white rabbit. » et **il ne se passe rien**. La phrase est
une invitation que la page ne tient pas.

Ce design la tient : au scroll suivant, la caméra entre dans l'écran au niveau du texte, les
cellules de phosphore s'ouvrent en corridor, on les traverse, et le noir arrive. Le poste et son
terminal deviennent le **seuil** de la section Work ; ce qui monte du noir est Work lui-même.

## La référence, et pourquoi on la joue à l'envers

La capture fournie va du noir vers un écran : tunnel de phosphore (t ≈ 1,4 → 3 s) puis arrivée
sur une macro de CRT montrant un texte (t ≈ 3,5 → 4,6 s), lignes de balayage et frange RVB
visibles.

**On la joue à l'envers.** On PART de l'écran du poste, on grossit jusqu'à voir sa structure de
phosphore, on traverse, le corridor s'enfonce, noir. Soit, en images de la référence :
`f13 → f10 → f07 → f04 → f00`.

## Découpage : deux features, ce spec en couvre une

Ce qui attend de l'autre côté du tunnel n'est pas défini, et le prétendre serait mentir. Trois
endroits du code le disent :

- `src/sections/Work.tsx:412` — l'index des projets est rendu avec `hidden` ;
- `src/sections/Work.tsx:437` — le lien cliquable est caché, avec « Revient avec l'affichage
  des projets » ;
- `src/components/chrome/ChromeTableau.tsx` — « LES PHOTOGRAPHIES SONT ÉTEINTES […] la question
  de ce que la télé montre est ouverte, pas répondue ».

Rallumer les projets n'est pas un drapeau à basculer : la dalle qui les portait est dimensionnée
pour l'ancien tableau, et le poste — qu'on vient de traverser — n'est plus là pour les afficher.

- **Spec #1, celui-ci : la plongée.** Du seuil au noir. Autonome, vérifiable seul.
- **Spec #2, plus tard : la scène des projets.** Ce qui monte du noir.

Le critère de fin du #1 est donc un écran noir, et c'est un livrable acceptable : la sortie
actuelle vers Contact (`workReveal.away`) reste branchée et inchangée derrière.

## La disposition du scroll

```
[form ]  le poste se forme          existant   workReveal.form + Theatre
[· · ·]  le terminal invite         existant   horloge réelle  ← scroll retenu
[dive ]  LA PLONGÉE                 NOUVEAU    workReveal.dive
[ ??? ]  les projets                           ← spec #2
[away ]  sortie vers Contact        existant   inchangé
```

`dive` est un quatrième scrub, du même genre que `form` et `away` : une valeur 0..1 sur un
singleton mutable, écrite par une timeline GSAP scrubbée, lue une fois par frame par l'horloge.
Aucune seconde source de temps — la doctrine de `formClock` tient.

## La retenue du scroll, et son accélération

**Décision prise en connaissance du défaut.** Tant que les trois phrases ne sont pas affichées,
la plongée ne démarre pas : `pin` ScrollTrigger sur la section plus `lenis.stop()`.

**Mais le geste est répondu.** Scroller pendant la séquence **accélère la frappe** au lieu de ne
rien faire. La plongée reste retenue — l'intention du choix tient, le texte est vu en entier —
et l'attente tombe de ~10 s à deux ou trois. Sans cette accélération, un geste ignoré pendant
dix secondes lit comme une page cassée, et c'est la seule raison pour laquelle ce spec se permet
de bloquer le scroll.

Forme : chaque cran de molette avance `tb.t` d'un incrément, en plus du `delta` de la frame.
L'accélération est bornée par la fin de la séquence, jamais au-delà.

**Garde-fou obligatoire** : `lenis.start()` doit être appelé sur TOUS les chemins de sortie —
séquence finie, démontage du composant, `prefers-reduced-motion`, et retour arrière du scroll
au-dessus de la section. Un `lenis.stop()` orphelin fige la page entière, sans symptôme visible
autre qu'une molette morte.

En `prefers-reduced-motion` : ni retenue, ni accélération, ni plongée jouée — le scrub existe
mais la caméra ne bouge pas. Le mouvement est ce que cette préférence demande d'éviter, et une
caméra qui traverse un écran en est le maximum.

## Le tunnel : le masque de phosphore, en volume

C'est le cœur, et le choix de l'instanciation en découle.

**Une cellule = un triplet de phosphore.** Une grille de 48 × 36 cellules couvre le canvas
512 × 384 du terminal (une cellule pour 10,7 × 10,7 pixels de canvas).

**La profondeur vient de copies, pas d'une transformation.** La grille est répétée `D = 16` fois
en Z. La copie `k` est à `z_k = z₀·(1+g)^k` et à l'échelle `(1+g)^k` — **géométrique des deux
côtés, et c'est l'invariant** : `échelle / distance` est alors constant, donc toutes les copies
sous-tendent le même angle et le corridor est DROIT. Un espacement linéaire avec une échelle
géométrique (l'erreur de la première rédaction de ce spec) donne un pavillon évasé, pas le tube
rectangulaire de `f04`/`f07`. Total : 48 × 36 × 16 = **27 648 instances**.

C'est le motif classique du zoom infini, et il apporte le recyclage gratuitement : quand une
copie dépasse la caméra, la remettre au fond est une multiplication par `(1+g)^D`. Le tunnel est
donc de profondeur illimitée pour 16 tranches.

Il donne exactement les parois de `f04`/`f07` : des blocs qui balaient les bords pendant qu'un
rectangle sombre tient le point de fuite.

**Les cellules éteintes existent aussi, et c'est ce qui fait le corridor.** Un masque de
phosphore couvre TOUT l'écran, pas seulement la partie allumée. Chaque cellule porte donc une
couleur de base sombre (le phosphore au repos) à laquelle s'ajoute l'échantillon du canvas.
Sans ça, le canvas du terminal étant noir à 95 %, le « corridor » serait une seule bande
lumineuse et pas un tunnel.

**Attributs d'instance** : `aCell` (l'uv de la cellule dans le canvas) et `aSlice` (l'indice
`k`). Le reste est un programme de vertex — la direction que le dépôt a prise en quittant le
raymarcher, et la raison pour laquelle `ChromeTableau` existe.

**La texture est partagée** : le tunnel échantillonne le MÊME `CanvasTexture` 512 × 384 que le
tube (`screen.tex` dans `ChromeTableau`). Ce n'est pas une optimisation, c'est le sens de la
séquence — on entre dans les pixels de cette phrase-là, pas dans une texture qui lui ressemble.
Il faut donc la sortir de `ChromeTableau` vers un module que les deux consomment.

## Le relais poste → tunnel

**Le poste ne peut pas dessiner le tunnel.** Dès que le plan proche de la caméra traverse le
verre, ses fragments passent derrière la caméra. Et le `side: DoubleSide` de ses matériaux fait
qu'on verrait l'intérieur du boîtier avant de sortir. Le relais est donc obligatoire, pas
esthétique — c'est le même passage de témoin mesh-à-mesh que crâne → poste, que le dépôt sait
déjà faire.

| `dive` | Ce qui se passe |
|---|---|
| 0 → 0,35 | La caméra approche du centre du rectangle de l'écran. Le shader du tube gagne son détail macro : le balayage se densifie, une frange RVB apparaît, le bloom monte — la `f13` de la référence. |
| 0,35 → 0,5 | Le poste s'efface (son fondu doit être **complet avant** que le plan proche atteigne le verre), le tunnel monte. |
| 0,5 → 1 | Le corridor défile. La luminosité monte puis retombe au noir. |

**L'ordre du fondu est un invariant à vérifier par la mesure** : si le poste n'est pas
entièrement éteint quand la caméra franchit le verre, on voit l'intérieur du boîtier. C'est le
défaut le plus probable de cette feature.

## Les fichiers

| Fichier | Ce qui change |
|---|---|
| `src/lib/workReveal.ts` | `+ dive` |
| `src/sections/Work.tsx` | une timeline scrubbée de plus ; le `pin` et la retenue ; l'accélération à la molette |
| `src/lib/formClock.ts` | `dive` entre dans `FormState` ; la pose caméra le lit |
| `src/lib/cameraStage.ts` | la trajectoire de plongée, **par défaut une seconde feuille Theatre** — ce fichier est l'autorité caméra documentée et « le seul fichier du projet qui connaît Theatre.js », donc une trajectoire caméra qui naîtrait ailleurs casserait cet isolement. Repli vers une interpolation directe **seulement si** le studio se révèle inutilisable pour un trajet qui traverse le sujet (à constater, pas à supposer) |
| `src/components/chrome/ChromeTableau.tsx` | détail macro du tube ; fondu du poste ; la `CanvasTexture` sort du fichier |
| `src/lib/tubeScreen.ts` | **NOUVEAU** — le canvas 512 × 384 et son pinceau, partagés |
| `src/components/chrome/PixelTunnel.tsx` | **NOUVEAU** — l'`InstancedMesh` |
| `src/components/chrome/ChromeCanvas.tsx` | monte le tunnel |
| `src/lib/posteTweak.ts` | molettes de réglage de la plongée (profondeur, densité, couleur du phosphore au repos) |

## Hors périmètre, explicitement

- **La scène des projets.** Spec #2. Ce spec s'arrête au noir.
- **`workReveal.away` et Contact.** Inchangés, toujours branchés derrière.
- **Hero et About.** Non touchés.
- **Le son.** La séquence est muette, comme tout le site.
- **Un retour arrière animé.** Le scrub est réversible par construction (remonter défait la
  plongée) ; aucune animation de sortie dédiée n'est écrite.

## Critères de vérification

Aucun n'est satisfait par relecture — tous demandent une mesure ou une capture.

1. **La séquence puis la plongée.** Les trois phrases s'affichent, la molette n'avance pas la
   plongée avant la dernière, puis elle l'avance.
2. **L'accélération.** Scroller pendant la frappe raccourcit l'attente et ne saute aucune phrase.
3. **Lenis est toujours rendu.** Après passage de la section, dans les deux sens, et après
   démontage : la page scrolle. À vérifier aussi avec le préchargeur et le `ControlPanel`, qui
   touchent déjà Lenis.
4. **Aucun intérieur de boîtier visible** au franchissement du verre.
5. **Le tunnel est fait de CE texte** : changer le texte du terminal change les cellules
   allumées du corridor.
6. **Le budget de frame.** 27 648 instances de plus : mesurer avant/après, sur la section, en
   dpr plein. Le Hero a déjà été ramené de 30 à 51 FPS dans ce dépôt en supprimant du travail
   par frame — un budget se mesure, il ne se suppose pas.
7. **`prefers-reduced-motion`** : ni retenue, ni plongée.
8. **Le scrub est réversible** : remonter défait proprement, sans état collé.

## Risques

- **Le plus grave : `lenis.stop()` orphelin.** Une page figée sans message. D'où le garde-fou
  ci-dessus et le critère 3.
- **La retenue reste du scroll-jacking**, atténuée mais pas supprimée. Si à l'usage elle
  déplaît, la sortie est l'option écartée au design : la molette complète la séquence d'un coup.
  Ce repli ne coûte qu'une condition, il est délibérément laissé accessible.
- **27 648 instances** — voir critère 6. Si le budget ne passe pas, les leviers sont `D` puis la
  finesse de grille, dans cet ordre : la profondeur se remarque moins que la résolution.
- **Le fondu du poste** — voir critère 4.
