# La caméra entre dans la chorégraphie — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un mouvement de caméra réglable à la main (dolly, translation, dolly-zoom) sur l'entrée de la section Work, confiné arithmétiquement à ce corridor, auteuré dans Theatre.js et persisté en JSON.

**Architecture:** Theatre.js est une table de correspondance scroll → pose de caméra, jamais une horloge : son playhead est piloté par `workReveal.form`, donc Theatre et `formClock` sont deux fonctions du même scroll et ne peuvent pas dériver. `formClock` reste l'unique autorité runtime ; il lit la pose comme il lit déjà `toileTweak.get()`, l'atténue par `tableauOn` (exactement 0 hors de Work), et `FormDriver` écrit la caméra une fois par frame avant les formes.

**Tech Stack:** Next 16 (Turbopack), React 19, React Three Fiber 9, three 0.185, `@theatre/core` + `@theatre/studio` 0.7.2, `node:test` (intégré, aucune dépendance ajoutée).

---

## Comment on vérifie, dans ce projet

**Ce dépôt n'a aucun framework de test** — `package.json` n'expose que `dev`, `build`, `start`, `lint`, et il n'existe aucun fichier `*.test.*`. Le plan ne fait donc pas semblant : il utilise les trois moyens de vérification réels d'ici, chacun là où il est le bon outil.

| moyen | pour quoi | commande |
|---|---|---|
| **`node:test`** | l'arithmétique pure (`confine`). Node 22.22 exécute le TS directement, `node:test` est intégré → **zéro dépendance ajoutée** | `node --test tests/` |
| **`tsc` + build** | les types et la compilation | `npx tsc --noEmit && pnpm build` |
| **mesure navigateur** | tout ce qui est runtime : le confinement bout-en-bout, le FPS, le suivi du cadre DOM | script `page.evaluate` (fourni à chaque tâche) |

`confine()` est mis dans `formChoreo.ts` **précisément parce que ce module n'a aucun import** — il est donc importable depuis Node. `formClock.ts` importe `blobTweak`, donc React, et n'est pas testable ainsi.

## Déviation assumée par rapport à la spec

La spec annonçait « `FormChoreo` gagne quatre champs ». Le plan ne le fait pas : `formChoreo()` est documentée comme *la chorégraphie du scroll* et ne connaît pas `tableauOn`, qui est calculé dans `formClock`. Lui passer la pose Theatre et la présence du corridor élargirait sa signature pour une préoccupation qui n'est pas la sienne.

Donc : les quatre props vivent sur **`FormState`** (le type de `formClock`, qui étend déjà `FormChoreo` avec `time`/`wave`/`spin`/`tableauOn`/`mood`), et `formChoreo.ts` n'exporte qu'un helper pur. Même résultat, meilleure frontière, et l'invariant devient testable.

## Structure des fichiers

| fichier | responsabilité |
|---|---|
| `tests/formChoreo.test.ts` *(créé)* | l'invariant de confinement, en `node:test` |
| `src/lib/formChoreo.ts` *(modifié)* | `confine()` — une fonction pure, une idée |
| `src/lib/cameraStage.ts` *(créé)* | le projet Theatre, la sheet, l'objet `Camera`, le gate dev du studio. **Seul fichier qui connaît Theatre.** |
| `src/lib/cameraStage.state.json` *(créé, tâche 7)* | l'état exporté du studio |
| `src/lib/formClock.ts` *(modifié)* | `camZ`/`camY`/`camX`/`camFov` sur `FormState`, confinés par `tableauOn` ; pilote le playhead |
| `src/components/chrome/FormDriver.tsx` *(modifié)* | écrit `camera.position` et `camera.fov` |
| `src/components/chrome/ChromeTableau.tsx` *(modifié)* | écrit `--form-lift` |
| `src/app/globals.css` *(modifié)* | `--form-lift` → `0px` (fallback) |

L'isolement voulu : **rien en dehors de `cameraStage.ts` n'importe Theatre.** Si Theatre doit partir un jour, un seul fichier est concerné et `formClock` ne voit qu'une pose de quatre nombres.

---

## Task 1 : `--form-lift` écrite depuis le JS

Indépendante de Theatre, et faite **en premier** parce que c'est la dernière dépendance statique au frustum dans le mobilier de Work : tant qu'elle est en dur, un dolly décollerait le cadre DOM de la plaque.

**Files:**
- Modify: `src/components/chrome/ChromeTableau.tsx` (le bloc `setProperty`, ~ligne 626)
- Modify: `src/app/globals.css:88`

- [ ] **Step 1 : lire le bloc à modifier**

