"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { works } from "@/data/site";
import { workPlate } from "@/lib/workPlate";
import { workReveal } from "@/lib/workReveal";
import { formState } from "@/lib/formClock";
import { tubeGate } from "@/lib/tubeGate";
import { lockPageScroll, scrollPageTo } from "@/lib/pageScroll";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Work — la côte. One plate at a time, and the plate is the chrome form itself.
 *
 * The section is a tall band with a sticky screen: the form sits in the middle,
 * with its name under it and 01–04 under that, the neighbouring projects showing at the
 * edges of the screen. Scrolling
 * advances the plate: the metal is rolled out into a 16:9 sheet and takes that
 * project's photograph, and each change throws the sheet out of the frame to come back
 * carrying the next one (see workPlate and formPhoto); the name decodes itself as it
 * changes (see ScrambleText).
 *
 * The band is read in three parts.
 *
 *  1. SETTING UP — the blob arrives in the middle, then the name fades in and the numbers
 *     appear WHILE the metal flattens into the first project's picture. The forming is not
 *     queued after the type; they are one beat, which is why that beat is owned by the
 *     entrance timeline rather than by the plate handler (see the `forms` gate).
 *  2. THE PLATES — four equal stretches of scroll, one per project.
 *  3. PUTTING AWAY — the same sequence backwards: the type fades, and the metal is
 *     released back to a blob before the piece leaves the middle.
 *
 * All three are scrubbed, not played on arrival: every transition on this page is
 * reversible, and the entrance in particular has to happen while the screen is
 * already STUCK — before it sticks, the DOM furniture is still sliding up the page
 * while the form (drawn by a fixed canvas) is not, so anything visible then is
 * misaligned by however far the band still has to travel.
 *
 * Two things are worth knowing before changing anything here.
 *
 * The piece is not in this DOM. It is drawn by the fixed chrome stage, at the
 * viewport's centre, so this section cannot contain it — only arrange furniture
 * around it. Hence the frame sized off --form-dim rather than the viewport, and
 * hence the form's own lift above centre (DOCK_Y_WORK): what has to look centred is
 * the whole group, so the piece must sit above the middle by half the height of the
 * text below it, and only the WebGL side can move it.
 *
 * The scroll is the single source of truth for the selection. Clicking a number
 * SCROLLS to that plate rather than setting the index — a click that sets state
 * directly is undone by the very next scroll event, which is the classic trap of
 * this kind of double control.
 */

const LAST = works.length - 1;

/**
 * The shares of the band's travel given to the setting-up and to the putting-away.
 * Against the 480vh band (380vh of travel) that is ~68vh for the entrance and ~84vh
 * for the exit, leaving ~57vh per plate. Each is used twice — to size its timeline and
 * to bound the plate selection — so the two halves cannot disagree about where the
 * section proper starts and ends.
 *
 * Both sequences live INSIDE the band, which is the point: the screen is stuck for
 * the whole of the band, so the furniture is centred on the form throughout, and the
 * putting-away is finished before Contact arrives. The exit used to run from the
 * band's end onwards, i.e. over Contact's first screen — the piece was still being
 * put away while the next section was reading, and the whole four-beat sequence had
 * to fit in whatever scroll was left, which at wheelMultiplier 0.9 is one flick.
 */
// 0.14: enough road for the SCRUBBED roll-out (the metamorphosis advances with the
// wheel now — see workReveal.form — and needs scroll to advance over), while keeping
// the first payoff close: at 0.18 the entrance was scroll spent watching an arrival
// that had already happened.
const ENTER = 0.14;
const EXIT = 0.22;

/**
 * The entrance's beats, in timeline units — just the index's arrival now: the
 * metamorphosis no longer lives in this timeline, it rides the section's ARRIVAL
 * (see the roll-out trigger below), so the rows type in beside a work that is
 * already on its easel.
 */
const BEAT = { name: 0.64, tail: 0.25 };

