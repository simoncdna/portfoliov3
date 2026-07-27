# La rafale (planche → fiche projet) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliquer le nom d'un projet dans Work fait grandir et exploser le métal à l'écran, d'où il ressort reformé à côté de la fiche du projet ; le geste inverse ramène la planche.

**Architecture:** Un singleton mutable (`plateBurst.t`, un seul nombre) écrit par un timeline GSAP joué et lu une fois par frame par `formClock` — l'idiome exact de `aboutReveal` / `workReveal`. `formChoreo` transforme ce nombre en dock / échelle / rage (une impulsion `t·(1−t)·4`, comme `spinBoost`), donc toutes les représentations du métal suivent sans code supplémentaire. La fiche est une couche portalisée dans `body` (obligatoire : `.plate-group` porte un `transform`, donc c'est un containing block pour `position: fixed`, et `.plate-screen` est en `overflow: hidden`). Le verrou de scroll devient compté dans `pageScroll.ts` pour que le ControlPanel et la fiche ne se volent pas Lenis.

**Tech Stack:** Next 16.2.11 (App Router, client components), React 19.2, GSAP 3.15 + `@gsap/react`, three 0.185 / R3F 9, Lenis 1.3, Tailwind 4 + CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-07-27-plate-burst-design.md`

---

## Comment on vérifie (lis ça d'abord)

**Ce repo n'a aucun runner de test** — `package.json` n'expose que `dev`, `build`, `lint`. Il n'y a ni vitest, ni jest, ni playwright installé en dépendance. Le TDD au sens strict ne s'applique donc pas, et **ce plan n'ajoute pas de framework de test** : monter vitest + jsdom pour couvrir deux fonctions pures d'un prototype de mouvement serait du théâtre, et le sujet (une transition WebGL de 1,15 s) n'est pas testable là où il compte par une assertion.

À la place, chaque tâche se termine par des vérifications réelles et exécutables :

| Commande | Ce qu'elle prouve |
|---|---|
| `npx tsc --noEmit` | Les types tiennent. **Attendu : aucune sortie.** |
| `pnpm lint` | ESLint (`eslint-config-next`) passe. **Attendu : aucun warning.** |
| `pnpm dev` puis vérification navigateur | Le comportement. Chaque tâche dit quoi regarder et ce qu'on doit voir. |

Les vérifications navigateur se font avec le MCP Chrome DevTools ou Playwright (déjà utilisés sur ce repo — voir `.playwright-mcp/`). Pour chacune, l'URL est `http://localhost:3000` et la section Work s'atteint en scrollant jusqu'à ce que la pièce soit centrée dans son cadre de notches (environ 60 % de la page ; le raccourci fiable est de cliquer un des numéros `01`–`04`, qui scrolle sur la planche).

**Le hook de debug de la tâche 1 est ce qui rend les tâches 2 et 5 vérifiables** : `window.plateBurst.t = 0.5` dans la console reproduit n'importe quel instant du voyage, à l'arrêt, pour le regarder.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `src/lib/plateBurst.ts` | **Créer.** Le signal (`t`) et les durées du voyage. Rien d'autre — ni easing, ni DOM. | 1 |
| `src/lib/formChoreo.ts` | **Modifier.** Traduire `t` en dock / échelle / rage. Les cinq constantes de la rafale. | 2 |
| `src/lib/formClock.ts` | **Modifier.** Lire `plateBurst.t` et le passer à `formChoreo`. Trois lignes. | 2 |
| `src/components/chrome/LiquidDna.tsx` | **Modifier.** Appliquer la rage aux uniformes `uMoodD` / `uSpike`. Deux lignes. | 2 |
| `src/lib/pageScroll.ts` | **Modifier.** Le verrou compté (`lockPageScroll` / `unlockPageScroll`). | 3 |
| `src/components/SmoothScroll.tsx` | **Modifier.** Le ControlPanel devient un client du verrou. | 3 |
| `src/components/PlateDetails.tsx` | **Créer.** La fiche : scrim, flash, contenu. Portalisée. Possède son propre reveal. | 4, 5 |
| `src/app/globals.css` | **Modifier.** Le nom devient un `<button>` ; les styles de la fiche. | 4 |
| `src/sections/Work.tsx` | **Modifier.** Le déclencheur, le timeline de la matière, le gel de la marche. | 4, 5 |

**Frontière entre Work et PlateDetails** : Work possède `plateBurst.t` et la coquille de la planche. PlateDetails possède ses trois couches (scrim, flash, lignes) et les anime depuis sa seule prop `open`. Aucun des deux ne requête le DOM de l'autre — c'est ce qui évite un `document.querySelector` à travers le portal.

---

### Task 1: Le signal

**Files:**
- Create: `src/lib/plateBurst.ts`

- [ ] **Step 1: Écrire le fichier**

Créer `src/lib/plateBurst.ts` :

```ts
"use client";

/**
 * The plate → sheet burst: how far the metal is along its journey to the project's
 * detail sheet.
 *
 * A plain mutable singleton, like aboutReveal and workReveal: written by a GSAP
 * timeline (in Work), read once a frame by the form clock. What makes it one NUMBER
 * rather than a set of them is deliberate — the violence of the burst is DERIVED from
 * this one value in formChoreo (`t · (1 − t) · 4`, an impulse peaking mid-journey,
 * exactly as spinBoost is), so nothing can contradict anything: a rage at full tilt on
 * a form that has already reformed is not a state this can be in.
 *
 * Note what is NOT here: no easing. The other singletons in this family are scrubbed by
 * the scroll, which is quantised, so the clock smooths them. This one is written by a
 * timeline running on GSAP's own ticker — the same frame as the render — so it arrives
 * smooth. Easing it again would lag the pulse and drift the peak out of step with the
 * flash that is supposed to cover it.
 */
export const plateBurst = {
  /** 0 = the plate, 1 = the sheet. The journey, not the state. */
  t: 0,
};

/**
 * The journey's length (ms). Over the 500ms ceiling the motion tokens set for UI
 * transitions, and allowed to be: this is a reveal, and reveals are exempt.
 */
export const BURST_MS = 1150;
/**
 * When the sheet's own lines start arriving, i.e. after the metal has peaked and is
 * on its way back down. Read by PlateDetails as its reveal delay.
 */
export const SHEET_IN_MS = 700;
/** Where the chrome flash peaks, and how long it lasts. It covers the DOM swap. */
export const FLASH_PEAK_MS = 480;
export const FLASH_MS = 120;

// A debug hook, dev only: `window.plateBurst.t = 0.5` freezes the journey at any
// instant so it can be looked at. This module is a client module but Next still renders
// it on the server, hence the window guard.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as { plateBurst: typeof plateBurst }).plateBurst = plateBurst;
}
```

- [ ] **Step 2: Vérifier les types**

Run: `npx tsc --noEmit`
Expected: aucune sortie.

- [ ] **Step 3: Vérifier le lint**

