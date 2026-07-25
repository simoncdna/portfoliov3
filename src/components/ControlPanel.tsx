"use client";

import { useEffect, useRef } from "react";
import { blobTweak, useBlobTweak } from "@/lib/blobTweak";
import type { BlobMode } from "@/lib/blobTweak";

/** 3-way form selector: particles / blob / wireframe mesh. */
function ModeSwitch({ value }: { value: BlobMode }) {
  const opts: [BlobMode, string][] = [
    ["particles", "Dots"],
    ["blob", "Blob"],
    ["wire", "Mesh"],
  ];
  return (
    <div>
      <span className="mb-2 block font-mono text-[0.5rem] uppercase tracking-[0.26em] text-steel-2">
        Form
      </span>
      <div className="flex gap-4">
        {opts.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => blobTweak.set({ mode: k })}
            className={`cursor-none pb-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors ${
              value === k ? "text-chrome" : "text-silver-muted hover:text-silver"
            }`}
            style={{
              borderBottom:
                value === k
                  ? "1px solid var(--silver-bright)"
                  : "1px solid transparent",
            }}
          >
            {label}
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const drag = useRef({ on: false, y: 0, v: 0 });
  const f = (value - min) / (max - min);
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
          {fmt ? fmt(value) : value.toFixed(2)}
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
}: {
  min: number;
  max: number;
  step: number;
}) {
  const t = useBlobTweak();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef({ on: false, y: 0, v: 0 });

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
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = (now - last) / 1000;
      last = now;
      ctx.clearRect(0, 0, w, h);
      if (!blobTweak.get().open) return;
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
      const amp = h * 0.32;
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
          {t.freq.toFixed(2)}
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const f = (value - min) / (max - min);
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
          {fmt ? fmt(value) : value.toFixed(2)}
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
      <Dial label="Distort" value={t.distort} min={0} max={1} step={0.01}
        onChange={(v) => blobTweak.set({ distort: v })} />
      <Dial label="Rough" value={t.roughness} min={0} max={0.6} step={0.01}
        onChange={(v) => blobTweak.set({ roughness: v })} />
    </div>,
    <Oscilloscope key="freq" min={0.1} max={2} step={0.01} />,
    <SegBar key="speed" label="Speed" value={t.speed} min={0} max={3} step={0.05}
      onChange={(v) => blobTweak.set({ speed: v })} />,
    <SegBar key="particles" label="Particles" value={t.particleDetail} min={8} max={72} step={1}
      fmt={(v) => String(v)} onChange={(v) => blobTweak.set({ particleDetail: v })} />,
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

  return (
    <div
      className="pointer-events-none fixed right-8 top-1/2 z-[120] w-[min(86vw,240px)] -translate-y-1/2"
      aria-hidden={!t.open}
    >
      <div
        role="dialog"
        aria-label="Blob controls"
        className="pointer-events-auto flex flex-col gap-6"
        style={{ visibility: t.open ? "visible" : "hidden" }}
      >
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              opacity: t.open ? 1 : 0,
              transform: t.open ? "translateY(0)" : "translateY(14px)",
              transition: "opacity 340ms var(--ease-out), transform 340ms var(--ease-out)",
              transitionDelay: t.open ? `${(n - 1 - i) * 60}ms` : "0ms",
            }}
          >
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}
