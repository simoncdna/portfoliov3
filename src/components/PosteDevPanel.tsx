"use client";

import { useEffect, useRef, useState } from "react";
import { posteTweak, posteTweakAsSource, usePosteTweak } from "@/lib/posteTweak";
import { tubeHole } from "@/lib/tubeHole";
import { formState } from "@/lib/formClock";
import { screenFill, tubeMouth } from "@/lib/tubeMouth";

/** Le canvas du tube (voir tubeScreen.ts) — les deux barres de visée parlent en pixels de
 *  cette grille, comme les molettes de TEXTE juste au-dessus d'elles. */
const CANVAS_W = 512;
const CANVAS_H = 384;

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

/*
 * PAS DE PASTILLE DE COULEUR ICI — il y en a eu une (un `<input type="color">`, le même
 * contrôle que le « Tint » du panneau blob) pour la TEINTE de la peau ; la teinte est trouvée
 * (#c2c2c2, voir posteTweak) et sa barre est partie avec le rectangle du tube et la frappe du
 * texte (voir le commentaire dans le corps du panneau). Si une couleur redevient un jour
 * réglable ici, c'est ce contrôle-là qu'il faut reprendre du panneau blob : il ouvre le picker
 * de l'OS au CLIC, donc il n'a rien du drag que les `<input type="range">` n'arrivent pas à
 * accrocher sur ce site.
 */

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.12em] text-silver-muted">
        {label}
      </span>
      <span className="w-40 shrink-0 font-mono text-[0.55rem] tabular-nums text-silver">{value}</span>
    </div>
  );
}

/**
 * L'état vivant de la plongée, échantillonné à ~8 Hz (pas par frame : ce panneau se
 * re-rendrait 60 fois par seconde pour quatre nombres). `near` = 0.1, le défaut d'une
 * PerspectiveCamera three.js, le même que lit ChromeTableau.
 */
