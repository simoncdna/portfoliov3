"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight } from "@/components/Bits";
import { works } from "@/data/site";
import { workHover } from "@/lib/workHover";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Work — About in mirror image: the chrome form docks RIGHT here, so the list
 * lives on the LEFT. The section PINS centred and one scrubbed timeline plays the
 * whole sequence, exactly as About does:
 *
 *   1. the mono rule beside "Selected Work" draws itself left → right
 *   2. "Selected Work" draws in
 *   3. "02" draws in
 *   4. the project rows draw in, one after another
 *   5. everything stays put for a long beat — the section is pinned and still, so
 *      this is where the list is actually read and hovered
 *   6. it fades out, handing off to Contact
 *
 * The rows are deliberately quiet: index, title, year, and nothing more until you
 * ask. Hovering one opens its summary and stack AND reshapes the blob beside it
 * (see workHover, where each project's silhouette echoes its subject). The form is
 * this section's hover state, which is why the rows themselves need not shout.
 *
 * Same unveil vocabulary as About: a top→bottom clip curtain plus fade for text
 * (no vertical slide), a scaleX draw for the rule.
 */

const VEILED = "inset(0% 0% 100% 0%)";
const SHOWN = "inset(0% 0% -8% 0%)";

export function Work() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const rule = el.querySelector<HTMLElement>("[data-line]");
      const label = el.querySelector<HTMLElement>("[data-label]");
      const index = el.querySelector<HTMLElement>("[data-index]");
      const rows = gsap.utils.toArray<HTMLElement>(el.querySelectorAll("[data-row]"));
      const text = [label, index, ...rows].filter(Boolean) as HTMLElement[];

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set([rule, ...text].filter(Boolean), { clearProps: "all" });
        return;
      }

      gsap.set(rule, { scaleX: 0, transformOrigin: "left center", willChange: "transform" });
      gsap.set(text, { clipPath: VEILED, autoAlpha: 0, willChange: "clip-path, opacity" });

      // One ScrollTrigger pins and scrubs, as in About. `end` is sized from the
      // timeline's own length (~5.05 units here against About's ~10.55, at ~246 px
      // per unit) so that a beat costs the same amount of scroll in both sections —
      // otherwise the two read at different speeds despite using the same eases.
      gsap
        .timeline({
          scrollTrigger: {
            trigger: el,
            start: "center 62%",
            end: "+=1240",
            scrub: 1,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        })
        .to(rule, { scaleX: 1, ease: "sine.inOut", duration: 0.5 })
        .to(label, { clipPath: SHOWN, autoAlpha: 1, ease: "sine.out", duration: 0.5 }, ">-0.05")
        .to(index, { clipPath: SHOWN, autoAlpha: 1, ease: "sine.out", duration: 0.5 }, ">0.1")
        // 4. the rows, as a cascade rather than as four separate events. The
        //    stagger has to stay well UNDER each row's own duration: at 0.4 against
        //    a 0.6 duration the first row finished a full ~150 px of scroll before
        //    the last one started, so row 01 sat alone on screen for a third of the
        //    pin and read as belonging to a different animation. At 0.16 they
        //    overlap heavily and the eye reads one wave down the list.
        .to(
          rows,
          { clipPath: SHOWN, autoAlpha: 1, ease: "sine.out", duration: 0.6, stagger: 0.16 },
          ">0.1"
        )
        // 5. the reading beat: a long pause with everything drawn and nothing
        //    moving. It exists so the hover interaction has somewhere to happen —
        //    without it the list would still be arriving, or already leaving.
        .to({}, { duration: 1.6 })
        .to([rule, ...text], { autoAlpha: 0, ease: "sine.in", duration: 0.7 });
    },
    { scope: ref }
  );

  return (
    <section
      ref={ref}
      id="work"
      className="relative min-h-screen py-[var(--section-y)]"
      style={{ scrollMarginTop: "6rem" }}
    >
      <div className="shell grid min-h-screen grid-cols-1 items-start md:grid-cols-12">
        {/* left column — the list */}
        <div className="pt-[14vh] md:col-span-7 md:pr-8">
          {/* section label + index, built like About's so the two read as a pair */}
          <div className="mb-10 flex items-baseline justify-between">
            <span className="font-mono-label inline-flex items-center gap-2">
              <span data-line aria-hidden className="inline-block h-px w-6 bg-steel-2" />
              <span data-label>Work</span>
            </span>
            <span
              data-index
              className="font-display fs-h3 tabular-nums text-silver-muted"
            >
              02
            </span>
          </div>

          <ul>
            {works.map((w) => (
              <li key={w.title} data-row>
                <a
                  href={w.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="work-row work-row--quiet group"
                  aria-label={`${w.title} — open live site in a new tab`}
                  // Focus mirrors hover, so the form answers the keyboard too
                  onPointerEnter={() => workHover.enter(w.title)}
                  onPointerLeave={() => workHover.leave(w.title)}
                  onFocus={() => workHover.enter(w.title)}
                  onBlur={() => workHover.leave(w.title)}
                >
                  <div className="work-row-inner">
                    <div className="flex items-baseline justify-between gap-6">
                      <span className="flex items-baseline gap-4">
                        <span className="work-index font-mono text-[0.68rem] tabular-nums text-silver-muted">
                          {w.index}
                        </span>
                        <span className="work-title font-display fs-h3">{w.title}</span>
                        <ArrowRight className="work-arrow h-3 w-7 shrink-0 self-center text-silver-muted" />
                      </span>
                      {/* Edition number, not a date — see the note in data/site.ts.
                          Set at the system's own label size and tracking
                          (--fs-label / 0.18em) rather than a hair under it. */}
                      <span className="font-mono text-[0.6875rem] whitespace-nowrap uppercase tracking-[0.18em] text-silver-muted">
                        {w.timeline}
                      </span>
                    </div>

                    {/* Opens on hover / focus only. Grid-rows 0fr → 1fr animates a
                        height the content decides, so nothing has to be measured.
                        One sentence about the project and nothing else: the stack is
                        deliberately not shown — see the note in data/site.ts. */}
                    <div className="work-fold">
                      <div className="min-h-0 overflow-hidden">
                        {w.summary && (
                          <p className="mt-3 max-w-md text-[0.88rem] leading-relaxed text-silver">
                            {w.summary}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* right half kept open for the docked chrome form */}
        <div className="hidden md:col-span-5 md:block" aria-hidden />
      </div>
    </section>
  );
}
