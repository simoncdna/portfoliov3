"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* ------------------------------------------------------------------
   Mail dust
   ------------------------------------------------------------------
   The address as a field of grain that condenses into type as you scroll into Contact.
   At the top of the trigger it is a slow, edgeless cloud; at the bottom it is the
   address, set on two lines in Space Mono, one dot per sample of its own glyphs. It
   never fully stops: the grain keeps breathing at both ends of the scrub.

   WHY IT LIVES HERE AND NOT IN THE HEADER CORNER. Grain only reads as grain if there
   are gaps in it, which makes the effect a function of SIZE, not of particle count. In
   the references this shape is ~700px wide and each dot is ~0.2% of that width. At the
   46px of a corner ornament the smallest possible dot — one device pixel — is 2.2% of
   the width, i.e. eleven times too coarse, and the whole figure only has ~2000 cells to
   spend. You get a grey speckle, not dust. Contact is where there is room: the address
   is already this section's payoff, and at ~118px of type there are enough pixels for
   the gaps to exist.

   TWO CLOCKS, BOTH BOUNDED. Scroll position drives the CONDENSING (ScrollTrigger, so
   scrolling back scatters the cloud again — the best part of it, and it makes the
   gathering read as arrival at the end of the page rather than as an ambient effect).
   Elapsed time drives the LIFE, on gsap.ticker — the same clock Lenis and every
   scrubbed animation on this page already share, so there is no second rAF and no
   desync. The ticker is only attached while the block is on screen (see the
   IntersectionObserver below), so the cost is zero for the eleven screens where this
   section is nowhere near the viewport.

   THE ADDRESS STAYS REAL TEXT. The canvas is decoration over a live anchor: the `<a>`
   carries the mailto and the label, the fallback holds the address in the DOM, and the
   canvas only takes over once the cloud has actually been built. No JS, an unbuilt
   canvas, reduced motion, or a viewport too narrow for the grain to read — in every one
   of those cases what is on screen is the address as type, which is also what a screen
   reader and a crawler see.
*/

/** CSS px between samples of the rasterised glyphs. Converted to device px at build
 *  time, so density is the same on a 1x and a 2x screen.
 *
 *  This and DOT together are the ink coverage of the formed state: dots of DOT device px
 *  on a grid of SAMPLE_STEP CSS px cover (DOT / (SAMPLE_STEP × dpr))² of a stem. At 2 and
 *  1.5 that was 14% and the address came out a ghost — legible, but nothing like the
 *  weight of the type around it. 1.6 and 1.8 is 32%: still visibly granular up close,
 *  solid enough at reading distance to hold against the display face above it. */
const SAMPLE_STEP = 1.6;

/** Below this font size the grain cannot read (see above) and the component leaves the
 *  address as plain type. ~400px viewport and under. */
const MIN_FONT_PX = 34;

/** Fraction of the scroll spent letting particles set off, so the form emerges instead
 *  of snapping. Every particle still lands exactly at progress 1. */
const STAGGER = 0.45;

/** Device px. Fractional on purpose: fillRect on a non-integer box is antialiased,
 *  which is what gives a soft dot instead of a hard square — the glow in the references
 *  is edge softness, not a shadow. A shadowBlur per dot would cost 100× for the look. */
const DOT = 1.8;

/** Wander amplitude once formed, as a fraction of the cloud's. Not zero: type made of
 *  perfectly still dots looks like a screenshot of the effect rather than the effect.
 *  Sized so the settled shimmer is under a CSS pixel — enough to be alive, too little
 *  to blur the letterforms. */
const SETTLED = 0.025;

const TAU = Math.PI * 2;

/**
 * Broken after the @, into `cdna.simon@` / `gmail.com`.
 *
 * Set on ONE line the address is a 12em bar — twenty monospaced characters against one
 * of x-height. Condensing a cloud into that reads as a slot closing, not as a body
 * forming, and it caps the type at whatever font-size keeps 12em inside the shell.
 * Broken at the @ the longest line is 11 characters, so the same shell buys ~30% more
 * size AND the formed state is a block roughly as tall as it is wide — a mass, which is
 * the only silhouette a cloud can plausibly collapse into.
 */
function addressLines(text: string): string[] {
  const at = text.indexOf("@");
  return at < 1 ? [text] : [text.slice(0, at + 1), text.slice(at + 1)];
}

/** Line advance, as a multiple of font-size. Tight: the two lines have to read as one
 *  block for the mass to hold together. Mirrored by .dust-type in globals.css. */
