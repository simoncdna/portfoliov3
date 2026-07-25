/**
 * Bridge between the About section's pinned reveal timeline (DOM/GSAP) and the
 * chrome form's clock (WebGL). While About is pinned:
 *
 *  - `hold` (0..1) freezes the ambient scroll-driven turntable, so the page's
 *    global "turn as you scroll" stops fighting the section's own rotation —
 *    otherwise the two stack and the skull reads as turning ~1.5× instead of a
 *    single clean 360°;
 *  - `spin` (radians) is the ONE controlled turn the section scrubs in, once the
 *    text has finished drawing, and the form clock adds it to the skull;
 *  - `exit` (0..1) is the section's last movement, scrubbed after the text has
 *    faded: the form leaves its left dock, comes back to the middle, grows into
 *    the space the text just vacated, then unmakes itself into the resting sphere
 *    — the state the next section's form melts out of. It drives the whole
 *    About→Work transition (see formChoreo), which is why that transition is no
 *    longer read off the Work section's position: it is a continuation of this
 *    sequence, not a separate one that could drift from it.
 *
 * Plain mutable singletons (like sectionStore): read every frame by the form
 * clock, written by the scrubbed timeline / its ScrollTrigger callbacks.
 */
export const aboutReveal = { spin: 0, hold: 0, exit: 0 };
