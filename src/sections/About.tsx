import { Reveal } from "@/components/Reveal";
import { Kicker, Index } from "@/components/Bits";
import { site } from "@/data/site";

export function About() {
  return (
    <section
      id="about"
      className="relative py-[var(--section-y)]"
      style={{ scrollMarginTop: "6rem" }}
    >
      <div className="shell">
        {/* header row */}
        <div className="flex items-center justify-between">
          <Reveal>
            <Kicker>About</Kicker>
          </Reveal>
          <Reveal delay={80}>
            <Index>01</Index>
          </Reveal>
        </div>

        <hr className="hairline my-8" />

        <div className="grid grid-cols-1 gap-x-10 gap-y-14 md:grid-cols-12">
          {/* Big statement */}
          <div className="md:col-span-7">
            <Reveal variant="mask">
              <h2 className="font-display fs-h1 text-chrome-grad">
                Crafting modern,
                <br />
                responsive
                <br />
                interfaces.
              </h2>
            </Reveal>
          </div>

          {/* Bio */}
          <div className="flex flex-col gap-6 md:col-span-5 md:pt-4">
            {site.bio.map((line, i) => (
              <Reveal key={i} delay={i * 90}>
                <p
                  className={
                    i === 0
                      ? "text-[1.05rem] leading-relaxed text-silver-bright"
                      : "text-[0.98rem] leading-relaxed text-silver"
                  }
                >
                  {line}
                </p>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Skills */}
        <div className="mt-20 grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-12">
          <div className="md:col-span-6">
            <Reveal>
              <span className="font-mono-label">Languages &amp; Frameworks</span>
            </Reveal>
            <ul className="mt-5 flex flex-col">
              {site.languages.map((item, i) => (
                <Reveal
                  as="li"
                  key={item}
                  delay={i * 50}
                  className="skill-row"
                >
                  <span className="font-display text-[clamp(1.5rem,3.4vw,2.6rem)] text-silver transition-colors duration-300">
                    {item}
                  </span>
                  <span className="font-mono text-[0.65rem] text-silver-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </Reveal>
              ))}
            </ul>
          </div>

          <div className="md:col-span-6">
            <Reveal>
              <span className="font-mono-label">Libraries &amp; Tools</span>
            </Reveal>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-4">
              {site.tools.map((item, i) => (
                <Reveal as="span" key={item} delay={i * 40}>
                  <span className="font-display text-[clamp(1.1rem,2vw,1.6rem)] text-silver transition-colors duration-300 hover:text-chrome">
                    {item}
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
