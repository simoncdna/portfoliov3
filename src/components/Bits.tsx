import type { ReactNode } from "react";

/** Mono kicker label — the "// SCRAPBOOK" poster meta line. */
export function Kicker({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`font-mono-label inline-flex items-center gap-2 ${className}`}>
      <span aria-hidden className="inline-block h-px w-6 bg-steel-2" />
      {children}
    </span>
  );
}

/** Rounded chip, the "US"-pill language. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-silver"
      style={{ borderColor: "var(--steel-2)" }}
    >
      {children}
    </span>
  );
}

/** Big section index numeral, e.g. 01. */
export function Index({ children }: { children: ReactNode }) {
  return (
    <span className="font-display fs-h3 text-silver-muted tabular-nums">
      {children}
    </span>
  );
}

/** Decorative barcode strip (poster margin motif). */
export function Barcode({ className = "" }: { className?: string }) {
  // deterministic-ish widths so SSR and client match
  const bars = [3, 1, 2, 1, 1, 4, 1, 2, 1, 3, 1, 1, 2, 1, 4, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 1, 1, 4, 1, 2, 1, 1, 3];
  let x = 0;
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 40"
      className={className}
      preserveAspectRatio="none"
      role="presentation"
    >
      {bars.map((w, i) => {
        const rect =
          i % 2 === 0 ? (
            <rect key={i} x={x} y={0} width={w} height={40} fill="var(--silver-bright)" />
          ) : null;
        x += w;
        return rect;
      })}
    </svg>
  );
}

/** Globe glyph used in the poster margins. */
export function Globe({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <ellipse cx="12" cy="12" rx="4" ry="10" />
      <path d="M2 12h20M4 6.5h16M4 17.5h16" />
    </svg>
  );
}

/** Small SE-corner arrow. */
export function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 40 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className={className}
    >
      <path d="M0 8h37M30 2l7 6-7 6" />
    </svg>
  );
}