/**
 * The shortest time a plate is allowed to hold the screen (ms).
 *
 * One flick of the wheel is a long way down the band, and without a floor it
 * would cross two or three plates at once: three pictures boiling through one another,
 * three names churning over one another, and no plate ever actually SEEN. So the
 * shown plate does not jump to wherever the scroll is — it walks there, one plate at
 * a time, never faster than this. The pause is a pause in the SELECTION only: the
 * clock keeps running underneath, so the sheet is still swaying and the metal still
 * flowing all the way through it (see formClock — nothing here touches the form's own
 * animation).
 *
 * 900 ms because that is what the name's brouillage takes to settle (LEAD 330 plus
 * eight locks at 70 — see ScrambleText, where the pairing is documented from its side):
 * every plate is held at least long enough for its own name to finish decoding before
 * the next one starts breaking up. It was 1400, and that read as the section not
 * answering the wheel; the scramble sped up with it, so the invariant holds.
 */
const DWELL = 900;

/**
 * Les touches qu'un scroll natif consulterait — copiées de SmoothScroll (qui les
 * garde privées, une par verrouilleur plutôt qu'une exportée à partager) plutôt que
 * factorisées : ce fichier n'a que ça à emprunter, et l'exporter de SmoothScroll pour
 * une seule autre lecture aurait couplé deux verrous qui n'ont pas à se connaître.
 */
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
  "Spacebar",
]);

/**
 * L'ACCÉLÉRATION DE LA RETENUE — voir tubeGate. Secondes ajoutées à l'horloge du tube
 * PAR ÉVÈNEMENT wheel pendant que le verrou tient — pas une fraction de son deltaY :
 * les unités de deltaY ne sont pas comparables entre souris et trackpad (mode ligne ou
 * pixel, accélération propre au pilote), donc une échelle proportionnelle aurait fait
 * dépendre la vitesse perçue du matériel du lecteur plutôt que de son geste. Compter
 * les évènements reste dépendant de l'appareil (un trackpad en émet beaucoup plus
 * qu'une molette pour un geste comparable), mais c'est la dépendance que la tâche
 * assume déjà en parlant de « chaque cran », pas de « chaque pixel ».
 *
 * NON MESURÉ AU NAVIGATEUR — rien ici ne peut compter les évènements wheel qu'émet un
 * geste réel. Ce qui suit est un calcul, pas une observation :
 *
 * La séquence dure 8,01 s aux réglages par défaut de posteTweak (1,5 s d'attente +
 * (10 + 19 + 24) caractères × 0,07 s + 2 pauses × 1,4 s — voir sequenceDuration). À
 * 0.5 s le cran, une dizaine de crans — quelques gestes déterminés à la molette, ou un
 * flick de trackpad — suffisent à faire tomber l'attente de 8 s à 2-3 s, la fourchette
 * demandée. Et AUCUN cran isolé ne peut sauter une phrase entière : le plus petit reste
 * à frapper après la première phrase (« wake up... », 0,7 s de frappe puis 1,4 s de
 * pause) pèse encore 2,1 s, plus de quatre fois l'incrément.
 */
const BOOST_STEP = 0.5;

