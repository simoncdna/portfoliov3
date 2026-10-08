"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector4 } from "three";
import type { BufferGeometry, Material, Object3D } from "three";

/**
 * LA PRÉCHAUFFE — chaque forme cachée est compilée, puis tirée UNE fois hors champ, avant
 * qu'une transition n'ait besoin d'elle.
 *
 * POURQUOI. Toutes les formes de la scène sont montées dès le chargement et se cachent
 * elles-mêmes (`visible = false`) tant que leur section n'est pas là. Or three ne prépare un
 * objet qu'au premier rendu où il est VISIBLE, et cette première fois coûte trois choses
 * d'un coup, toutes synchrones pour l'image qui la paie :
 *
 *  - le programme : `getProgramParameter(LINK_STATUS)` attend que le processus GPU ait fini
 *    de compiler et de lier le shader ;
 *  - le pipeline Metal, créé par ANGLE au premier tirage avec ce programme et cet état de
 *    rendu — c'est ce qui bloque le thread du GPU, donc aussi le compositeur ;
 *  - les tampons et les textures, téléversés au premier tirage qui les lie.
 *
 * Et cette « première fois » tombait exactement sur les transitions, puisque c'est là que
 * chaque forme apparaît. Mesuré (M3 Pro, Chrome 151, profil neuf, trace devtools) : le crâne
 * au premier cran de molette, 141 ms dans `getProgramParameter` ; le poste au relais
 * d'About, 275 ms dans la boucle r3f (programme, pipeline, géométrie et textures du glb) ;
 * le corridor à l'entrée de la plongée, 131 ms plus 46 ms côté GPU ; la salle, 52 ms.
 *
 * CE QUE FAIT CE COMPOSANT, en deux temps, pour tout objet caché qu'il n'a pas encore vu :
 *
 *  1. `compileAsync` sur la scène entière — elle parcourt aussi les objets invisibles. Avec
 *     KHR_parallel_shader_compile, la compilation se fait hors du thread principal et la
 *     promesse se résout quand les programmes sont prêts : le `getProgramParameter` du
 *     tirage suivant ne bloque plus.
 *  2. Un tirage de ces objets dans un rectangle de ciseaux d'UN pixel, réduits à une seule
 *     primitive. C'est un vrai tirage, avec leur vrai matériau dans le vrai framebuffer —
 *     c'est la condition pour que le pipeline créé soit celui que la transition utilisera
 *     (il dépend du mélange, du masque d'écriture et du format de la cible, pas des
 *     uniformes). Les tampons, eux, partent en entier : three téléverse la géométrie
 *     indépendamment de `drawRange`.
 *
 * INVISIBLE PAR CONSTRUCTION : ce tirage précède, dans la même image, le rendu de r3f, qui
 * efface le framebuffer en entier (autoClear) avant de dessiner. Le pixel écrit n'est
 * jamais présenté.
 *
 * LE COÛT NE DISPARAÎT PAS, IL CHANGE D'HEURE : il est payé au chargement, pendant les
 * premières secondes où la page est de toute façon en train de s'installer — et sous le
 * rideau du Preloader quand il est monté. Les objets arrivent par vagues (le corridor et la
 * salle sans rien à charger, le crâne et le poste quand leurs glb sont là), donc la
 * préchauffe aussi : un lot par vague, détecté par un balayage périodique de la scène.
 *
 * SA PLACE PARMI LES useFrame EST INDIFFÉRENTE. Les formes montées derrière un Suspense
 * s'abonnent après lui et écrivent leur visibilité après son passage, donc il lit celle de
 * l'image précédente. Sans conséquence : une forme qui apparaît dans l'image même où elle
 * est préchauffée est simplement tirée deux fois, et la visibilité que ce composant force
 * est rendue telle qu'il l'a trouvée avant que la forme n'écrive la sienne.
 */

/** Combien d'images entre deux balayages de la scène. Un balayage parcourt une vingtaine
 *  d'objets : rien à économiser, sinon de la latence entre l'arrivée d'un glb et sa
 *  préchauffe. */
const SCAN_EVERY = 10;

type Drawable = Object3D & {
  geometry: BufferGeometry & { instanceCount?: number; isInstancedBufferGeometry?: boolean };
  material: Material | Material[];
  isMesh?: boolean;
  isPoints?: boolean;
  isLine?: boolean;
  isInstancedMesh?: boolean;
  count?: number;
};

const isDrawable = (o: Object3D): o is Drawable => {
  const d = o as Drawable;
  return !!(d.isMesh || d.isPoints || d.isLine) && !!d.geometry && !!d.material;
};

