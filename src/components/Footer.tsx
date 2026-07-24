import { Barcode, Globe } from "./Bits";
import { MagneticLink } from "./MagneticLink";
import { site } from "@/data/site";

export function Footer() {
  return (
    <footer className="relative border-t border-steel py-10">
      <div className="shell">
        {/* Giant wordmark */}
        <div className="mix-blend-difference">
          <span className="font-display block text-[clamp(3rem,17vw,15rem)] leading-none text-chrome">
            Cardona
          </span>
        </div>

        <div className="mt-8 grid grid-cols-2 items-end gap-6 md:grid-cols-12">
          <div className="col-span-2 md:col-span-4">
            <span className="font-mono-label block">Details:</span>
            <p className="mt-2 max-w-xs text-[0.8rem] leading-relaxed text-silver-muted">
              {site.role}, based in {site.location}. Available for freelance and
              full-time opportunities.
            </p>
          </div>

          <div className="col-span-1 hidden md:col-span-4 md:flex md:justify-center">
            <Globe className="h-8 w-8 text-silver-muted" />
          </div>

          <div className="col-span-2 flex items-end justify-between gap-4 md:col-span-4 md:justify-end">
            <MagneticLink href="#top" strength={4} ariaLabel="Back to top">
              <span className="magnetic-underline font-mono text-[0.7rem] uppercase tracking-[0.14em] text-silver">
                Back to top ↑
              </span>
            </MagneticLink>
            <Barcode className="h-8 w-24 opacity-70" />
          </div>
        </div>

        <hr className="hairline my-8" />

        <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-silver-muted">
            © {new Date().getFullYear()} {site.name} — All rights reserved
          </span>
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-silver-muted">
            {site.edition} / N°003
          </span>
        </div>
      </div>
    </footer>
  );
}