Run: `pnpm lint`
Expected: aucun warning. (Si ESLint se plaint du `as unknown as`, c'est le seul cast du fichier et il est justifié par le commentaire — ne pas le supprimer, ajuster la forme.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/plateBurst.ts
git commit -m "feat(burst): le signal — un seul nombre pour tout le voyage"
```

---

### Task 2: Ce que la matière en fait

À la fin de cette tâche, `window.plateBurst.t = 0.5` dans la console noie l'écran de chrome, et `= 1` pose la pièce à gauche en petit. Il n'y a encore ni fiche, ni clic.

**Files:**
- Modify: `src/lib/formChoreo.ts`
- Modify: `src/lib/formClock.ts`
- Modify: `src/components/chrome/LiquidDna.tsx`

- [ ] **Step 1: Ajouter les constantes de la rafale à `formChoreo.ts`**

Après `export const DOCK_X_AFTER = 3.6;` (ligne 29), insérer :

```ts
/**
 * Where the piece stands on the detail sheet — About's own dock, reused: the sheet
 * reads on the right, so the metal holds the left. That is the site's reading layout.
 */
export const DOCK_X_DETAILS = -3.6;

/**
 * The size it settles at on the sheet. Under WORK_SCALE (0.62) on purpose: on the
 * plate the piece IS the subject, on its sheet the words are.
 */
const DETAILS_SCALE = 0.5;

/**
 * The scale the metal reaches at the peak of the burst.
 *
 * Derived, not chosen. FORM_RADIUS is 2.1 and the camera sits at z = 10 with a 42°
 * fov, so the world it sees is 7.677 tall — a half-diagonal of ≈ 7.8 at 16:9 on the
 * z = 0 plane. 2.1 × 3.6 ≈ 7.6, plus the surged displacement on top: the screen is
 * drowned. And 7.6 stays well short of the camera's own 10 — a thorn that reaches the
 * camera starts the ray INSIDE the field, which is a flat wash of colour, not metal.
 *
 * Touch FORM_RADIUS, the camera's z or its fov and this number has to move with them.
 */
export const BURST_PEAK_SCALE = 3.6;

/**
 * The rage's gain on the project's own displacement, and the thorns it grows. Read by
 * the representations (see LiquidDna) rather than folded into the eased silhouette —
 * `state.mood` is mutated in place and eased every frame, so writing a pulse into it
 * would poison the next frame's easing and the metal would never come back to the
 * project's form.
 *
 * Both are deliberately modest, and `spike` is the one to lower first if the peak
 * speckles: thorns are steep, so they shorten the raymarcher's stride (the uSpike term
 * in stepK) and it only has 96 steps. The flash already covers the worst frame, so
 * there is nothing to be gained by pushing them — the SCALE is what drowns the screen.
 */
export const BURST_DISTORT = 2.0;
export const BURST_SPIKE = 0.35;
```

- [ ] **Step 2: Ajouter `rage` au type `FormChoreo`**

Dans `src/lib/formChoreo.ts`, à la fin du type `FormChoreo` (après `skullOn: number;`) :

```ts
  /**
   * The burst's violence: an impulse, not a level — 1 at mid-journey, 0 at both ends,
   * where the form is meant to be settled. Computed here rather than in the clock so
   * that the scale's swell and the field's rage cannot disagree about where the peak is.
   */
  rage: number;
```

- [ ] **Step 3: Prendre `burst` en 5ᵉ argument et l'appliquer**

Remplacer la signature et le corps de `formChoreo` (lignes 123-175) par :

```ts
export function formChoreo(
  about: number,
  exit: number,
  work: number,
  after: number,
  burst = 0
): FormChoreo {
  const a = clamp01(about);
  const x = clamp01(exit);
  const w = clamp01(work);
  const f = clamp01(after);
  const b = clamp01(burst);

  // The exit, in three overlapping beats. They overlap on purpose: the form should
  // read as one continuous movement — walking back into the middle while swelling,
  // and already softening into the sphere before it has finished swelling — rather
  // than as three cues played in turn.
  const home = smoothstep(0, 0.5, x); // leaves the left dock, back to centre
  const grow = smoothstep(0.15, 0.8, x); // takes the space the text vacated

  // The skull unmakes itself into the resting sphere — and hands the frame back to
  // the liquid on the way, since the handover reverses as pres falls.
  //
  // That handover lives in a NARROW range of pres (0.16 → 0.02) for a reason: it
  // is the only stretch where the mesh is still close enough to a sphere for the
  // cross-fade to hide. Widening it would show the swap. What it needed instead was
  // more SCROLL inside the same range — so pres falls quickly to the top of the
  // window and then crawls through it, giving the cross-fade about a fifth of the
  // exit beat rather than the sliver it got when pres ran linearly to zero.
  const fall = smoothstep(0.35, 0.8, x); // 1 → the top of the handover window
  const cross = smoothstep(0.8, 1.0, x); // …then through it, slowly
  const pres = a * ((1 - fall) * (1 - HANDOVER_OUT) + HANDOVER_OUT * (1 - cross));

  // The burst's impulse. Same shape as spinBoost below, and for the same reason: what
  // this describes is an event, not a destination.
  const rage = b * (1 - b) * 4;
  // …and the burst's own settling, which is NOT linear in b. The piece has to hold the
  // centre while it drowns the screen — walking to its dock through the flood would
  // leave the far edge of the viewport uncovered at the very frame that has to be
  // covered — so the travel is weighted entirely into the second half, where the metal
  // is coming back down.
  const settle = smoothstep(0.45, 1, b);

  const baseX = DOCK_X * a * (1 - home) + DOCK_X_WORK * w * (1 - f) + DOCK_X_AFTER * f;
  const baseScale =
    ((1 + grow * EXIT_SCALE) * (1 - w) + WORK_SCALE * w) * (1 - f) + AFTER_SCALE * f;
  const settleScale = baseScale * (1 - b) + DETAILS_SCALE * b;

  return {
    pres,
    // Two docks, summed rather than switched: About's left one is released by the
    // exit (`home` → 1) exactly as Work's centre one is claimed, so the form makes
    // one continuous crossing of the stage instead of teleporting between sides.
    // …and once Work is over, the form slides off the centre to the right dock: the
    // last term wins over Work's 0 rather than being added to it, and the lift and
    // the display size are released on the same signal, so the piece is put away as
    // one gesture instead of three. The sheet's own dock is the same override again.
    dockX: baseX * (1 - settle) + DOCK_X_DETAILS * settle,
    // The lift is released with the travel: on the sheet the piece stands BESIDE its
    // text, not above it, so there is nothing below it to make room for.
    dockY: DOCK_Y_WORK * w * (1 - f) * (1 - settle),
    // Swells for the crossing, settles down to display size inside its frame — and the
    // burst's swell is an additive pulse on top of that crossing: at the peak `rage` is
    // 1, so the scale is exactly BURST_PEAK_SCALE, and at both ends the pulse is 0 and
    // the rest of the choreography is untouched.
    scale: settleScale + rage * (BURST_PEAK_SCALE - (baseScale + DETAILS_SCALE) * 0.5),
    // A pulse, not a level: this is a rate that gets integrated, and `exit` stays
    // at 1 for the whole rest of the page — so anything monotonic in x would leave
    // the blob spinning four times too fast forever. Peaks mid-crossing, zero at
    // both ends, where the form is supposed to be settled.
    spinBoost: x * (1 - x) * 4.8,
    handover: smoothstep(HANDOVER_IN, HANDOVER_OUT, pres),
    skullOn: smoothstep(0, HANDOVER_IN * 1.5, pres),
    rage,
  };
}
```

Mettre également à jour le bloc de doc `@param` juste au-dessus (lignes 111-122) en y ajoutant :

```
 * @param burst 0..1 progress of the plate → sheet burst, written by a played timeline
 *              (plateBurst.t). Like `after` it OVERRIDES rather than adds: the piece
 *              leaves the plate for the sheet's own dock. Unlike every other input
 *              here it is not eased on the way in — see plateBurst.
```

- [ ] **Step 4: Lire le signal dans `formClock.ts`**

Ajouter l'import en haut de `src/lib/formClock.ts`, sous `import { workReveal }` :

```ts
import { plateBurst } from "./plateBurst";
```

Puis, dans `advanceFormClock`, remplacer la ligne 159 :

```ts
  const c = formChoreo(eased, reduced ? 0 : aboutReveal.exit, easedWork, easedAfter);
```

par :

```ts
  // Not eased, unlike its four neighbours: a played timeline on GSAP's ticker already
  // arrives smooth, and smoothing it again would lag the burst's peak out of step with
  // the flash that covers it. Reduced motion gets the sheet without the journey.
  const burst = reduced ? 0 : Math.max(0, Math.min(1, plateBurst.t));
  const c = formChoreo(
    eased,
    reduced ? 0 : aboutReveal.exit,
    easedWork,
    easedAfter,
    burst
  );
```

`state.rage` arrive tout seul : `Object.assign(state, c)` est déjà là (ligne 204) et `FormState` étend `FormChoreo`.

- [ ] **Step 5: Appliquer la rage aux uniformes dans `LiquidDna.tsx`**

Dans `src/components/chrome/LiquidDna.tsx`, changer l'import de `formField`/`formShapes` en ajoutant :

```ts
import { BURST_DISTORT, BURST_SPIKE } from "@/lib/formChoreo";
```

Puis remplacer les deux lignes (326-327) :

```ts
    u.uMoodD.value = s.mood.distort;
    u.uMoodF.value = s.mood.freq;
    u.uSpike.value = s.mood.spike;
```

par :

```ts
    // The burst's rage rides ON TOP of the eased silhouette rather than inside it:
    // `s.mood` is mutated in place and eased every frame, so writing an impulse into it
    // would poison the next frame's easing and the metal would never find the project's
    // own form again. stepK reads both of these, so a surged field automatically
    // shortens the raymarcher's stride — see BURST_SPIKE for what to do if it speckles.
    u.uMoodD.value = s.mood.distort * (1 + s.rage * BURST_DISTORT);
    u.uMoodF.value = s.mood.freq;
    u.uSpike.value = s.mood.spike + s.rage * BURST_SPIKE;
```

- [ ] **Step 6: Vérifier les types et le lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: aucune sortie, aucun warning.

- [ ] **Step 7: Vérifier que rien n'a bougé**

Run: `pnpm dev`, ouvrir `http://localhost:3000`, scroller jusqu'à Work.
Expected: la section est **identique** à avant — `plateBurst.t` vaut 0, donc `rage` vaut 0 et chaque terme ajouté s'annule. Si quelque chose a bougé, c'est une erreur d'algèbre dans l'étape 3, pas un réglage.

- [ ] **Step 8: Regarder le voyage, à l'arrêt**

Dans la console, sur la planche `01` :

```js
window.plateBurst.t = 0.25   // le métal grandit et se hérisse
window.plateBurst.t = 0.5    // le pic : l'écran doit être noyé de chrome
window.plateBurst.t = 1      // la pièce se pose à gauche, petite, en forme de caméra
window.plateBurst.t = 0      // retour à la planche
```

Expected à `t = 0.5` : **aucun bord de viewport visible autour du métal.** Si un bord apparaît, monter `BURST_PEAK_SCALE`. Si la forme mouchette ou se troue (des rayons qui n'atteignent pas la surface en 96 pas), baisser `BURST_SPIKE` d'abord, `BURST_DISTORT` ensuite — **ne pas toucher `stepK`**, il est réglé pour tout le reste du site.

Prendre une capture à `t = 0.5` et à `t = 1` pour pouvoir comparer après la tâche 5.

- [ ] **Step 9: Commit**

```bash
git add src/lib/formChoreo.ts src/lib/formClock.ts src/components/chrome/LiquidDna.tsx
git commit -m "feat(burst): la matière — un dock, une échelle et une rage tirés d'un seul nombre"
```

---

### Task 3: Le verrou compté

Aucun changement visible. Ce qui change : deux propriétaires peuvent arrêter Lenis sans se le voler.

**Files:**
- Modify: `src/lib/pageScroll.ts`
- Modify: `src/components/SmoothScroll.tsx`

- [ ] **Step 1: Le verrou dans `pageScroll.ts`**

Ajouter à la fin de `src/lib/pageScroll.ts` :

```ts
/**
 * The page's scroll lock, counted by reason.
 *
 * Two things hold the page still: the blob control panel and a project's detail sheet.
 * They used to be one thing, and the lock was `lenis.stop()` called from SmoothScroll
 * with its own memory of the previous state — which breaks the moment there is a second
 * owner: dismissing the panel would hand back a scroll the sheet is still holding.
 * Counting the reasons fixes it, and the reason is a string so a leak is legible in the
 * debugger instead of being an integer nobody can attribute.
 *
 * Under prefers-reduced-motion SmoothScroll never starts Lenis, so there is nothing to
 * stop — the document is the scroller, and the fallback is its own overflow.
 */
const locks = new Set<string>();

function applyLock() {
  if (lenis) {
    if (locks.size > 0) lenis.stop();
    else lenis.start();
    return;
  }
  document.documentElement.style.overflow = locks.size > 0 ? "hidden" : "";
}

export function lockPageScroll(reason: string) {
  locks.add(reason);
  applyLock();
}

export function unlockPageScroll(reason: string) {
  locks.delete(reason);
  applyLock();
}
```

Et modifier `setPageScroller` pour qu'un verrou posé avant l'arrivée de Lenis soit honoré :

```ts
export function setPageScroller(instance: Lenis | null) {
  lenis = instance;
  // A lock may have been taken before Lenis existed (or while it was being replaced by
  // a hot reload). Re-assert it rather than letting the new instance start unlocked.
  if (instance) {
    document.documentElement.style.overflow = "";
    applyLock();
  }
}
```

**Attention à l'ordre de déclaration** : `applyLock` doit être défini avant `setPageScroller` dans le fichier, ou déclaré en `function` (hoisté). Le code ci-dessus utilise `function applyLock()`, donc il est hoisté — placer le bloc du verrou où on veut dans le fichier fonctionne.

- [ ] **Step 2: Faire du ControlPanel un client du verrou**

Dans `src/components/SmoothScroll.tsx`, changer l'import ligne 8 :

```ts
import { setPageScroller, lockPageScroll, unlockPageScroll } from "@/lib/pageScroll";
```

Puis remplacer le bloc du panneau (lignes 79-92) par :

```ts
    // While the blob control panel is open, the page is LOCKED: a scroll gesture
    // closes the panel instead of moving the page, and the page only starts moving
    // once the panel's close animation has finished — so the Hero's furniture-fade and
    // the section handovers never begin underneath an open panel. A stopped Lenis
    // swallows wheel/touch and preventDefaults them (see its onVirtualScroll), so the
    // lock IS the stop; we only have to catch the scroll intent ourselves to trigger
    // the close, since a stopped Lenis fires no scroll event to hang the old
    // close-on-scroll off.
    //
    // The lock is taken by reason rather than by calling lenis.stop() here: the detail
    // sheet holds the same page still, and two owners with private memories of the
    // previous state give the scroll back to each other (see pageScroll).
    const LOCK = "control-panel";
    let startTimer = 0;
    let prevOpen = blobTweak.get().open;
    if (prevOpen) lockPageScroll(LOCK);
    const onPanel = () => {
      const open = blobTweak.get().open;
      if (open === prevOpen) return; // only react to the open→closed edges
      prevOpen = open;
      clearTimeout(startTimer);
      if (open) lockPageScroll(LOCK);
      // Held closed for the reverse-piano retract, THEN the page is handed back —
      // whether the panel was dismissed by a scroll, the ✕, or the barcode.
      else startTimer = window.setTimeout(() => unlockPageScroll(LOCK), PANEL_CLOSE_MS);
    };
    const unsubscribePanel = blobTweak.subscribe(onPanel);
```

Ajouter au cleanup (avant `setPageScroller(null)`), pour qu'un hot reload ne laisse pas un verrou derrière :

```ts
      unlockPageScroll(LOCK);
```

- [ ] **Step 3: Vérifier les types et le lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: aucune sortie, aucun warning.

- [ ] **Step 4: Vérifier que le panneau verrouille toujours**

Sur `http://localhost:3000` :
1. Ouvrir le ControlPanel (le code-barres dans le Hero).
2. Molette.
Expected: la page **ne bouge pas**, le panneau se ferme.
3. Attendre ~1,2 s puis molette à nouveau.
Expected: la page scrolle normalement.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pageScroll.ts src/components/SmoothScroll.tsx
git commit -m "refactor(scroll): le verrou compté par raison — le panneau ne rend plus un scroll qu'un autre retient"
```

---

### Task 4: La fiche, sans le voyage

À la fin de cette tâche la navigation marche entièrement : clic sur le nom → la fiche ; croix / `Escape` / molette → la planche. Sans rafale : la fiche apparaît en fondu et la pièce glisse à sa place. C'est volontaire — on valide la mécanique avant d'y mettre le mouvement.

**Files:**
- Create: `src/components/PlateDetails.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/sections/Work.tsx`

- [ ] **Step 1: Écrire `PlateDetails.tsx`**

Créer `src/components/PlateDetails.tsx` :

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { Work } from "@/data/site";
import { SHEET_IN_MS, FLASH_PEAK_MS, FLASH_MS } from "@/lib/plateBurst";

/**
 * A project's detail sheet — the plate, opened.
 *
 * Three layers, and the order matters more than anything else in this file:
 *
 *  - the SCRIM, at z-index 3, which is BELOW the chrome stage (4). It masks the page
 *    while leaving the piece visible on top of it. An opaque backdrop above the canvas
 *    would hide the very thing the burst just reformed.
 *  - the FLASH, at 99: a chrome wash that peaks mid-burst. It covers the DOM swap, and
 *    it spares the raymarcher having to be flawless at the one instant it is most
 *    loaded (full screen, shortest stride, 96 steps).
 *  - the SHEET, at 100: the words, above the canvas, to the right of the piece.
 *
 * Portalled into `body` out of necessity, not preference: `.plate-group` carries a
 * `transform`, which makes it a containing block for `position: fixed`, and
 * `.plate-screen` is `overflow: hidden`. Rendered in Work's tree, this would be
 * clipped and mispositioned.
 *
 * Always mounted, `inert` when closed: the exit tween needs something to animate, and
 * `inert` is what keeps focus and the accessibility tree out of a sheet that is gone.
 *
 * It owns its own reveal. Work owns the metal (plateBurst.t) and the plate's shell;
 * neither reaches into the other's DOM. They agree on timing through the shared
 * constants in plateBurst rather than through a shared timeline.
 */
export function PlateDetails({
  work,
  open,
  onClose,
}: {
  work: Work;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  // The element focus returns to. Captured on open rather than passed in, so the sheet
  // does not need to know what opened it.
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Escape closes, and focus is moved in and back out. Not a full focus trap library:
  // the sheet has three focusables and everything else on the page is `inert` or
  // behind the scrim.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    // The dialog itself takes the focus, not its close button: the button is one of the
    // staggered lines, so at this instant it is still at autoAlpha 0 — and focus() on a
    // `visibility: hidden` element does nothing at all. The container is visible from
    // the first frame (it has no background of its own to fade), so it is the one thing
    // here that can reliably be focused. Tab then reaches the button once it has landed.
    ref.current?.querySelector<HTMLElement>('[role="dialog"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener.current?.focus();
    };
  }, [open, onClose]);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const lines = gsap.utils.toArray<HTMLElement>(el.querySelectorAll("[data-line]"));
      const flash = el.querySelector<HTMLElement>("[data-sheet-flash]");
      const scrim = el.querySelector<HTMLElement>("[data-sheet-scrim]");
      if (!flash || !scrim) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(lines, { autoAlpha: open ? 1 : 0, y: 0 });
        gsap.set(scrim, { autoAlpha: open ? 1 : 0 });
        gsap.set(flash, { autoAlpha: 0 });
        return;
      }

      if (open) {
        // The scrim comes up under the flood — it has to be there before the flash
        // fades off it, or the page shows through for a frame.
        gsap.to(scrim, { autoAlpha: 1, duration: 0.3, ease: "sine.out" });
        gsap
          .timeline()
          .to(flash, { autoAlpha: 1, duration: FLASH_MS / 2000, ease: "sine.out" },
            (FLASH_PEAK_MS - FLASH_MS / 2) / 1000)
          .to(flash, { autoAlpha: 0, duration: 0.32, ease: "sine.in" });
        gsap.fromTo(
          lines,
          { autoAlpha: 0, y: 18 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.45,
            ease: "expo.out",
            stagger: 0.07,
            delay: SHEET_IN_MS / 1000,
          }
        );
      } else {
        // The words go first, and quickly: on the way out they are the thing that must
        // not still be readable when the metal starts to tear.
        gsap.to(lines, { autoAlpha: 0, y: 10, duration: 0.22, ease: "sine.in", stagger: 0.03 });
        gsap
          .timeline()
          .to(flash, { autoAlpha: 1, duration: FLASH_MS / 2000, ease: "sine.out" },
            (FLASH_PEAK_MS - FLASH_MS / 2) / 1000)
          .to(flash, { autoAlpha: 0, duration: 0.32, ease: "sine.in" })
          .to(scrim, { autoAlpha: 0, duration: 0.3, ease: "sine.in" }, "<");
      }
    },
    { dependencies: [open], scope: ref }
  );

  if (!mounted) return null;

  return createPortal(
    <div ref={ref} inert={!open ? true : undefined}>
      <div data-sheet-scrim className="sheet-scrim" aria-hidden />
      <div data-sheet-flash className="sheet-flash" aria-hidden />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        // Focusable but not tabbable: it is the landing spot on open, nothing more.
        tabIndex={-1}
      >
        <button
          data-line
          type="button"
          className="sheet-close"
          onClick={onClose}
          aria-label="Fermer la fiche"
        >
          ✕
        </button>
        <div className="sheet-col">
          <p data-line className="sheet-index font-display">
            {work.index}
          </p>
          <h2 data-line id="sheet-title" className="sheet-title font-display">
            {work.title.toUpperCase()}
          </h2>
          <p data-line className="sheet-meta">
            {work.timeline}
          </p>
          {work.summary ? (
            <p data-line className="sheet-summary">
              {work.summary}
            </p>
          ) : null}
          {work.languages.length > 0 ? (
            <ul data-line className="sheet-chips" aria-label="Langages">
              {work.languages.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
          {work.tools.length > 0 ? (
            <ul data-line className="sheet-chips" aria-label="Outils">
              {work.tools.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : null}
          <a
            data-line
            className="sheet-live"
            href={work.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir le site ↗
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Les styles**

Dans `src/app/globals.css`, insérer juste après le bloc `@media (prefers-reduced-motion: reduce) { .plate-screen { --form-lift: 0px; } }` (autour de la ligne 494) :

```css
/* ---------------------------------------------------------------------------
   The detail sheet. Three layers, and their z-indices are the design:

     3   the scrim — BELOW the chrome stage (4), so it masks the page while the piece
         stays visible on top of it. An opaque backdrop above the canvas would hide the
         very thing the burst reformed.
     99  the flash — above the canvas, under the words: it covers the DOM swap.
     100 the sheet — above the canvas, under the ControlPanel (200). The header (50)
         stays visible on purpose; it is the site's own chrome, not furniture.
   ------------------------------------------------------------------------- */
.sheet-scrim {
  position: fixed;
  inset: 0;
  z-index: 3;
  background: var(--void);
  visibility: hidden;
  opacity: 0;
}
.sheet-flash {
  position: fixed;
  inset: 0;
  z-index: 99;
  background: var(--grad-chrome);
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}
.sheet {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  /* The piece holds the left (DOCK_X_DETAILS), the words the right. The columns are
     halves rather than content-sized, so the text block never creeps under the metal
     on a narrow window. */
  grid-template-columns: 1fr 1fr;
  align-items: center;
  padding: 0 clamp(20px, 5vw, 64px);
  pointer-events: none;
}
/* The dialog is focusable (tabIndex -1) so it can be the landing spot on open, and a
   ring on a full-screen box would read as a border round the whole page. */
.sheet:focus {
  outline: none;
}
/* Only the sheet's own controls take the pointer: the scrim is not a dismiss target
   (the wheel and Escape are), and a full-screen catcher over a page whose whole
   surface is a WebGL stage swallows the cursor tracking. */
.sheet > * {
  pointer-events: auto;
}
.sheet-col {
  grid-column: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-4);
  max-width: 44ch;
}
.sheet-index {
  margin: 0;
  font-size: var(--fs-h3);
  letter-spacing: 0.08em;
  color: var(--silver-muted);
}
.sheet-title {
  margin: 0;
  font-size: var(--fs-h1);
  line-height: 0.92;
  letter-spacing: -0.02em;
  color: var(--chrome);
}
.sheet-meta {
  margin: 0;
  font-family: var(--font-mono), monospace;
  font-size: var(--fs-label);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--silver-muted);
}
.sheet-summary {
  margin: 0;
  font-size: var(--fs-body);
  line-height: 1.6;
  color: var(--silver-bright);
}
/* The stack, finally rendered — site.ts says its place is a case-study page, and this
   is it. Pills, per MASTER.md's tag language. */