const LINE = 1.12;

/**
 * Approximately normal, in [-1, 1]. Four uniforms summed — the central limit theorem on
 * the cheap, and the whole difference between a haze and a disc: sqrt(random) on a
 * radius gives a UNIFORM disc, which has a hard circular rim, and a rim is the one
 * thing that stops a scatter reading as a cloud. This is dense in the middle and thins
 * to nothing, so the cloud has no edge to see.
 */
const gauss = () =>
  (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Everything in DEVICE px, flat and preallocated: the render loop touches ~6000
 *  particles per frame and must not allocate or chase pointers. `d*` is the vector from
 *  origin to target and `b*` the perpendicular bow, both baked once — the loop is then
 *  a handful of multiply-adds per axis with no hypot in it. */
type Cloud = {
  n: number;
  ox: Float32Array;
  oy: Float32Array;
  dx: Float32Array;
  dy: Float32Array;
  bx: Float32Array;
  by: Float32Array;
  /** wander half-amplitude per axis, at cloud scale */
  wx: Float32Array;
  wy: Float32Array;
  /** wander phase and angular speed, so no two particles breathe together */
  ph: Float32Array;
  spd: Float32Array;
  delay: Float32Array;
  alpha: Float32Array;
  fill: string;
};

/**
 * Rasterise the address on a scratch canvas, then keep one particle per opaque sample.
 * Returns null when the type is too small for grain to read, which is the caller's
 * signal to leave the address as text.
 */
function build(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  text: string
): Cloud | null {
  const cs = getComputedStyle(host);
  const fontPx = parseFloat(cs.fontSize);
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (!(fontPx >= MIN_FONT_PX) || !w || !h) return null;

  // Capped at 2: past that the grain is finer than the eye resolves and the particle
  // count — which is a function of AREA — quadruples for nothing.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  const scratch = document.createElement("canvas");
  scratch.width = canvas.width;
  scratch.height = canvas.height;
  const sctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!sctx) return null;

  // cs.fontFamily is the RESOLVED stack, so the raster uses whatever the page is
  // actually showing. Which is why the caller waits on document.fonts.ready:
  // rasterising early would bake the fallback's metrics into the positions for good.
  sctx.scale(dpr, dpr);
  sctx.font = `400 ${fontPx}px ${cs.fontFamily}`;
  sctx.textAlign = "left";
  sctx.textBaseline = "alphabetic";
  sctx.fillStyle = "#fff";

  // Centred on the INK, not on the em box: an address is all x-height with one ascender
  // and one descender, so its optical centre is nowhere near the baseline.
  // Flush LEFT, on the shell's own left edge — the same edge "LET'S HAVE A CHAT." above
  // it starts from. Centred in the field it read as a caption floating in the middle of
  // the section, and it drifted right, under the chrome form. Mirrored by .dust-type.
  const lines = addressLines(text);
  const lead = fontPx * LINE;
  const m0 = sctx.measureText(lines[0]);
  const last = sctx.measureText(lines[lines.length - 1]);
  const ink =
    (lines.length - 1) * lead +
    m0.actualBoundingBoxAscent +
    last.actualBoundingBoxDescent;
  const firstBaseline = (h - ink) / 2 + m0.actualBoundingBoxAscent;
  lines.forEach((line, i) => {
    sctx.fillText(line, 0, firstBaseline + i * lead);
  });

  const data = sctx.getImageData(0, 0, scratch.width, scratch.height).data;
  const step = Math.max(1, Math.round(SAMPLE_STEP * dpr));
  const pts: number[] = [];
  for (let y = 0; y < scratch.height; y += step) {
    for (let x = 0; x < scratch.width; x += step) {
      // Half-opaque and up. Sampling the antialiased fringe as well would double the
      // count and put a halo of dim dots around every stem.
      if (data[(y * scratch.width + x) * 4 + 3] > 128) pts.push(x, y);
    }
  }
  const n = pts.length / 2;
  if (!n) return null;

  // Brightness spread is what gives the cloud depth. The floor is high — the dimmest
  // dot is still at 45% — because depth here is a whisper, not a range: dots that go
  // properly dark just read as holes in the letterforms once the address has formed.
  // Particles are SORTED by it so the render loop's globalAlpha barely changes from one
  // dot to the next — see render().
  const bright = new Float32Array(n);
  for (let i = 0; i < n; i++) bright[i] = 0.45 + Math.random() * 0.55;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => bright[a] - bright[b]
  );

  const c: Cloud = {
    n,
    ox: new Float32Array(n),
    oy: new Float32Array(n),
    dx: new Float32Array(n),
    dy: new Float32Array(n),
    bx: new Float32Array(n),
    by: new Float32Array(n),
    wx: new Float32Array(n),
    wy: new Float32Array(n),
    ph: new Float32Array(n),
    spd: new Float32Array(n),
    delay: new Float32Array(n),
    alpha: new Float32Array(n),
    fill:
      getComputedStyle(document.documentElement)
        .getPropertyValue("--chrome")
        .trim() || "#faf6f1",
  };

  // The cloud is a soft ellipse OVERFLOWING the text block and filling the canvas —
  // wider than the formed address on purpose, since a scatter no bigger than the thing
  // it forms reads as a blur of it rather than as a gathering. The gaussian's tails are
  // clamped to the box because the canvas clips: a hard-cut rectangle of noise is the
  // failure mode, and with this falloff barely any particle reaches the edge anyway.
  // Sized so the gaussian's 3-sigma reach lands just INSIDE the box (sigma is 0.289 of
  // the spread, so 0.95 → ±0.82 of the width). The clamp below is then a guard that
  // almost never fires — which is the point: a clamp that fires often stops being a
  // safety net and becomes a wall, piling every outlier onto the same line and giving
  // the cloud the one thing it must not have, a straight edge.
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const spreadX = canvas.width * 0.95;
  const spreadY = canvas.height * 0.8;
  const wander = fontPx * dpr * 0.3;

  for (let k = 0; k < n; k++) {
    const i = order[k];
    const tx = pts[i * 2];
    const ty = pts[i * 2 + 1];

    const ox = clamp(cx + gauss() * spreadX, 0, canvas.width - DOT);
    const oy = clamp(cy + gauss() * spreadY, 0, canvas.height - DOT);
    const dx = tx - ox;
    const dy = ty - oy;

    // A signed perpendicular bow, so no two particles travel the same straight line.
    // Straight lines are what make a converge read as a zoom.
    const len = Math.hypot(dx, dy) || 1;
    const bow = (Math.random() * 2 - 1) * fontPx * dpr * 0.32;

    c.ox[k] = ox;
    c.oy[k] = oy;
    c.dx[k] = dx;
    c.dy[k] = dy;
    c.bx[k] = (-dy / len) * bow;
    c.by[k] = (dx / len) * bow;
    c.wx[k] = (Math.random() * 2 - 1) * wander;
    c.wy[k] = (Math.random() * 2 - 1) * wander;
    c.ph[k] = Math.random() * TAU;
    // 0.25–0.7 rad/s, i.e. a 9–25s cycle. Slow enough that no individual dot is ever
    // seen to travel; what you read is the field shifting.
    c.spd[k] = 0.25 + Math.random() * 0.45;
    c.delay[k] = Math.random() * STAGGER;
    c.alpha[k] = bright[i];
  }

  return c;
}

