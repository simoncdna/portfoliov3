import { HeroChrome } from "@/components/chrome/HeroChrome";
import { Reveal } from "@/components/Reveal";
import { Barcode, Globe } from "@/components/Bits";
import { site } from "@/data/site";

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] flex-col justify-between overflow-hidden pt-28 pb-8"
    >
      {/* Chrome centerpiece — the foreground hero object (+ dev controls) */}
      <HeroChrome />

      {/* SEO / a11y heading (visually the chrome form carries the hero) */}
      <h1 className="sr-only">
        {site.name} — {site.role}
      </h1>

      {/* Right-edge vertical title (poster language) */}
      <div className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 md:block">
        <span className="vertical-rl font-display text-[clamp(1.5rem,3vw,2.6rem)] text-silver">
          {site.name}
          <span className="text-silver-muted"> //</span>
        </span>
      </div>

      {/* Top meta row */}
      <div className="shell relative z-10 flex items-start justify-between">
        <Reveal delay={100}>
          <span className="font-mono-label">
            [ PORTFOLIO ] — {site.edition}
          </span>
        </Reveal>
        <Reveal delay={160}>
          <span className="hidden items-center gap-2 font-mono-label sm:inline-flex">
            <Globe className="h-4 w-4 text-silver-muted" />
            BASED IN {site.location.toUpperCase()}
          </span>
        </Reveal>
      </div>

      {/* Bottom details row */}
      <div className="shell relative z-10 mt-8 grid grid-cols-2 items-end gap-6 md:grid-cols-12">
        <Reveal delay={200} className="col-span-2 max-w-sm md:col-span-4">
          <p className="text-[0.95rem] leading-relaxed text-silver">
            {site.bio[0]} Turning ideas from businesses &amp; startups into
            high-performing web applications.
          </p>
        </Reveal>

        <div className="col-span-2 hidden md:col-span-4 md:flex md:justify-center">
          <Reveal delay={280}>
            <a
              href="#work"
              className="group flex flex-col items-center gap-3"
              aria-label="Scroll to selected work"
            >
              <span className="font-mono-label">Scroll</span>
              <span className="scroll-cue" aria-hidden />
            </a>
          </Reveal>
        </div>

        <Reveal
          delay={200}
          className="col-span-2 flex items-end justify-end gap-4 md:col-span-4"
        >
          <div className="text-right">
            <span className="font-mono-label block">Edition</span>
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-silver-bright">
              N°003
            </span>
          </div>
          <Barcode className="h-9 w-24 opacity-80" />
        </Reveal>
      </div>
    </section>
  );
}