.sheet-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.sheet-chips li {
  padding: 3px 10px;
  border: 1px solid var(--steel);
  border-radius: var(--r-pill);
  font-family: var(--font-mono), monospace;
  font-size: var(--fs-label);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--silver);
}
.sheet-live {
  margin-top: var(--sp-4);
  font-family: var(--font-mono), monospace;
  font-size: var(--fs-label);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--silver-bright);
  text-decoration: none;
  transition: color var(--dur-fast) linear;
}
.sheet-live:hover {
  color: var(--spec);
}
.sheet-close {
  position: absolute;
  top: clamp(20px, 5vw, 48px);
  right: clamp(20px, 5vw, 64px);
  background: none;
  border: 0;
  padding: var(--sp-2);
  font-family: var(--font-mono), monospace;
  font-size: 0.8rem;
  color: var(--silver-muted);
  transition: color var(--dur-fast) linear;
}
.sheet-close:hover {
  color: var(--spec);
}
.sheet-close:focus-visible,
.sheet-live:focus-visible {
  outline: 1px solid var(--silver-bright);
  outline-offset: 6px;
}
/* Under one column the piece has nowhere to stand beside the words, so the words take
   the whole width and sit low — the metal keeps the upper half. */
@media (max-width: 760px) {
  .sheet {
    grid-template-columns: 1fr;
    align-items: end;
    padding-bottom: clamp(48px, 12vh, 128px);
  }
  .sheet-col {
    grid-column: 1;
  }
}
```

- [ ] **Step 3: Le nom devient un bouton (CSS)**

Toujours dans `globals.css`, remplacer le commentaire et les règles des lignes 410-442 :

```css
  /* The word is the piece's only label, and it is what opens the project's sheet.
     No rule under it — the call is the frame closing on the piece, below. */
  text-decoration: none;
}
.plate-name button {
  display: inline-block;
  /* A button, not a link: it does not open a document, it opens the sheet. Which means
     resetting the four things a button brings and the display face does not want. */
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
}

