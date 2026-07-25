"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { aboutReveal } from "@/lib/aboutReveal";
import { site } from "@/data/site";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * About — the chrome form docks LEFT during the Hero→About transition; the
 * content lives on the RIGHT. The section PINS centred (the page appears to stop
 * scrolling) and a single scrubbed timeline plays the whole sequence in sync
 * with the scroll:
 *
 *   1. the mono rule beside "About" draws itself left → right
 *   2. "About" draws in
 *   3. "01" draws in
 *   4. the bio paragraphs draw in, one after another
 *   …all of it while the skull turns a single 360° (via aboutReveal.spin, added
 *      into the form clock): the rotation is laid over the reveal rather than
 *      queued after it, so the same scroll writes the text and turns the head
 *   5. the section fades out in place (opacity only, nothing slides)
 *   6. the form takes the emptied stage: back to the middle, swelling, then
 *      unmaking itself into the resting sphere — the About→Work transition,
 *      scrubbed from here via aboutReveal.exit rather than read off the Work
 *      section's position, so it cannot drift from the fade it follows
 *
 * Text pieces are unveiled with a top→bottom clip curtain + fade (no vertical
 * slide); the rule is a scaleX draw from its left edge.
 */

// clip-path keyframes for the top→bottom unveil. VEILED hides a piece by
// insetting its full height from the bottom; SHOWN pulls the bottom edge just
// past the box (−8%) so descenders / the silver halo are never clipped.
const VEILED = "inset(0% 0% 100% 0%)";
const SHOWN = "inset(0% 0% -8% 0%)";

export function About() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const rule = el.querySelector<HTMLElement>("[data-line]");
      const about = el.querySelector<HTMLElement>("[data-about]");
      const index = el.querySelector<HTMLElement>("[data-index]");
      const bio = gsap.utils.toArray<HTMLElement>(el.querySelectorAll("[data-zone]"));
      const text = [about, index, ...bio].filter(Boolean) as HTMLElement[];

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set([rule, ...text].filter(Boolean), { clearProps: "all" });
        aboutReveal.spin = 0;
        aboutReveal.exit = 0;
        return;
      }

      // start states: the rule collapsed to its left edge; every text piece
      // veiled and transparent (opacity, not translation → no vertical slide).
      gsap.set(rule, { scaleX: 0, transformOrigin: "left center", willChange: "transform" });
      gsap.set(text, { clipPath: VEILED, autoAlpha: 0, willChange: "clip-path, opacity" });
      aboutReveal.spin = 0;
      aboutReveal.hold = 0;
      aboutReveal.exit = 0;

      // One ScrollTrigger both PINS and scrubs, so the reveal, the skull's spin
      // and the fade can never drift apart. `end` is the scroll distance that
      // drives the entire pinned sequence — long, so every beat has room to feel
      // soft (more scroll "resistance", gentler motion). While pinned, `hold`
      // freezes the ambient turntable so the skull's only rotation is the single
      // controlled 360° below (no stacking → no "1.5 turns" wobble).
      gsap
        .timeline({
          scrollTrigger: {
            trigger: el,
            start: "center 62%", // engage a touch earlier (starts sooner)
            // Scales with the timeline's length: the scrub spreads the WHOLE
            // timeline over this distance, so adding a beat (a bio paragraph, the
            // exit) would otherwise speed every other beat up by the same share.
            // Sized from the timeline's length at ~246 px per unit, the rate Work
            // is calibrated against too. Folding the 360° into the reveal instead of
            // queueing it after took the timeline from ~10.55 units to ~7.75.
            end: "+=1900",
            scrub: 1, // a frame of smoothing on top of the scrub → softer
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onToggle: (self) => {
              aboutReveal.hold = self.isActive ? 1 : 0;
            },
          },
        })
        // 1. rule draws left → right
        .to(rule, { scaleX: 1, ease: "sine.inOut", duration: 0.5 })
        // 2. "About"
        .to(about, { clipPath: SHOWN, autoAlpha: 1, ease: "sine.out", duration: 0.5 }, ">-0.05")
        // 3. "01"
        .to(index, { clipPath: SHOWN, autoAlpha: 1, ease: "sine.out", duration: 0.5 }, ">0.1")
        // 4. bio paragraphs, one after another
        .to(
          bio,
          { clipPath: SHOWN, autoAlpha: 1, ease: "sine.out", duration: 0.6, stagger: 0.45 },
          ">0.1"
        )
        // 5. the whole section fades out where it stands — no slide, so the eye is
        //    handed straight to the form rather than following text off-screen
        .to([rule, ...text], { autoAlpha: 0, ease: "sine.in", duration: 0.7 }, ">0.15")
        .addLabel("faded")
        // 6. …and the form takes the emptied stage: it leaves the left dock, comes
        //    back to the middle, swells into the space the text just vacated, then
        //    unmakes itself into the resting sphere the next section's form melts
        //    out of. One scrubbed value, overlapping beats — see formChoreo.
        //    Long, because its last fifth is the skull→blob cross-fade: that swap
        //    can only hide inside a narrow range of shape, so the only way to make
        //    it flow is to give that range plenty of scroll.
        .to(aboutReveal, { exit: 1, ease: "sine.inOut", duration: 3.2 }, "faded+=0.1")
        // …and, laid OVER all of the above from the very first pixel of scroll: the
        // skull's single 360°. Inserted last but positioned at 0, so it runs
        // concurrently with the reveal instead of after it — the turn and the
        // writing are one gesture, driven by the same scroll. It lands exactly as
        // the fade ends, which is where the exit's own spin takes over, so the form
        // is never left standing still. (Hence the absolute position and the label
        // above: `>` is relative to the previously INSERTED tween, which would make
        // this one's placement reorder everything after it.)
        .to(aboutReveal, { spin: Math.PI * 2, ease: "sine.inOut", duration: 4.45 }, 0);
    },
    { scope: ref }
  );

  return (
    <section
      ref={ref}
      id="about"
      className="relative min-h-screen py-[var(--section-y)]"
      style={{ scrollMarginTop: "6rem" }}
    >
      <div className="shell grid min-h-screen grid-cols-1 items-start md:grid-cols-12">
        {/* left half kept open for the docked chrome form */}
        <div className="hidden md:col-span-5 md:block" aria-hidden />

        {/* right column — label + bio, drawn in while the section is pinned. The
            content is top-anchored with a viewport offset so it opens in the
            upper third of the screen rather than dead-centre. The label pieces
            are split out (rule / word / index) so each can be sequenced. */}
        <div className="pt-[14vh] md:col-span-7 md:pl-6">
          {/* section label + index */}
          <div className="mb-10 flex items-baseline justify-between">
            <span className="font-mono-label inline-flex items-center gap-2">
              <span
                data-line
                aria-hidden
                className="inline-block h-px w-6 bg-steel-2"
              />
              <span data-about>About</span>
            </span>
            <span
              data-index
              className="font-display fs-h3 text-silver-muted tabular-nums"
            >
              01
            </span>
          </div>

          <div className="flex max-w-xl flex-col gap-5">
            {site.bio.map((line, i) => (
              <p
                key={i}
                data-zone
                className={
                  i === 0
                    ? "text-[1.05rem] leading-relaxed text-silver-bright"
                    : "text-[0.98rem] leading-relaxed text-silver"
                }
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