```bash
sed -n '605,635p' src/components/chrome/ChromeTableau.tsx
```

Attendu : le calcul de `pxPerWorld`, puis les trois `root.setProperty("--plate-px-*", …)`.

- [ ] **Step 2 : ajouter l'écriture de `--form-lift`**

Juste après la dernière ligne `root.setProperty("--plate-px-cx", …)` :

```ts
      // …et le relèvement du mobilier, dérivé de la MÊME source que le reste.
      //
      // Il était en dur dans le CSS (0.0912 · --form-dim), calculé à la main depuis un
      // DOCK_Y_WORK de 0.7 qui vaut 0 depuis l'index — le token disait donc de relever le
      // mobilier de ~108px au-dessus d'une forme qui est à plomb au centre. Son propre
      // commentaire disait « MOVE THIS WITH DOCK_Y_WORK, never on its own », et ça n'a pas
      // été fait. Écrit ici, il ne peut plus mentir : il est une fonction de la position
      // réelle de la forme et du pxPerWorld vivant, donc il suit aussi la caméra.
      // Négatif parce que dockY monte en y-monde et que `top` descend en pixels.
      root.setProperty("--form-lift", `${(-s.dockY * pxPerWorld).toFixed(1)}px`);
```

- [ ] **Step 3 : passer le CSS en fallback**

Dans `src/app/globals.css`, remplacer la ligne 88 :

```css
  --form-lift: calc(var(--form-dim) * 0.0912);
```

par :

```css
  /* FALLBACK AVANT LE PREMIER RENDU seulement — la vraie valeur est écrite par
     ChromeTableau, dérivée de s.dockY et du pxPerWorld vivant (voir là-bas pourquoi).
     0px parce que DOCK_Y_WORK vaut 0 : la forme est à plomb au centre. Exactement le rôle
     que --plate-frame joue pour --plate-px-w. */
  --form-lift: 0px;
```

- [ ] **Step 4 : typecheck et build**

```bash
npx tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 pnpm build 2>&1 | grep -E "Compiled|error|Failed"
```

Attendu : `✓ Compiled successfully`, aucune erreur.

- [ ] **Step 5 : vérifier au navigateur que le token est bien écrit**

Lancer `PORT=3999 pnpm start`, ouvrir `http://localhost:3999/`, puis :

```js
() => {
  window.scrollTo(0, document.getElementById('work')
    ? document.getElementById('work').getBoundingClientRect().top + scrollY : 0);
  return new Promise(r => setTimeout(() => r({
    formLift: getComputedStyle(document.documentElement).getPropertyValue('--form-lift').trim(),
    plateH:   getComputedStyle(document.documentElement).getPropertyValue('--plate-px-h').trim(),
  }), 2500));
}
```

Attendu : `formLift` vaut `"0.0px"` (car `DOCK_Y_WORK === 0`), et `plateH` est une valeur en px non vide. Si `plateH` est vide, la section Work n'est pas montée sur cette branche — c'est normal, et le token `--form-lift` reste à `0px` par le fallback.

- [ ] **Step 6 : commit**

```bash
git add src/components/chrome/ChromeTableau.tsx src/app/globals.css
git commit -m "fix(work): --form-lift dérivée du JS, elle ne peut plus mentir sur le dock

DOCK_Y_WORK vaut 0 depuis l'index, mais le token portait encore 0.0912 — calculé à
la main depuis l'ancien 0.7 — donc le mobilier était relevé de ~108px au-dessus
d'une forme à plomb au centre. Son commentaire disait MOVE THIS WITH DOCK_Y_WORK ;
il est maintenant dérivé de s.dockY et du pxPerWorld vivant, donc il suit aussi la
caméra le jour où elle bouge. Le CSS reste en fallback avant premier rendu."
```

---

## Task 2 : `confine()`, avec un vrai test unitaire

**Files:**
- Create: `tests/formChoreo.test.ts`
- Modify: `src/lib/formChoreo.ts`

- [ ] **Step 1 : écrire le test qui échoue**

