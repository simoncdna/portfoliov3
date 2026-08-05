# La plongée dans l'écran — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Après la dernière phrase du terminal, le scroll fait entrer la caméra dans l'écran du poste ; les cellules de phosphore s'ouvrent en corridor, on les traverse, et le noir arrive.

**Architecture:** Un quatrième scrub (`workReveal.dive`) du même genre que `form` et `away`. Les parties calculables — l'horloge de la séquence, la géométrie du corridor — sortent en modules **sans aucun import**, sur le précédent de `formChoreo.ts`, donc testables sous Node. Le tunnel est une `InstancedMesh` de cellules colorées par la MÊME `CanvasTexture` que le tube. Le poste ne peut pas dessiner le tunnel (plan proche), d'où un relais mesh-à-mesh comme crâne → poste.

**Tech Stack:** Next.js 16, React 19, R3F 9, three 0.185, GSAP/ScrollTrigger, Lenis, Theatre.js 0.7, `node --test` pour les modules purs.

**Spec:** `docs/superpowers/specs/2026-08-05-plongee-dans-lecran-design.md`

**Hors périmètre :** la scène des projets (spec #2). Ce plan s'arrête au noir.

---

## Structure des fichiers

| Fichier | Responsabilité | Testable Node |
|---|---|---|
| `src/lib/tubeSequence.ts` | **NOUVEAU.** L'horloge du terminal : `(t, lignes, cadences) → (ligne, caractères, frappe, fini)`. Zéro import. | oui |
| `src/lib/tunnelGeom.ts` | **NOUVEAU.** La géométrie du corridor : profondeur et échelle d'une tranche, recyclage. Zéro import. | oui |
| `src/lib/tubeScreen.ts` | **NOUVEAU.** Le canvas 512×384 et son pinceau, partagés entre le tube et le tunnel. | non (DOM) |
| `src/components/chrome/PixelTunnel.tsx` | **NOUVEAU.** L'`InstancedMesh` du corridor. | non |
| `src/lib/workReveal.ts` | `+ dive` | — |
| `src/sections/Work.tsx` | timeline de plongée ; retenue + accélération | non |
| `src/lib/formClock.ts` | `dive` dans `FormState` | — |
| `src/components/chrome/ChromeTableau.tsx` | consomme `tubeSequence` et `tubeScreen` ; fondu du poste ; détail macro | non |
| `src/components/chrome/ChromeCanvas.tsx` | monte `PixelTunnel` | non |

**Pourquoi ce découpage :** `ChromeTableau.tsx` fait déjà ~1300 lignes. Deux des blocs qu'on toucherait sont de la logique pure enfouie dans un `useFrame` — les sortir les rend testables ET allège le fichier au lieu de l'alourdir.

---

## Task 1 : `tubeSequence.ts` — l'horloge du terminal, extraite et testée

**Files:**
- Create: `src/lib/tubeSequence.ts`
- Create: `tests/tubeSequence.test.ts`
- Modify: `src/components/chrome/ChromeTableau.tsx` (le bloc de séquence dans le `useFrame`)

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `tests/tubeSequence.test.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sequenceAt, sequenceDuration } from "../src/lib/tubeSequence.ts";

const LINES = ["ab", "cde"];
const R = { idle: 1, char: 0.1, hold: 0.5 };

test("avant la fin de l'attente : rien de frappé", () => {
  assert.deepEqual(sequenceAt(0, LINES, R), { line: 0, chars: 0, typing: false, done: false });
  assert.deepEqual(sequenceAt(0.99, LINES, R), { line: 0, chars: 0, typing: false, done: false });
});

test("pendant la frappe de la première ligne", () => {
  // t = 1 + 0.15 → 1 caractère et demi de « ab » → 1
  const s = sequenceAt(1.15, LINES, R);
  assert.equal(s.line, 0);
  assert.equal(s.chars, 1);
  assert.equal(s.typing, true);
  assert.equal(s.done, false);
});

test("pendant la pause : la ligne est entière, la frappe est finie", () => {
  // « ab » = 0.2s, donc frappée à t = 1.2 ; pause jusqu'à 1.7
  const s = sequenceAt(1.4, LINES, R);
  assert.equal(s.line, 0);
  assert.equal(s.chars, 2);
  assert.equal(s.typing, false);
  assert.equal(s.done, false);
});

test("la ligne suivante démarre après la pause", () => {
  // 1 + 0.2 + 0.5 = 1.7 ; à 1.85 → 1 caractère de « cde »
  const s = sequenceAt(1.85, LINES, R);
  assert.equal(s.line, 1);
  assert.equal(s.chars, 1);
});

// L'INVARIANT QUI PORTE LA PLONGÉE. `done` est ce qui déverrouille le scroll : s'il
// arrivait trop tôt, la plongée démarrerait sur un texte inachevé ; s'il n'arrivait
// jamais, la page resterait bloquée. Les deux sont des pannes silencieuses.
test("done : faux jusqu'au dernier caractère de la dernière ligne, vrai ensuite", () => {
  const end = sequenceDuration(LINES, R); // 1 + 0.2 + 0.5 + 0.3 = 2.0
  assert.equal(end, 2);
  assert.equal(sequenceAt(1.99, LINES, R).done, false);
  assert.equal(sequenceAt(2, LINES, R).done, true);
  assert.equal(sequenceAt(999, LINES, R).done, true);
});

test("la dernière ligne se POSE : plus rien ne change après elle", () => {
  const a = sequenceAt(2.5, LINES, R);
  const b = sequenceAt(60, LINES, R);
  assert.deepEqual(a, b);
  assert.equal(a.line, 1);
  assert.equal(a.chars, 3);
});

// Deux lectures du même instant doivent dessiner la même image — c'est ce qui
// permet le rembobinage du panneau et le scrub de la section.
test("pure : même t, même résultat", () => {
  for (const t of [0, 0.5, 1.13, 1.7, 1.95, 3]) {
    assert.deepEqual(sequenceAt(t, LINES, R), sequenceAt(t, LINES, R));
  }
});

test("sequenceDuration somme attente, frappes et pauses intermédiaires", () => {
  // une seule ligne : pas de pause du tout
  assert.equal(sequenceDuration(["abc"], R), 1 + 0.3);
  // trois lignes : deux pauses
  assert.equal(sequenceDuration(["a", "b", "c"], R), 1 + 0.1 + 0.5 + 0.1 + 0.5 + 0.1);
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npx tsc --noEmit -p tests && node --test tests/tubeSequence.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/tubeSequence.ts'`

- [ ] **Step 3 : Écrire l'implémentation minimale**

Créer `src/lib/tubeSequence.ts` :

```ts
/**
 * L'HORLOGE DU TERMINAL, en fonction pure — AUCUN IMPORT, comme formChoreo, et pour la
 * même raison : ce module est importable depuis Node, donc son invariant se teste sans
 * navigateur ni framework. Voir tests/tubeSequence.test.ts.
 *
 * L'état est une FONCTION de l'instant, jamais un compteur avancé à la frame. Un compteur
 * dériverait, ne saurait pas rejouer, et ne saurait surtout pas répondre deux fois la même
 * chose au même temps — ce que le rembobinage du panneau et le scrub de la section exigent
 * tous les deux.
 */

export type Cadence = {
  /** L'attente au curseur nu avant la première lettre, secondes. */
  idle: number;
  /** Une lettre toutes les… secondes. */
  char: number;
  /** La pause après une ligne avant que la suivante commence, secondes. */
  hold: number;
};

export type SequenceState = {
  /** L'indice de la ligne courante. */
  line: number;
  /** Combien de caractères de cette ligne sont frappés. */
  chars: number;
  /** Une frappe est en cours (le curseur ne clignote pas pendant). */
  typing: boolean;
  /**
   * La séquence est arrivée au bout. C'EST CE QUI DÉVERROUILLE LA PLONGÉE — il vaut faux
   * une frame de trop et la plongée part sur un texte inachevé, il ne bascule jamais et la
   * page reste bloquée. Testé aux deux bords.
   */
  done: boolean;
};

/** Combien de temps la séquence entière prend. Les pauses sont INTERMÉDIAIRES : n-1, pas n. */
export function sequenceDuration(lines: readonly string[], r: Cadence): number {
  let d = r.idle;
  for (let i = 0; i < lines.length; i++) {
    d += lines[i].length * r.char;
    if (i < lines.length - 1) d += r.hold;
  }
  return d;
}

export function sequenceAt(t: number, lines: readonly string[], r: Cadence): SequenceState {
  const last = lines.length - 1;
  let rest = t - r.idle;
  if (rest <= 0) return { line: 0, chars: 0, typing: false, done: false };

  for (let i = 0; i <= last; i++) {
    const dur = lines[i].length * r.char;
    if (rest < dur) {
      const chars = Math.floor(rest / r.char);
      return { line: i, chars, typing: chars > 0, done: false };
    }
    rest -= dur;
    // La dernière ne cède pas la main : pas de pause à consommer, l'état se pose.
    if (i === last) return { line: i, chars: lines[i].length, typing: false, done: true };
    if (rest < r.hold) return { line: i, chars: lines[i].length, typing: false, done: false };
    rest -= r.hold;
  }
  // Inatteignable : la branche `i === last` retourne toujours. Présent pour le typage.
  return { line: last, chars: lines[last].length, typing: false, done: true };
}
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

Run: `npx tsc --noEmit -p tests && node --test tests/tubeSequence.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5 : Brancher ChromeTableau dessus, sans changer le comportement**

Dans `src/components/chrome/ChromeTableau.tsx`, ajouter l'import :

```ts
import { sequenceAt, type SequenceState } from "@/lib/tubeSequence";
```

Remplacer le bloc de dérivation dans le `useFrame` (celui qui commence par `const last = TV_LINES.length - 1;` et finit avant le commentaire « L'état comprend maintenant la MISE EN PAGE ») par :

```ts
    // L'horloge est sortie du fichier (tubeSequence) : c'était de la logique pure enfouie
    // dans un useFrame, donc intestable, dans un fichier qui n'avait pas besoin de grossir.
    let seq: SequenceState;
    if (reduced || pt.textFull) {
      const l = TV_LINES.length - 1;
      seq = { line: l, chars: TV_LINES[l].length, typing: false, done: true };
    } else {
      // Le garde compare flat — le nombre qui SNAPPE exactement à 1 dans formClock — et
      // jamais `dressed === 1` : la fenêtre dérivée (flat − 0.9) / 0.1 vaut
      // 0.9999999999999998 en flottant quand flat vaut exactement 1, et l'horloge ne
      // démarrait jamais. Une égalité stricte n'est licite que sur une valeur snappée.
      if (s.mood.dev > 0.55 && s.mood.flat === 1) tb.t += delta;
      else tb.t = 0;
      seq = sequenceAt(tb.t, TV_LINES, { idle: TYPE_IDLE, char: pt.textChar, hold: pt.textHold });
    }
    const line = seq.line;
    const chars = seq.chars;
    // Le curseur ne clignote qu'au repos — pendant la frappe il reste allumé, comme un vrai
    // terminal : c'est l'écho qui bat la mesure, pas le curseur.
    const cursorOn = seq.typing || (reduced || pt.textFull) || tb.t % (2 * BLINK) < BLINK;
```

- [ ] **Step 6 : Vérifier que rien n'a bougé à l'écran**

Run: `npx tsc --noEmit`
Expected: exit 0

Puis, navigateur : charger `/#work`, scroller jusqu'à `flat === 1 && dev === 1` (voir `window.__form.state()`), et vérifier que les trois phrases s'enchaînent comme avant, avec le même rythme.

- [ ] **Step 7 : Commit**

```bash
git add src/lib/tubeSequence.ts tests/tubeSequence.test.ts src/components/chrome/ChromeTableau.tsx
git commit -m "refactor(tube): l'horloge du terminal sort en module pur, et devient testable

Elle était de la logique pure enfouie dans un useFrame — intestable, dans un
fichier de 1300 lignes qui n'avait pas besoin de grossir. Sortie sur le
précédent de formChoreo : aucun import, donc importable depuis Node.

Elle gagne au passage \`done\`, l'invariant qui portera la plongée : faux une
frame de trop et la plongée part sur un texte inachevé, jamais vrai et la page
reste bloquée. Testé aux deux bords."
```

---

## Task 2 : `tunnelGeom.ts` — la géométrie du corridor, testée

**Files:**
- Create: `src/lib/tunnelGeom.ts`
- Create: `tests/tunnelGeom.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `tests/tunnelGeom.test.ts` :

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sliceZ, sliceScale, sliceCount, recycle } from "../src/lib/tunnelGeom.ts";

const Z0 = 2;
const G = 0.35;

// L'INVARIANT DU TUBE DROIT. échelle / distance doit être CONSTANT : c'est ce qui fait que
// toutes les tranches sous-tendent le même angle, donc que le corridor est droit. Un
// espacement linéaire avec une échelle géométrique donne un pavillon évasé — c'était
// l'erreur de la première rédaction du spec, corrigée à la relecture. Ce test est là pour
// qu'elle ne revienne pas.
test("échelle / distance est constant sur toutes les tranches", () => {
  const ref = sliceScale(0, G) / sliceZ(0, Z0, G);
  for (let k = 1; k < 16; k++) {
    const ratio = sliceScale(k, G) / sliceZ(k, Z0, G);
    assert.ok(Math.abs(ratio - ref) < 1e-12, `tranche ${k} : ${ratio} ≠ ${ref}`);
  }
});

test("la tranche 0 est à z0, à l'échelle 1 — c'est l'image plate", () => {
  assert.equal(sliceZ(0, Z0, G), Z0);
  assert.equal(sliceScale(0, G), 1);
});

test("les tranches s'éloignent et grossissent", () => {
  for (let k = 1; k < 8; k++) {
    assert.ok(sliceZ(k, Z0, G) > sliceZ(k - 1, Z0, G));
    assert.ok(sliceScale(k, G) > sliceScale(k - 1, G));
  }
});

// Le recyclage est ce qui rend la profondeur illimitée pour 16 tranches : une tranche
// dépassée par la caméra repart au fond. Sans lui, le tunnel a un fond visible.
test("recycle ramène dans [z0, z0·(1+g)^D)", () => {
  const D = 16;
  const span = Math.pow(1 + G, D);
  for (const travel of [0, 1, 5, 17.3, 200]) {
    for (let k = 0; k < D; k++) {
      const z = recycle(sliceZ(k, Z0, G), travel, Z0, G, D);
      assert.ok(z >= Z0 - 1e-9, `z=${z} sous le plancher (travel=${travel}, k=${k})`);
      assert.ok(z < Z0 * span + 1e-9, `z=${z} au-dessus du plafond (travel=${travel}, k=${k})`);
    }
  }
});

test("recycle à travel 0 est l'identité", () => {
  for (let k = 0; k < 16; k++) {
    const z = sliceZ(k, Z0, G);
    assert.ok(Math.abs(recycle(z, 0, Z0, G, 16) - z) < 1e-12);
  }
});

test("sliceCount : combien de tranches pour couvrir une profondeur donnée", () => {
  // z0·(1+g)^D ≥ far  →  D = ceil(log(far/z0) / log(1+g))
  assert.equal(sliceCount(Z0, G, Z0), 0);
  assert.equal(sliceCount(2, 1, 16), 3); // 2·2³ = 16
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npx tsc --noEmit -p tests && node --test tests/tunnelGeom.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/tunnelGeom.ts'`

- [ ] **Step 3 : Écrire l'implémentation minimale**

Créer `src/lib/tunnelGeom.ts` :

```ts
/**
 * LA GÉOMÉTRIE DU CORRIDOR — aucun import, testable sous Node (voir tests/tunnelGeom.test.ts),
 * sur le précédent de formChoreo.
 *
 * Le tunnel est la grille de cellules du terminal RÉPÉTÉE en profondeur. La tranche k est à
 * z₀·(1+g)^k et à l'échelle (1+g)^k — GÉOMÉTRIQUE DES DEUX CÔTÉS, et c'est tout l'invariant :
 * échelle/distance est alors constant, donc chaque tranche sous-tend le même angle et le
 * corridor est DROIT. Un espacement linéaire avec une échelle géométrique donne un pavillon
 * évasé ; c'est l'erreur qu'a faite la première rédaction du spec.
 *
 * Le recyclage tombe du même choix : une tranche dépassée repart au fond par une
 * multiplication, et seize tranches suffisent pour une profondeur illimitée.
 */

/** La profondeur de la tranche k. z₀ est celle de l'image plate. */
export const sliceZ = (k: number, z0: number, g: number): number => z0 * Math.pow(1 + g, k);

/** L'échelle de la tranche k. La tranche 0 vaut 1 : c'est l'image telle qu'à l'écran. */
export const sliceScale = (k: number, g: number): number => Math.pow(1 + g, k);

/** Combien de tranches pour couvrir de z₀ jusqu'à `far`. */
export const sliceCount = (z0: number, g: number, far: number): number =>
  Math.max(0, Math.ceil(Math.log(far / z0) / Math.log(1 + g)));

/**
 * La profondeur d'une tranche après que la caméra a avancé de `travel`, repliée dans
 * l'intervalle d'un cycle. Le repli se fait en LOG parce que l'espacement est géométrique :
 * soustraire puis tester « est-ce que je suis passé derrière » en linéaire raterait les
 * grands `travel` et coûterait une boucle.
 */
export function recycle(z: number, travel: number, z0: number, g: number, slices: number): number {
  const lg = Math.log(1 + g);
  const span = slices * lg;
  // Position dans le cycle, en unités logarithmiques depuis le plancher z0.
  let u = Math.log(z / z0) - travel * lg;
  u = ((u % span) + span) % span; // modulo toujours positif, y compris pour travel négatif
  return z0 * Math.exp(u);
}
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

Run: `npx tsc --noEmit -p tests && node --test tests/tunnelGeom.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5 : Commit**

```bash
git add src/lib/tunnelGeom.ts tests/tunnelGeom.test.ts
git commit -m "feat(tunnel): la géométrie du corridor, et l'invariant du tube droit

échelle/distance constant : c'est ce qui fait que toutes les tranches
sous-tendent le même angle, donc que le corridor est droit. Un espacement
linéaire avec une échelle géométrique donne un pavillon évasé — l'erreur de la
première rédaction du spec. Le test existe pour qu'elle ne revienne pas.

Le recyclage tombe du même choix : une tranche dépassée repart au fond par une
multiplication, donc seize tranches font une profondeur illimitée."
```

---

## Task 3 : `workReveal.dive` et sa timeline scrubbée

**Files:**
- Modify: `src/lib/workReveal.ts`
- Modify: `src/sections/Work.tsx` (à la suite de la timeline de sortie, vers la ligne 330)
- Modify: `src/lib/formClock.ts` (`FormState` et `state`)

- [ ] **Step 1 : Ajouter `dive` au singleton**

Dans `src/lib/workReveal.ts`, remplacer la dernière ligne par :

```ts
/**
 * `dive` (0..1) est la PLONGÉE : la traversée de l'écran du poste, après que le terminal a
 * fini de parler. Quatrième scrub de la section, du même genre que les trois autres — écrit
 * par une timeline GSAP, lu une fois par frame par l'horloge de la forme.
 *
 * Il ne démarre PAS tant que la séquence du terminal n'est pas finie : la section est
 * épinglée et Lenis arrêté jusque-là (voir Work.tsx). C'est le seul endroit du site où le
 * scroll est retenu, et c'est un choix assumé — atténué par le fait que scroller accélère
 * la frappe au lieu de ne rien faire.
 */
export const workReveal = { away: 0, form: 0, dive: 0 };
```

- [ ] **Step 2 : Le faire entrer dans FormState**

Dans `src/lib/formClock.ts`, ajouter au type `FormState` (près de `tableauOn`, ligne ~48) :

```ts
  /**
   * La plongée, 0..1 — la traversée de l'écran. Lue par ChromeTableau (fondu du poste,
   * détail macro) et par PixelTunnel (l'avance dans le corridor). Atténuée par tableauOn
   * comme le reste : hors du corridor de Work, il n'y a pas de plongée.
   */
  dive: number;
```

Ajouter au littéral `state` (ligne ~237) : `dive: 0,`

Et dans `advanceFormClock`, à côté de l'écriture de `state.tableauOn` (ligne ~494) :

```ts
  // La plongée est un scrub PUR : aucune inertie, aucun chase. Contrairement à la formation
  // (que l'horloge lisse pour donner du poids à la matière), une traversée doit coller à la
  // molette au pixel — c'est un déplacement du point de vue, pas de la matière, et un point
  // de vue qui traîne derrière la main lit comme une latence.
  state.dive = state.tableauOn * Math.max(0, Math.min(1, workReveal.dive));
```

- [ ] **Step 3 : Écrire la timeline scrubbée**

Dans `src/sections/Work.tsx`, après le bloc de la timeline de sortie (`outTl`, vers la ligne 358), ajouter :

```ts
      /*
       * LA PLONGÉE. Un scrub de plus, sur sa propre bande de scroll, placé APRÈS le repos du
       * poste et AVANT la sortie. `fromTo` et pas `to`, pour la même raison que les autres
       * timelines de ce fichier : un `to` scrubbé se rend à progress 0 au refresh et
       * enregistre la valeur courante comme point de départ, ce qui fige la plongée là où
       * elle était au dernier rechargement.
       */
      workReveal.dive = 0;
      const diveTl = gsap.timeline({
        scrollTrigger: {
          trigger: ref.current,
          start: "bottom-=140% bottom",
          end: "bottom-=40% bottom",
          scrub: 1,
        },
      });
      diveTl.fromTo(workReveal, { dive: 0 }, { dive: 1, ease: "none" }, 0);
```

- [ ] **Step 4 : Vérifier que le scrub court bien de 0 à 1**

Run: `npx tsc --noEmit`
Expected: exit 0

Navigateur : charger `/#work`, puis dans la console suivre `window.__form.state().dive` en scrollant.
Expected: la valeur monte de 0 à 1 sur la bande, redescend en remontant, et vaut **exactement 0** hors de Work (`tableauOn` l'atténue).

**Si `dive` reste à 0** : `workReveal.form` n'est écrit que par `Work.tsx`, et le même piège vaut ici — vérifier que `<Work/>` est bien monté dans `src/app/page.tsx`. C'est l'erreur qu'a faite le design de la caméra, documentée dans son spec.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/workReveal.ts src/lib/formClock.ts src/sections/Work.tsx
git commit -m "feat(work): workReveal.dive, le quatrième scrub de la section

Un scrub PUR, sans chase : une traversée est un déplacement du point de vue, pas
de la matière, et un point de vue qui traîne derrière la main lit comme une
latence. Atténué par tableauOn comme le reste — hors du corridor, pas de plongée."
```

---

## Task 4 : `tubeScreen.ts` — sortir la CanvasTexture, la partager

**Files:**
- Create: `src/lib/tubeScreen.ts`
- Modify: `src/components/chrome/ChromeTableau.tsx` (le `useMemo` `screen`, vers la ligne 780)

- [ ] **Step 1 : Extraire le canvas et son pinceau**

Créer `src/lib/tubeScreen.ts` en y déplaçant tel quel le contenu du `useMemo` `screen` de `ChromeTableau.tsx`, avec ses commentaires d'origine, sous la forme :

```ts
"use client";

import { CanvasTexture } from "three";
import { posteTweak } from "./posteTweak";

/**
 * LE CANVAS DU TUBE, sorti de ChromeTableau parce qu'il a maintenant DEUX consommateurs : le
 * tube du poste et le tunnel de pixels. Ce n'est pas une optimisation, c'est le sens de la
 * séquence — on entre dans les pixels de CETTE phrase-là, pas dans une texture qui lui
 * ressemble. Deux canvas se seraient désynchronisés à la première molette du panneau.
 *
 * 512×384 : le 4:3 du tube, et une résolution qui laisse le monospace net sans peser. Le vert
 * est le P1 des phosphores de terminal, pas un vert d'écran moderne.
 *
 * Créé PARESSEUSEMENT : ce module est importé par des composants rendus côté serveur, et
 * `document` n'y existe pas.
 */

export const LINE_STEP = 1.5;

type Screen = { tex: CanvasTexture; draw: (line: number, chars: number, cursorOn: boolean) => void };

let screen: Screen | null = null;

export function tubeScreen(lines: readonly string[]): Screen {
  if (screen) return screen;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 384;
  const x = c.getContext("2d")!;
  const tex = new CanvasTexture(c);
  tex.flipY = false;
  const draw = (line: number, chars: number, cursorOn: boolean) => {
    // (corps identique à celui de ChromeTableau aujourd'hui, commentaires compris —
    // il lit posteTweak.get() à l'instant de peindre, et `lines` remplace TV_LINES)
  };
  draw(0, 0, true);
  screen = { tex, draw };
  return screen;
}
```

**Le corps de `draw` est déplacé sans être réécrit.** Recopier l'existant, y compris les commentaires sur le phosphore, le curseur qui suit la frappe, et l'empilement.

- [ ] **Step 2 : Brancher ChromeTableau dessus**

Remplacer le `useMemo` `screen` par :

```ts
  const screen = useMemo(() => tubeScreen(TV_LINES), []);
```

et importer `tubeScreen` et `LINE_STEP` depuis `@/lib/tubeScreen` (supprimer la constante `LINE_STEP` locale).

- [ ] **Step 3 : Vérifier que rien n'a bougé**

Run: `npx tsc --noEmit && npx eslint src/lib/tubeScreen.ts`
Expected: exit 0 des deux

Navigateur : la séquence des trois phrases est identique, et les molettes « Texte X/Y », « Corps », « Halo » du panneau agissent toujours.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/tubeScreen.ts src/components/chrome/ChromeTableau.tsx
git commit -m "refactor(tube): le canvas sort de ChromeTableau, il a deux consommateurs

Le tunnel doit échantillonner LE MÊME canvas que le tube : c'est le sens de la
séquence — on entre dans les pixels de cette phrase-là. Deux canvas se seraient
désynchronisés à la première molette du panneau."
```

---

## Task 5 : `PixelTunnel.tsx` — l'InstancedMesh

**Files:**
- Create: `src/components/chrome/PixelTunnel.tsx`
- Modify: `src/components/chrome/ChromeCanvas.tsx` (monter le tunnel à côté de `ChromeTableau`)

- [ ] **Step 1 : Construire le mesh**

Créer `src/components/chrome/PixelTunnel.tsx`. Points obligatoires :

- `InstancedMesh` sur une `BoxGeometry(1, 1, 1)`, `COLS = 48`, `ROWS = 36`, `SLICES = 16` → 27 648 instances.
- Deux `InstancedBufferAttribute` : `aCell` (vec2, l'uv du centre de la cellule dans le canvas) et `aSlice` (float, `k`).
- Uniformes : `uScreen` (la texture partagée), `uTravel` (l'avance, dérivée de `s.dive`), `uZ0`, `uG`, `uSlices`, `uRest` (la couleur du phosphore au repos), `uFade`.
- Le placement en vertex shader utilise **exactement** les formules de `tunnelGeom` — `z = uZ0 * pow(1+uG, k)` puis le recyclage en log — pour que le test unitaire couvre réellement ce que le GPU dessine :

```glsl
  float lg = log(1.0 + uG);
  float span = uSlices * lg;
  float u = log(uZ0 * pow(1.0 + uG, aSlice) / uZ0) - uTravel * lg;
  u = mod(mod(u, span) + span, span);
  float z = uZ0 * exp(u);
  float sc = z / uZ0;              // échelle ∝ distance : l'invariant du tube droit
```

- La couleur : `texture2D(uScreen, aCell).rgb + uRest`. **Les cellules éteintes existent** — un masque de phosphore couvre tout l'écran, pas seulement la partie allumée ; sans `uRest`, le canvas étant noir à 95 %, le corridor serait une bande lumineuse.
- L'atténuation avec la distance, pour que le point de fuite soit sombre.
- `frustumCulled = false` sur le mesh : les instances sont déplacées en vertex shader, donc la boîte englobante que three calcule est fausse et il découperait le tunnel.

- [ ] **Step 2 : Le monter, éteint**

Dans `ChromeCanvas.tsx`, à côté de `<ChromeTableau/>`. Le composant sort tôt (`if (fade <= 0.001) { mesh.visible = false; return; }`) pour ne rien coûter hors de la plongée.

- [ ] **Step 3 : Vérifier qu'il n'apparaît pas encore**

Run: `npx tsc --noEmit`
Expected: exit 0

Navigateur : la page est **identique** à avant sur toutes les sections — `uFade` est piloté par `s.dive`, qui vaut 0 partout sauf sur la bande de plongée, et on n'a pas encore branché la caméra.

- [ ] **Step 4 : Mesurer le coût, avant de continuer**

C'est le critère 6 du spec, et il se mesure ici pendant que le tunnel est encore isolable.

Run: dans le navigateur, sur la section Work, en dpr plein — relever le temps de frame avec le tunnel monté puis avec son `<PixelTunnel/>` commenté.
Expected: écart < 2 ms. **Si l'écart est plus grand**, réduire `SLICES` de 16 à 12 puis 8 AVANT de toucher `COLS`/`ROWS` : la profondeur se remarque moins que la résolution.

Consigner le chiffre mesuré en commentaire dans le fichier. Le Hero de ce dépôt a été ramené de 30 à 51 FPS en supprimant du travail par frame ; un budget se mesure.

- [ ] **Step 5 : Commit**

```bash
git add src/components/chrome/PixelTunnel.tsx src/components/chrome/ChromeCanvas.tsx
git commit -m "feat(tunnel): le corridor de phosphore, 27648 cellules instanciées

Les cellules ÉTEINTES existent aussi : un masque de phosphore couvre tout
l'écran, pas seulement la partie allumée. Sans la couleur de repos, le canvas
étant noir à 95 %, le corridor serait une bande lumineuse.

frustumCulled = false : les instances sont déplacées en vertex shader, donc la
boîte que three calcule est fausse et il découpait le tunnel."
```

---

## Task 6 : Le relais — caméra, fondu du poste, détail macro

**Files:**
- Modify: `src/lib/cameraStage.ts` (seconde feuille Theatre)
- Modify: `src/lib/formClock.ts` (la pose lit `dive`)
- Modify: `src/components/chrome/ChromeTableau.tsx` (fondu, détail macro)

- [ ] **Step 1 : La trajectoire caméra**

Ajouter une seconde feuille dans `cameraStage.ts` — `project.sheet("Work dive")` — avec les mêmes quatre props, et un `seekDive(scrub)` jumeau de `seek`, **avec la même garde « n'écrit que si la valeur a changé »** (écrire `sequence.position` à chaque frame déclenche la machinerie de dérivation de Theatre pour rien).

Dans `formClock`, la pose devient la composition des deux : l'entrée d'abord, puis la plongée par-dessus.

Rester dans `cameraStage` est délibéré : c'est « le seul fichier du projet qui connaît Theatre.js », et une trajectoire caméra née ailleurs casserait cet isolement.

- [ ] **Step 2 : Le fondu du poste, et son invariant**

Dans `ChromeTableau`, le poste s'éteint sur `s.dive` ∈ [0.35, 0.5].

**L'ordre est un invariant à vérifier, pas à supposer** : le fondu doit être COMPLET avant que le plan proche de la caméra atteigne le verre. Sinon on voit l'intérieur du boîtier, ses matériaux étant en `DoubleSide`. C'est le défaut le plus probable de cette feature (critère 4 du spec).

- [ ] **Step 3 : Le détail macro du tube**

Sur `s.dive` ∈ [0, 0.35], dans `FRAG_FRAME` : densifier `scan`, ajouter une frange RVB, monter le bloom — la `f13` de la référence.

- [ ] **Step 4 : Vérifier le relais image par image**

Navigateur : poser `dive` à 0.30, 0.36, 0.42, 0.48, 0.52 et capturer chaque état.
Expected: aucune image ne montre l'intérieur du boîtier ; aucun trou noir entre l'extinction du poste et l'apparition du tunnel.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/cameraStage.ts src/lib/formClock.ts src/components/chrome/ChromeTableau.tsx
git commit -m "feat(dive): le relais poste → tunnel

Le poste ne PEUT pas dessiner le tunnel : dès que le plan proche traverse le
verre, ses fragments passent derrière la caméra. Le relais est obligatoire, pas
esthétique — le même passage de témoin mesh-à-mesh que crâne → poste.

Son fondu doit être terminé AVANT le franchissement, sinon on voit l'intérieur
du boîtier (DoubleSide). Vérifié image par image."
```

---

## Task 7 : La retenue du scroll, et son accélération

**Files:**
- Modify: `src/sections/Work.tsx`

Placé en dernier **volontairement** : c'est la partie la plus risquée (un `lenis.stop()` orphelin fige la page entière sans autre symptôme qu'une molette morte), et tout ce qui précède se vérifie sans elle.

- [ ] **Step 1 : La retenue**

`pin` ScrollTrigger sur la section plus `lenis.stop()` tant que `seq.done` est faux, à partir du moment où la séquence démarre (`dev > 0.55 && flat === 1`).

**`lenis.start()` sur TOUS les chemins de sortie** : séquence finie, démontage du composant (le `return` du `useGSAP`), `prefers-reduced-motion`, et retour arrière du scroll au-dessus de la section. Un chemin oublié fige la page.

- [ ] **Step 2 : L'accélération**

Un écouteur `wheel` pendant la retenue avance `tb.t` d'un incrément par cran, en plus du `delta` de la frame, borné par `sequenceDuration()`. Le geste est répondu ; sans ça, dix secondes de molette morte lisent comme une page cassée.

- [ ] **Step 3 : Les huit critères du spec, un par un**

Reprendre `docs/superpowers/specs/2026-08-05-plongee-dans-lecran-design.md`, section « Critères de vérification », et les passer tous.

Le critère 3 en particulier : **la page scrolle encore** après la section, dans les deux sens, après démontage, et avec le préchargeur et le `ControlPanel` — qui touchent déjà Lenis.

- [ ] **Step 4 : Commit**

```bash
git add src/sections/Work.tsx
git commit -m "feat(dive): la retenue du scroll, et le geste qui y répond

Choix assumé contre l'avis donné au design : tant que les trois phrases ne sont
pas dites, la plongée ne démarre pas. Mais scroller ACCÉLÈRE la frappe au lieu
de ne rien faire — sans ça, dix secondes de molette morte lisent comme une page
cassée.

lenis.start() sur tous les chemins de sortie, y compris le démontage : un stop()
orphelin fige la page sans autre symptôme qu'une molette inerte."
```

---

## Auto-revue du plan

**Couverture du spec** — chaque section a sa tâche : découpage (périmètre, en-tête) · disposition du scroll (T3) · retenue et accélération (T7) · tunnel (T2 géométrie, T5 mesh) · relais (T6) · détail macro (T6) · texture partagée (T4) · fichiers (tableau) · critères (T5 step 4 pour le budget, T6 step 4 pour le relais, T7 step 3 pour les huit).

**Molettes de réglage** — le spec liste `posteTweak` dans ses fichiers touchés ; aucune tâche ne les ajoute. **C'est délibéré** : les valeurs de `uZ0`, `uG` et `uRest` se trouvent d'abord en dur, et n'ont besoin d'une molette que si les premières valeurs ne conviennent pas. Ajouter le panneau avant de savoir si on en a besoin serait du travail spéculatif.

**Cohérence des noms** — `sequenceAt`/`sequenceDuration`/`SequenceState`/`Cadence` (T1) ; `sliceZ`/`sliceScale`/`sliceCount`/`recycle` (T2) ; `workReveal.dive` et `state.dive` (T3) ; `tubeScreen`/`LINE_STEP` (T4). Les formules GLSL de T5 reprennent celles de T2 à l'identique, ce qui est le but : le test unitaire couvre ce que le GPU dessine.

**Zéro placeholder** dans T1 à T4, qui portent le code complet. T5 à T7 décrivent des shaders et une intégration Lenis dont les valeurs se trouvent par la mesure ; chacune porte son critère chiffré et sa consigne de repli plutôt qu'un nombre inventé.
