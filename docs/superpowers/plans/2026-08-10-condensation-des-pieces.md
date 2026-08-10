# La condensation des pièces — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À la sortie du tunnel, les quatre projets ne s'allument plus : leurs grains naissent dispersés dans un halo autour de leur place et convergent, en vague par pièce et en cascade de la plus proche à la plus lointaine, pendant que la poussière de la salle creuse — comme si l'air avait donné la matière.

**Architecture:** Un terme `born` ajouté dans le vertex exactement là où vit `esc`, fonction pure de la présence et des deux graines (la doctrine du fichier : rien ne s'intègre d'une frame à l'autre). `uRot[i].z` cesse de porter `theatre.on` partagé et porte une naissance PAR PIÈCE, calculée par une fonction pure de `theatre.ts` depuis l'angle courant de la caméra — donc aucun tri, aucun état, et la sortie de salle se défait gratuitement dans le même ordre. L'arrivée du grain REMPLACE le fondu d'alpha, elle ne s'y ajoute pas.

**Tech Stack:** Next.js 16, React 19, R3F 9, three 0.185, GLSL (points + AdditiveBlending), `node --test` pour le module pur.

**Spec:** `docs/superpowers/specs/2026-08-10-condensation-des-pieces-design.md`

**Hors périmètre :** le cycle d'effritement, la caméra, le noir peuplé (`dive` 0,90 → 0,915), les fenêtres du film dans `Work.tsx`, le survol / l'ouverture d'un projet, la densité et le volume de la poussière. **Rien dans `formClock.ts`.**

**Note d'environnement :** ce plan s'exécute **en place**, sur `feat/work-tableau-mesh`, PAS dans un worktree dédié. La branche porte du travail non commité de l'utilisateur (`Work.tsx`, `theatre.ts`, `TheatrePieces.tsx`, `globals.css`, …) : le déplacer serait plus risqué que de travailler à côté. **Ne jamais `git add -A` ni `git commit -a`** — chaque commit ci-dessous nomme ses fichiers.

---

## Structure des fichiers

| Fichier | Responsabilité | Testable Node |
|---|---|---|
| `src/lib/theatre.ts` | `+ stationBirth()` — la cascade, pure : `(φ caméra, φ station, on, cascade) → naissance 0..1` | oui |
| `tests/theatre.test.ts` | `+` cinq invariants de `stationBirth` | — |
| `src/lib/theatreLook.ts` | `+` les quatre nombres (`birthReach`, `birthWave`, `birthCascade`, `dustGive`), documentés | non |
| `src/components/chrome/TheatrePieces.tsx` | les deux uniformes, le terme `born`, `vAlpha`, la naissance dans `uRot[i].z`, le creux de la poussière, la prop `reduced` | non |
| `src/components/chrome/ChromeCanvas.tsx` | `reduced={reduced}` sur `<TheatrePieces />` | non |

**Pourquoi ce découpage :** `theatre.ts` porte déjà la discipline du fichier — *« la géométrie et la pose de caméra ne sont pas ici : elles sont dans `theatre` et `theatreShapes`, purs et testés »*. La cascade est de l'arithmétique d'angle : elle y va, et elle y est testée. `theatreLook.ts` est le foyer déclaré de tous les nombres de la salle. `TheatrePieces.tsx` fait 550 lignes et reste raisonnable ; on ne le découpe pas.

---

## Task 1 : `stationBirth()` — la cascade, pure et testée

**Files:**
- Modify: `src/lib/theatre.ts` (après `shortestDelta`, ~ligne 162)
- Modify: `tests/theatre.test.ts` (imports en tête, tests en fin de fichier)

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter `stationBirth` à la liste d'imports en tête de `tests/theatre.test.ts` (elle est triée alphabétiquement — il se place entre `stationPosition` et `stationSlide`) :

```ts
import {
  APPROACH,
  PIECE_OF_WORK,
  RING_RADIUS,
  STATIONS,
  SLIDE,
  shortestDelta,
  stationBirth,
  stationPosition,
  stationSlide,
  theatreCamera,
} from "../src/lib/theatre.ts";
```

Puis ajouter ces cinq tests **à la fin** du fichier :

```ts
/**
 * LA NEUTRALITÉ, ET C'EST LE TEST QUI COMPTE LE PLUS. À cascade nulle, la naissance vaut
 * exactement la présence partagée — donc la cascade est strictement opt-in, et l'image
 * d'avant cette mécanique se retrouve en mettant un seul nombre à zéro. Sans ce test, une
 * refonte de la formule pourrait décaler les quatre pièces d'un cheveu sans que rien ne le
 * dise.
 */
test("à cascade nulle, la naissance vaut exactement la présence", () => {
  for (const s of STATIONS) {
    for (const on of [0, 0.25, 0.5, 0.75, 1]) {
      const b = stationBirth(0, s.phi, on, 0);
      assert.equal(b, on, `φ=${s.phi} on=${on} : ${b}`);
    }
  }
});

test("les deux bouts sont exacts, quelle que soit la cascade", () => {
  for (const s of STATIONS) {
    for (const cascade of [0, 0.2, 0.35, 0.6, 0.9]) {
      assert.equal(stationBirth(0, s.phi, 0, cascade), 0, `φ=${s.phi} cascade=${cascade}`);
      assert.equal(stationBirth(0, s.phi, 1, cascade), 1, `φ=${s.phi} cascade=${cascade}`);
    }
  }
});

test("la naissance ne repart jamais en arrière quand la présence monte", () => {
  for (const s of STATIONS) {
    let last = -1;
    for (let i = 0; i <= 40; i++) {
      const b = stationBirth(0, s.phi, i / 40, 0.35);
      assert.ok(b >= last, `φ=${s.phi} on=${i / 40} : ${b} après ${last}`);
      last = b;
    }
  }
});

/**
 * LA CASCADE EXISTE VRAIMENT — et l'invariant est CONDITIONNEL, pas absolu.
 *
 * Le devant est strictement plus avancé que le fond TANT QUE le fond n'est pas né ; une fois le
 * fond arrivé, les deux valent 1 et il n'y a plus d'écart à mesurer.
 *
 * Une première rédaction affirmait « le fond ne peut saturer qu'à on = 1 ». C'est vrai d'un
 * antipode exact et faux des stations réelles : la plus lointaine vue de φ = 0 est à 148°, donc
 * d = 0,822, et elle sature dès on = 1 − cascade·(1 − d) ≈ 0,938. Le test échouait à on = 0,95,
 * où les deux valent 1 — et il aurait fait accuser la formule, qui est correcte : une pièce née
 * reste née. La forme ci-dessous ne dépend d'aucun seuil et balaie toute la rampe.
 */
test("la pièce dans l'axe naît avant celle du fond", () => {
  const phi = STATIONS[0].phi;
  // La plus lointaine en écart angulaire, mesurée et non supposée.
  const far = STATIONS.reduce((a, s) =>
    Math.abs(shortestDelta(phi, s.phi)) > Math.abs(shortestDelta(phi, a.phi)) ? s : a
  );
  assert.notEqual(far.phi, phi, "il faut deux stations distinctes pour comparer");
  for (let i = 0; i <= 40; i++) {
    const on = i / 40;
    const front = stationBirth(phi, phi, on, 0.35);
    const back = stationBirth(phi, far.phi, on, 0.35);
    if (on === 0) {
      assert.equal(front, 0, "rien n'est né à présence nulle");
      assert.equal(back, 0, "rien n'est né à présence nulle");
    } else if (back < 1) {
      assert.ok(front > back, `on=${on} : devant ${front} n'est pas devant le fond ${back}`);
    } else {
      assert.equal(front, 1, `on=${on} : le fond est né (${back}) mais pas le devant (${front})`);
    }
  }
});