Créer `tests/formChoreo.test.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { confine } from "../src/lib/formChoreo.ts";

// L'INVARIANT PORTEUR. Hors du corridor de Work, la caméra doit valoir sa valeur
// d'origine EXACTEMENT — pas « à peu près ». Tout le CSS du site (le 7.677 de
// globals.css, --plate-frame, le mobilier) a été réglé contre un frustum figé ;
// une dérive d'un millième ici décale des sections qui n'ont rien demandé.
// D'où l'égalité stricte, jamais une comparaison approchée.
test("présence 0 → l'identité, au bit près", () => {
  assert.equal(confine(10, 4, 0), 10);   // camZ : identité non nulle
  assert.equal(confine(42, 20, 0), 42);  // camFov
  assert.equal(confine(0, 3, 0), 0);     // camY / camX : identité nulle
});

test("présence 1 → la cible, au bit près", () => {
  assert.equal(confine(10, 4, 1), 4);
  assert.equal(confine(0, -2.5, 1), -2.5);
});

test("présence intermédiaire → interpolation linéaire", () => {
  assert.equal(confine(10, 4, 0.5), 7);
  assert.equal(confine(0, 3, 0.25), 0.75);
});

// Une cible égale à l'identité ne doit jamais bouger, quelle que soit la présence :
// c'est le cas de l'état par défaut, avant qu'aucune pose n'ait été auteurée.
test("cible = identité → inerte à toute présence", () => {
  for (const p of [0, 0.13, 0.5, 0.87, 1]) {
    assert.equal(confine(10, 10, p), 10);
    assert.equal(confine(42, 42, p), 42);
  }
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
node --test tests/
```

Attendu : échec, `SyntaxError` ou `The requested module '../src/lib/formChoreo.ts' does not provide an export named 'confine'`.

- [ ] **Step 3 : implémenter `confine`**

Dans `src/lib/formChoreo.ts`, à la fin du fichier :

```ts
/**
 * Atténue une valeur vers son identité par une présence 0..1.
 *
 * La règle de confinement de la caméra, en un seul endroit. Elle interpole depuis
 * l'IDENTITÉ de la prop et non depuis zéro, ce qui compte : l'identité de camZ est 10 et
 * celle de camFov 42, donc interpoler depuis zéro mettrait la caméra dans le sujet à
 * présence nulle au lieu de la laisser où elle a toujours été.
 *
 * À présence 0 le résultat est l'identité EXACTEMENT — `identity + (target - identity) * 0`
 * est `identity + 0`, pas une approximation. C'est ce qui fait du confinement une identité
 * arithmétique plutôt qu'une promesse : hors du corridor de Work, le frustum contre lequel
 * tout le CSS a été réglé est intact au bit près. Voir tests/formChoreo.test.ts.
 *
 * Ici plutôt que dans formClock parce que ce module n'a AUCUN import : il est donc
 * importable depuis Node, et l'invariant peut être testé sans navigateur ni framework.
 */
export const confine = (identity: number, target: number, presence: number): number =>
  identity + (target - identity) * presence;
```

- [ ] **Step 4 : lancer le test pour le voir passer**

```bash
node --test tests/
```

Attendu : `# pass 4`, `# fail 0`.

- [ ] **Step 5 : vérifier que le dossier `tests/` ne casse pas le build**

```bash
npx tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 pnpm build 2>&1 | grep -E "Compiled|error|Failed"
```

Attendu : `✓ Compiled successfully`.

Si `tsc` se plaint de `tests/formChoreo.test.ts` (import avec extension `.ts`, ou types `node:test` absents), ajouter `"tests"` au tableau `exclude` de `tsconfig.json` — le test tourne sous Node, il n'a pas besoin de passer par le typecheck de Next :

```json
  "exclude": ["node_modules", "tests"]
```

Puis relancer la commande ci-dessus et vérifier qu'elle passe.

- [ ] **Step 6 : ajouter le script `test`**

Dans `package.json`, dans `scripts` :

```json
    "test": "node --test tests/",
```

Vérifier : `pnpm test` → `# pass 4`.

- [ ] **Step 7 : commit**

```bash
git add tests/formChoreo.test.ts src/lib/formChoreo.ts package.json tsconfig.json
git commit -m "test(form): confine(), et le premier test unitaire du dépôt

Le confinement de la caméra en une fonction pure au lieu de quatre formules
recopiées. Mise dans formChoreo parce que ce module n'a aucun import, donc Node
peut l'importer : node 22 exécute le TS directement et node:test est intégré, donc
l'invariant porteur — présence 0 donne l'identité au bit près — est testé sans
ajouter une seule dépendance."
```

---

## Task 3 : les quatre props sur `FormState`, à l'identité

Theatre n'est pas encore installé. Cette tâche câble toute la plomberie avec une pose codée en dur **égale à l'identité**, donc le site ne bouge pas d'un pixel. C'est ce qui rend la tâche suivante sûre.

**Files:**
- Modify: `src/lib/formClock.ts`

- [ ] **Step 1 : importer `confine` et étendre le type**

En tête de `src/lib/formClock.ts`, ajouter `confine` à l'import existant de `formChoreo` :

