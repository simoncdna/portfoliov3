import { Reveal } from "@/components/Reveal";
import { ScrubReveal } from "@/components/ScrubReveal";
import { Kicker, Index } from "@/components/Bits";
import { MagneticLink } from "@/components/MagneticLink";
import { MailDust } from "@/components/MailDust";
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

        <div className="mt-14">
          <MailDust email={site.email} />
        </div>

        {/* The "Direct" column that used to sit beside this held the address in 0.9rem mono —
            the same address the dust above now gives at 128px, a few centimetres apart. Two
            printings of one string, one of them the section's whole payoff. The grid it shared
            went with it: a twelve-column layout for a single list is scaffolding for a column
            that no longer exists. */}
        <div className="mt-16">
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
    </section>
  );
}
