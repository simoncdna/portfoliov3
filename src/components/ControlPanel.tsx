"use client";

import { useEffect, useRef, useState } from "react";
import { blobTweak, PANEL_CLOSE_MS, useBlobTweak } from "@/lib/blobTweak";
import type { BlobMode } from "@/lib/blobTweak";

const ICON = { box: 40, c: 20, r: 16 } as const;

/** Line-art icon: a sphere built from ~80 dots, sized by depth (particles). */
function IconDots() {
  const { c, r } = ICON;
  const N = 80;
  const g = Math.PI * (3 - Math.sqrt(5));
  const pts: [string, string, string, string][] = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = g * i;
    const z = Math.sin(th) * rad;
    const px = c + Math.cos(th) * rad * r;
    const py = c - y * r;
    const d = z * 0.5 + 0.5; // 0 (back) .. 1 (front)
    pts.push([px.toFixed(2), py.toFixed(2), (0.4 + d * 0.85).toFixed(2), (0.45 + d * 0.55).toFixed(2)]);
  }
  return (
    <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden preserveAspectRatio="xMidYMid meet">
      {pts.map(([x, y, rr, o], i) => (
        <circle key={i} cx={x} cy={y} r={rr} fill="currentColor" opacity={o} />
      ))}
    </svg>
  );
}

/** Line-art icon: a smooth sphere with dense latitude stripes (blob). */
function IconBlob() {
  const { c, r } = ICON;
  const lats = [-0.84, -0.64, -0.44, -0.22, 0, 0.22, 0.44, 0.64, 0.84];
  return (
    <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden fill="none" stroke="currentColor" preserveAspectRatio="xMidYMid meet">
      <circle cx={c} cy={c} r={r} strokeWidth="1" />
      {lats.map((v, i) => {
        const rx = r * Math.sqrt(1 - v * v);
        return (
          <ellipse
            key={i}
            cx={c}
            cy={(c - r * v).toFixed(2)}
            rx={rx.toFixed(2)}
            ry={(rx * 0.22).toFixed(2)}
            strokeWidth="0.7"
            opacity="0.9"
          />
        );
      })}
    </svg>
  );
}