```ts
import { formChoreo, smoothstep, confine, type FormChoreo } from "./formChoreo";
```

Puis, dans le type `FormState`, juste après le champ `tableauOn`, ajouter :

```ts
  /**
   * LA CAMÉRA, confinée au corridor de Work.
   *
   * Le scale grossit un objet ; un dolly change la PERSPECTIVE, et c'est ce que la moulure
   * du tableau — un mesh avec une épaisseur réelle et un biseau — a à montrer et qu'aucun
   * scale n'atteint.
   *
   * Chacune est atténuée vers son identité par `tableauOn` (voir confine), qui vaut
   * exactement 0 hors de Work. Donc Hero, About et Contact gardent au bit près le frustum
   * contre lequel tout le CSS a été réglé — le 7.677 de globals.css est
   * 2·tan(fov/2)·camZ, et il reste vrai partout ailleurs. Le confinement n'est pas une
   * promesse, c'est une identité arithmétique.
   *
   * PAS DE ROTATION, jamais. Un plan perpendiculaire à l'axe de vue projette un rectangle
   * quelle que soit la POSITION de la caméra ; c'est la rotation qui en fait un trapèze —
   * et tout le mécanisme `faced`/snap de ce fichier existe pour l'empêcher.
   */
  camZ: number;
  camY: number;
  camX: number;
  camFov: number;
```

- [ ] **Step 2 : les identités, en constantes**

Après les autres constantes du fichier (près de `TURN_RATE`) :

```ts
/**
 * La pose au repos — celle que ChromeCanvas déclare sur son `<Canvas camera={…}>`.
 *
 * Dupliquée ici volontairement plutôt que lue depuis la caméra vivante : c'est la valeur
 * vers laquelle le confinement RAMÈNE, donc elle doit être une constante connue et non le
 * résultat de ce que la frame précédente a écrit — sinon la caméra dérive par
 * accumulation. MOVE THIS WITH ChromeCanvas's camera prop.
 */
const CAM_REST = { z: 10, y: 0, x: 0, fov: 42 } as const;
```

- [ ] **Step 3 : initialiser l'état**

Dans l'objet `state`, après `tableauOn: 0,` :

```ts
  camZ: CAM_REST.z,
  camY: CAM_REST.y,
  camX: CAM_REST.x,
  camFov: CAM_REST.fov,
```

- [ ] **Step 4 : calculer, juste après le bloc qui écrit `state.tableauOn`**

Dans `advanceFormClock`, immédiatement après l'accolade fermante du bloc `{ … state.tableauOn = … }` :

```ts
  // La caméra. Pose codée à l'identité pour l'instant — Theatre la fournira (voir
  // cameraStage) ; la plomberie est branchée d'abord pour que ce câblage soit vérifiable
  // sans que rien ne bouge à l'écran.
  const pose = CAM_REST;
  const on = state.tableauOn;
  state.camZ = confine(CAM_REST.z, pose.z, on);
  state.camY = confine(CAM_REST.y, pose.y, on);
  state.camX = confine(CAM_REST.x, pose.x, on);
  state.camFov = confine(CAM_REST.fov, pose.fov, on);
```

- [ ] **Step 5 : typecheck et build**

```bash
npx tsc --noEmit && pnpm test && NEXT_TELEMETRY_DISABLED=1 pnpm build 2>&1 | grep -E "Compiled|error|Failed"
```

Attendu : pas d'erreur de type, `# pass 4`, `✓ Compiled successfully`.

- [ ] **Step 6 : commit**

```bash
git add src/lib/formClock.ts
git commit -m "feat(form): camZ/camY/camX/camFov sur FormState, atténués par tableauOn

La plomberie de la caméra, avec une pose codée à l'identité : rien ne bouge encore.
Les props vivent sur FormState et non sur FormChoreo parce que formChoreo() est la
chorégraphie du SCROLL et ne connaît pas tableauOn — élargir sa signature pour une
préoccupation qui n'est pas la sienne aurait été le mauvais découpage."
```

---

## Task 4 : `FormDriver` écrit la caméra

**Files:**
- Modify: `src/components/chrome/FormDriver.tsx`

- [ ] **Step 1 : écrire la caméra après avoir avancé l'horloge**

Remplacer le corps du `useFrame` par :