/**
 * One frame. `p` is scroll progress (0 = scattered, 1 = the address); `time` is elapsed
 * seconds, and only drives the wander.
 */
function render(
  ctx: CanvasRenderingContext2D,
  c: Cloud,
  p: number,
  time: number
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = c.fill;

  // globalAlpha is quantised to 24 steps and only written when it changes. Since the
  // particles are sorted by brightness, consecutive dots almost always want the same
  // value — a few dozen writes per frame instead of one per dot.
  let lastQ = -1;

  for (let i = 0; i < c.n; i++) {
    const d = c.delay[i];
    const raw = (p - d) / (1 - d);
    const t = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;

    // Ease OUT: fast away from the cloud, settling into the letterform. In-out would
    // have every particle hesitate before leaving, which reads as lag on a scrub.
    const inv = 1 - t;
    const e = 1 - inv * inv * inv;
    const s = Math.sin(e * Math.PI); // bow, zero at both ends, widest mid-flight

    // Two out-of-step sinusoids per particle, so the wander is an ellipse rather than a
    // line. Amplitude collapses as the form arrives — full drift while diffuse, a sub-
    // pixel shimmer once it is type.
    const clock = time * c.spd[i] + c.ph[i];
    const w1 = Math.sin(clock);
    const w2 = Math.cos(clock * 0.83);
    const amp = 1 - e + e * SETTLED;

    const x = c.ox[i] + c.dx[i] * e + c.bx[i] * s + c.wx[i] * w1 * amp;
    const y = c.oy[i] + c.dy[i] * e + c.by[i] * s + c.wy[i] * w2 * amp;

    // Dim while diffuse, full once formed. The twinkle rides on `amp` like the wander
    // does, so it is airborne flicker in the cloud and nothing at all once the address
    // is type — a letterform whose dots keep changing brightness reads as a bad screen,
    // not as dust. w1 is already paid for, so the flicker itself is free.
    const twinkle = 1 - 0.22 * amp * (0.5 - 0.5 * w1);
    const q = Math.round(c.alpha[i] * (0.5 + 0.5 * e) * twinkle * 24) / 24;
    if (q !== lastQ) {
      ctx.globalAlpha = q;
      lastQ = q;
    }
    ctx.fillRect(x, y, DOT, DOT);
  }
}