/** Form selector spread across the full panel width, as line-art icons. */
function ModeSwitch({ value }: { value: BlobMode }) {
  const opts: [BlobMode, string, () => React.ReactElement][] = [
    ["particles", "Particles", IconDots],
    ["blob", "Blob", IconBlob],
  ];
  return (
    <div>
      <span className="mb-2 block font-mono text-[0.58rem] uppercase tracking-[0.2em] text-silver">
        Form
      </span>
      <div className="flex w-full items-end justify-between">
        {opts.map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => blobTweak.set({ mode: k })}
            aria-label={label}
            title={label}
            className={`flex flex-1 cursor-none flex-col items-center transition-colors ${
              value === k ? "text-chrome" : "text-silver-muted hover:text-silver"
            }`}
          >
            <span className="h-11 w-11">
              <Icon />
            </span>
            <span
              className="mt-1.5 h-px w-6"
              style={{
                background: value === k ? "var(--silver-bright)" : "transparent",
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Rotary molette with a ring of graduations (drag up/down to turn). */
function Dial({
  label,
  value,
  min,
  max,
  step,
  fmt,
  onChange,
  boot = 1,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt?: (v: number) => string;
  onChange: (v: number) => void;
  boot?: number;
}) {
  const drag = useRef({ on: false, y: 0, v: 0 });
  // boot: the level winds up from 0 to its value when the panel powers on
  const f = ((value - min) / (max - min)) * boot;
  const dispVal = min + (value - min) * boot;
  const TICKS = 40;
  const START = -150;
  const SWEEP = 300;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  // round to a fixed precision so SSR and client stringify identically (no
  // hydration mismatch from float → string differences)
  const rnd = (v: number) => Math.round(v * 1000) / 1000;
  const at = (r: number, deg: number) => [
    rnd(30 + r * Math.sin(rad(deg))),
    rnd(30 - r * Math.cos(rad(deg))),
  ];
  const iDeg = START + f * SWEEP;
  const [ix, iy] = at(17, iDeg);

  const down = (e: React.PointerEvent) => {
    drag.current = { on: true, y: e.clientY, v: value };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    const dy = drag.current.y - e.clientY;
    let v = drag.current.v + (dy / 150) * (max - min);
    v = Math.round(v / step) * step;
    onChange(Math.max(min, Math.min(max, v)));
  };
  const up = (e: React.PointerEvent) => {
    drag.current.on = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div className="flex flex-1 flex-col items-center gap-2.5">
      <svg
        width={64}
        height={64}
        viewBox="0 0 60 60"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{ cursor: "none", touchAction: "none" }}
      >
        {Array.from({ length: TICKS }, (_, i) => {
          const s = i / (TICKS - 1);
          const deg = START + s * SWEEP;
          const [x1, y1] = at(23, deg);
          const [x2, y2] = at(27, deg);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={s <= f + 1e-3 ? "var(--silver-bright)" : "var(--steel-2)"}
              strokeWidth={1}
              strokeLinecap="round"
            />
          );
        })}
        <circle cx={30} cy={30} r={16} fill="none" stroke="var(--steel)" strokeWidth={1} />
        <line x1={30} y1={30} x2={ix} y2={iy} stroke="var(--silver-bright)" strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={ix} cy={iy} r={1.7} fill="var(--silver-bright)" />
        <circle cx={30} cy={30} r={1.6} fill="var(--silver-muted)" />
      </svg>
      <div className="flex flex-col items-center leading-none">
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-silver">
          {label}
        </span>
        <span className="mt-1 font-mono text-[0.55rem] tabular-nums text-silver-muted">
          {fmt ? fmt(dispVal) : dispVal.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

/** Frequency shown as a live oscilloscope (drag up/down to change). */
function Oscilloscope({
  min,
  max,
  step,
  boot = 1,
  active = true,
}: {
  min: number;
  max: number;
  step: number;
  boot?: number;
  active?: boolean;
}) {
  const t = useBlobTweak();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef({ on: false, y: 0, v: 0 });
  const bootRef = useRef(1);
  bootRef.current = boot;
  // keep the trace running while the panel is on screen (incl. the close
  // retract) rather than blanking the moment `open` flips false
  const activeRef = useRef(true);
  activeRef.current = active;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 200;
    const h = cv.clientHeight || 40;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.scale(dpr, dpr);
    let raf = 0;
    let phase = 0;
    let last = performance.now();
    // Whether there is anything on the canvas to rub out. The clear used to run
    // unconditionally, ahead of the active test — so a shut panel repainted this
    // canvas and handed the compositor a fresh texture on every single frame, for
    // ever, to draw nothing. It now clears ONCE on the way down and then leaves
    // the surface alone; the loop itself stays alive so re-opening resumes.
    let painted = false;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = (now - last) / 1000;
      last = now;
      if (!activeRef.current) {
        if (painted) {
          ctx.clearRect(0, 0, w, h);
          painted = false;
        }
        return;
      }
      ctx.clearRect(0, 0, w, h);
      painted = true;
      phase += dt * 2.4;
      // graticule — minor grid
      const minor = 7;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(150,160,184,0.2)";
      ctx.beginPath();
      for (let x = w / 2 - minor; x > 0; x -= minor) {
        const px = Math.round(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
      }
      for (let x = w / 2 + minor; x < w; x += minor) {
        const px = Math.round(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
      }
      for (let y = h / 2 - minor; y > 0; y -= minor) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      for (let y = h / 2 + minor; y < h; y += minor) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
      // major grid — every 4 cells
      ctx.strokeStyle = "rgba(160,172,196,0.42)";
      ctx.beginPath();
      for (let x = w / 2 + minor * 4; x <= w; x += minor * 4) {
        const px = Math.round(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
      }
      for (let x = w / 2 - minor * 4; x >= 0; x -= minor * 4) {
        const px = Math.round(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
      }
      for (let y = h / 2; y > 0; y -= minor * 4) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      for (let y = h / 2; y < h; y += minor * 4) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
      // centre axes (brightest)
      ctx.strokeStyle = "rgba(175,186,210,0.55)";
      ctx.beginPath();
      ctx.moveTo(0, Math.round(h / 2) + 0.5);
      ctx.lineTo(w, Math.round(h / 2) + 0.5);
      ctx.moveTo(Math.round(w / 2) + 0.5, 0);
      ctx.lineTo(Math.round(w / 2) + 0.5, h);
      ctx.stroke();
      // signal — cycles scale with frequency, with a phosphor glow
      const f = blobTweak.get().freq;
      const cycles = 1 + ((f - min) / (max - min)) * 7;
      const amp = h * 0.32 * bootRef.current; // winds up from a flat line on power-on
      ctx.strokeStyle = "rgba(236,240,255,0.98)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(200,214,255,0.6)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const y = h / 2 + amp * Math.sin((x / w) * cycles * Math.PI * 2 + phase);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [min, max]);

  const down = (e: React.PointerEvent) => {
    drag.current = { on: true, y: e.clientY, v: blobTweak.get().freq };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    const dy = drag.current.y - e.clientY;
    let v = drag.current.v + (dy / 140) * (max - min);
    v = Math.round(v / step) * step;
    blobTweak.set({ freq: Math.max(min, Math.min(max, v)) });
  };
  const up = (e: React.PointerEvent) => {
    drag.current.on = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-silver">
          Frequency
        </span>
        <span className="font-mono text-[0.58rem] tabular-nums text-silver-muted">
          {(min + (t.freq - min) * boot).toFixed(2)}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="block h-10 w-full border border-steel"
        style={{ cursor: "none", touchAction: "none" }}
      />
    </div>
  );
}

/** Segmented level bar (drag/click along it). */
function SegBar({
  label,
  value,
  min,
  max,
  step,
  fmt,
  onChange,
  boot = 1,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt?: (v: number) => string;
  onChange: (v: number) => void;
  boot?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const f = ((value - min) / (max - min)) * boot;
  const dispVal = min + (value - min) * boot;
  const SEGS = 24;
  const setFromX = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nf = (clientX - r.left) / r.width;
    nf = Math.max(0, Math.min(1, nf));
    let v = min + nf * (max - min);
    v = Math.round(v / step) * step;
    onChange(Math.max(min, Math.min(max, v)));
  };
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-silver">
          {label}
        </span>
        <span className="font-mono text-[0.58rem] tabular-nums text-silver-muted">
          {fmt ? fmt(dispVal) : dispVal.toFixed(2)}
        </span>
      </div>
      <div
        ref={ref}
        onPointerDown={(e) => {
          dragging.current = true;
          try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
          setFromX(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && setFromX(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        className="flex h-5 items-stretch gap-[2px]"
        style={{ cursor: "none", touchAction: "none" }}
      >
        {Array.from({ length: SEGS }, (_, j) => (
          <span
            key={j}
            className="flex-1"
            style={{
              background:
                (j + 0.5) / SEGS <= f ? "var(--silver-bright)" : "var(--steel-2)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Minimalist HUD blob controls — opened by clicking the barcode ("TWEAK").
 * Anchored right, vertically centred, airy, no box/border/separator: it should
 * feel like uncovering instrumentation that was always there but hidden. The
 * controls cascade in bottom→top (piano) with a fade. Molettes (dials) + segment
 * bars, like a real instrument cluster. Drives the shared blobTweak store.
 */
export function ControlPanel() {
  const t = useBlobTweak();
  // "power-on": after the piano cascade, gauges wind up from 0 to their value
  // and the panel brightens from grey to full — like a dashboard lighting up.
  const [boot, setBoot] = useState(0);
  // stays true through the reverse "piano" retract on close (before hiding)
  const [show, setShow] = useState(false);
  const open = t.open;
  /**
   * The cascade, opening — unchanged, and deliberately unhurried: this is the
   * reveal, the moment instrumentation you did not know was there lights up one row
   * at a time. It is meant to be watched.
   */
  const STAGGER = 100;
  const REVEAL = 460;
  /**
   * The cascade, CLOSING — and it is not the same gesture played backwards.
   *
   * Opening is a reveal; closing is putting the tools away, and a reader who has
   * dismissed a panel has already moved on. At the opening's pace the retract ran
   * (n-1)·100 + 460 ≈ 1160 ms, which is over a second of watching rows you have
   * finished with leave the screen one by one — long enough that the ✕ felt
   * unresponsive.
   *
   * Brisk, not instant: it is still a cascade top-down, so the eye reads it as the
   * panel being ranged rather than as a cut.
   *
   * The number that actually decides how fast the dismissal FEELS is not the stagger
   * on its own — it is when the LAST row is finally gone, because that is the moment
   * the screen is clear. That tail is (n-1)·CLOSE_STAGGER + CLOSE_REVEAL, and it is
   * what these two are tuned against rather than the per-row pace:
   *
   *   opening's pace, reversed   7·100 + 460 = 1160 ms
   *   first pass                 7· 40 + 240 =  520 ms
   *   now                        7· 22 + 190 =  344 ms
   *
   * MUST fit inside PANEL_CLOSE_MS — that is the timer that then hides the panel,
   * releases the scroll (SmoothScroll) and turns the barcode's TWEAK off
   * (BarcodeEAN13's CLOSE_GRACE_MS). Overrun it and the panel is cut off mid-retract.
   *   344 ms  ≤  380
   */
  const CLOSE_STAGGER = 22;
  const CLOSE_REVEAL = 190;

  const rows = [
    <div key="head" className="flex items-center justify-between">
      <span className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-chrome">
        Tweak <span className="text-silver-muted">/ blob</span>
      </span>
      <button
        type="button"
        onClick={() => blobTweak.set({ open: false })}
        aria-label="Close controls"
        className="cursor-none font-mono text-[0.7rem] leading-none text-silver-muted transition-colors hover:text-chrome"
      >
        ✕
      </button>
    </div>,
    <ModeSwitch key="mode" value={t.mode} />,
    <div key="dials" className="flex gap-5">
      <Dial label="Distort" value={t.distort} min={0} max={1} step={0.01} boot={boot}
        onChange={(v) => blobTweak.set({ distort: v })} />
      <Dial label="Rough" value={t.roughness} min={0} max={1} step={0.01} boot={boot}
        onChange={(v) => blobTweak.set({ roughness: v })} />
    </div>,
    <Oscilloscope key="freq" min={0} max={1} step={0.01} boot={boot} active={show} />,
    <SegBar key="speed" label="Speed" value={t.speed} min={0} max={1} step={0.05} boot={boot}
      onChange={(v) => blobTweak.set({ speed: v })} />,
    <SegBar key="particles" label="Particles" value={t.particleDetail} min={8} max={100} step={1} boot={boot}
      fmt={(v) => String(Math.round(v))} onChange={(v) => blobTweak.set({ particleDetail: v })} />,
    <label key="tint" className="flex items-center justify-between">
      <span className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-silver">Tint</span>
      <input
        type="color"
        value={t.color}
        onChange={(e) => blobTweak.set({ color: e.target.value })}
        className="h-5 w-9 cursor-none border border-steel bg-transparent p-0"
      />
    </label>,
    <button
      key="reset"
      type="button"
      onClick={() => blobTweak.reset()}
      className="cursor-none self-start font-mono text-[0.55rem] uppercase tracking-[0.24em] text-silver-muted transition-colors hover:text-chrome"
    >
      [ reset ]
    </button>,
  ];
  const n = rows.length;

  useEffect(() => {
    if (open) {
      setShow(true);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setBoot(1);
        return;
      }
      setBoot(0);
      const startDelay = 240; // just after the piano starts (overlaps it)
      const DUR = 1150;
      const ease = (x: number) => 1 - Math.pow(1 - x, 3);
      let raf = 0;
      let s0 = 0;
      const tid = window.setTimeout(() => {
        s0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - s0) / DUR);
          setBoot(ease(p));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }, startDelay);
      return () => {
        clearTimeout(tid);
        cancelAnimationFrame(raf);
      };
    }
    // closing: let the reverse "piano" retract play out, THEN hide + reset
    // (PANEL_CLOSE_MS is shared with the barcode's turn-off timing)
    const tid = window.setTimeout(() => {
      setShow(false);
      setBoot(0);
    }, PANEL_CLOSE_MS);
    return () => clearTimeout(tid);
  }, [open, n]);

  // grey → full brightness with a mid flash → the "lights coming on" breath
  const glow = 0.5 + 0.5 * boot + Math.sin(boot * Math.PI) * 0.35;

  return (
    <div
      className="pointer-events-none fixed right-8 top-1/2 z-[120] w-[min(86vw,240px)] -translate-y-1/2"
      aria-hidden={!open}
    >
      <div
        role="dialog"
        aria-label="Blob controls"
        className="pointer-events-auto flex flex-col gap-6"
        style={{
          visibility: show ? "visible" : "hidden",
          filter: `brightness(${glow.toFixed(3)})`,
        }}
      >
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              opacity: open ? 1 : 0,
              transform: open ? "translateY(0)" : "translateY(14px)",
              transition: `opacity ${open ? REVEAL : CLOSE_REVEAL}ms var(--ease-out), transform ${
                open ? REVEAL : CLOSE_REVEAL
              }ms var(--ease-out)`,
              // open: bottom→top (piano). close: reversed (top leaves first) → "ranger",
              // and quicker — see CLOSE_STAGGER.
              transitionDelay: open
                ? `${(n - 1 - i) * STAGGER}ms`
                : `${i * CLOSE_STAGGER}ms`,
            }}
          >
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}