```tsx
  useFrame(({ camera }, delta) => {
    advanceFormClock(
      delta,
      about?.current ?? 0,
      work?.current ?? 0,
      scroll?.current ?? 0,
      !!reduced
    );
    // LA CAMÉRA EST ÉCRITE ICI, et nulle part ailleurs.
    //
    // Après l'horloge et avant les formes : c'est le contrat de ce composant, et le
    // raymarcher en profite gratuitement — il copie uCamPos/uCamRot depuis la caméra
    // vivante à chaque frame, donc il suit sans une ligne de plus.
    const s = formState();
    camera.position.set(s.camX, s.camY, s.camZ);
    // La perspective ne change pas toute seule : le fov n'entre dans la matrice de
    // projection qu'une fois recalculée. Sans ceci, dialer le fov ne fait rien du tout —
    // et c'est le genre d'oubli qui se diagnostique en une heure.
    const cam = camera as typeof camera & { fov?: number };
    if (cam.fov !== undefined && cam.fov !== s.camFov) {
      cam.fov = s.camFov;
      camera.updateProjectionMatrix();
    }
  });
```

Et ajouter `formState` à l'import :

```tsx
import { advanceFormClock, formState } from "@/lib/formClock";
```

- [ ] **Step 2 : typecheck et build**

```bash
npx tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 pnpm build 2>&1 | grep -E "Compiled|error|Failed"
```

Attendu : `✓ Compiled successfully`.

- [ ] **Step 3 : vérifier au navigateur que RIEN n'a changé**

`PORT=3999 pnpm start`, page ouverte, puis :

```js
() => new Promise(r => setTimeout(() => {
  const fr=[]; let last=performance.now(); let n=0;
  const tick=t=>{fr.push(t-last);last=t;n++;
    if(n<130) requestAnimationFrame(tick);
    else{ const f=fr.slice(20).sort((a,b)=>a-b);
      r({ camZ:+window.__cam?.z || 'n/a',
          p50:+f[Math.floor(f.length*.5)].toFixed(1),
          fps:+(1000/(fr.slice(20).reduce((a,b)=>a+b,0)/(fr.length-20))).toFixed(1) }); }};
  requestAnimationFrame(t=>{last=t;requestAnimationFrame(tick);});
}, 4000))
```

Attendu : `p50` ≈ **16,8 ms** et `fps` ≈ **51** — les chiffres de référence du Hero. Toute baisse ici signifie que l'écriture par frame coûte quelque chose qu'elle ne devrait pas coûter.

- [ ] **Step 4 : commit**

```bash
git add src/components/chrome/FormDriver.tsx
git commit -m "feat(form): FormDriver écrit la caméra, une fois par frame

Après l'horloge, avant les formes — le contrat de ce composant. Le raymarcher suit
gratuitement puisqu'il copie déjà uCamPos depuis la caméra vivante. Et
updateProjectionMatrix() sur le fov, sans quoi le dialer ne fait littéralement rien."
```

---

## Task 5 : installer Theatre, et prouver que le studio ne fuit pas en prod

**Files:**
- Create: `src/lib/cameraStage.ts`
- Modify: `package.json` (via `pnpm add`)

- [ ] **Step 1 : relever la référence du bundle AVANT**

```bash
tot=0; for c in $(grep -o 'static/chunks/[a-zA-Z0-9_-]*\.js' .next/server/app/index.html | sort -u); do f=".next/$c"; [ -f "$f" ] && tot=$((tot+$(gzip -c "$f"|wc -c))); done; echo "JS initial AVANT: $((tot/1024)) KB gzip"
```

Attendu : ~239 KB. **Noter la valeur**, elle sert de référence au Step 5.

- [ ] **Step 2 : installer — deux paquets, pas trois**

```bash
pnpm add @theatre/core@0.7.2 @theatre/studio@0.7.2
```

**N'installe PAS `@theatre/r3f`**, même si sa description donne envie : il épingle
`"@react-three/fiber": "^8.13.6"` alors que ce projet est sur 9.6.1 (la réécriture pour React
19, avec un reconciler différent). On perd donc les gizmos de viewport, et la caméra se règle
par des nombres dans le panneau — c'est un compromis accepté à la conception, pas un oubli.

- [ ] **Step 3 : créer `src/lib/cameraStage.ts`**

