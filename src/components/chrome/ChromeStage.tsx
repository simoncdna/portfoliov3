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
      style={{ position: "fixed", inset: 0, zIndex: 4, pointerEvents: "none" }}
    >
      <HeroChrome />
    </div>
  );
}
