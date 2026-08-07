/**
 * LES QUATRE PIÈCES DU THÉÂTRE, en nuages de points — un objet par projet.
 *
 * Pur, sans three ni WebGL, pour la même raison que tunnelGeom : la géométrie est ce
 * qu'on se trompe en écrivant, et un test la tient (voir tests/theatreShapes.test.ts).
 * Le composant qui la consomme (TheatrePieces) n'a plus qu'à téléverser des tampons.
 *
 * CHAQUE PIÈCE RENVOIE AUSSI UNE SAILLANCE PAR POINT — de 0 (au cœur d'une face, là où
 * la matière tient) à 1 (à une pointe, là où elle lâche). C'est ce nombre, et lui seul,
 * que la décomposition lit. Il n'est pas décoratif : c'est la façon dont chaque forme
 * répond à « par où te perds-tu ? », et la réponse diffère réellement d'une géométrie à
 * l'autre. Le marteau se vide par les deux bouts de sa tête et son pommeau, le burger
 * par le pourtour de ses couches, le vase par sa lèvre et son pied, l'appareil par ses
 * arêtes de boîtier et sa bague d'objectif.
 *
 * Une formule unique ne pouvait pas marcher : `min(|x|,|y|,|z|)` désigne les huit coins
 * d'un cube et ne veut rien dire sur un vase.
 */

/** Un nuage : positions xyz entrelacées, et une saillance par point. */
export type PointCloud = {
  pos: Float32Array;
  sal: Float32Array;
  count: number;
};

/*
 * LE TYPE VIENT DE `theatre`, ET SEULEMENT LE TYPE. Ces deux modules sont testés par
 * node --test, dont le chargeur résout les imports de VALEUR : un import ordinaire
 * entre eux casserait les deux suites, la convention du dépôt omettant les extensions.
 * `import type` est effacé avant résolution, donc il ne coûte rien — et il évite de
 * dupliquer l'union des quatre pièces dans deux fichiers.
 */
import type { PieceKind } from "./theatre";

/* ---------------------------------------------------------------------------
   PRIMITIVES ÉCHANTILLONNÉES À PAS CONSTANT.

   Toutes prennent un pas `sp` en unités locales et posent des points espacés de sp
   dans les DEUX directions de la surface. C'est ce qui permet d'assembler un objet à
   partir de six primitives différentes sans qu'aucune ne trahisse sa nature par un
   grain plus fin : le nombre de points suit l'aire, jamais la paramétrisation. Un
   anneau de rayon 0,1 reçoit six points, un de rayon 0,9 en reçoit soixante.

   `ax` mappe (le long de l'axe, puis les deux du plan) vers (x, y, z) : une seule
   implémentation sert donc aux trois orientations.
   --------------------------------------------------------------------------- */

type Axis = (a: number, b: number, c: number) => [number, number, number];
type Put = (x: number, y: number, z: number, sal: number) => void;

const AX: Record<"x" | "y" | "z", Axis> = {
  x: (a, b, c) => [a, b, c],
  y: (a, b, c) => [b, a, c],
  z: (a, b, c) => [b, c, a],
};

function ring(put: Put, ax: Axis, a: number, r: number, sp: number, sal: number | ((th: number) => number)) {
  const at = (th: number) => (typeof sal === "function" ? sal(th) : sal);
  if (r < sp * 0.35) {
    const q = ax(a, 0, 0);
    put(q[0], q[1], q[2], at(0));
    return;
  }
  const m = Math.max(4, Math.round((r * Math.PI * 2) / sp));
  for (let i = 0; i < m; i++) {
    const th = (Math.PI * 2 * i) / m;
    const q = ax(a, r * Math.cos(th), r * Math.sin(th));
    put(q[0], q[1], q[2], at(th));
  }
}

/** Disque plein, en anneaux concentriques — pas une grille carrée découpée. */
function disc(put: Put, ax: Axis, a: number, r: number, sp: number, sal: number | ((th: number) => number)) {
  const rings = Math.max(1, Math.round(r / sp));
  const q = ax(a, 0, 0);
  put(q[0], q[1], q[2], typeof sal === "function" ? sal(0) : sal);
  for (let k = 1; k <= rings; k++) ring(put, ax, a, (r * k) / rings, sp, sal);
}