export function Work() {
  const ref = useRef<HTMLElement>(null);
  const [plate, setPlate] = useState(0);
  /** true from the moment the metal starts taking a project's shape */
  const [formed, setFormed] = useState(false);

  // The plate walk. Refs rather than state because the walk is a timing machine, not
  // a rendering concern: the scroll handler must read the current values without
  // re-subscribing, and a timer firing between two renders must see the truth.
  /** what is on screen */
  const shown = useRef(0);
  /** where the scroll says we are — the walk's destination */
  const target = useRef(0);
  /** when `shown` last changed, for the DWELL floor */
  const changedAt = useRef(0);
  const timer = useRef(0);
  /** is a plate presented at all — false through the entrance and past the exit */
  const live = useRef(false);

  /** The band's document position and the scroll distance the whole band spans. */
  const geometry = useCallback(() => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    if (span <= 0) return null;
    return { top: r.top + window.scrollY, span };
  }, []);

  /** Put plate i on screen now, and start its dwell. */
  const present = useCallback((i: number) => {
    shown.current = i;
    changedAt.current = performance.now();
    setPlate(i);
    // No direction is passed on: the changeover is the STRIP sliding to this slot, and a
    // slide from 01 to 02 is the same movement whichever way the reader is going — its
    // sign is already in the two positions (see mood.car in formClock).
    workPlate.show(works[i].title);
  }, []);

  /**
   * Walk `shown` one plate toward `target`, no faster than DWELL, and keep walking
   * until it arrives.
   *
   * The timer is what makes it a walk rather than a rate limiter: the last scroll
   * event of a flick may be the last event we ever get, so if the dwell blocks a step
   * there has to be something scheduled to take it afterwards — otherwise the piece
   * would simply stop two plates short of where the reader is.
   *
   * A NAMED function expression, so it schedules itself by that name rather than
   * through the `walk` binding: a timer reaching back out for the variable it was
   * created from is the kind of thing that goes stale.
   */
  const walk = useCallback(
    function step() {
      window.clearTimeout(timer.current);
      if (!live.current || target.current === shown.current) return;
      const wait = DWELL - (performance.now() - changedAt.current);
      if (wait > 0) {
        timer.current = window.setTimeout(step, wait);
        return;
      }
      const dir = Math.sign(target.current - shown.current);
      present(shown.current + dir);
      if (shown.current !== target.current) timer.current = window.setTimeout(step, DWELL);
    },
    [present]
  );

  useEffect(() => {
    const onScroll = () => {
      const g = geometry();
      if (!g) return;
      const p = (window.scrollY - g.top) / g.span;
      // Only the four plates belong to this handler. The setting-up and the putting
      // away are owned by their timelines — including releasing the metal — because
      // both are sequences with an order, and the order is what the user reads. A
      // handler that also cleared at the edges would, on the way out, reset the name
      // to plate 01 halfway through its own fade-out.
      if (p < ENTER || p > 1) return;
      // Clamped at both ends: past 1 - EXIT the putting-away has the floor, and the
      // last plate simply stays selected for it (so the type that is fading out is
      // still the plate that was being read).
      const q = Math.min(1, (p - ENTER) / (1 - ENTER - EXIT));
      // Equal bins, not `round(q * LAST)`: rounding gives the first and last plates
      // half a bin each, which would have left plate 01 — the one that has just been
      // formed at the end of the entrance — on screen for half as long as 02 and 03.
      // This only sets the DESTINATION; the walk decides when to get there.
      target.current = Math.min(LAST, Math.floor(q * works.length));
      walk();
    };
    // Lenis writes real scroll positions (it is not a transform-based scroller), so
    // the native event is the honest signal here — and it fires on its frames.
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.clearTimeout(timer.current);
      workPlate.clear();
    };
  }, [geometry, walk]);

  /**
   * LA RETENUE, ET SON ACCÉLÉRATION — voir tubeGate et pageScroll. `workReveal.dive`
   * (plus bas, diveTl) est le scrub qui traverse l'écran, et il ne doit pas avancer
   * avant que le terminal ait fini ses trois phrases : la molette scrubbe déjà tout le
   * reste de la section, donc sans retenue un simple flick pendant l'attente saute le
   * dialogue et arrive dans la plongée avant qu'un mot n'ait été lu.
   *
   * LE VERROU tombe sur lockPageScroll("tube", …), pas sur un lenis.stop() en direct :
   * c'est le mécanisme déjà établi (voir pageScroll, et SectionNav pour le menu, l'autre
   * verrouilleur) plutôt qu'un second qui l'ignorerait. Tenu quand le poste est posé ET
   * développé — `s.mood.flat === 1 && s.mood.dev > 0.55`, LA MÊME garde que le useFrame
   * de ChromeTableau teste avant d'avancer tb.t (dupliquée là-bas avec un renvoi ici : si
   * l'une change, l'autre doit suivre) — et que la séquence n'est pas finie
   * (`!tubeGate.done`). Relâché dès que `done` passe vrai.
   *
   * PAS de pin ScrollTrigger : un Lenis arrêté avale déjà wheel et touch et les
   * preventDefault (vérifié dans node_modules/lenis — onVirtualScroll, `if
   * (this.isStopped || this.isLocked) { if (event.cancelable) event.preventDefault();
   * return; }`), donc l'arrêter EST la retenue. Un pin en plus changerait la mise en
   * page (un pin reflow le document) pour un bénéfice nul.
   *
   * UN TICKER, PAS UN ABONNEMENT : formState() et tubeGate sont des singletons mutables
   * lus par valeur, comme workReveal et workPlate — rien n'émet d'évènement quand
   * `mood.flat` franchit 1 ou quand `tubeGate.done` bascule, donc quelque chose doit les
   * RELIRE à intervalle régulier. gsap.ticker plutôt qu'un requestAnimationFrame maison :
   * c'est déjà l'horloge unique qui pousse Lenis et ScrollTrigger (voir SmoothScroll,
   * « Single clock »), donc s'y greffer n'ouvre pas une troisième boucle indépendante
   * côté DOM — seulement une frame de plus, au pire, avant qu'un `done` écrit par le
   * useFrame de ChromeTableau (une boucle R3F séparée, sans garantie d'ordre avec celle-
   * ci dans la même frame navigateur) ne soit vu ici.
   *
   * L'ACCÉLÉRATION répond au même problème par l'autre bout : retenir SANS rien répondre
   * au geste lirait comme une page cassée (voir BOOST_STEP), donc pendant que le verrou
   * tient, chaque évènement wheel avance l'horloge du tube (tubeGate.boost) au lieu de
   * ne rien faire. L'écouteur est câblé comme celui qui referme le panneau toile dans
   * SmoothScroll (même options : `passive`, pas de capture) — Lenis arrêté preventDefault
   * déjà l'évènement, donc celui-ci n'a besoin que de LIRE deltaY, jamais de le bloquer
   * lui-même.
   *
   * LE CLAVIER EST UNE AUTRE PORTE, et une que la tâche qui a posé ce fichier ne nommait
   * pas : Lenis n'intercepte QUE wheel et touch (SmoothScroll le documente déjà pour son
   * propre verrou — « Lenis governs wheel and touch but not the keyboard »), donc
   * PageDown, Espace ou une flèche ferait défiler le document nativement pendant que
   * Lenis se croit arrêté, ce qui avancerait les ScrollTrigger de la section (le roll-out
   * puis diveTl) SOUS le clavier alors même que la molette est bien retenue — l'exact
   * défaut que cet effet existe pour empêcher, par une porte restée ouverte. SCROLL_KEYS
   * et sa garde reprennent donc le motif déjà validé par SmoothScroll pour le panneau,
   * appliqué au verrou "tube" à la place du panneau toile.
   *
   * TOUS LES CHEMINS DE SORTIE RELÂCHENT "tube" SANS CONDITION : le tick dès que `want`
   * retombe (séquence finie, ou tout ce qui ferait retomber flat/dev), et le nettoyage
   * de cet effet — démontage du composant — sans regarder `locked`. lockPageScroll est un
   * Set.delete : relâcher un nom qu'on ne tenait pas ne coûte rien, donc pas besoin de
   * savoir lequel de ces deux chemins a réellement tenu le verrou pour appeler l'autre
   * sans risque.
   */
  useEffect(() => {
    // Comme le reduced-motion check du useGSAP plus bas : vérifié une fois au montage,
    // pas réactif à un changement live de la préférence système — cohérent avec le reste
    // de ce fichier plutôt qu'une exception qui se justifierait à elle seule. En reduced
    // motion, ni retenue ni accélération : cet effet entier se retire.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /** Le verrou "tube" est-il tenu par CE composant en ce moment — écrit par le seul
     *  tick, lu par la molette et le clavier pour savoir s'ils ont quoi que ce soit à
     *  faire. */
    let locked = false;

    const tick = () => {
      const s = formState();
      const want = s.mood.flat === 1 && s.mood.dev > 0.55 && !tubeGate.done;
      if (want === locked) return;
      locked = want;
      lockPageScroll("tube", want);
    };
    gsap.ticker.add(tick);

    const onWheel = () => {
      if (!locked) return;
      tubeGate.boost += BOOST_STEP;
    };
    window.addEventListener("wheel", onWheel, { passive: true });

    const onKey = (e: KeyboardEvent) => {
      if (!locked || !SCROLL_KEYS.has(e.key)) return;
      // Comme SmoothScroll : ne pas voler une touche qu'un contrôle attend
      // légitimement. Rien n'est focusable pendant la retenue aujourd'hui (l'index des
      // plaques est `hidden` — voir le rendu plus bas), mais la garde ne coûte rien et
      // évite une régression silencieuse si ça change.
      if ((e.target as HTMLElement)?.closest?.('[role="dialog"],input,button')) return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      lockPageScroll("tube", false);
    };
  }, []);

  /** Scroll to the middle of plate i's bin — see the binning in the handler above. */
  const go = (i: number) => {
    const g = geometry();
    if (!g) return;
    const q = (i + 0.5) / works.length;
    scrollPageTo(g.top + g.span * (ENTER + q * (1 - ENTER - EXIT)));
  };

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const rows = gsap.utils.toArray<HTMLElement>(el.querySelectorAll("[data-row]"));
      const type = rows;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(type, { clearProps: "all" });
        live.current = true;
        present(0);
        setFormed(true);
        return;
      }

      gsap.set(type, { autoAlpha: 0 });

      // --- 1. setting up -------------------------------------------------------
      const inTl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          // Anchored to the stick point, so the whole sequence plays with the
          // furniture already centred on the form.
          start: "top top",
          end: () => "+=" + (el.offsetHeight - window.innerHeight) * ENTER,
          scrub: 1,
          invalidateOnRefresh: true,
        },
      });
      inTl
        // The index arrives as one gesture: rows top to bottom, a beat apart — typed
        // in beside a work that is already (or almost) on its easel: the roll-out no
        // longer waits for the stick, see the arrival trigger below.
        .to(rows, { autoAlpha: 1, ease: "sine.out", duration: 0.5, stagger: 0.09 }, BEAT.name)
        // A tail so the last beat does not land on the very edge of the range, where
        // a scrub of one pixel would finish it.
        .to({}, { duration: BEAT.tail });

      // THE ROLL-OUT RIDES THE TRAVEL. It used to start after the screen stuck — so
      // the reader got the full chain in single file: the skull melts, the blob
      // crosses the stage, arrives, and only THEN becomes the work. That queue was
      // the "slow" in the entrance. Scrubbed over the ARRIVAL instead (the band's top
      // crossing the lower half of the viewport — the same stretch the choreography
      // spends carrying the piece to its dock), the metal is already rolling out
      // while it travels and lands as the framed work: the blob stops being a felt
      // stopover and becomes a trajectory. Starts at 55% and not earlier, because the
      // skull → liquid handover is still finishing above that and expects to be
      // crossfading over a SPHERE, not over a half-born plate.
      workReveal.form = 0;
      gsap.fromTo(
        workReveal,
        { form: 0 },
        {
          form: 1,
          ease: "none",
          immediateRender: false,
          scrollTrigger: {
            trigger: el,
            // 92%: the roll-out begins the moment the section shows — overlapping the
            // END OF THE SKULL'S MELT, so About→Work reads as ONE metamorphosis
            // (skull melting *into* a sheet) instead of two queued ones with a
            // resting sphere between. The mesh baton (tableauOn) passes even
            // earlier, so the sphere that starts flattening is already the
            // tableau's, and the liquid never carries it in between.
            start: "top 92%",
            end: "top top",
            scrub: 1,
            invalidateOnRefresh: true,
            // The plate must exist for the flatness to have anything to form INTO
            // (flat's target is gated on workPlate.index — see formClock), so the
            // first plate is presented the moment the arrival begins, and released
            // when the reader backs all the way out.
            onEnter: () => {
              setFormed(true);
              live.current = true;
              present(shown.current);
            },
            onLeaveBack: () => {
              // Backing out of the section rewinds it: the metal is released AND the
              // selection is wound back to the first plate, so coming down again
              // plays the sequence from the top rather than resuming where it was.
              setFormed(false);
              live.current = false;
              window.clearTimeout(timer.current);
              workPlate.clear();
              setPlate(0);
              shown.current = 0;
              target.current = 0;
            },
          },
        }
      );

      // --- 3. putting away -----------------------------------------------------
      // The entrance backwards, in four beats and strictly in this order:
      //
      //   1. the type goes — name, then numbers
      //   2. the metal is released, and finds its own form again (the blob)
      //   3. only then does the piece leave the middle, for the next section
      //
      // Beat 4 is the reason workReveal exists. It used to be a smoothstep on the
      // band's bottom edge over in ChromeCanvas, which had no way of knowing where
      // beats 1–3 had got to: the piece slid away while the frame was still around it.
      // Scrubbed from here, it cannot get ahead of them.
      //
      // fromTo, not to: a scrubbed `to` renders at progress 0 on refresh and records
      // whatever autoAlpha is at that moment as its start — which is 0, since the
      // section has not been reached yet. It would then tween 0 → 0 and the furniture
      // would never leave. immediateRender: false so declaring the start values does
      // not undo the hidden state above.
      workReveal.away = 0;
      const outTl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          // The band's last EXIT share, and not a pixel past it: `bottom bottom+=N`
          // fires when the band's bottom edge is still N px BELOW the fold, i.e. N px
          // of scroll before the band ends. So the four beats play out while the
          // screen is still stuck — the piece framed and centred — and the section is
          // put away by the time the sticky screen releases.
          start: () => "bottom bottom+=" + (el.offsetHeight - window.innerHeight) * EXIT,
          end: "bottom bottom",
          scrub: 1,
          invalidateOnRefresh: true,
        },
      });
      outTl
        .fromTo(
          type,
          { autoAlpha: 1 },
          { autoAlpha: 0, ease: "sine.in", duration: 0.5, immediateRender: false }
        )
        // The release, on its own beat — the blob has a moment to be a blob before the
        // frame around it goes. The melt itself takes about four seconds of real time
        // (see MOOD_RATE), so this is where it STARTS, not where it finishes.
        .addLabel("free")
        .to({}, { duration: 0.9 })
        // …and last, the piece steps aside. sine.inOut because this one is a MOVE
        // across the stage rather than a fade: it has to start and stop from rest.
        .fromTo(
          workReveal,
          { away: 0 },
          { away: 1, ease: "sine.inOut", duration: 0.7, immediateRender: false },
          ">-0.1"
        );

      /*
       * LA PLONGÉE. Un scrub de plus, sur sa propre bande de scroll, placé APRÈS le repos du
       * poste et AVANT la sortie. `fromTo` et pas `to`, pour la même raison que les autres
       * timelines de ce fichier : un `to` scrubbé se rend à progress 0 au refresh et
       * enregistre la valeur courante comme point de départ, ce qui fige la plongée là où
       * elle était au dernier rechargement.
       *
       * CES BORNES ONT ÉTÉ MESURÉES, ET ELLES SE CHEVAUCHENT — signalé plutôt que corrigé en
       * silence, sur consigne explicite de la tâche qui les a posées sans les mesurer.
       *
       * Le piège : dans "bottom-=140% bottom", le "%" du PREMIER mot (le côté trigger) est un
       * pourcentage de la hauteur du TRIGGER LUI-MÊME (`_offsetToPx`, appelé avec
       * `bounds.height` — voir node_modules/gsap/ScrollTrigger.js), donc des 480vh de LA BANDE
       * ENTIÈRE (.plate-band, globals.css), pas des 100vh du viewport comme le "92%" de
       * "top 92%" plus haut (qui, lui, est le second mot — le côté scroller — et SE calcule sur
       * le viewport). "bottom-=140%" vaut donc bandBottom − 1,4×480vh, pas bandBottom − 140vh.
       *
       * Conséquence, en fraction du travel de la bande (p=0 quand elle s'épingle, p=1 quand
       * elle se libère — le même p que dans geometry() ci-dessus, vérifié en rejouant à la main
       * la formule de _parsePosition) :
       *   diveTl                       p ∈ [−0,768 ; 0,495]
       *   entrée : inTl                p ∈ [0 ; 0,14]
       *   entrée : roll-out (form)     p ∈ [−0,242 ; 0]
       *   sortie : outTl (away)        p ∈ [0,78 ; 1]
       *
       * Donc AUCUN chevauchement avec la sortie — l'hypothèse qu'on redoutait le plus — mais
       * deux qu'on ne redoutait pas : diveTl CONTIENT tout le roll-out et toute l'entrée (à
       * p=0,14, `dive` est déjà à ~72 % pendant que le poste finit à peine de se former, avant
       * que le terminal ait tapé une seule lettre), et il recouvre plus de la moitié de la zone
       * [ENTER, 1−EXIT] que le handler `onScroll` plus haut utilise encore pour faire défiler
       * les plaques 0 à 2.
       *
       * CONFIRMÉ AU NAVIGATEUR, pas seulement au calcul : relevé par paliers, `dive` valait
       * 0,29 alors que `flat` était encore à 0 (le poste pas même commencé), et 0,93 quand
       * `dev` n'était qu'à 0,06 — la plongée finissait AVANT que le terminal ait parlé.
       *
       * LES BORNES CI-DESSOUS SONT PROVISOIRES, et volontairement. Elles placent la plongée
       * dans p ∈ [0,55 ; 0,75] — après que la planéité est atteinte (p≈0,46) et avant que la
       * sortie s'empare du scroll (p=0,78) — ce qui suffit à rendre les tâches suivantes
       * VÉRIFIABLES : sans ça, le tunnel et le relais se régleraient contre un `dive` déjà à 1
       * au moment où le poste se forme, et leurs captures ne voudraient rien dire.
       *
       * Elles ne sont PAS la position définitive, parce que celle-ci ne peut pas être décidée
       * ici : la séquence du terminal dure quelques secondes de temps réel (voir tubeGate) là
       * où cette fenêtre ne fait que ~960 px de scroll.
       *
       * CE PARAGRAPHE ATTENDAIT UN PIN ScrollTrigger SUR LA SECTION POUR RÉSOUDRE ÇA (« la
       * plongée prendra le scroll que le pin relâche ») — FAUX depuis que T7 a tranché POUR
       * L'ARRÊT DE LENIS plutôt que pour un pin (voir la retenue plus haut dans ce fichier, et
       * pageScroll.ts) : il n'y a pas de pin, donc pas de scroll-distance relâchée nulle part.
       * La page se fige simplement à la position `p` qu'elle avait atteinte quand le verrou a
       * pris — quelques millièmes après que `flat` atteint 1, selon la vitesse de la molette
       * juste avant que `dev` franchisse 0,55 — pour la durée réelle (accélérable) du terminal,
       * puis reprend EXACTEMENT là. Positionner `diveTl` pour de bon demande donc de mesurer CE
       * `p`-là au navigateur, pas une fraction d'un pin qui n'existe pas.
       *
       * Conversion, pour qui reprendra ces nombres : le côté trigger étant un % de la HAUTEUR
       * de la bande (3792 px mesurés) et p une fraction de son TRAVEL (3002 px), le facteur est
       * travel/hauteur ≈ 0,792. D'où 0,55 → 43,5 % et 0,75 → 59,4 %.
       */
      workReveal.dive = 0;
      const diveTl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: "top+=43.5% top",
          end: "top+=59.4% top",
          scrub: 1,
        },
      });
      diveTl.fromTo(workReveal, { dive: 0 }, { dive: 1, ease: "none" }, 0);

      // The release gate. Reversible in both directions, like the entrance gate —
      // scrolling back up out of Contact has to hand the plate back, and the plate it
      // hands back is the one that was left (not the first), so the section resumes
      // rather than restarting.
      const FREE = outTl.labels.free / outTl.duration();
      let freed = false;
      outTl.eventCallback("onUpdate", () => {
        const want = outTl.progress() >= FREE;
        if (want === freed) return;
        freed = want;
        setFormed(!want);
        live.current = !want;
        if (want) {
          window.clearTimeout(timer.current);
          workPlate.clear();
        } else {
          present(shown.current);
          // …and if the scroll moved on while the piece was let go, the walk picks up
          // the difference from here instead of the plate silently disagreeing with
          // where the reader is.
          walk();
        }
      });
    },
    { scope: ref, dependencies: [present, walk] }
  );

  const current = works[plate];

  return (
    <section
      ref={ref}
      id="work"
      className="plate-band"
      style={{ scrollMarginTop: "6rem" }}
    >
      {/* No section label here, unlike About: the composition is a piece on a field,
          and a rule + "WORK" + "02" in the corners of that field reads as a second
          frame competing with the notches. The plate numbers already say where you
          are. */}
      <div className="plate-screen">
        {/* THE INDEX — the section as a table of contents. The four names are all on
            screen, stacked in display type on the left margin like a magazine sommaire;
            the photograph is developed by the fixed stage at the RIGHT margin (the form
            is docked there, see DOCK_X_WORK). The scroll remains the single source of
            truth for the selection: it lights a row up, a click scrolls to that row's
            plate (the picks' old contract), and hovering the LIT row answers on the
            picture — colour, stillness, the step forward. */}
        <div className="plate-index" role="group" aria-label="Projects" hidden>
          {works.map((w, i) => (
            <button
              data-row
              key={w.title}
              type="button"
              className="plate-row"
              onClick={() => go(i)}
              aria-current={formed && i === plate ? "true" : "false"}
              aria-label={`Plate ${w.index} — ${w.title}`}
            >
              {/* Three digits and a full stop — the page's own way of numbering things
                  (the barcode's register): an identification number, not a rank. */}
              <span className="plate-row-no">{String(i + 1).padStart(3, "0")}.</span>
              <span className="font-display plate-row-name">{w.title.toUpperCase()}</span>
            </button>
          ))}
        </div>

        {/* The photograph is the link now — the print is drawn by the fixed stage, so
            this is its DOM hit box, sized and placed each frame by the renderer (the
            --plate-px vars, see LiquidDna): only the shader knows what shape and where
            the current picture is. Hovering it is the read gesture — the picture takes
            its colour, holds still, steps forward — and clicking it opens the live
            site: the affordance sits ON the proof, not on the name that summons it. */}
        {/* CACHÉ AVEC LES PROJETS. La forme est un téléviseur qui ne montre plus les
            œuvres — un lien qui ouvre le site d'un projet depuis un poste qui n'affiche
            rien de ce projet est une affordance orpheline (et son hover ne répondait
            plus par rien de visible : la couleur qu'il appelait vit sur la dalle photo,
            elle-même cachée). Revient avec l'affichage des projets. `false &&` plutôt
            qu'un retrait : le bloc et son commentaire d'origine restent la doc du
            geste à restaurer. */}
        {false && formed && (
          <a
            className="plate-hit"
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${current.title} — open the live site in a new tab`}
            onPointerEnter={() => {
              workPlate.hover = true;
            }}
            onPointerLeave={() => {
              workPlate.hover = false;
            }}
            onFocus={() => {
              workPlate.hover = true;
            }}
            onBlur={() => {
              workPlate.hover = false;
            }}
          />
        )}
      </div>
    </section>
  );
}
