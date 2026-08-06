"use client";

import { useEffect, useRef, useState } from "react";
import { posteTweak, posteTweakAsSource, usePosteTweak } from "@/lib/posteTweak";
import { tubeHole } from "@/lib/tubeHole";
import { formState } from "@/lib/formClock";
import { screenFill, tubeMouth } from "@/lib/tubeMouth";
import { tunnelLive } from "@/lib/tunnelLive";

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

/**
 * UNE FAMILLE DE MOLETTES, REPLIABLE — et fermée par défaut. Le panneau a fini par dépasser la
 * hauteur du viewport : vingt-cinq barres empilées, dont on n'en règle que deux ou trois à la
 * fois, et le reste masque la scène qu'on est en train de juger. Chaque section garde son propre
 * état, sans registre central : rien ici n'a besoin de savoir ce que les autres font.
 *
 * L'intitulé porte un chevron ET reste un bouton pleine largeur — on ouvre en visant n'importe
 * où sur la ligne, pas un triangle de 8 px.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex items-center gap-1 text-left font-mono text-[0.5rem] uppercase tracking-[0.24em] text-silver-muted transition-colors hover:text-chrome"
      >
        <span className="inline-block w-2">{open ? "−" : "+"}</span>
        {title}
      </button>
      {open ? <div className="flex flex-col gap-[0.3rem] pb-1">{children}</div> : null}
    </>
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
  const [live, setLive] = useState({
    x: 0, y: 0, z: 0, fov: 0, ecr: 0, dx: 0, dy: 0, through: false,
    // Les deux grandeurs ANIMÉES du corridor, telles qu'elles partent au shader — voir tunnelLive.
    wall: 0, blocks: 0,
  });
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
        wall: tunnelLive.wall,
        blocks: tunnelLive.blocks,
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
   * OÙ LE PANNEAU SE TROUVE — `null` = sa place par défaut (en bas à droite, posée par les
   * classes). Dès qu'on l'a déplacé une fois, la position devient explicite en pixels : il n'y a
   * donc AUCUNE position calculée tant qu'on n'y touche pas, et rien à recalculer au resize.
   *
   * Déplaçable parce qu'un panneau de réglage recouvre par nature ce qu'il sert à juger : le
   * poste est au centre, le corridor le remplit, et un pavé fixe dans un coin finit toujours par
   * masquer l'endroit qu'on regarde.
   */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

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
      className={pos ? "fixed select-none" : "fixed bottom-16 right-6 select-none"}
      style={{
        pointerEvents: "auto",
        zIndex: 2000000000,
        ...(pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : null),
      }}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col gap-[0.3rem] overflow-y-auto border border-steel bg-black/85 p-3 backdrop-blur-sm">
          {/*
           * LE TITRE EST LA POIGNÉE. `setPointerCapture` comme les barres — c'est la seule
           * mécanique de glissement prouvée sur ce site (voir l'en-tête) : le curseur custom et
           * Lenis avalent le reste. On mémorise l'écart entre le pointeur et le coin, sinon le
           * panneau saute pour venir se centrer sous le doigt au premier pixel.
           */}
          <div
            className="flex cursor-grab items-center justify-between gap-6"
            onPointerDown={(e) => {
              const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
              drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {}
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              setPos({ x: e.clientX - d.dx, y: e.clientY - d.dy });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            style={{ touchAction: "none" }}
          >
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

          <Section title="cadrage">
            <Row
              label="Taille"
              value={t.fill}
              min={0.15}
              max={1}
              step={0.005}
              fmt={(v) => v.toFixed(3)}
              onChange={(v) => posteTweak.set({ fill: v })}
            />
          </Section>

          {/*
           * LE RECTANGLE DU TUBE EST DE RETOUR AU PANNEAU. Il en était parti (« trouvé, validé,
           * retiré ») avec des valeurs relevées À L'ŒIL sur capture — centre (−1.30, 1.43),
           * 2.15 × 1.84 — et pas dérivées du modèle. Or c'est LUI qui décide de la place que le
           * texte occupe sur le verre : l'agrandir jusqu'aux bords de l'écran du poste rend le
           * texte plus présent sans toucher à son corps ni au nombre de caractères par ligne,
           * là où grossir la police coûte une ligne d'habillage à chaque cran.
           *
           * Rien dans le shader ne borne ce rectangle au verre (il ne teste que l'appartenance
           * au rectangle et l'orientation de la normale) : trop grand, le texte débordera sur le
           * boîtier. C'est donc un réglage à l'œil, et la lueur du tube en montre le bord.
           */}
          <Section title="écran (sur le verre)">
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
              max={7}
              step={0.005}
              fmt={(v) => v.toFixed(2)}
              onChange={(v) => posteTweak.set({ scrW: v })}
            />
            <Row
              label="Hauteur"
              value={t.scrH}
              min={0.5}
              max={7}
              step={0.005}
              fmt={(v) => v.toFixed(2)}
              onChange={(v) => posteTweak.set({ scrH: v })}
            />
          </Section>

          <Section title="entrée (canvas 512×384)">
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
          {/*
           * LES DEUX BARRES QUI RECENTRENT LA LETTRE. Elles ne déplacent pas la visée dans le
           * canvas (c'est « Visée X/Y », qui abandonne la mesure du glyphe) : elles compensent le
           * TIRAGE du verre, le texte peint n'étant pas là où la relation affine le dit. On tire
           * en regardant la lettre, elle vient au centre.
           */}
          <Row
            label="Tirage X"
            value={t.dragX}
            min={-40}
            max={40}
            step={0.2}
            fmt={(v) => `${v.toFixed(1)}px`}
            onChange={(v) => posteTweak.set({ dragX: v })}
          />
          <Row
            label="Tirage Y"
            value={t.dragY}
            min={-40}
            max={40}
            step={0.2}
            fmt={(v) => `${v.toFixed(1)}px`}
            onChange={(v) => posteTweak.set({ dragY: v })}
          />
          <Row
            label="Zoom sur"
            value={t.zoomChars}
            min={0.5}
            max={8}
            step={0.1}
            fmt={(v) => `${v.toFixed(1)} car.`}
            onChange={(v) => posteTweak.set({ zoomChars: v })}
          />
          <Row
            label="Zoom sur ↔"
            value={t.zoomSpan}
            min={0.1}
            max={3}
            step={0.05}
            fmt={(v) => `${v.toFixed(2)} écr.`}
            onChange={(v) => posteTweak.set({ zoomSpan: v })}
          />
          <Row
            label="Fenêtre"
            value={t.holeWin}
            min={1}
            max={24}
            step={0.1}
            fmt={(v) => `${v.toFixed(1)} car.`}
            onChange={(v) => posteTweak.set({ holeWin: v })}
          />

          <Row
            label="Halo près"
            value={t.pixelHalo}
            min={0}
            max={3}
            step={0.05}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => posteTweak.set({ pixelHalo: v })}
          />
          <Row
            label="Contraste"
            value={t.pixelGamma}
            min={0}
            max={1.6}
            step={0.05}
            fmt={(v) => (v === 0 ? "neutre" : v.toFixed(2))}
            onChange={(v) => posteTweak.set({ pixelGamma: v })}
          />
          </Section>
          <Section title="plongée">
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
            min={0.06}
            max={3}
            step={0.02}
            fmt={(v) => `${v.toFixed(2)} écr.`}
            onChange={(v) =>
              posteTweak.set({ crossIn: v, crossOut: Math.min(t.crossOut, v - 0.01) })
            }
          />
          <Row
            label="Bascule à"
            value={t.crossHold}
            min={0.03}
            max={1.5}
            step={0.01}
            fmt={(v) => `${v.toFixed(2)} écr.`}
            onChange={(v) =>
              posteTweak.set({
                crossHold: v,
                crossIn: Math.max(t.crossIn, v + 0.01),
                crossOut: Math.min(t.crossOut, v - 0.01),
              })
            }
          />
          <Row
            label="Fini à"
            value={t.crossOut}
            min={0.01}
            max={1.5}
            step={0.01}
            fmt={(v) => `${v.toFixed(2)} écr.`}
            onChange={(v) =>
              posteTweak.set({ crossOut: v, crossIn: Math.max(t.crossIn, v + 0.01) })
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
            label="Recentre dès"
            value={t.aimFrom}
            min={0.5}
            max={8}
            step={0.1}
            fmt={(v) => `${v.toFixed(1)} écr.`}
            onChange={(v) => posteTweak.set({ aimFrom: v, aimBy: Math.min(t.aimBy, v - 0.2) })}
          />
          <Row
            label="Recentré"
            value={t.aimBy}
            min={0.2}
            max={6}
            step={0.1}
            fmt={(v) => `${v.toFixed(1)} écr.`}
            onChange={(v) => posteTweak.set({ aimBy: v })}
          />
          </Section>
          <Section title="corridor">
          {/*
           * LA RÉSOLUTION EST LA SEULE BARRE QUI RECONSTRUIT QUELQUE CHOSE (le tableau
           * d'instances), d'où un pas grossier : 0.5 par cran, donc au plus sept
           * reconstructions sur un drag d'un bout à l'autre. Le libellé montre la grille
           * obtenue ET le nombre d'instances, parce que le coût est quadratique — voir
           * `gridScale` dans posteTweak.
           */}
          <Row
            label="Pixels"
            value={t.gridScale}
            min={0.5}
            max={12}
            step={0.5}
            fmt={(v) => {
              const base = Math.max(1, Math.round(12 * v));
              const n = 4 * base * 3 * base * Math.round(t.slices);
              return `${4 * base}×${3 * base} · ${(n / 1000).toFixed(0)}k`;
            }}
            onChange={(v) => posteTweak.set({ gridScale: v })}
          />
          <Row
            label="Tranches"
            value={t.slices}
            min={4}
            max={40}
            step={4}
            fmt={(v) => `${Math.round(v)}`}
            onChange={(v) => posteTweak.set({ slices: v })}
          />
          {/* LA FORME, en tête de section : c'est elle qui décide du geste, le reste l'habille. */}
          <Toggle
            label="Forme"
            on={t.tubeShaft}
            onLabel="puits"
            offLabel="cône"
            onChange={(v) => posteTweak.set({ tubeShaft: v })}
          />
          {t.tubeShaft ? (
            <>
              <Row
                label="Pas"
                value={t.tubeStep}
                min={0.05}
                max={1.5}
                step={0.05}
                fmt={(v) => `${v.toFixed(2)} bouche`}
                onChange={(v) => posteTweak.set({ tubeStep: v })}
              />
              {/*
               * PAROI LOIN / DEDANS, la paire qui anime la sortie — même lecture que « Blocs
               * loin/dedans » juste en dessous : la première est la valeur au croisement, la
               * seconde celle à la fin de la traversée. À 1 la paroi est continue, donc une seule
               * ouverture au fond (voir `tubeWall`).
               */}
              <Row
                label="Paroi loin"
                value={t.tubeWall}
                min={0.1}
                max={1}
                step={0.05}
                fmt={(v) => (v >= 1 ? "continue" : v.toFixed(2))}
                onChange={(v) => posteTweak.set({ tubeWall: v })}
              />
              <Row
                label="Paroi sortie"
                value={t.tubeWallIn}
                min={0.02}
                max={1}
                step={0.02}
                fmt={(v) => (v >= 1 ? "continue" : v.toFixed(2))}
                onChange={(v) => posteTweak.set({ tubeWallIn: v })}
              />
            </>
          ) : null}
          {/* Le seul bouton du corridor qui divise le coût par six — voir `blockQuad`. */}
          <Toggle
            label="Bloc"
            on={t.blockQuad}
            onLabel="plaque"
            offLabel="cube"
            onChange={(v) => posteTweak.set({ blockQuad: v })}
          />
          <Row
            label="Blocs loin"
            value={t.fillXY}
            min={0.2}
            max={1}
            step={0.01}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => posteTweak.set({ fillXY: v })}
          />
          <Row
            label="Blocs dedans"
            value={t.fillIn}
            min={0.1}
            max={1}
            step={0.01}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => posteTweak.set({ fillIn: v })}
          />
          <Row
            label="Espacement"
            value={t.growth}
            min={0.08}
            max={0.9}
            step={0.01}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => posteTweak.set({ growth: v })}
          />
          <Row
            label="Calage X"
            value={t.corrX}
            min={-60}
            max={60}
            step={1}
            fmt={(v) => `${Math.round(v)}px`}
            onChange={(v) => posteTweak.set({ corrX: v })}
          />
          <Row
            label="Calage Y"
            value={t.corrY}
            min={-40}
            max={40}
            step={1}
            fmt={(v) => `${Math.round(v)}px`}
            onChange={(v) => posteTweak.set({ corrY: v })}
          />
          <Row
            label="Vide"
            value={t.cellCut}
            min={0}
            max={0.6}
            step={0.01}
            fmt={(v) => (v === 0 ? "aucun" : v.toFixed(2))}
            onChange={(v) => posteTweak.set({ cellCut: v })}
          />
          <Row
            label="Fond"
            value={t.restLevel}
            min={0}
            max={1}
            step={0.05}
            fmt={(v) => (v === 0 ? "noir" : v.toFixed(2))}
            onChange={(v) => posteTweak.set({ restLevel: v })}
          />
          <Row
            label="Recul bouche"
            value={t.mouthBack}
            min={-0.4}
            max={0.6}
            step={0.005}
            fmt={(v) => `${v.toFixed(3)} écr.`}
            onChange={(v) => posteTweak.set({ mouthBack: v })}
          />
          <Row
            label="Éclat"
            value={t.peak}
            min={1}
            max={9}
            step={0.1}
            fmt={(v) => `×${v.toFixed(1)}`}
            onChange={(v) => posteTweak.set({ peak: v })}
          />
          <Row
            label="Traversée"
            value={t.cycles}
            min={t.tunnelLoop ? 1 : 0.2}
            max={t.tunnelLoop ? 5 : 2}
            step={t.tunnelLoop ? 1 : 0.1}
            fmt={(v) =>
              t.tunnelLoop ? `${Math.round(v)} tour${v > 1 ? "s" : ""}` : `×${v.toFixed(1)} du tube`
            }
            onChange={(v) => posteTweak.set({ cycles: v })}
          />
          {/* Où Paroi/Blocs ont fini leur course — à caler contre la ligne « Anime ». */}
          {/* La plongée n'est plus scrubbée : elle joue cette durée — voir `diveSeconds`. */}
          <Row
            label="Durée"
            value={t.diveSeconds}
            min={2}
            max={20}
            step={0.5}
            fmt={(v) => `${v.toFixed(1)} s`}
            onChange={(v) => posteTweak.set({ diveSeconds: v })}
          />
          <Row
            label="Dissout à"
            value={t.dissolveAt}
            min={0.1}
            max={1}
            step={0.02}
            fmt={(v) => `${Math.round(v * 100)} %`}
            onChange={(v) => posteTweak.set({ dissolveAt: v })}
          />
          <Row
            label="Sortie à"
            value={t.fallAt}
            min={0.2}
            max={0.98}
            step={0.02}
            fmt={(v) => `${Math.round(v * 100)} %`}
            onChange={(v) => posteTweak.set({ fallAt: v })}
          />
          {/* Le geste du corridor, pas un réglage d'image — voir `tunnelLoop`. */}
          <Toggle
            label="Fin"
            on={t.tunnelLoop}
            onLabel="boucle"
            offLabel="on sort"
            onChange={(v) => posteTweak.set({ tunnelLoop: v, cycles: v ? 1 : Math.min(t.cycles, 2) })}
          />
          <Row
            label="Atténuat."
            value={t.atten}
            min={0}
            max={0.6}
            step={0.01}
            fmt={(v) => v.toFixed(2)}
            onChange={(v) => posteTweak.set({ atten: v })}
          />
          <Row
            label="Retrait"
            value={t.discard}
            min={0.2}
            max={9}
            step={0.1}
            fmt={(v) => v.toFixed(1)}
            onChange={(v) => posteTweak.set({ discard: v })}
          />
          </Section>
          <Section title="en direct">
          <Readout
            label="Caméra"
            value={`x ${live.x.toFixed(2)}  y ${live.y.toFixed(2)}  z ${live.z.toFixed(2)}`}
          />
          <Readout label="Fov" value={`${live.fov.toFixed(1)}°`} />
          {/*
           * CE QUI PART VRAIMENT AU SHADER, et qui n'est aucune des quatre molettes : `Paroi` et
           * `Blocs` sont des paires interpolées sur la dissolution (voir tunnelLive.ts). Sans cette
           * ligne, la seule façon de savoir où en est l'animation était de la recalculer de tête.
           */}
          <Readout
            label="Anime"
            value={`paroi ${live.wall.toFixed(2)}   blocs ${live.blocks.toFixed(2)}`}
          />
          <Readout label="Verre" value={`${live.ecr.toFixed(2)} écr.`} />
          <Readout
            label="Lettre"
            value={
              live.through
                ? "traversée"
                : `${live.dx >= 0 ? "+" : ""}${Math.round(live.dx)}, ${live.dy >= 0 ? "+" : ""}${Math.round(live.dy)} px`
            }
          />
          </Section>
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