/**
 * L'ANGLE DE L'HORLOGE S'ACCUMULE ET N'EST PAS RAMENÉ DANS UN TOUR — mesuré au navigateur :
 * `theatrePhi` valait −22 rad après quelques allers-retours. Une naissance calculée sur un
 * écart non replié sortirait de [0,1] et la salle s'éteindrait sans raison visible.
 */
test("un angle accumulé hors d'un tour ne sort pas la naissance de [0,1]", () => {
  for (const phi of [-22, -6.5, 0, 7.1, 43.9]) {
    for (const s of STATIONS) {
      const b = stationBirth(phi, s.phi, 0.5, 0.35);
      assert.ok(b >= 0 && b <= 1, `φ=${phi} station=${s.phi} : ${b}`);
    }
  }
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `node --test tests/theatre.test.ts`
Expected: FAIL — `SyntaxError` ou `The requested module '../src/lib/theatre.ts' does not provide an export named 'stationBirth'`.

- [ ] **Step 3 : Écrire `stationBirth`**

Dans `src/lib/theatre.ts`, juste après la fonction `shortestDelta` (qui finit ligne 162) :

```ts
/**
 * L'AVANCEMENT DE LA NAISSANCE D'UNE PIÈCE — la cascade, sans état ni tri.
 *
 * Les quatre pièces partageaient une seule présence (`theatre.on`), donc elles apparaissaient
 * ensemble. Ici chacune reçoit la sienne, RETARDÉE DE SON ÉCART ANGULAIRE À LA CAMÉRA : celle
 * qu'on regarde naît d'abord, celles du dos suivent. On voit la salle se peupler au lieu d'un
 * interrupteur.
 *
 * CONTINU, DONC NI CLASSEMENT NI ÉTAT. Trier les stations par distance aurait demandé un rang —
 * un entier qui saute, donc quelque chose à intégrer, donc de l'état dans un fichier qui n'en a
 * pas. Le retard est ici une FONCTION de l'écart, et l'ordre en sort tout seul : avec les angles
 * actuels (0, 62, 148, 218) et la caméra à φ = 0 à l'arrivée, il vaut 0, 1, puis 3 (142°) et 2
 * (148°) quasi ex æquo. Il reste juste si les angles changent.
 *
 * ET LA SORTIE EST GRATUITE. Quand `on` retombe (voir `hallLeft` dans formClock), la même
 * formule défait les pièces dans le même ordre, en commençant par le fond : les grains repartent
 * dans leur halo et la salle se rend à la poussière, sans une ligne de code de sortie.
 *
 * `phi` EST L'ANGLE COURANT DE LA CAMÉRA, PAS CELUI DE LA STATION VISÉE. Pendant la fenêtre de
 * naissance la caméra est immobile (le scroll est verrouillé par le film — voir tubeGate), donc
 * les deux coïncident alors ; mais à la sortie, prendre le courant fait défaire la salle depuis
 * là où on regarde vraiment.
 *
 * À `cascade` = 0 le résultat vaut EXACTEMENT `on` pour toute station — la cascade est
 * strictement opt-in, et un test le fixe. Borné à 0,999 parce que la formule divise par
 * (1 − cascade) : à 1, toutes les pièces naîtraient au même instant infiniment court.
 */
export function stationBirth(phi: number, stationPhi: number, on: number, cascade: number) {
  const k = Math.max(0, Math.min(0.999, cascade));
  const d = Math.abs(shortestDelta(phi, stationPhi)) / Math.PI;
  return Math.max(0, Math.min(1, (on - d * k) / (1 - k)));
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run: `node --test tests/theatre.test.ts`
Expected: PASS — 17 tests (12 existants + 5 neufs), `# fail 0`.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/theatre.ts tests/theatre.test.ts
git commit -m "feat(salle): chaque pièce a sa propre naissance, retardée par son écart au regard"
```

---

## Task 2 : les quatre nombres, dans `theatreLook`

**Files:**
- Modify: `src/lib/theatreLook.ts` (le type `TheatreLook` et le littéral `THEATRE_LOOK`)

Aucun changement d'image à cette étape : les champs sont ajoutés et personne ne les lit encore. C'est voulu — la tâche suivante les branche d'un coup, et un `tsc` propre ici prouve que le type est cohérent avant qu'un shader n'en dépende.

- [ ] **Step 1 : Ajouter le bloc au type**

Dans `src/lib/theatreLook.ts`, insérer ce bloc **entre** la fin du bloc `/* ---- DÉCOMPOSITION ---- */` (après le champ `openSpin`) et le début de `/* ---- COULEURS ---- */` :

```ts
  /* ---- NAISSANCE ---- */

  /**
   * LE RAYON DU HALO D'OÙ LES GRAINS ARRIVENT, en unités de pièce — comme `reach`, donc
   * indépendant de l'échelle de la station.
   *
   * Le nuage est en `AdditiveBlending` et se règle « sur la somme, pas sur l'unité » : un halo
   * étalé sur un grand volume est plus SOMBRE par pixel qu'une pièce dense, donc trop de portée
   * fait paraître la convergence partie de trop bas. C'est le premier levier si la naissance
   * semble sortir du noir au lieu de sortir de la poussière.
   *
   * À 0, les grains naissent chez eux : il ne reste que la montée d'alpha échelonnée. C'est ce
   * que `reduced` force.
   */
  birthReach: number;
  /**
   * LA PART DE LA RAMPE PASSÉE À ÉCHELONNER LES GRAINS, dans [0,1). À 0 ils arrivent tous
   * ensemble — la pièce se contracte d'un bloc ; plus haut, elle se prend en vague.
   *
   * IL SE DISPUTE LA MÊME FENÊTRE QUE `birthCascade`. Elle vaut ≈ 0,84 s (voir la spec : le
   * troisième temps du film couvre `dive` 0,90 → 1 en 16 % de `diveSeconds`, sans ease, donc un
   * centième de `dive` y vaut 0,11 s à 7 s de plongée). `birthWave + birthCascade` proche de 1
   * ne laisse plus de place à la course elle-même.
   */
  birthWave: number;
  /**
   * LE RETARD DU FOND SUR LE DEVANT, en part de la rampe — voir `stationBirth`, qui en fait une
   * fonction de l'écart angulaire plutôt qu'un rang. À 0, les quatre pièces naissent ensemble et
   * `stationBirth` rend exactement la présence partagée.
   */
  birthCascade: number;
  /**
   * DE COMBIEN LA POUSSIÈRE CREUSE au plus fort de la convergence, en fraction de `dustGain`.
   *
   * Sur une cloche `4·on·(1−on)` : le facteur vaut EXACTEMENT 1 à `on` = 0 et `on` = 1, donc la
   * poussière seule du noir peuplé et la poussière de la salle posée sont inchangées — seul le
   * passage creuse. L'air a l'air d'avoir donné la matière.
   *
   * Ce n'est pas une conservation : 30 000 grains de poussière contre ~140 000 pour les quatre
   * pièces, les comptes ne s'équilibrent pas et ne le peuvent pas. C'est un effet de CAUSE — sans
   * lui la poussière reste indifférente à ce qui naît dedans.
   */
  dustGive: number;
```

- [ ] **Step 2 : Ajouter les valeurs au littéral**

Dans le même fichier, dans `THEATRE_LOOK`, insérer après `openSpin: 0.45,` :

```ts
  birthReach: 2.5,
  birthWave: 0.55,
  birthCascade: 0.35,
  dustGive: 0.3,
```

- [ ] **Step 3 : Vérifier que le type est cohérent**

Run: `npx tsc --noEmit`
Expected: aucune sortie (le littéral satisfait le type).

- [ ] **Step 4 : Commit**

```bash
git add src/lib/theatreLook.ts
git commit -m "feat(salle): les quatre nombres de la naissance, et le budget de temps qui les contraint"
```

---

## Task 3 : `reduced` arrive jusqu'à la salle

**Files:**
- Modify: `src/components/chrome/TheatrePieces.tsx` (signature du composant)
- Modify: `src/components/chrome/ChromeCanvas.tsx:397`

`TheatrePieces` est le seul enfant de `ChromeCanvas` à ne pas recevoir ce drapeau, que tous ses frères prennent (`LiquidDna`, `ChromeTableau`, `ChromeSkull`, `MeshDna`, `DnaParticles`). Aucun changement d'image ici : la prop est reçue et pas encore lue.

- [ ] **Step 1 : Déclarer la prop**

Dans `src/components/chrome/TheatrePieces.tsx`, remplacer :

```tsx
export function TheatrePieces() {
```

par :

```tsx
type Props = {
  reduced?: boolean;
};

export function TheatrePieces({ reduced }: Props) {
```

- [ ] **Step 2 : La passer**

Dans `src/components/chrome/ChromeCanvas.tsx`, remplacer :

```tsx
          <TheatrePieces />
```

par :

```tsx
          <TheatrePieces reduced={reduced} />
```

- [ ] **Step 3 : Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune sortie.

- [ ] **Step 4 : Commit**

```bash
git add src/components/chrome/TheatrePieces.tsx src/components/chrome/ChromeCanvas.tsx
git commit -m "chore(salle): le drapeau reduced arrive jusqu'aux pièces, comme chez ses frères"
```

---

## Task 4 : la naissance — les grains arrivent du dehors

C'est la tâche qui change l'image.

**Files:**
- Modify: `src/components/chrome/TheatrePieces.tsx` (VERT, le bloc `uniforms`, le `useFrame`)

- [ ] **Step 1 : Déclarer les deux uniformes dans le vertex**

Dans `VERT`, après la ligne `uniform float uFloat;`, ajouter :

```glsl
uniform float uBirthReach;
uniform float uBirthWave;
```

- [ ] **Step 2 : Ajouter le terme de naissance et refaire `vAlpha`**

Dans `VERT`, remplacer ce bloc :

```glsl
  vAlpha = alpha * RT.z;
  vDust = RT.w;

  vec3 world = XF.xyz + (base + esc) * XF.w;
```

par :

```glsl
  /*
   * LA NAISSANCE — le grain arrive du dehors, il ne s'allume pas sur place.
   *
   * RT.z NE SERT PLUS À ÉTEINDRE, IL SERT D'HORLOGE. Il portait `theatre.on`, partagé par les
   * quatre pièces, et il multipliait l'alpha : chaque grain était déjà à sa place finale et
   * seule son opacité montait — le fantôme de l'objet fini qui s'allume. Il porte maintenant la
   * naissance de CETTE pièce (voir stationBirth), et c'est l'ARRIVÉE du grain qui fait l'alpha.
   * L'extinction reste exacte : à RT.z = 0, bk vaut 0 pour tous les grains.
   *
   * L'ÉCHELONNAGE PAR GRAIN vient d'un hachage NEUF, pas de `pick` réutilisé : corrélés, les
   * grains qui s'effritent seraient aussi les derniers arrivés, et les deux gestes se
   * confondraient.
   */
  float bd = fract(sin(r1 * 269.5 + r0 * 183.3) * 43758.5453) * uBirthWave;
  float bk = ease(clamp((RT.z - bd) / max(1e-3, 1.0 - uBirthWave), 0.0, 1.0));
  // LA POUSSIÈRE EST NÉE D'AVANCE — par le drapeau qui existe déjà (RT.w, voir vDust). C'est
  // elle qui peuple le noir avant que les pièces n'arrivent : la faire naître aussi aurait vidé
  // ce passage de la seule chose qu'il montre.
  bk = mix(bk, 1.0, RT.w);

  /*
   * LA DIRECTION DU HALO : une sphère UNIFORME, tirée sur les deux graines.
   *
   * NE PAS « SIMPLIFIER » EN NORMALISANT TROIS BRUITS. Un vec3 de bruits normalisé concentre les
   * tirages sur les diagonales du cube, et la pièce se condenserait depuis ses huit coins. Le
   * z uniforme + l'angle uniforme est la seule méthode qui couvre la sphère à plat.
   *
   * La direction partage r0/r1 avec le panache de l'effritement, donc départ et arrivée sont de
   * la même famille — assumé : les deux ne coexistent pas, et une pièce dont la matière rentre
   * par où elle sortira se tient mieux qu'une qui mélange deux champs indépendants.
   */
  float bz = r0 * 2.0 - 1.0;
  float brd = sqrt(max(0.0, 1.0 - bz * bz));
  float ban = r1 * TAU;
  vec3 born = vec3(brd * cos(ban), bz, brd * sin(ban))
            * (uBirthReach * (1.0 - bk) * (1.0 - RT.w));

  // L'ARRIVÉE REMPLACE LE FONDU, ELLE NE S'Y AJOUTE PAS. Multiplier bk PAR RT.z aurait laissé le
  // fondu plat par-dessus la convergence : les deux rampes se seraient composées et on aurait
  // revu, en plus faible, le défaut qu'on corrige. La poussière, elle, garde sa présence à elle.
  vAlpha = alpha * mix(bk, RT.z, RT.w);
  vDust = RT.w;

  // `born` s'ajoute APRÈS les rotations, au même endroit et pour la même raison que `esc` : le
  // halo d'où la matière arrive n'appartient pas plus à l'objet que le panache par où elle part.
  vec3 world = XF.xyz + (base + esc + born) * XF.w;
```

- [ ] **Step 3 : Déclarer les uniformes côté JS**

Dans le `useMemo` qui construit `material`, après la ligne `uFloat: { value: 0 },`, ajouter :

```ts
        uBirthReach: { value: 0 },
        uBirthWave: { value: 0 },
```

- [ ] **Step 4 : Importer `stationBirth`**

Dans l'import depuis `@/lib/theatre` en tête du fichier, ajouter `stationBirth` (la liste est triée) :

```tsx
import {
  PIECE_RADIUS,
  RING_RADIUS,
  STATIONS,
  stationBirth,
  stationPosition,
  stationSlide,
  theatreReveal,
  theatreScreen,
} from "@/lib/theatre";
```

- [ ] **Step 5 : Pousser les uniformes et la naissance par pièce**

Dans le `useFrame`, après la ligne `u.uFloat.value = g.float;`, ajouter :

```ts
    // À ZÉRO SOUS `reduced` : une convergence est du mouvement, et cette préférence demande
    // qu'il n'y en ait pas. Il reste la montée d'alpha, c'est-à-dire l'image d'avant.
    u.uBirthReach.value = reduced ? 0 : g.birthReach;
    u.uBirthWave.value = reduced ? 0 : g.birthWave;
```

Puis, dans la boucle `for (let i = 0; i < STATIONS.length; i++)`, remplacer :

```ts
      rot[i].set(s.tilt, spin, on, 0);
```

par :

```ts
      // LA NAISSANCE DE CETTE PIÈCE, plus la présence partagée : celle qu'on regarde arrive
      // d'abord, celles du dos suivent — et à la sortie elles se défont dans le même ordre.
      rot[i].set(s.tilt, spin, stationBirth(c.phi, s.phi, on, reduced ? 0 : g.birthCascade), 0);
```

- [ ] **Step 6 : Vérifier la compilation et les tests**

Run: `npx tsc --noEmit && node --test tests/theatre.test.ts`
Expected: aucune sortie de `tsc`, puis `# fail 0`.

- [ ] **Step 7 : Vérifier au navigateur qu'aucun shader ne casse**

Charger `http://localhost:3000` et lire la console.
Expected: aucun `THREE.WebGLProgram: Shader Error`. Si un tel message apparaît, c'est une déclaration d'uniforme manquante ou un nom de variable en collision — les noms `bd`, `bk`, `bz`, `brd`, `ban` ont été choisis pour ne pas heurter `ca`/`sa` (lacet) ni `ct`/`st` (inclinaison), déjà pris dans `main`.

- [ ] **Step 8 : Commit**

```bash
git add src/components/chrome/TheatrePieces.tsx
git commit -m "feat(salle): les pièces se condensent hors de la poussière au lieu de s'allumer"
```

---

## Task 5 : la poussière cède quelque chose

**Files:**
- Modify: `src/components/chrome/TheatrePieces.tsx` (la pose du slot de poussière dans le `useFrame`)

- [ ] **Step 1 : Creuser `dustGain` pendant le passage**

Dans le `useFrame`, remplacer :

```ts
    xf[DUST_SLOT].set(c.cx, c.cy, c.cz, 1);
    // …et w = 1, LE DRAPEAU DE POUSSIÈRE, qui part au fragment via vDust (voir sa déclaration dans
    // le vertex). Les pièces gardent 0, posé juste au-dessus.
    rot[DUST_SLOT].set(0, 0, dustOn * g.dustGain, 1);
```

par :

```ts
    xf[DUST_SLOT].set(c.cx, c.cy, c.cz, 1);
    /*
     * LA POUSSIÈRE CÈDE QUELQUE CHOSE — une cloche, pas une rampe.
     *
     * `4·on·(1−on)` vaut EXACTEMENT 0 aux deux bouts, donc le facteur vaut 1 : la poussière seule
     * du noir peuplé (où `on` est encore nul) et la poussière de la salle posée sont inchangées
     * au bit près. Seul le PASSAGE creuse, et il se rebouche tout seul — y compris à la sortie,
     * puisque `on` redescend par la même cloche.
     *
     * Ce n'est pas une conservation et ça ne prétend pas l'être (30 000 grains contre ~140 000) :
     * c'est ce qui fait que la poussière n'est pas indifférente à ce qui naît dedans.
     */
    const give = 1 - (reduced ? 0 : g.dustGive) * 4 * on * (1 - on);
    // …et w = 1, LE DRAPEAU DE POUSSIÈRE, qui part au fragment via vDust (voir sa déclaration dans
    // le vertex). Les pièces gardent 0, posé juste au-dessus.
    rot[DUST_SLOT].set(0, 0, dustOn * g.dustGain * give, 1);
```

- [ ] **Step 2 : Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune sortie.

- [ ] **Step 3 : Commit**

```bash
git add src/components/chrome/TheatrePieces.tsx
git commit -m "feat(salle): l'air a l'air d'avoir donné la matière — la poussière creuse au passage"
```

---

## Task 6 : la vérification à l'écran, et le réglage

Les quatre nombres de la Task 2 sont des **points de départ**, pas des valeurs trouvées. Cette tâche les confronte à l'image et les fixe.

**Files:**
- Modify (peut-être) : `src/lib/theatreLook.ts` — les quatre valeurs

- [ ] **Step 1 : Se poser dans la fenêtre de naissance**

Dans la console du navigateur, sur `http://localhost:3000` :

```js
const raf = (n) => new Promise(r => { let i=0; const t=()=>{ if(++i>=n) return r(); requestAnimationFrame(t); }; requestAnimationFrame(t); });
// pousser jusqu'à ce que le poste soit formé ET habillé (sinon `dive` est bridé par `dressed`)
for (let y = 2500; y <= 9500; y += 100) {
  window.__lenis.scrollTo(y, { immediate: true }); await raf(2);
  const s = window.__form.state();
  if (s.mood.flat > 0.999 && s.mood.dev > 0.99) break;
}
await raf(20);
// puis piloter la naissance à la main
window.__form.workReveal.dive = 0.95; await raf(20);
window.__form.state().theatre.on;   // ≈ 0.45
```

- [ ] **Step 2 : Passer les six critères visuels de la spec**

À `dive` successivement 0,92 / 0,94 / 0,96 / 0,99 :

| # | Attendu |
|---|---|
| 6 | à `on ≈ 0,2` : des halos épars, **aucune silhouette lisible** |
| 7 | à `on ≈ 0,5` : la pièce de devant est presque prise, celle du fond encore en nuage — **la cascade se voit** |
| 8 | à `on = 1` : les quatre sont **identiques à aujourd'hui** (grains chez eux, effritement normal) |
| 9 | la poussière est plus faible à `on ≈ 0,5` qu'à `on = 0` **et** qu'à `on = 1` |
| 10 | en remontant (`workReveal.hallOut` monté à la main), les pièces se défont **en repartant dans leur halo, le fond d'abord** |

Le critère 8 est le plus important : si les pièces ne sont pas exactement l'image d'avant à `on = 1`, c'est que `born` ne s'annule pas — vérifier `(1.0 - bk)` et le facteur `(1.0 - RT.w)`.

- [ ] **Step 3 : Mesurer le coût**

Dans la salle (`dive` ≈ 0,99), relever la médiane du temps de frame sur 40 à 120 frames, comme le repo le fait ailleurs.
Expected: pas de variation mesurable. La naissance ajoute une dizaine d'opérations ALU par sommet et **aucune lecture de texture**, sur 140 000 points déjà dessinés. Une régression franche ici voudrait dire que `born` a été mis dans le fragment par erreur.

- [ ] **Step 4 : Régler les quatre nombres**

Le budget est de ≈ 0,84 s pour la cascade ET la vague. Ordre de réglage :

1. `birthReach` — si la convergence paraît sortir du noir plutôt que de la poussière, **baisser** (l'additif : un halo étalé est plus sombre par pixel qu'une pièce dense).
2. `birthCascade` — monter jusqu'à ce que la cascade se lise, s'arrêter avant que la dernière pièce ne finisse après `on = 1`.
3. `birthWave` — ce qui reste du budget.
4. `dustGive` — le creux doit se sentir sans que la salle ne clignote.

Si le geste ne se lit pas dans les 0,84 s, **le levier n'est pas dans ces quatre nombres** : c'est le film (`Work.tsx`) ou le seuil 0,915 de `formClock`. Élargir la fenêtre a été écarté à la conception (ça finit après que le scroll est rendu) — c'est cette décision qu'il faut rouvrir avec l'utilisateur, pas la contourner en douce.

- [ ] **Step 5 : Vérifier `reduced`**

Dans les préférences système, activer « réduire les animations », recharger, refaire la plongée.
Expected: les grains naissent chez eux, les quatre pièces ensemble, une simple montée d'alpha — aucune course.

- [ ] **Step 6 : Vérification finale et commit**

```bash
npx tsc --noEmit && npm test && npx eslint src/lib/theatre.ts src/lib/theatreLook.ts src/components/chrome/TheatrePieces.tsx src/components/chrome/ChromeCanvas.tsx
```
Expected: `tsc` muet, `# fail 0`, et pour `eslint` **aucune erreur NOUVELLE** — `ChromeTableau.tsx` porte déjà quatre erreurs `react-hooks` préexistantes, mais aucun des quatre fichiers de ce plan n'en avait avant.

```bash
git add src/lib/theatreLook.ts
git commit -m "tune(salle): les nombres de la naissance, trouvés à l'écran"
```

(Si le réglage n'a rien changé, sauter ce dernier commit plutôt que d'en faire un vide.)

---

## Auto-revue du plan

**1. Couverture de la spec.** Chaque section a sa tâche :

| Section de la spec | Tâche |
|---|---|
| Le mécanisme dans le vertex (`bd`, `bk`, `dir`, `born`) | Task 4, steps 1–2 |
| L'alpha : l'arrivée remplace le fondu | Task 4, step 2 (`vAlpha = alpha * mix(bk, RT.z, RT.w)`) |
| La cascade sans état ni tri | Task 1 + Task 4, step 5 |
| Où vit ce calcul (`theatre.ts`, pur, testé) | Task 1 |
| Neutralité prouvable à `cascade = 0` | Task 1, step 1, premier test |
| La poussière cède quelque chose | Task 5 |
| Reduced motion | Task 3 (plomberie) + Task 4 step 5 + Task 5 step 1 (usage) + Task 6 step 5 (vérif) |
| Les nombres | Task 2, réglés en Task 6 |
| Les fichiers | les cinq sont touchés, aucun autre |
| Critères testés 1–5 | Task 1, step 1 — un test chacun |
| Critères navigateur 6–11 | Task 6, steps 2–3 |
| Risques (budget, additif, tirage de direction) | Task 6 step 4 ; commentaires dans Task 2 (`birthReach`) et Task 4 step 2 (« ne pas simplifier ») |

Aucune lacune.

**2. Placeholders.** Aucun « TBD », aucun « gérer les cas limites », aucun « comme la tâche N ». Chaque étape qui touche du code montre le code. Le seul jugement laissé ouvert est le réglage des quatre nombres, qui est explicitement le sujet de la Task 6 et borné par une procédure et un critère d'échec.

**3. Cohérence des types et des noms.**

- `stationBirth(phi, stationPhi, on, cascade)` — même signature en Task 1 (définition), Task 1 step 1 (tests) et Task 4 step 5 (appel). ✔
- `birthReach` / `birthWave` / `birthCascade` / `dustGive` — mêmes noms en Task 2 (type + littéral), Task 4 (uniformes et `g.birthCascade`) et Task 5 (`g.dustGive`). ✔
- Uniformes `uBirthReach` / `uBirthWave` — déclarés en GLSL (Task 4 step 1), déclarés en JS (step 3), écrits (step 5). Les trois concordent. ✔
- `reduced` — prop déclarée en Task 3, lue en Task 4 step 5 et Task 5 step 1. ✔
- Variables GLSL `bd`, `bk`, `bz`, `brd`, `ban` — vérifiées contre celles déjà prises dans `main` (`pi`, `XF`, `RT`, `FX`, `r0`, `r1`, `w`, `rate`, `pick`, `base`, `ca`, `sa`, `ct`, `st`, `alpha`, `esc`, `ph`, `phGo`, `gust`, `e`, `k`, `world`, `mv`, `dist`). Aucune collision. ⚠ `k` existe déjà dans la branche `if (pick < w * rate)` — `bk` est distinct, et `born` est calculé HORS de cette branche, donc aucun conflit de portée. ✔
- `ease` et `TAU` — déjà définis en tête de `VERT`, réutilisés. ✔
