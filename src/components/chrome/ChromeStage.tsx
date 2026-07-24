"use client";

import { HeroChrome } from "./HeroChrome";

/**
 * Fixed full-screen stage holding the solid chrome blob.
 */
export function ChromeStage() {
  return (
    <div
      aria-hidden
      style={{ position: "fixed", inset: 0, zIndex: 4, pointerEvents: "none" }}
    >
      <HeroChrome />
    </div>
  );
}
