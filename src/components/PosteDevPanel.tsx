"use client";

import { useRef, useState } from "react";
import {
  POSTE_ENVS,
  posteTweak,
  posteTweakAsSource,
  usePosteTweak,
  type PosteEnv,
} from "@/lib/posteTweak";

/**
 * DEV PANEL — la scène du poste, réglée en direct. Un outil, pas une fonctionnalité :
 * fait pour trouver des nombres, les recopier dans la source (bouton « copier ») et
 * disparaître, comme les panneaux de PLATE_LOOK et de la toile avant lui. En bas à
 * DROITE, hors de la composition, et monté en dev seulement (voir PosteDevPanelMount).
 *
 * LES BARRES NE SONT PAS DES <input type="range">. Le contrôle natif n'a jamais accroché
 * le drag dans cet environnement — quoi qu'il l'avale (le curseur custom, Lenis, la
 * capture de pointeur du canvas) — et ces barres à segments, reprises du ControlPanel du
 * blob, sont la seule interaction de slider prouvée sur ce site. Ne pas « simplifier »
 * en natif sans le vérifier dans un vrai navigateur.
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
      <span className="w-16 shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.12em] text-silver">
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
        data-dev-bar
        className="flex h-5 w-40 items-stretch gap-[2px]"
        style={{ touchAction: "none" }}
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
      <span className="w-11 shrink-0 text-right font-mono text-[0.55rem] tabular-nums text-silver-muted">
        {fmt ? fmt(value) : value.toFixed(2)}
      </span>
    </div>
  );
}

/** Un intertitre — les molettes se lisent par famille, pas comme une liste de dix. */
function Head({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1 font-mono text-[0.5rem] uppercase tracking-[0.24em] text-silver-muted">
      {children}
    </span>
  );
}

/**
 * Le choix d'environnement. Une grille de pastilles et non un <select> : on compare des
 * éclairages en faisant des allers-retours entre deux d'entre eux, ce qu'une liste
 * déroulante rend pénible (ouvrir, viser, fermer) alors que deux pastilles côte à côte se
 * font au clic. « local » est distingué — c'est le seul que la prod sert.
 */
