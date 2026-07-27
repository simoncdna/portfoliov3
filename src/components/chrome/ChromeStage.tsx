"use client";

import { HeroChrome } from "./HeroChrome";

/**
 * Fixed full-screen stage holding the solid chrome blob.
 */
export function ChromeStage() {
  return (
    <div
      aria-hidden
      // Named so the section menu can take it out of the compositor while it is fully
      // covered — see .chrome-stage in globals.css for why that is not an optimisation
      // but a fix.
      className="chrome-stage"
      // NOTE the z-index is NOT here. It lives in globals.css because the preloader has to
      // raise this layer above its own backdrop for the length of the intro, and an inline
      // style beats any class rule — including that one. Leaving it inline meant the override
      // silently did nothing.
      style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
    >
      <HeroChrome />
    </div>
  );
}