export function MailDust({ email }: { email: string }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The canvas has a cloud in it and may hide the fallback type. */
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cloud: Cloud | null = null;
    let trigger: ScrollTrigger | null = null;
    let ticking = false;
    let alive = true;
    let built = false;
    let lastW = 0;
    let resizeTimer = 0;
    let progress = 0;
    let visible = false;

    // gsap.ticker hands out elapsed seconds since page load — shared with Lenis and
    // every scrub on the page, so this cannot drift against them.
    const tick = (time: number) => {
      if (cloud) render(ctx, cloud, progress, time);
    };
    const startTicking = () => {
      if (ticking || !cloud) return;
      gsap.ticker.add(tick);
      ticking = true;
    };
    const stopTicking = () => {
      if (!ticking) return;
      gsap.ticker.remove(tick);
      ticking = false;
    };

    const make = () => {
      cloud = build(canvas, host, email);
      built = true;
      lastW = host.clientWidth;
      setActive(!!cloud);

      if (!cloud) {
        // Too narrow for grain: shut everything down and let the type stand.
        stopTicking();
        trigger?.kill();
        trigger = null;
        return;
      }

      if (!trigger) {
        trigger = ScrollTrigger.create({
          trigger: host,
          // Keyed to the block's BOTTOM, not its top: the scrub only begins once the
          // whole field is on screen. Started on "top 88%" — the reflex, and what every
          // other reveal on this page uses — the scattered state was permanently half
          // below the fold, so the cloud was never once seen AS a cloud; by the time the
          // block had cleared the bottom edge the address had already formed. A reveal
          // of type can start off-screen because type only has to arrive. This has a
          // state at progress 0 that is the whole point of it.
          start: "bottom 92%",
          end: "top 8%",
          // Scroll only stores the value — the ticker is what paints, so a frame is
          // never rendered twice for one scroll event.
          onUpdate: (self) => {
            progress = self.progress;
          },
          onRefresh: (self) => {
            progress = self.progress;
          },
        });
      }
      progress = trigger.progress;
      render(ctx, cloud, progress, gsap.ticker.time);
    };

    // The webfont decides where every particle goes, so nothing is built until it is in.
    document.fonts.ready.then(() => {
      if (!alive) return;
      make();
      if (visible) startTicking();
    });

    // The life is only paid for while the block is on screen. Contact is eleven screens
    // down; without this the ticker would be running a 6000-particle loop from the
    // moment the page loads, against the smooth scroll's own frame budget.
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) startTicking();
        else stopTicking();
      },
      { rootMargin: "15% 0px" }
    );
    io.observe(host);

    // Width drives the font size (a vw clamp) and therefore the whole raster. Height is
    // in `em` off that same size, so watching width alone is enough — and ignoring pure
    // height changes keeps this from rebuilding on mobile URL-bar collapse.
    const ro = new ResizeObserver(() => {
      if (!built || host.clientWidth === lastW) return;
      lastW = host.clientWidth;
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!alive) return;
        make();
        if (visible) startTicking();
      }, 160);
    });
    ro.observe(host);

    return () => {
      alive = false;
      clearTimeout(resizeTimer);
      stopTicking();
      io.disconnect();
      ro.disconnect();
      trigger?.kill();
    };
  }, [email]);

  return (
    <a href={`mailto:${email}`} className="dust" aria-label={`Email ${email}`}>
      <span ref={hostRef} className="dust-field">
        <span aria-hidden className="dust-type" data-hidden={active || undefined}>
          {addressLines(email).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
        <canvas ref={canvasRef} aria-hidden className="dust-canvas" />
      </span>
    </a>
  );
}