/** Dessiné par le rendu de cette image : lui ET tous ses ancêtres visibles. */
function shown(o: Object3D) {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

export function StageWarmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  /*
   * Préchauffé = cette géométrie a été tirée avec ce matériau. Le couple, pas l'objet : un
   * mesh peut changer de géométrie sans changer d'identité (le cadre du poste se reconstruit
   * quand on règle sa moulure), et c'est la géométrie neuve qui a des tampons à envoyer.
   */
  const warmed = useRef(new WeakMap<BufferGeometry, WeakSet<Material>>());
  const st = useRef({ phase: "scan" as "scan" | "compiling" | "draw", batch: [] as Drawable[], frame: 0 });
  const scissor = useRef(new Vector4());
  const log = useRef<{ at: number; objects: string[]; compileMs: number; drawMs: number }[]>([]);

  const mats = (o: Drawable) => (Array.isArray(o.material) ? o.material : [o.material]);
  const isWarm = (o: Drawable) => {
    const set = warmed.current.get(o.geometry);
    return !!set && mats(o).every((m) => set.has(m));
  };
  const markWarm = (o: Drawable) => {
    let set = warmed.current.get(o.geometry);
    if (!set) warmed.current.set(o.geometry, (set = new WeakSet()));
    for (const m of mats(o)) set.add(m);
  };

  useFrame(() => {
    const s = st.current;
    s.frame++;
    if (s.phase === "compiling") return;

    if (s.phase === "draw") {
      s.phase = "scan";
      const t0 = performance.now();
      const items = s.batch.filter((o) => o.parent && !shown(o) && !isWarm(o));
      s.batch = [];
      if (!items.length) return;

      // Ce qui est déjà dessiné reste tel quel : sous un pixel de ciseaux, il ne coûte rien.
      const before = new Set<Object3D>();
      scene.traverse((o) => {
        if (isDrawable(o) && shown(o)) before.add(o);
      });
      const unhidden: Object3D[] = [];
      for (const o of items) {
        for (let p: Object3D | null = o; p; p = p.parent) {
          if (!p.visible) {
            p.visible = true;
            unhidden.push(p);
          }
        }
      }
      /*
       * Tout ce que ces changements de visibilité font apparaître est réduit à une primitive —
       * y compris les frères d'un objet du lot, qui se retrouvent dessinés parce que leur
       * groupe parent l'est.
       *
       * SAUF une géométrie à groupes (plusieurs matériaux) : three borne chaque groupe à
       * l'intersection de son intervalle et de `drawRange`, donc une plage réduite au premier
       * triangle laisserait les autres groupes à un compte négatif, que three saute sans les
       * lier — leurs pipelines ne seraient jamais créés. Celles-là sont tirées entières ; le
       * pixel de ciseaux suffit à les rendre bon marché.
       */
      const ranges: [Drawable, number, number, number | undefined, number | undefined][] = [];
      scene.traverse((o) => {
        if (!isDrawable(o) || before.has(o) || !shown(o)) return;
        const g = o.geometry;
        if (Array.isArray(o.material) && g.groups.length) return;
        ranges.push([o, g.drawRange.start, g.drawRange.count, g.instanceCount, o.count]);
        g.setDrawRange(0, o.isPoints ? 1 : o.isLine ? 2 : 3);
        if (g.isInstancedBufferGeometry) g.instanceCount = 1;
        if (o.isInstancedMesh) o.count = 1;
      });

      const hadScissor = gl.getScissorTest();
      gl.getScissor(scissor.current);
      gl.setScissorTest(true);
      gl.setScissor(0, 0, 1, 1);
      try {
        gl.render(scene, camera);
      } finally {
        gl.setScissor(scissor.current);
        gl.setScissorTest(hadScissor);
        for (const [o, start, count, inst, objCount] of ranges) {
          o.geometry.setDrawRange(start, count);
          if (inst !== undefined) o.geometry.instanceCount = inst;
          if (objCount !== undefined) o.count = objCount;
          markWarm(o);
        }
        for (const p of unhidden) p.visible = false;
      }
      for (const o of items) markWarm(o);
      const last = log.current[log.current.length - 1];
      if (last) last.drawMs = +(performance.now() - t0).toFixed(1);
      return;
    }

    if (s.frame % SCAN_EVERY) return;
    const pending: Drawable[] = [];
    scene.traverse((o) => {
      if (!isDrawable(o) || isWarm(o)) return;
      // Ce que le rendu de cette image dessine s'y prépare tout seul.
      if (shown(o)) markWarm(o);
      else pending.push(o);
    });
    if (!pending.length) return;
    s.phase = "compiling";
    s.batch = pending;
    const t0 = performance.now();
    const entry = {
      at: +t0.toFixed(0),
      objects: pending.map((o) => o.name || o.type),
      compileMs: 0,
      drawMs: 0,
    };
    log.current.push(entry);
    // Un échec de compilation est signalé par three lui-même ; la préchauffe n'a rien à y
    // ajouter, seulement à ne pas rester bloquée en « compiling ».
    gl.compileAsync(scene, camera)
      .catch(() => {})
      .then(() => {
        entry.compileMs = +(performance.now() - t0).toFixed(1);
        s.phase = "draw";
      });
  });

  // Hublot de dev, comme `window.__form` : les lots passés et ce qu'ils ont coûté.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as Record<string, unknown>).__warm = () => log.current;
  }, []);
  return null;
}