function useDiveLive() {
  const [live, setLive] = useState({ x: 0, y: 0, z: 0, fov: 0, ecr: 0, dx: 0, dy: 0, through: false });
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 125) return;
      last = now;
      const s = formState();
      const tanHalf = Math.tan((s.camFov * Math.PI) / 360);
      const depth = s.camZ - tubeMouth.frontZ;
      const aspect = window.innerWidth / window.innerHeight;
      // Pas de lookAt dans cette scène : la projection d'un point se réduit à son écart en
      // x/y à la caméra, divisé par la profondeur — d'où le centre du viewport quand l'écart
      // est nul, ce que la plongée vise par construction.
      const ndcX = (tubeMouth.holeX - s.camX) / Math.max(depth * tanHalf * aspect, 1e-6);
      const ndcY = (tubeMouth.holeY - s.camY) / Math.max(depth * tanHalf, 1e-6);
      setLive({
        x: s.camX,
        y: s.camY,
        z: s.camZ,
        fov: s.camFov,
        ecr: screenFill(s.camZ, 0.1, tanHalf),
        dx: (ndcX / 2) * window.innerWidth,
        dy: (-ndcY / 2) * window.innerHeight,
        through: depth <= 0,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return live;
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

  /*
   * LE POINT D'ENTRÉE EFFECTIF, EN PIXELS DU CANVAS — lu chez tubeHole, le MÊME calcul que la
   * scène, jamais une seconde copie de la formule ici (voir tubeMouth.ts sur ce qu'une
   * deuxième dérivation coûte). C'est ce qui permet aux deux barres de VISÉE d'afficher où la
   * mesure a visé quand personne ne l'a remplacée, au lieu de n'afficher que ce qu'on y a
   * tapé.
   *
   * Appelé au rendu, sans mémo : le rendu ne se produit qu'au changement du store
   * (`usePosteTweak`) et tubeHole garde son propre cache sur exactement ces clés-là — donc
   * l'appel est une comparaison de chaîne tant que rien de pertinent n'a bougé. Sans danger
   * côté serveur : ce composant est monté en `ssr: false` (voir PosteDevPanelMount), qui
   * existe précisément parce qu'il touche `document`.
   */
  const hole = tubeHole();
  const aimPx = { x: hole.u * CANVAS_W, y: hole.v * CANVAS_H };
  const live = useDiveLive();

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

          {/*
           * LE RECTANGLE DU TUBE (scrX/scrY/scrW/scrH) ET LA FRAPPE DU TEXTE
           * (textX/textY/textSize/textGlow/textChar/textHold/textStack/textFull) N'ONT PLUS DE
           * BARRES — trouvés, validés, retirés du panneau. Le geste est celui que l'en-tête
           * annonce pour le panneau entier : une molette existe pour chercher un nombre, et
           * s'en va quand il est trouvé. Un panneau qui garde tout ce qu'il a servi à régler
           * finit par cacher les deux réglages en cours dans une liste de vingt.
           *
           * LES VALEURS, ELLES, N'ONT PAS BOUGÉ D'UN BIT : elles vivent toujours dans
           * posteTweak (voir ses DEFAULTS et le grand commentaire de la session du 2026-08-05),
           * qui reste la source de vérité que la scène lit — retirer une barre ne recuit rien.
           * Le bouton « copier » continue de les cracher, donc le jour où ce panneau part en
           * entier, il n'y a rien de plus à retrouver à la main. Pour en régler une à nouveau :
           * remettre la barre ici, elle retrouvera le store intact.
           */}
          <Head>entrée (canvas 512×384)</Head>
          {/*
           * LA BASCULE AMORCE LA VISÉE MANUELLE AVEC LE POINT MESURÉ, elle ne la laisse pas
           * sauter au centre : `hole` ci-dessus est le point EFFECTIF (en auto, celui du
           * « a »), donc passer en manuel repart exactement d'où la mesure avait visé. Sans
           * ça, un clic sur la bascule déplaçait l'entrée de tout un écran avant qu'on ait
           * réglé quoi que ce soit — et on aurait perdu la seule information qu'on venait
           * chercher, l'endroit que la mesure avait trouvé.
           */}
          <Toggle
            label="Visée"
            on={t.aimAuto}
            onLabel="le « a » mesuré"
            offLabel="un point"
            onChange={(v) =>
              posteTweak.set(
                v ? { aimAuto: true } : { aimAuto: false, aimX: aimPx.x, aimY: aimPx.y }
              )
            }
          />
          {/*
           * AFFICHÉES DANS LES DEUX MODES, et c'est le point de ces deux barres autant que le
           * réglage : en auto elles RAPPORTENT où la mesure a visé (des coordonnées qu'on peut
           * lire, noter, transmettre), en manuel elles la remplacent. Les barres restent
           * traînables en auto — traîner bascule en manuel, ce qui est le geste attendu quand
           * on empoigne une coordonnée pour la corriger.
           */}
          <Row
            label="Visée X"
            value={aimPx.x}
            min={0}
            max={512}
            step={1}
            fmt={(v) => `${Math.round(v)}px${t.aimAuto ? " ·auto" : ""}`}
            onChange={(v) => posteTweak.set({ aimAuto: false, aimY: aimPx.y, aimX: v })}
          />
          <Row
            label="Visée Y"
            value={aimPx.y}
            min={0}
            max={384}
            step={1}
            fmt={(v) => `${Math.round(v)}px${t.aimAuto ? " ·auto" : ""}`}
            onChange={(v) => posteTweak.set({ aimAuto: false, aimX: aimPx.x, aimY: v })}
          />
          <Row
            label="Fenêtre"
            value={t.holeWin}
            min={0.5}
            max={6}
            step={0.1}
            fmt={(v) => `${v.toFixed(1)} car.`}
            onChange={(v) => posteTweak.set({ holeWin: v })}
          />

          <Head>plongée</Head>
          <Row
            label="Moment"
            value={t.diveArrive}
            min={0.15}
            max={0.9}
            step={0.01}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => posteTweak.set({ diveArrive: v })}
          />
          <Row
            label="Distance"
            value={t.divePast}
            min={0}
            max={12}
            step={0.02}
            fmt={(v) => `${v.toFixed(2)} bch.`}
            onChange={(v) => posteTweak.set({ divePast: v })}
          />
          <Row
            label="Croise à"
            value={t.crossIn}
            min={0.1}
            max={3}
            step={0.02}
            fmt={(v) => `${v.toFixed(2)} écr.`}
            onChange={(v) =>
              posteTweak.set({ crossIn: v, crossOut: Math.min(t.crossOut, v - 0.05) })
            }
          />
          <Row
            label="Fini à"
            value={t.crossOut}
            min={0.05}
            max={1.5}
            step={0.01}
            fmt={(v) => `${v.toFixed(2)} écr.`}
            onChange={(v) =>
              posteTweak.set({ crossOut: v, crossIn: Math.max(t.crossIn, v + 0.05) })
            }
          />

          <Row
            label="Naissance"
            value={t.birthDim}
            min={0.05}
            max={1}
            step={0.01}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => posteTweak.set({ birthDim: v })}
          />
          <Row
            label="Monte sur"
            value={t.birthSpan}
            min={0.2}
            max={4}
            step={0.05}
            fmt={(v) => `${v.toFixed(2)} écr.`}
            onChange={(v) => posteTweak.set({ birthSpan: v })}
          />
          <Row
            label="Recentré"
            value={t.aimBy}
            min={0.5}
            max={6}
            step={0.1}
            fmt={(v) => `${v.toFixed(1)} écr.`}
            onChange={(v) => posteTweak.set({ aimBy: v })}
          />

          <Head>en direct</Head>
          <Readout
            label="Caméra"
            value={`x ${live.x.toFixed(2)}  y ${live.y.toFixed(2)}  z ${live.z.toFixed(2)}`}
          />
          <Readout label="Fov" value={`${live.fov.toFixed(1)}°`} />
          <Readout label="Verre" value={`${live.ecr.toFixed(2)} écr.`} />
          <Readout
            label="Lettre"
            value={
              live.through
                ? "traversée"
                : `${live.dx >= 0 ? "+" : ""}${Math.round(live.dx)}, ${live.dy >= 0 ? "+" : ""}${Math.round(live.dy)} px`
            }
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
