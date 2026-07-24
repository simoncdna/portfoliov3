import { Reveal } from "@/components/Reveal";
import { ScrubReveal } from "@/components/ScrubReveal";
import { Kicker, Index, ArrowRight } from "@/components/Bits";
import { works } from "@/data/site";

export function Work() {
  return (
    <section
      id="work"
      className="relative py-[var(--section-y)]"
      style={{ scrollMarginTop: "6rem" }}
    >
      <div className="shell">
        <div className="flex items-center justify-between">
          <Reveal>
            <Kicker>Selected Work</Kicker>
          </Reveal>
          <Reveal delay={80}>
            <Index>02</Index>
          </Reveal>
        </div>

        <ScrubReveal as="h2" className="mt-6 font-display fs-h1 text-chrome">
          Around the work<span className="text-silver-muted"> //</span>
        </ScrubReveal>

        <ul className="mt-14">
          {works.map((w, i) => (
            <Reveal as="li" key={w.title} delay={i * 60}>
              <a
                href={w.url}
                target="_blank"
                rel="noopener noreferrer"
                className="work-row group"
                aria-label={`${w.title} — open live site in a new tab`}
              >
                <div className="work-row-inner">
                  {/* top line */}
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="flex items-baseline gap-4 md:gap-8">
                      <span className="font-mono text-[0.7rem] text-silver-muted">
                        {w.index}
                      </span>
                      <span className="work-title font-display text-[clamp(2rem,7vw,5.5rem)]">
                        {w.title}
                      </span>
                    </div>
                    <ArrowRight className="work-arrow h-4 w-10 shrink-0 text-silver-muted" />
                  </div>

                  {/* detail line */}
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-8">
                    <span className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-silver-muted md:col-span-3">
                      {w.timeline}
                    </span>
                    <p className="max-w-md text-[0.92rem] leading-relaxed text-silver md:col-span-5">
                      {w.summary}
                    </p>
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 md:col-span-4 md:justify-end">
                      {[...w.languages, ...w.tools].map((t) => (
                        <span
                          key={t}
                          className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-silver-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </a>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