/* The call.
   Pointing at the name pulls the four notches in on the piece and lights them. The
   underline it replaces was furniture borrowed from a document; this is the section's
   own gesture — the corners of a field, tightening on what they mark — and it answers
   at the OBJECT rather than at the word, which is where the reader is looking.
   Reaching the notches from the button means going up and back across the tree, hence
   :has(). It fires the same on keyboard focus, so the outline is not the only thing
   that says this word leads somewhere.
   Note the limit: hover does not exist on touch, so on a phone the name still gives
   no sign of being pressable. The numbers below it remain the only tap target that
   announces itself. */
.plate-group:has(.plate-name button:hover),
.plate-group:has(.plate-name button:focus-visible) {
  --notch-out: 16px;
}
.plate-group:has(.plate-name button:hover) .plate-notch::before,
.plate-group:has(.plate-name button:hover) .plate-notch::after,
.plate-group:has(.plate-name button:focus-visible) .plate-notch::before,
.plate-group:has(.plate-name button:focus-visible) .plate-notch::after {
  background: var(--silver-bright);
}
.plate-name button:focus-visible {
  outline: 1px solid var(--silver-bright);
  outline-offset: 6px;
}
```

- [ ] **Step 4: Câbler Work — la coquille, le bouton, la fiche**

Dans `src/sections/Work.tsx` :

**a.** Ajouter aux imports :

```tsx
import { PlateDetails } from "@/components/PlateDetails";
import { lockPageScroll, unlockPageScroll } from "@/lib/pageScroll";
```

**b.** Ajouter l'état, sous `const [formed, setFormed] = useState(false);` :

```tsx
  /** is the project's sheet open */
  const [sheet, setSheet] = useState(false);
  // …and the same fact as a ref, for the handlers that must not re-subscribe to read
  // it (the scroll/resize listener) and for the timers that fire between renders.
  const sheetOpen = useRef(false);