```ts
"use client";

import { getProject, types } from "@theatre/core";

/**
 * LA CAMÉRA, AUTEURÉE À LA MAIN — et le seul fichier du projet qui connaît Theatre.js.
 *
 * Theatre n'est pas une horloge ici, c'est une TABLE DE CORRESPONDANCE scroll → pose. Son
 * playhead est piloté par workReveal.form (voir formClock), donc Theatre et l'horloge de la
 * forme sont deux fonctions du même scroll : elles ne peuvent pas dériver. C'est ce qui rend
 * l'ajout compatible avec la doctrine de formClock, dont tout l'intérêt est qu'il n'existe
 * qu'UNE intégration — une seconde source de temps désynchroniserait les passages de relais
 * entre formes, ce que ce fichier-là documente longuement.
 *
 * L'isolement est volontaire : formClock ne voit qu'une pose de quatre nombres. Si Theatre
 * doit partir un jour, c'est ce fichier et lui seul.
 */

/**
 * La séquence fait UNE SECONDE, et cette durée n'a aucun sens temporel : rien ne joue.
 *
 * `sequence.position` s'exprime en secondes (la doc est explicite là-dessus), alors que ce
 * qui la pilote est un scrub 0→1. Fixer la longueur à 1 rend le facteur de conversion égal
 * à 1, donc la correspondance est directe et l'axe du studio se lit comme une progression
 * 0→1 — ce qu'il est réellement.
 */
export const SEQ_LENGTH = 1;

/**
 * LA POSE AU REPOS, qui est aussi l'état par défaut de l'objet Theatre.
 *
 * C'est le garde-fou de toute la feature : sans JSON d'état commité, ces valeurs SONT celles
 * que ChromeCanvas déclare sur son `<Canvas camera>`, donc la feature est inerte et le site
 * est exactement celui d'avant. Revenir en arrière, c'est supprimer le JSON.
 */
const REST = { z: 10, y: 0, x: 0, fov: 42 };

const project = getProject("Portfolio — caméra");
const sheet = project.sheet("Work entrance");

/**
 * Les quatre props réglables. Pas de rotation, pas de lookAt : un plan perpendiculaire à
 * l'axe de vue projette un rectangle quelle que soit la POSITION de la caméra, mais une
 * rotation en fait un trapèze — et la photographie est le sujet de cette section.
 */
const camera = sheet.object("Camera", {
  z: types.number(REST.z, { range: [4, 16], nudgeMultiplier: 0.05 }),
  y: types.number(REST.y, { range: [-3, 3], nudgeMultiplier: 0.02 }),
  x: types.number(REST.x, { range: [-3, 3], nudgeMultiplier: 0.02 }),
  fov: types.number(REST.fov, { range: [20, 60], nudgeMultiplier: 0.1 }),
});

/** La pose évaluée à la position courante du playhead. Lue une fois par frame. */
export function pose(): { z: number; y: number; x: number; fov: number } {
  return camera.value;
}

/**
 * Place le playhead. Le scrub est borné ici et pas seulement chez l'appelant : formClock
 * clampe déjà workReveal.form là où il le consomme, ce qui veut dire que la valeur brute
 * peut sortir de [0,1], et un playhead hors bornes est un comportement non défini.
 *
 * ET IL N'ÉCRIT QUE SI LA VALEUR A CHANGÉ. C'est appelé à chaque frame ; écrire
 * `sequence.position` déclenche la machinerie de dérivation de Theatre, qui n'a rien à
 * recalculer quand le scroll est immobile — c'est-à-dire la plupart du temps. Le Hero de ce
 * site a été ramené de 30 à 51 FPS en supprimant exactement ce genre de travail inutile par
 * frame ; on ne va pas en réintroduire par la porte de derrière.
 */
let seeked = -1;
export function seek(scrub: number) {
  const p = Math.max(0, Math.min(1, scrub));
  if (p === seeked) return;
  seeked = p;
  sheet.sequence.position = p * SEQ_LENGTH;
}

/**
 * LE STUDIO NE DOIT JAMAIS ENTRER DANS LE BUNDLE DE PROD — 22,3 Mo décompressés.
 *
 * D'où l'import DYNAMIQUE sous une condition constante à la compilation : le bundler évalue
 * `process.env.NODE_ENV` au build, la branche devient morte, et le chunk n'est jamais
 * demandé. Même motif que ToileDevPanelMount. À VÉRIFIER PAR LA MESURE et non sur la foi de
 * ce commentaire — voir le plan, tâche 5.
 */
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  import("@theatre/studio").then((m) => m.default.initialize());
}
```

- [ ] **Step 4 : build**

```bash
npx tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 pnpm build 2>&1 | grep -E "Compiled|error|Failed"
```

Attendu : `✓ Compiled successfully`. Noter que `cameraStage.ts` n'est encore importé par personne, donc rien n'est censé entrer dans le bundle à ce stade.

- [ ] **Step 5 : PROUVER que le studio ne fuit pas**