/**
 * Surface de révolution. `rAt(t)` donne le rayon pour t de 0 (a0) à 1 (a1).
 *
 * Le nombre de rangs suit la longueur du PROFIL, pas l'écart entre a0 et a1 : une
 * panse qui s'évase parcourt plus de chemin que sa hauteur ne le dit, et la mesurer
 * sur l'axe seul y espacerait les points deux fois trop.
 */
function lathe(
  put: Put,
  ax: Axis,
  a0: number,
  a1: number,
  rAt: (t: number) => number,
  sp: number,
  sal: number | ((t: number, th: number) => number)
) {
  let len = 0;
  let pa = a0;
  let pr = rAt(0);
  for (let i = 1; i <= 64; i++) {
    const t = i / 64;
    const na = a0 + (a1 - a0) * t;
    const nr = rAt(t);
    len += Math.hypot(na - pa, nr - pr);
    pa = na;
    pr = nr;
  }
  const rows = Math.max(1, Math.round(len / sp));
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    ring(put, ax, a0 + (a1 - a0) * t, rAt(t), sp, typeof sal === "function" ? (th: number) => sal(t, th) : sal);
  }
}

/** Six faces sans doubler les arêtes : les tranches sautent les rangs déjà posés. */
function box(
  put: Put,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  sp: number,
  sal: (u: number, v: number, w: number) => number
) {
  const nx = Math.max(2, Math.round((2 * hx) / sp) + 1);
  const ny = Math.max(2, Math.round((2 * hy) / sp) + 1);
  const nz = Math.max(2, Math.round((2 * hz) / sp) + 1);
  const L = (i: number, m: number, h: number) => -h + (2 * h * i) / (m - 1);
  const emit = (x: number, y: number, z: number) => put(cx + x, cy + y, cz + z, sal(x / hx, y / hy, z / hz));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      emit(L(i, nx, hx), L(j, ny, hy), -hz);
      emit(L(i, nx, hx), L(j, ny, hy), hz);
    }
  for (let i = 0; i < nx; i++)
    for (let k = 1; k < nz - 1; k++) {
      emit(L(i, nx, hx), -hy, L(k, nz, hz));
      emit(L(i, nx, hx), hy, L(k, nz, hz));
    }
  for (let j = 1; j < ny - 1; j++)
    for (let k = 1; k < nz - 1; k++) {
      emit(-hx, L(j, ny, hy), L(k, nz, hz));
      emit(hx, L(j, ny, hy), L(k, nz, hz));
    }
}

/** Portion de sphère entre deux latitudes, en anneaux de pas constant. */
function dome(
  put: Put,
  cx: number,
  cy: number,
  cz: number,
  r: number,
  sp: number,
  sal: number | ((t: number) => number),
  t0 = 0,
  t1 = Math.PI
) {
  const rows = Math.max(2, Math.round((r * (t1 - t0)) / sp));
  for (let j = 0; j <= rows; j++) {
    const phi = t0 + ((t1 - t0) * j) / rows;
    const y = Math.cos(phi) * r;
    const rad = Math.sin(phi) * r;
    const s = typeof sal === "function" ? sal(j / rows) : sal;
    if (rad < sp * 0.35) {
      put(cx, cy + y, cz, s);
      continue;
    }
    const m = Math.max(4, Math.round((rad * Math.PI * 2) / sp));
    for (let i = 0; i < m; i++) {
      const th = (Math.PI * 2 * i) / m;
      put(cx + rad * Math.cos(th), cy + y, cz + rad * Math.sin(th), s);
    }
  }
}

/**
 * Anse : un tube circulaire suivant un arc, pour les poignées du vase.
 *
 * La section est prise PERPENDICULAIRE à la course, sinon le tube s'aplatit dans les
 * virages et l'anse se lit comme un ruban.
 */
function handle(
  put: Put,
  arcAt: (t: number) => [number, number],
  len: number,
  tubeR: number,
  sp: number,
  sal: (t: number) => number
) {
  const steps = Math.max(8, Math.round(len / sp));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const c = arcAt(t);
    const d = arcAt(Math.min(1, t + 0.01));
    const tx = d[0] - c[0];
    const ty = d[1] - c[1];
    const n = Math.hypot(tx, ty) || 1;
    const px = -ty / n;
    const py = tx / n;
    const m = Math.max(5, Math.round((tubeR * Math.PI * 2) / sp));
    for (let k = 0; k < m; k++) {
      const th = (Math.PI * 2 * k) / m;
      const ca = Math.cos(th) * tubeR;
      const sa = Math.sin(th) * tubeR;
      put(c[0] + px * ca, c[1] + py * ca, sa, sal(t));
    }
  }
}