```

**c.** Dans le handler `onScroll` (ligne 186), ajouter en toute première ligne du corps :

```tsx
      // The sheet freezes the section. Lenis is stopped so no scroll event arrives —
      // but `resize` calls this same handler, and recomputing the target there would
      // walk the plate underneath an open sheet.
      if (sheetOpen.current) return;
```

**d.** Ajouter le premier garde-fou dans `walk` (dans le `useCallback`, ligne 171), en changeant :

```tsx
      if (!live.current || target.current === shown.current) return;
```

en :

```tsx
      if (sheetOpen.current || !live.current || target.current === shown.current) return;
```

**e.** Ajouter la raison du verrou en **portée module**, à côté de `DWELL` (au-dessus de `export function Work()`) :

```tsx
/** This section's reason for holding the page still — see pageScroll's counted lock. */
const LOCK = "plate-sheet";
```

En portée module et pas dans le corps du composant : il est lu par le cleanup de l'effet de scroll et par le timeline de la tâche 5, tous deux écrits **avant** l'endroit où les handlers vivent. Une `const` dans le corps marcherait (les callbacks tournent après l'exécution du corps) mais l'ordre de lecture serait un piège pour rien.

Puis ajouter les deux handlers, après `const go = (i: number) => {...}` :

```tsx
  /** Open the shown plate's sheet: lock the page, freeze the walk, show the sheet. */
  const openSheet = () => {
    if (sheetOpen.current) return;
    sheetOpen.current = true;
    lockPageScroll(LOCK);
    // Freeze the walk where it stands. Lenis is stopped, so no new destination can
    // arrive — but a DWELL already armed would change the plate under the open sheet.
    target.current = shown.current;
    window.clearTimeout(timer.current);
    setSheet(true);
  };

  /** Close it: hand the page back and let the walk pick up where the scroll is. */
  const closeSheet = useCallback(() => {
    if (!sheetOpen.current) return;
    sheetOpen.current = false;
    setSheet(false);
    unlockPageScroll(LOCK);
    walk();
  }, [walk]);
