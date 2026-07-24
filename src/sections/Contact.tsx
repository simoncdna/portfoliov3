import { Reveal } from "@/components/Reveal";
import { ScrubReveal } from "@/components/ScrubReveal";
import { Kicker, Index } from "@/components/Bits";
import { MagneticLink } from "@/components/MagneticLink";
import { site } from "@/data/site";

export function Contact() {
  return (
    <section
      id="contact"
      className="relative overflow-hidden py-[var(--section-y)]"
      style={{ scrollMarginTop: "6rem" }}
    >
      <div className="shell relative z-10">
        <div className="flex items-center justify-between">
          <Reveal>
            <Kicker>Contact</Kicker>
          </Reveal>
          <Reveal delay={80}>
            <Index>03</Index>
          </Reveal>
        </div>

        <hr className="hairline my-8" />

        <Reveal delay={80}>
          <p className="max-w-xl text-[clamp(1.1rem,2.4vw,1.9rem)] leading-snug text-silver">
            Got a new project in mind? An opportunity?
          </p>
        </Reveal>

        <div className="mt-8 mix-blend-difference">
          <ScrubReveal>
            <MagneticLink
              href={`mailto:${site.email}`}
              strength={10}
              ariaLabel={`Email ${site.name}`}
            >
              <span className="font-display fs-h1 text-chrome transition-opacity duration-300 hover:opacity-80">
                Let&apos;s have
                <br />a chat.
              </span>
            </MagneticLink>
          </ScrubReveal>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-12">
          <div className="md:col-span-6">
            <span className="font-mono-label block">Direct</span>
            <MagneticLink href={`mailto:${site.email}`} strength={4}>
              <span className="magnetic-underline mt-2 inline-block font-mono text-[0.9rem] text-silver-bright">
                {site.email}
              </span>
            </MagneticLink>
          </div>

          <div className="md:col-span-6">
            <span className="font-mono-label block">Elsewhere</span>
            <ul className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
              {site.socials.map((s) => (
                <li key={s.label}>
                  <MagneticLink href={s.href} external strength={4}>
                    <span className="magnetic-underline font-mono text-[0.8rem] uppercase tracking-[0.12em] text-silver transition-colors duration-200 hover:text-chrome">
                      {s.label} ↗
                    </span>
                  </MagneticLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