/* --------------------------------------------------------------------------- */

/**
 * Sème une pièce. `density` est le nombre de pas sur la pleine largeur du cube unité :
 * le pas vaut donc 2/density, et une pièce plus fine reçoit proportionnellement moins
 * de points — c'est ce qui garde le grain constant d'un objet à l'autre.
 */
export function buildPiece(kind: PieceKind, density: number): PointCloud {
  const n = Math.max(8, Math.round(density));
  const sp = 2 / n;
  const xs: number[] = [];
  const sl: number[] = [];
  const put: Put = (x, y, z, sal) => {
    xs.push(x, y, z);
    sl.push(Math.min(1, Math.max(0, sal)));
  };

  if (kind === "appareil") {
    /* PICTARINE — l'appareil photo. La bague d'objectif est ce qui le fait lire comme
       un appareil plutôt que comme une boîte à bouton, d'où son relief. */
    const corner = (u: number, v: number, w: number) => Math.min(Math.abs(u), Math.abs(v), Math.abs(w));
    box(put, 0, 0, 0, 0.8, 0.5, 0.26, sp, (u, v, w) => corner(u, v, w) * 0.9);
    box(put, -0.26, 0.6, 0, 0.24, 0.12, 0.15, sp, corner);
    lathe(put, AX.y, 0.5, 0.6, () => 0.075, sp, 0.4);
    disc(put, AX.y, 0.6, 0.075, sp, 0.55);
    lathe(put, AX.z, 0.26, 0.56, () => 0.3, sp, 0.25);
    lathe(put, AX.z, 0.56, 0.62, (t) => 0.3 + 0.04 * t, sp, (t) => 0.5 + 0.5 * t);
    ring(put, AX.z, 0.62, 0.34, sp, 1);
    disc(put, AX.z, 0.6, 0.3, sp, 0.15);
  } else if (kind === "marteau") {
    /* FORMA — le marteau de justice. Les deux bagues ne sont pas un ornement : sans
       elles la tête se lit comme un simple rouleau. */
    const half = 0.6;
    const r = 0.26;
    lathe(put, AX.x, -half, half, () => r, sp, (t) => 0.15 + 0.5 * Math.abs(2 * t - 1));
    for (const sx of [-1, 1]) {
      disc(put, AX.x, sx * half, r, sp, 1);
      lathe(put, AX.x, sx * 0.4, sx * 0.46, () => r + 0.035, sp, 0.5);
    }
    lathe(put, AX.y, -0.92, 0, () => 0.085, sp, (t) => 0.35 * (1 - t));
    dome(put, 0, -0.92, 0, 0.135, sp, 1, Math.PI * 0.36, Math.PI);
    /* La tête en haut, le manche qui descend : on translate à la fin plutôt que de
       porter un décalage dans chacune des primitives. */
    for (let i = 1; i < xs.length; i += 3) xs[i] += 0.4;
  } else if (kind === "burger") {
    /* CRAZEE.B — le burger. Chaque couche déborde un peu de celle du dessus : c'est ce
       débord, et lui seul, qui le fait lire de profil comme un burger et non comme une
       pile de disques. */
    lathe(put, AX.y, -0.7, -0.4, (t) => 0.52 + 0.3 * Math.sin(t * Math.PI * 0.5), sp, (t) => 0.2 + 0.5 * t);
    disc(put, AX.y, -0.7, 0.52, sp, 0.3);
    lathe(put, AX.y, -0.4, -0.16, () => 0.86, sp, 0.85);
    /* La salade : un feston, pas un disque — son ondulation est le seul détail qui
       distingue la couche verte de la viande. */
    for (let j = 0; j <= 2; j++) {
      const y = -0.16 + j * 0.035;
      const m = Math.max(24, Math.round((0.94 * Math.PI * 2) / sp));
      for (let i = 0; i < m; i++) {
        const th = (Math.PI * 2 * i) / m;
        const rr = 0.94 + 0.075 * Math.sin(9 * th);
        const rings = Math.max(1, Math.round((rr - 0.55) / sp));
        for (let k = 0; k <= rings; k++) {
          const r2 = 0.55 + ((rr - 0.55) * k) / rings;
          put(r2 * Math.cos(th), y + 0.02 * Math.sin(9 * th), r2 * Math.sin(th), 0.35 + 0.65 * (k / rings));
        }
      }
    }
    lathe(put, AX.y, -0.06, 0.1, () => 0.8, sp, 0.6);
    dome(put, 0, 0.1, 0, 0.8, sp, (t) => 0.55 * (1 - t), 0, Math.PI * 0.5);
    /* Les graines : sans elles le pain du haut n'est qu'une demi-sphère. */
    const seeds: [number, number][] = [
      [0.2, 0.7],
      [1.1, 1.15],
      [2.2, 0.55],
      [3.0, 1.0],
      [3.9, 0.75],
      [4.8, 1.2],
      [5.7, 0.9],
    ];
    for (const [th, phi] of seeds) {
      const ph = phi * 0.5;
      dome(
        put,
        0.8 * Math.sin(ph) * Math.cos(th),
        0.1 + 0.8 * Math.cos(ph),
        0.8 * Math.sin(ph) * Math.sin(th),
        0.075,
        sp * 0.8,
        0.15,
        0,
        Math.PI * 0.55
      );
    }
  } else {
    /* KLAY — le vase romain. Le profil fait tout : un pied étroit, une panse basse, un
       col resserré, une lèvre évasée. Les anses rangent la silhouette du côté de
       l'amphore, et la lèvre est creusée — un vase plein en haut se lit comme un pion
       d'échecs. */
    const PROF: [number, number][] = [
      [-1.0, 0.3],
      [-0.94, 0.36],
      [-0.88, 0.24],
      [-0.74, 0.34],
      [-0.52, 0.55],
      [-0.24, 0.66],
      [0.02, 0.64],
      [0.26, 0.52],
      [0.46, 0.34],
      [0.6, 0.25],
      [0.76, 0.23],
      [0.88, 0.3],
      [0.96, 0.36],
      [1.0, 0.33],
    ];
    const rAt = (t: number) => {
      const y = -1 + 2 * t;
      for (let i = 0; i < PROF.length - 1; i++) {
        if (y >= PROF[i][0] && y <= PROF[i + 1][0]) {
          const k = (y - PROF[i][0]) / (PROF[i + 1][0] - PROF[i][0]);
          return PROF[i][1] + (PROF[i + 1][1] - PROF[i][1]) * k;
        }
      }
      return PROF[PROF.length - 1][1];
    };
    lathe(put, AX.y, -1, 1, rAt, sp, (t) => Math.max(0, Math.abs(2 * t - 1) * 1.15 - 0.15));
    disc(put, AX.y, -1, 0.3, sp, 0.9);
    disc(put, AX.y, 0.99, 0.26, sp, 0.5);
    for (const sx of [-1, 1]) {
      handle(
        put,
        (t) => {
          const a = Math.PI * (0.5 - t);
          return [
            sx * (0.3 + 0.42 * Math.cos(a) + 0.1 * Math.sin(Math.PI * t)),
            0.72 - 0.52 * t - 0.16 * Math.sin(Math.PI * t),
          ];
        },
        1.05,
        0.055,
        sp,
        (t) => 0.25 + 0.45 * Math.sin(Math.PI * t)
      );
    }
  }

  /*
   * RAMENER DANS LE CUBE UNITÉ, À LA FIN. Les pièces sont écrites à taille naturelle —
   * c'est la seule façon d'ajuster une lèvre de vase ou une bague d'objectif sans
   * recalculer tout le reste. La mise à l'échelle est UNIFORME : appliquée axe par axe
   * elle déformerait l'objet, et un appareil photo étiré verticalement cesse d'en être
   * un.
   */
  let m = 0;
  for (let i = 0; i < xs.length; i++) m = Math.max(m, Math.abs(xs[i]));
  if (m > 0) {
    const k = 1 / m;
    for (let i = 0; i < xs.length; i++) xs[i] *= k;
  }

  return { pos: new Float32Array(xs), sal: new Float32Array(sl), count: sl.length };
}