```

**f.** Le geste de molette qui ferme. Ajouter un `useEffect` sous les autres :

```tsx
  // The wheel closes the sheet, the way it closes the control panel: the page cannot
  // move (it is locked), so the gesture is free to mean something else. Passive —
  // nothing is prevented here, the lock already swallows the scroll.
  useEffect(() => {
    if (!sheet) return;
    const onWheel = () => closeSheet();
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchmove", onWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onWheel);
    };
  }, [sheet, closeSheet]);
```

**g.** Libérer le verrou au démontage. Dans le `useEffect` du scroll (ligne 212), ajouter au cleanup :

```tsx
      unlockPageScroll(LOCK);
```

**h.** Le JSX. Remplacer le `<h3 data-name>` et son `<a>` (lignes 423-432) par :

```tsx
            <h3 data-name className="font-display plate-name">
              <button
                type="button"
                onClick={openSheet}
                aria-haspopup="dialog"
                aria-expanded={sheet}
                aria-label={`${current.title} — ouvrir la fiche du projet`}
              >
                <ScrambleText text={current.title.toUpperCase()} pool={pool} />
              </button>
            </h3>
```

**i.** Rendre la fiche. Ajouter, juste avant `</section>` :

```tsx
      <PlateDetails work={current} open={sheet} onClose={closeSheet} />
```

**Pas de wrapper autour de `.plate-group`.** La tentation est d'en ajouter un pour donner à la rafale une cible qui lui appartienne, mais elle est inutile : `inTl` et `outTl` n'animent que `[data-notch]`, `[data-name]` et `[data-pick]` — **jamais** `.plate-group` lui-même. Le groupe est donc déjà une cible libre, et la rafale l'anime directement (tâche 5). C'est ce qui règle le piège des deux propriétaires d'`autoAlpha` : la rafale écrit sur le parent, les timelines scrubbées sur les enfants, et un `ScrollTrigger.refresh()` ne peut plus rien écraser.

Un wrapper aurait de toute façon fallu être en `display: contents` — `.plate-group` est en `position: absolute` contre `.plate-screen` — et une boîte en `display: contents` ne peut pas porter d'`autoAlpha`.

- [ ] **Step 5: Vérifier les types et le lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: aucune sortie, aucun warning. Si TypeScript se plaint de `inert`, vérifier que `@types/react` est bien en v19 (`inert?: boolean` y est déclaré) ; ne pas caster, corriger le type.

- [ ] **Step 6: Vérifier la navigation**

Sur `http://localhost:3000`, aller sur Work (cliquer `02` par exemple) :
1. Cliquer le nom.
   Expected: la fiche apparaît à droite (titre, `20.23 — 24`, summary, deux rangées de pills, « Voir le site ↗ »), la pièce est passée à gauche en petit, toujours en forme de maillet. La planche (nom, notches, numéros) n'est plus visible.
2. Molette.
   Expected: la fiche part, la planche revient, **sur le projet 02** — pas sur 01.
3. Rouvrir, puis `Escape`. Puis rouvrir, puis la croix.
   Expected: même retour dans les deux cas.
4. Ouvrir la fiche de `01` (Pictarine).
   Expected: pas de bloc summary vide, pas de rangée de pills vide — les trois se rendent conditionnellement.
5. Ouvrir la fiche, puis **redimensionner la fenêtre**.
   Expected: la planche ne réapparaît pas par-dessus la fiche.
6. Ouvrir/fermer trois fois, puis scroller.
   Expected: la page scrolle, et la planche est celle où on l'avait laissée.

- [ ] **Step 7: Commit**

```bash
git add src/components/PlateDetails.tsx src/app/globals.css src/sections/Work.tsx
git commit -m "feat(sheet): la fiche projet — le nom l'ouvre, la molette la ferme, la planche est gelée dessous"
```

---

### Task 5: Le voyage

**Files:**
- Modify: `src/sections/Work.tsx`

- [ ] **Step 1: Construire le timeline de la rafale**

