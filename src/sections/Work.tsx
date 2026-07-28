"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { works } from "@/data/site";
import { workPlate } from "@/lib/workPlate";
import { workReveal } from "@/lib/workReveal";
import { scrollPageTo } from "@/lib/pageScroll";

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
// 0.12, down from 0.18: the first payoff was too far away. The blob is already centre
// stage when the band sticks (About's exit walks it there), so a long arrival was scroll
// spent watching a thing that had already happened — the entrance now gets to the
// roll-out, its peak and the developer sooner, and the plates get the travel back.
const ENTER = 0.12;
const EXIT = 0.22;

/**
 * The entrance's beats, in timeline units. Absolute positions rather than the usual
 * relative ones because the forming is pinned to the same instant as the name (see
 * FORMS below): with `>`-relative placement, inserting a beat would silently move the
 * moment the metal starts to change.
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
        // The index arrives as one gesture: rows top to bottom, a beat apart — the
        // sommaire being typed out while the metal is rolled into the first picture.
        .to(rows, { autoAlpha: 1, ease: "sine.out", duration: 0.5, stagger: 0.09 }, BEAT.name)
        // A tail so the last beat does not land on the very edge of the range, where
        // a scrub of one pixel would finish it.
        .to({}, { duration: BEAT.tail });

      // The forming, as a fraction of the entrance's progress: the same instant the
      // name starts to arrive. Derived from the timeline's own duration rather than
      // written down, so re-timing the beats above cannot leave it behind.
      const FORMS = BEAT.name / inTl.duration();
      // Edge-triggered: onUpdate fires on every scrubbed frame, and setState (plus
      // workPlate's own turn accounting) has no business running 60 times a second.
      let on = false;
      inTl.eventCallback("onUpdate", () => {
        const want = inTl.progress() >= FORMS;
        if (want === on) return;
        on = want;
        setFormed(want);
        if (want) {
          // The first plate starts its dwell here, so scrolling straight on cannot
          // switch away from it before it has been seen.
          live.current = true;
          present(shown.current);
        } else {
          // Backing out of the section rewinds it: the metal is released AND the
          // selection is wound back to the first plate, so coming down again plays
          // the sequence from the top rather than resuming where it was left.
          live.current = false;
          window.clearTimeout(timer.current);
          workPlate.clear();
          setPlate(0);
          shown.current = 0;
          target.current = 0;
        }
      });

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
        <div className="plate-index" role="group" aria-label="Projects">
          {works.map((w, i) => {
            const meta = [...w.languages, ...w.tools.slice(0, 2)].join(" · ");
            return (
              <button
                data-row
                key={w.title}
                type="button"
                className="plate-row"
                onClick={() => go(i)}
                aria-current={formed && i === plate ? "true" : "false"}
                aria-label={`Plate ${w.index} — ${w.title}`}
                // The hover gesture belongs to the plate being READ: pointing at its
                // name holds the picture still, colours it, steps it forward (the eased
                // gesture lives in the form clock; this only reports the fact). Focus
                // too, so a keyboard is told the same thing.
                onPointerEnter={() => {
                  if (i === plate) workPlate.hover = true;
                }}
                onPointerLeave={() => {
                  workPlate.hover = false;
                }}
                onFocus={() => {
                  if (i === plate) workPlate.hover = true;
                }}
                onBlur={() => {
                  workPlate.hover = false;
                }}
              >
                <span className="plate-row-no">N°{w.index}</span>
                <span className="font-display plate-row-name">{w.title.toUpperCase()}</span>
                {meta && <span className="plate-row-meta">{meta}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