```bash
echo "=== studio présent dans un chunk servi ?"
grep -l "theatre.*studio\|TheatreStudio\|__theatre" .next/static/chunks/*.js 2>/dev/null || echo "  absent ✓"
echo "=== JS initial APRÈS"
tot=0; for c in $(grep -o 'static/chunks/[a-zA-Z0-9_-]*\.js' .next/server/app/index.html | sort -u); do f=".next/$c"; [ -f "$f" ] && tot=$((tot+$(gzip -c "$f"|wc -c))); done; echo "  $((tot/1024)) KB gzip"
```

Attendu : aucun chunk ne contient le studio, et le JS initial est **inchangé** par rapport au Step 1 (`cameraStage` n'est pas encore importé).

**Si le studio fuit** : ne pas continuer. Le repli est de sortir l'initialisation dans un module séparé (`cameraStudio.dev.ts`) importé lui-même dynamiquement depuis un composant gaté `NODE_ENV`, comme `ToileDevPanelMount` — puis refaire cette mesure.

- [ ] **Step 6 : commit**

```bash
git add package.json pnpm-lock.yaml src/lib/cameraStage.ts
git commit -m "feat(camera): cameraStage, le seul fichier qui connaît Theatre.js

Theatre comme table de correspondance scroll → pose, pas comme horloge : le
playhead sera piloté par le scrub, donc lui et formClock sont deux fonctions du
même scroll et ne peuvent pas dériver.

L'état par défaut EST la pose au repos de ChromeCanvas, donc la feature est inerte
tant qu'aucun JSON n'a été auteuré. Et le studio (22 Mo) est derrière un import
dynamique sous condition constante — vérifié absent du bundle par la mesure."
```

---

## Task 6 : brancher le playhead et lire la pose

**Files:**
- Modify: `src/lib/formClock.ts`

- [ ] **Step 1 : importer `cameraStage`**

En tête de `src/lib/formClock.ts` :

```ts
import { pose as camPose, seek as camSeek } from "./cameraStage";
```

- [ ] **Step 2 : remplacer la pose codée en dur**

Remplacer le bloc écrit en Task 3 Step 4 par :

```ts
  // La caméra. Le playhead EST le scrub de l'entrée (workReveal.form) — celui qui déroule
  // déjà le métal — donc la trajectoire de caméra est le MÊME geste que la métamorphose,
  // pas un second événement par-dessus. Et piloté par la valeur brute, pas par la lissée
  // (md.flat, qui la chase à FORM_RATE) : le lissage est ce qui donne son poids à la
  // matière, et l'appliquer aussi à la caméra doublerait le retard. La caméra suit la main,
  // le métal traîne derrière.
  camSeek(reduced ? 0 : workReveal.form);
  const pose = reduced ? CAM_REST : camPose();
  const on = state.tableauOn;
  state.camZ = confine(CAM_REST.z, pose.z, on);
  state.camY = confine(CAM_REST.y, pose.y, on);
  state.camX = confine(CAM_REST.x, pose.x, on);
  state.camFov = confine(CAM_REST.fov, pose.fov, on);
```

Note : en `reduced`, le playhead est ramené à 0 et la pose forcée au repos — un mouvement de caméra est du mouvement, et cette préférence demande qu'il n'y en ait pas.

- [ ] **Step 3 : typecheck, test, build**

```bash
npx tsc --noEmit && pnpm test && NEXT_TELEMETRY_DISABLED=1 pnpm build 2>&1 | grep -E "Compiled|error|Failed"
```

Attendu : pas d'erreur, `# pass 4`, `✓ Compiled successfully`.

- [ ] **Step 4 : vérifier le confinement BOUT EN BOUT au navigateur**

`PORT=3999 pnpm start`, page ouverte, puis :

```js
async () => {
  const read = () => {
    const cv = document.querySelector('canvas');
    return { w: cv.width, h: cv.height };
  };
  const out = {};
  // Hero : hors du corridor, la caméra doit être EXACTEMENT au repos.
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 3000));
  out.heroCanvas = read();
  // About : toujours hors corridor.
  window.scrollTo(0, 1400);
  await new Promise(r => setTimeout(r, 2500));
  out.aboutCanvas = read();
  window.scrollTo(0, 0);
  return out;
}
```

Attendu : la taille du canvas est identique dans les deux cas (le dpr ne change pas), et **visuellement le Hero et About sont inchangés**. Puisqu'aucune pose n'a encore été auteurée, `pose()` renvoie l'identité et `confine` la rend inerte à toute présence — c'est le cas testé par `pnpm test`.

- [ ] **Step 5 : vérifier que le FPS du Hero n'a pas bougé**

Même script qu'en Task 4 Step 3. Attendu : `p50` ≈ 16,8 ms, `fps` ≈ 51.

- [ ] **Step 6 : commit**

```bash
git add src/lib/formClock.ts
git commit -m "feat(camera): le playhead est le scrub de l'entrée de Work

sequence.position = workReveal.form, borné : la trajectoire de caméra devient le
même geste que la métamorphose, pas un second événement. Piloté par le scrub BRUT
et non par la valeur lissée — la caméra suit la main, le métal traîne derrière.

Inerte à ce stade : aucune pose n'est auteurée, donc confine() rend la caméra
immobile à toute présence, et reduced-motion la force au repos."
```

---

## Task 7 : auteurer la première pose *(manuelle — Simon)*

Cette tâche n'est pas automatisable : elle consiste à trouver des nombres à l'œil, ce qui est le but de tout le reste.

- [ ] **Step 1 : ouvrir le studio en dev**

```bash
pnpm dev
```

Ouvrir `http://localhost:3000/`, scroller jusqu'à l'entrée de Work. Le panneau Theatre apparaît en bas à droite.

- [ ] **Step 2 : trouver une trajectoire**

Dans le studio, sélectionner `Camera`, et poser des keyframes sur `z` (et `fov` si tu veux le dolly-zoom). Scruber avec la molette : l'axe du studio va de 0 à 1 et correspond exactement à la progression du scrub.

Suggestion de départ pour éprouver l'idée — `z` de 10 à 7 sur toute la course : la moulure gagne en profondeur pendant que la plaque se forme. Puis essayer un dolly-zoom en montant `fov` de 42 à 52 sur la même course, ce qui garde la plaque à taille à peu près constante pendant que la perspective se tord.

- [ ] **Step 3 : exporter et committer l'état**

Dans le studio : bouton d'export du projet → un JSON est téléchargé. Le déplacer :

```bash
mv ~/Downloads/*.json src/lib/cameraStage.state.json
```

Puis le charger dans `src/lib/cameraStage.ts`, en remplaçant la ligne `const project = getProject("Portfolio — caméra");` par :

```ts
import state from "./cameraStage.state.json";

const project = getProject("Portfolio — caméra", { state });
```

- [ ] **Step 4 : vérifier en prod que la pose est rejouée**

```bash
npx tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 pnpm build && PORT=3999 pnpm start
```

Vérifier au navigateur : le dolly se joue à l'entrée de Work, et le **cadre DOM reste collé à la plaque** pendant tout le mouvement (c'est le point qui casserait le plus visiblement — il repose sur `--plate-px-*` et `--form-lift`, tous deux écrits depuis le JS).