Dans `src/sections/Work.tsx`, ajouter aux imports :

```tsx
import { plateBurst, BURST_MS } from "@/lib/plateBurst";
```

Ajouter la ref, sous `sheetOpen` :

```tsx
  /** the burst, built once and played forward / in reverse */
  const burst = useRef<gsap.core.Timeline | null>(null);
```

Puis un `useGSAP` à lui, après celui de l'entrée/sortie :

```tsx
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      // The GROUP, not its children: [data-notch], [data-name] and [data-pick] belong
      // to the scrubbed entrance and exit timelines, which write autoAlpha inline. Two
      // owners of one property means a ScrollTrigger.refresh() — a resize is enough —
      // re-applies the scrubbed value and wipes the burst. The parent is free.
      const shell = el.querySelector<HTMLElement>(".plate-group");
      if (!shell) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // No journey: the sheet is a state, not a movement. The piece is placed by the
        // clock (which reads plateBurst.t) and the shell simply is or is not there.
        return;
      }

      // Two halves, because the two halves are two different gestures: a mass being
      // torn accelerates (power2.in), and one falling back into shape decelerates
      // (expo.out, the site's --ease-out). Played forward to open, reversed to close —
      // reversing is what guarantees the metal retraces its own path rather than
      // finding a second one.
      const half = BURST_MS / 2000;
      burst.current = gsap
        .timeline({
          paused: true,
          onReverseComplete: () => {
            unlockPageScroll(LOCK);
            // …and if the scroll had moved on before the sheet was opened, the walk
            // picks the difference up here.
            walk();
          },
        })
        .to(plateBurst, { t: 0.5, duration: half, ease: "power2.in" }, 0)
        .to(plateBurst, { t: 1, duration: half, ease: "expo.out" })
        // The shell goes early and quickly: what is being torn apart must not still
        // have a name and four numbers hanging off it.
        .to(shell, { autoAlpha: 0, duration: 0.16, ease: "sine.in" }, 0);

      return () => {
        burst.current?.kill();
        burst.current = null;
        plateBurst.t = 0;
      };
    },
    { scope: ref, dependencies: [walk] }
  );
```

- [ ] **Step 2: Le jouer depuis les handlers**

Remplacer `openSheet` et `closeSheet` de la tâche 4 par :

```tsx
  /** Open the shown plate's sheet: lock the page, freeze the walk, fire the burst. */
  const openSheet = () => {
    if (sheetOpen.current) return;
    sheetOpen.current = true;
    lockPageScroll(LOCK);
    // Freeze the walk where it stands. Lenis is stopped, so no new destination can
    // arrive — but a DWELL already armed would change the plate under the open sheet.
    target.current = shown.current;
    window.clearTimeout(timer.current);
    setSheet(true);
    // No timeline under reduced motion: the clock reads plateBurst.t as 0 there anyway,
    // so setting it outright is the whole of the movement.
    if (burst.current) burst.current.play();
    else plateBurst.t = 1;
  };

  /**
   * Close it. The page is handed back by the timeline's onReverseComplete, not here:
   * releasing it now would let the document move while the metal is still crossing
   * back, and the plate would land somewhere the reader never was.
   */
  const closeSheet = useCallback(() => {
    if (!sheetOpen.current) return;
    sheetOpen.current = false;
    setSheet(false);
    if (burst.current) burst.current.reverse();
    else {
      plateBurst.t = 0;
      unlockPageScroll(LOCK);
      walk();
    }
  }, [walk]);
```

- [ ] **Step 3: Vérifier les types et le lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: aucune sortie, aucun warning.

- [ ] **Step 4: Regarder la rafale**

Sur Work, plaque `02` :
1. Cliquer le nom.
   Expected, dans cet ordre : le nom et les notches s'effacent en ~160 ms, le métal grandit en se hérissant, l'écran est noyé de chrome vers 480 ms, et de cette noyade la pièce ressort à gauche, en maillet, pendant que les lignes de la fiche montent une par une à partir de 700 ms. **Aucune frame où la pièce disparaît puis réapparaît.**
2. Molette.
   Expected: les mots partent d'abord, puis le métal se déchaîne à nouveau, avale l'écran, et se repose sur la planche 02 dans son cadre.
3. Cliquer, et **cliquer à nouveau au milieu du voyage** (pendant la noyade).
   Expected: le mouvement s'inverse depuis où il est — pas de saut, pas de redémarrage. C'est `reverse()` sur un timeline en cours qui donne ça gratuitement.

- [ ] **Step 5: Régler le pic si nécessaire**

Comparer avec les captures de la tâche 2, étape 8. Si le métal mouchette ou se troue au pic maintenant qu'il bouge : baisser `BURST_SPIKE` dans `formChoreo.ts` par pas de 0,05, puis `BURST_DISTORT` par pas de 0,25. **Ne pas toucher `stepK` dans `LiquidDna.tsx`** : il est dérivé d'une borne sur le gradient du champ et il gouverne tout le reste du site.

Si le budget de frame saute au pic (vérifiable avec une trace de performance), la sortie est de baisser le dpr pendant la rafale — pas de désarmer la rafale.

Noter dans le message de commit les valeurs retenues si elles diffèrent de 2.0 / 0.35.

- [ ] **Step 6: Commit**

```bash
git add src/sections/Work.tsx src/lib/formChoreo.ts
git commit -m "feat(burst): le voyage — le métal se déchaîne, noie l'écran, et ressort sur la fiche"
```

---

### Task 6: Mouvement réduit et clavier

**Files:**
- Modify: `src/components/PlateDetails.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Vérifier le chemin « mouvement réduit »**

Le code des tâches 4 et 5 le prévoit déjà : `PlateDetails` place ses couches d'un coup, `Work` ne construit pas de timeline et met `plateBurst.t` à 1 ou 0 directement, et `formClock` force `burst` à 0 quand `reduced` — donc la pièce reste où la choreo réduite l'a mise, sans voyage.

Vérifier dans le navigateur, avec l'émulation `prefers-reduced-motion: reduce` :
1. Aller sur Work, cliquer le nom.
   Expected: la fiche est là immédiatement, lisible, avec ses pills et son lien. Pas de flash, pas de grossissement.
2. `Escape`.
   Expected: la planche est de retour immédiatement.
3. Molette pendant la fiche.
   Expected: la page ne bouge pas (le fallback `overflow: hidden` de `pageScroll`, puisque Lenis n'existe pas sous mouvement réduit), et la fiche se ferme.

Si l'un des trois échoue, corriger **dans le chemin `reduced`** — ne pas toucher le chemin normal.

- [ ] **Step 2: Vérifier le clavier**

Sans souris :
1. `Tab` jusqu'au nom de la planche.
   Expected: les quatre notches se resserrent et s'éclairent (le `:has(...:focus-visible)`), et un contour apparaît sur le mot.
2. `Entrée`.
   Expected: la fiche s'ouvre et le focus est **sur la fiche elle-même** (le conteneur `role="dialog"`), pas sur la croix — la croix est une des lignes en stagger, elle n'est pas encore visible à cet instant.
3. `Tab`.
   Expected: le focus atteint la croix, puis le lien, et **ne sort pas** vers la page derrière — l'attribut `inert` sur les autres couches ne suffit pas à lui seul, la page derrière n'est pas `inert`. Si le focus s'échappe vers le header ou les sections, ajouter un `inert` sur `<main>` et sur le `<header>` pendant que la fiche est ouverte (piloté par `open` dans `PlateDetails` via un `useEffect` qui pose l'attribut, et le retire au cleanup).
4. `Escape`.
   Expected: la fiche se ferme et le focus est revenu **sur le nom de la planche**.

- [ ] **Step 3: Si le focus s'échappe, poser `inert` sur le reste de la page**

Dans `PlateDetails.tsx`, dans le `useEffect` qui gère `Escape`, ajouter :

```tsx
    // The sheet is modal, and the page behind it is not inert on its own. Rather than
    // a focus trap that has to know about every focusable, mark the rest of the
    // document unreachable for as long as the sheet is up.
    const behind = [
      document.querySelector("main"),
      document.querySelector("header"),
    ].filter(Boolean) as HTMLElement[];
    behind.forEach((n) => n.setAttribute("inert", ""));
