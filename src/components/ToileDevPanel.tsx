"use client";

import { useRef, useState } from "react";
import { toileTweak, useToileTweak } from "@/lib/toileTweak";

/**
 * DEV PANEL — the toile's arrival, dialled live. A tool, not a feature: meant to
 * find numbers for the source and then be deleted (the same life plateLook's panel
 * had). Bottom-left, out of the composition.
 *
 * The rows are the ControlPanel's SegBar interaction (pointer capture + clientX on
 * a plain div), NOT native <input type=range>: the native control's drag never
 * engaged in the real environment — whatever swallowed it, the blob panel's custom
 * bars are the one slider interaction proven to work on this site.
 *
 * "Rejouer" rewinds the clock's dev to 0, so the arrival can be watched on a
 * settled plate without scrubbing back and forth through the section.
 */

function Row({
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
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-silver">
        {label}
      </span>
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
        onPointerCancel={() => (dragging.current = false)}
        className="flex h-5 w-40 items-stretch gap-[2px]"
        style={{ cursor: "none", touchAction: "none" }}
      >
        {Array.from({ length: SEGS }, (_, j) => (
          <span
            key={j}
            className="pointer-events-none flex-1"
            style={{
              background: (j + 0.5) / SEGS <= f ? "var(--silver-bright)" : "var(--steel-2)",
            }}
          />
        ))}
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-[0.55rem] tabular-nums text-silver-muted">
        {fmt ? fmt(value) : value.toFixed(2)}
      </span>
    </div>
  );
}

export function ToileDevPanel() {
  const t = useToileTweak();
  const [open, setOpen] = useState(true);

  return (
    // z 300: over EVERYTHING, preloader (190) included — a dev tool has no place in
    // the document's stack. pointer-events pinned on, whatever the page around does.
    <div className="fixed bottom-6 left-6 z-[300] select-none" style={{ pointerEvents: "auto" }}>
      {open ? (
        <div className="flex flex-col gap-2 border border-steel bg-black/85 p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-6">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-chrome">
              Dev <span className="text-silver-muted">/ toile</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-none font-mono text-[0.7rem] leading-none text-silver-muted hover:text-chrome"
            >
              ✕
            </button>
          </div>
          <Row
            label="Collée"
            value={t.fit}
            min={1}
            max={1.06}
            step={0.002}
            fmt={(v) => v.toFixed(3)}
            onChange={(v) => toileTweak.set({ fit: v })}
          />
          <Row
            label="Durée"
            value={t.secs}
            min={0.3}
            max={4}
            step={0.1}
            fmt={(v) => `${v.toFixed(1)}s`}
            onChange={(v) => toileTweak.set({ secs: v })}
          />
          <Row
            label="Densité"
            value={t.ramp}
            min={0.2}
            max={1}
            step={0.05}
            onChange={(v) => toileTweak.set({ ramp: v })}
          />
          <Row
            label="Recul"
            value={t.recul}
            min={0}
            max={0.4}
            step={0.01}
            onChange={(v) => toileTweak.set({ recul: v })}
          />
          <Row
            label="Ombre"
            value={t.ombre}
            min={0}
            max={0.7}
            step={0.02}
            onChange={(v) => toileTweak.set({ ombre: v })}
          />
          <Row
            label="Cadre"
            value={t.cadre}
            min={0.7}
            max={1.8}
            step={0.02}
            onChange={(v) => toileTweak.set({ cadre: v })}
          />
          <Row
            label="Tourner"
            value={t.turn}
            min={-180}
            max={180}
            step={1}
            fmt={(v) => `${Math.round(v)}°`}
            onChange={(v) => toileTweak.set({ turn: v })}
          />
          <div className="mt-1 flex items-center gap-4">
            <button
              type="button"
              onClick={() => toileTweak.replay()}
              className="cursor-none font-mono text-[0.55rem] uppercase tracking-[0.24em] text-silver transition-colors hover:text-chrome"
            >
              [ rejouer ]
            </button>
            <button
              type="button"
              onClick={() => toileTweak.reset()}
              className="cursor-none font-mono text-[0.55rem] uppercase tracking-[0.24em] text-silver-muted transition-colors hover:text-chrome"
            >
              [ reset ]
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-none border border-steel bg-black/85 px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.24em] text-silver-muted hover:text-chrome"
        >
          dev/toile
        </button>
      )}
    </div>
  );
}