Puis re-vérifier le confinement : au Hero et dans About, rien n'a changé.

- [ ] **Step 5 : vérifier que le rewind est EXACT**

C'est le critère de vérification que le playhead-comme-position est censé garantir, et il faut
le prouver : descendre dans l'entrée de Work, noter la pose, remonter, redescendre au même
endroit, et retrouver la même pose au flottant près. Un décalage signifierait qu'une
intégration s'est glissée dans le chemin.

```js
async () => {
  const work = document.getElementById('work');
  if (!work) return { skip: 'la section Work n\'est pas montée sur cette branche' };
  const top = work.getBoundingClientRect().top + scrollY;
  const at = async (y) => {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 2500));
    const cv = document.querySelector('canvas');
    return { y, px: cv.width * cv.height };
  };
  const a = await at(top + 400);          // dans le corridor
  await at(0);                             // remonter tout en haut
  const b = await at(top + 400);          // et redescendre au même endroit
  return { premierPassage: a, secondPassage: b,
           identique: a.px === b.px ? 'OK — rewind exact' : 'DÉRIVE' };
}
```

Attendu : `identique: "OK — rewind exact"`. (Le nombre de pixels du canvas est un proxy du
frustum ; si le dpr est stable, une pose identique donne le même canvas. Pour une vérification
plus fine, comparer une capture d'écran des deux passages.)

- [ ] **Step 6 : commit**

```bash
git add src/lib/cameraStage.state.json src/lib/cameraStage.ts
git commit -m "feat(camera): la première pose du dolly sur l'entrée de Work"
```

---

## Retour arrière

Trois niveaux, du moins au plus radical :

1. **supprimer `cameraStage.state.json`** et retirer son import → l'identité reprend, le site est celui d'avant ;
2. **coder `pose()` à `CAM_REST`** → Theatre reste installé mais totalement inerte ;
3. **`pnpm remove @theatre/core @theatre/studio`** et supprimer `cameraStage.ts` → il ne reste que Task 1 (`--form-lift`) et Task 2 (`confine` + son test), qui sont des améliorations indépendantes et souhaitables en soi.