```

…et au cleanup du même effet :

```tsx
      behind.forEach((n) => n.removeAttribute("inert"));
```

> Attention à l'ordre : `opener.current?.focus()` doit venir **après** le retrait de `inert`, sinon le focus est rendu à un élément encore inerte et part sur `body`.

- [ ] **Step 4: Vérifier les types, le lint, et le build**

Run: `npx tsc --noEmit && pnpm lint && pnpm build`
Expected: aucune sortie, aucun warning, build réussi. Le build est ici et pas plus tôt parce que c'est lui qui attrape ce que `tsc` ne voit pas — un accès à `window` au niveau module dans un composant client, par exemple.

- [ ] **Step 5: Commit**

```bash
git add src/components/PlateDetails.tsx src/app/globals.css
git commit -m "feat(sheet): le clavier et le mouvement réduit — la fiche est modale pour de vrai"
```

---

### Task 7: Les six critères

Rien à écrire. Cette tâche est la vérification de la spec, en entier, dans le navigateur, et la correction de ce qu'elle trouve.

**Files:** aucun a priori.

- [ ] **Step 1: Dérouler les six critères de la spec**

Sur un serveur `pnpm dev` fraîchement démarré, à `http://localhost:3000` :

1. **Le métal ne coupe jamais.** Ouvrir la fiche de chacun des quatre projets. Aucune frame où la pièce disparaît puis réapparaît. (Prendre une trace de performance avec des captures si un doute subsiste : ce qu'on cherche, c'est un trou dans la continuité, pas une baisse de framerate.)
2. **Les trois sorties rendent la même planche.** Pour chaque projet : ouvrir, fermer par la croix ; ouvrir, fermer par `Escape` ; ouvrir, fermer par la molette. Les trois doivent rendre le même projet, la même forme, le même cadre.
3. **Le verrou.** Pendant la fiche, la page ne bouge pas. Après la fermeture, elle bouge. Et le ControlPanel verrouille / déverrouille toujours (l'ouvrir, molette, attendre, molette).
4. **Rien derrière.** Ouvrir/fermer trois fois de suite, puis scroller la bande de bout en bout : pas de planche changée, pas d'élément resté invisible, pas de scroll verrouillé. Vérifier dans l'inspecteur qu'aucun `visibility: hidden` inline ne traîne sur `.plate-group`, `[data-name]`, `[data-notch]`, `[data-pick]`.
5. **Le resize.** Ouvrir la fiche, redimensionner la fenêtre : la planche ne revient pas par-dessus.
6. **Mouvement réduit.** Refaire 1 à 5 avec `prefers-reduced-motion: reduce`. Tout marche, sans mouvement.

- [ ] **Step 2: La console**

Ouvrir la console et la vider, puis dérouler une ouverture/fermeture complète.
Expected: aucune erreur, aucun warning React (en particulier aucun avertissement sur `inert`, sur un `useSyncExternalStore` ou sur une mise à jour d'état sur un composant démonté).

- [ ] **Step 3: Corriger ce qui a été trouvé, puis commit**

```bash
git add -A
git commit -m "fix(burst): ce que les six critères ont trouvé"
```

(Si les six critères passent du premier coup, il n'y a rien à committer — passer.)

- [ ] **Step 4: Mettre la spec à jour si l'implémentation en a dévié**

Trois écarts sont **déjà** connus et volontaires ; les reporter dans la spec si elle doit rester la source de vérité :

1. **Pas de `subscribe` sur `plateBurst`.** La spec en prévoyait un pour le verrou de scroll ; le verrou compté de `pageScroll` est appelé impérativement depuis les handlers, donc il n'y a personne à notifier.
2. **Pas d'`easedBurst` dans `formClock`.** La spec disait « un `easedBurst` chassant `plateBurst.t` ». C'est faux : le timeline tourne sur le ticker de GSAP, donc il arrive déjà lissé, et l'easer une seconde fois retarde le pic et le décale du flash censé le couvrir.
3. **`BURST_DISTORT` 2.0 et `BURST_SPIKE` 0.35**, contre 3 et 0,45 dans la spec — qui les annonçait comme des valeurs de départ. Reporter celles réellement retenues à l'étape 5 de la tâche 5.

```bash
git add docs/superpowers/specs/2026-07-27-plate-burst-design.md
git commit -m "docs(spec): la rafale telle qu'elle a été écrite"
```

---

## Notes pour qui exécute

**Next.js.** Les guides dans `node_modules/next/dist/docs/` ont été consultés : rien dans cette fonctionnalité ne touche l'App Router, le rendu serveur, le cache ou le routing. Tout est client (`"use client"` partout, comme le reste de `src/components`), et `createPortal` n'a pas de particularité Next à connaître. Le seul piège serveur est celui déjà traité en tâche 1 : un module client est **quand même** rendu côté serveur, donc tout accès à `window` au niveau module a besoin d'un garde.

**Le travail en cours dans l'arbre.** Au moment où ce plan est écrit, `globals.css`, `src/app/page.tsx`, `src/lib/formShapes.ts`, `src/sections/Contact.tsx` et deux nouveaux fichiers `MailSeal` / `MailDust` sont modifiés et non committés. Les tâches 2 et 4 touchent `globals.css` et `formChoreo.ts`/`formClock.ts` — **ne rien committer d'autre que les fichiers listés dans chaque étape de commit**, et ne jamais faire `git add -A` avant la tâche 7 (où c'est explicite et où l'arbre doit d'abord être vérifié).

**L'ordre n'est pas négociable.** La tâche 2 est vérifiable parce que la tâche 1 a posé le hook de debug. La tâche 4 est vérifiable parce que la tâche 3 a rendu le verrou partageable. La tâche 5 remplace du code écrit en tâche 4 — c'est voulu : la navigation est validée avant qu'on y mette du mouvement, sinon un bug de navigation et un bug de timeline se déguisent l'un en l'autre.