function EnvPicker({
  value,
  onChange,
}: {
  value: PosteEnv;
  onChange: (v: PosteEnv) => void;
}) {
  return (
    <div className="flex w-[17.5rem] flex-wrap gap-1">
      {POSTE_ENVS.map((e) => {
        const on = e === value;
        return (
          <button
            key={e}
            type="button"
            onClick={() => onChange(e)}
            className="border px-[0.3rem] py-[0.1rem] font-mono text-[0.5rem] uppercase tracking-[0.1em] transition-colors"
            style={{
              color: on ? "var(--void)" : e === "local" ? "var(--silver)" : "var(--silver-muted)",
              background: on ? "var(--silver-bright)" : "transparent",
              borderColor: on ? "var(--silver-bright)" : "var(--steel)",
            }}
          >
            {e}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Une pastille de couleur. `<input type="color">` — le MÊME contrôle que le « Tint » du
 * panneau blob, et le seul choix de couleur prouvé sur ce site : il ouvre le picker de
 * l'OS au CLIC, il n'a donc rien du drag que les <input type="range"> n'arrivaient pas à
 * accrocher ici. Le bouton à côté ramène au neutre sans passer par le picker, parce que
 * retrouver le blanc exact dans une roue chromatique est pénible.
 */
function Swatch({
  label,
  value,
  neutral,
  onChange,
}: {
  label: string;
  value: string;
  neutral: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.12em] text-silver">
        {label}
      </span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-5 w-40 border border-steel bg-transparent p-0"
      />
      <button
        type="button"
        onClick={() => onChange(neutral)}
        className="w-11 shrink-0 text-right font-mono text-[0.55rem] text-silver-muted transition-colors hover:text-chrome"
      >
        {value.toLowerCase() === neutral ? "neutre" : "×"}
      </button>
    </div>
  );
}

function Toggle({
  label,
  on,
  onLabel,
  offLabel,
  onChange,
}: {
  label: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.12em] text-silver">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!on)}
        className="border border-steel px-2 py-[0.15rem] font-mono text-[0.5rem] uppercase tracking-[0.16em] transition-colors"
        style={{
          color: on ? "var(--silver-bright)" : "var(--silver-muted)",
          background: on ? "var(--steel-2)" : "transparent",
        }}
      >
        {on ? onLabel : offLabel}
      </button>
    </div>
  );
}

export function PosteDevPanel() {
  const t = usePosteTweak();
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(posteTweakAsSource());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Le presse-papier peut être refusé (document non focus, permission) : on retombe
      // sur la console, qui ne demande la permission de personne.
      console.log(posteTweakAsSource());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    /*
     * LE Z-INDEX EST INLINE ET ÉNORME, à dessein. z-[300] suffisait pour la pile du
     * document (le préloader plafonne à 190) mais PAS pour les autres outils : le studio
     * Theatre.js monte au maximum entier, et le badge dev de Next occupe le coin bas —
     * un panneau de réglage qu'un autre panneau recouvre ne sert à rien. Inline plutôt
     * qu'en classe pour qu'aucune purge Tailwind ni ordre de feuille ne puisse le perdre.
     *
     * `data-dev-panel` est ce que globals.css cible pour RENDRE LE CURSEUR NATIF : la
     * page force `cursor: none !important` partout pour son réticule custom, et on vise
     * au pixel sur une barre de 20 px.
     */
    <div
      data-dev-panel
      className="fixed bottom-16 right-6 select-none"
      style={{ pointerEvents: "auto", zIndex: 2000000000 }}
    >
      {open ? (
        <div className="flex flex-col gap-[0.3rem] border border-steel bg-black/85 p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-6">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-chrome">
              Dev <span className="text-silver-muted">/ poste</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-mono text-[0.7rem] leading-none text-silver-muted hover:text-chrome"
            >
              ✕
            </button>
          </div>

          <Head>hdri — scène</Head>
          <EnvPicker value={t.env} onChange={(v) => posteTweak.set({ env: v })} />
          <Row
            label="Intensité"
            value={t.envInt}
            min={0}
            max={8}
            step={0.05}
            onChange={(v) => posteTweak.set({ envInt: v })}
          />
          <Row
            label="Rotation"
            value={t.envRot}
            min={0}
            max={Math.PI * 2}
            step={0.02}
            fmt={(v) => `${Math.round((v * 180) / Math.PI)}°`}
            onChange={(v) => posteTweak.set({ envRot: v })}
          />
          {/*
            LE DÉCAPAGE VIT SOUS L'HDRI, et pas dans une section « matière » à lui : c'est
            la molette sans laquelle les deux du dessus ne se voient pas (à décapage plein,
            le shader jette le chrome et l'environnement avec). On la lit donc comme
            l'interrupteur des deux précédentes, pas comme un réglage indépendant.
          */}
          <Toggle
            label="Décapage"
            on={!t.revealAuto}
            onLabel="figé"
            offLabel="auto (horloge)"
            onChange={(v) => posteTweak.set({ revealAuto: !v })}
          />
          {!t.revealAuto && (
            <Row
              label="↳ chrome"
              value={t.reveal}
              min={0}
              max={1}
              step={0.01}
              fmt={(v) => (v === 0 ? "chrome" : v === 1 ? "peau" : v.toFixed(2))}
              onChange={(v) => posteTweak.set({ reveal: v })}
            />
          )}

          {/*
            LA PEAU — ce qui touche la COULEUR du glb, une fois le chrome retiré. L'HDRI
            n'entre pas ici : à décapage plein le shader jette le chrome, donc rien de
            l'environnement n'atteint la peau. Ces trois-là, si.
          */}
          <Head>peau du glb</Head>
          <Toggle
            label="Espace"
            on={t.skinSrgb}
            onLabel="sRGB"
            offLabel="linéaire (source)"
            onChange={(v) => posteTweak.set({ skinSrgb: v })}
          />
          <Swatch
            label="Teinte"
            value={t.skinTint}
            neutral="#ffffff"
            onChange={(v) => posteTweak.set({ skinTint: v })}
          />
          <Row
            label="Saturation"
            value={t.skinSat}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => posteTweak.set({ skinSat: v })}
          />
          <Row
            label="Gain"
            value={t.skinGain}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => posteTweak.set({ skinGain: v })}
          />
          <Row
            label="Vernis"
            value={t.skinFres}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => posteTweak.set({ skinFres: v })}
          />

          <Head>cadrage</Head>
          <Row
            label="Taille"
            value={t.fill}
            min={0.15}
            max={1}
            step={0.005}
            fmt={(v) => v.toFixed(3)}
            onChange={(v) => posteTweak.set({ fill: v })}
          />

          <Head>écran (sur le verre)</Head>
          <Row
            label="Centre X"
            value={t.scrX}
            min={-3}
            max={2}
            step={0.002}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => posteTweak.set({ scrX: v })}
          />
          <Row
            label="Centre Y"
            value={t.scrY}
            min={-1}
            max={3.5}
            step={0.002}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => posteTweak.set({ scrY: v })}
          />
          <Row
            label="Largeur"
            value={t.scrW}
            min={0.5}
            max={6}
            step={0.002}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => posteTweak.set({ scrW: v })}
          />
          <Row
            label="Hauteur"
            value={t.scrH}
            min={0.5}
            max={6}
            step={0.002}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => posteTweak.set({ scrH: v })}
          />

          <Head>texte (canvas 512×384)</Head>
          <Row
            label="Texte X"
            value={t.textX}
            min={0}
            max={480}
            step={1}
            fmt={(v) => `${Math.round(v)}`}
            onChange={(v) => posteTweak.set({ textX: v })}
          />
          <Row
            label="Texte Y"
            value={t.textY}
            min={0}
            max={350}
            step={1}
            fmt={(v) => `${Math.round(v)}`}
            onChange={(v) => posteTweak.set({ textY: v })}
          />
          <Row
            label="Corps"
            value={t.textSize}
            min={8}
            max={96}
            step={1}
            fmt={(v) => `${Math.round(v)}px`}
            onChange={(v) => posteTweak.set({ textSize: v })}
          />
          <Row
            label="Halo"
            value={t.textGlow}
            min={0}
            max={30}
            step={0.5}
            fmt={(v) => v.toFixed(1)}
            onChange={(v) => posteTweak.set({ textGlow: v })}
          />
          <Row
            label="Frappe"
            value={t.textChar}
            min={0.01}
            max={0.2}
            step={0.005}
            fmt={(v) => `${Math.round(v * 1000)}ms`}
            onChange={(v) => posteTweak.set({ textChar: v })}
          />
          <Row
            label="Pause"
            value={t.textHold}
            min={0}
            max={4}
            step={0.05}
            fmt={(v) => `${v.toFixed(2)}s`}
            onChange={(v) => posteTweak.set({ textHold: v })}
          />
          <Toggle
            label="Lignes"
            on={t.textStack}
            onLabel="empilées"
            offLabel="effacées"
            onChange={(v) => posteTweak.set({ textStack: v })}
          />
          <Toggle
            label="État"
            on={t.textFull}
            onLabel="état final"
            offLabel="séquence"
            onChange={(v) => posteTweak.set({ textFull: v })}
          />

          <div className="mt-1 flex items-center gap-4">
            <button
              type="button"
              onClick={() => posteTweak.replay()}
              className="font-mono text-[0.55rem] uppercase tracking-[0.24em] text-silver transition-colors hover:text-chrome"
            >
              [ rejouer ]
            </button>
            <button
              type="button"
              onClick={copy}
              className="font-mono text-[0.55rem] uppercase tracking-[0.24em] text-silver transition-colors hover:text-chrome"
            >
              {copied ? "[ copié ]" : "[ copier ]"}
            </button>
            <button
              type="button"
              onClick={() => posteTweak.reset()}
              className="font-mono text-[0.55rem] uppercase tracking-[0.24em] text-silver-muted transition-colors hover:text-chrome"
            >
              [ reset ]
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border border-steel bg-black/85 px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.24em] text-silver-muted hover:text-chrome"
        >
          dev/poste
        </button>
      )}
    </div>
  );
}
