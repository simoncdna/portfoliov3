"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  LineBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  TubeGeometry,
  Vector3,
} from "three";
import type { Group, LineSegments } from "three";
import { blobTweak } from "@/lib/blobTweak";

type Props = {
  about?: React.MutableRefObject<number>;
  scroll?: React.MutableRefObject<number>;
  reduced?: boolean;
};

const SPHERE_R = 2.1;
const LATS = 16; // parallels
const LONGS = 24; // meridians
const RING_SEG = 48; // smoothness of each line
const R = 0.8; // helix radius
const H = 3.8; // helix height
const TURNS = 1.0;
const TUBE_R = 0.14;
const RUNG_R = 0.09;
const RUNGS = 5;
const SEG = 200;
const DOCK_X = -3.6;

/** Clean lat/long wireframe globe (meridians + parallels), no triangulation. */
function buildGridSphere(r: number): BufferGeometry {
  const pos: number[] = [];
  const TAU = Math.PI * 2;
  // parallels (horizontal rings)
  for (let i = 1; i < LATS; i++) {
    const phi = (Math.PI * i) / LATS;
    const y = Math.cos(phi) * r;
    const rr = Math.sin(phi) * r;
    for (let s = 0; s < RING_SEG; s++) {
      const a0 = (TAU * s) / RING_SEG;
      const a1 = (TAU * (s + 1)) / RING_SEG;
      pos.push(Math.cos(a0) * rr, y, Math.sin(a0) * rr, Math.cos(a1) * rr, y, Math.sin(a1) * rr);
    }
  }
  // meridians (pole-to-pole half circles)
  for (let j = 0; j < LONGS; j++) {
    const th = (TAU * j) / LONGS;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    for (let s = 0; s < RING_SEG; s++) {
      const p0 = (Math.PI * s) / RING_SEG;
      const p1 = (Math.PI * (s + 1)) / RING_SEG;
      pos.push(ct * Math.sin(p0) * r, Math.cos(p0) * r, st * Math.sin(p0) * r, ct * Math.sin(p1) * r, Math.cos(p1) * r, st * Math.sin(p1) * r);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  return geo;
}

/**
 * Wireframe "mesh" form: a clean lat/long wireframe globe at the hero, cross-
 * dissolving into a wireframe tube double-helix toward About — same morph, dock
 * and spin as the liquid/particle forms.
 */
export function MeshDna({ about, scroll, reduced }: Props) {
  const group = useRef<Group>(null);
  const sphereRef = useRef<LineSegments>(null);
  const helixRef = useRef<Group>(null);
  const pres = useRef(0);
  const spin = useRef(0);
  const appear = useRef(0);
  const modeVis = useRef(0);
  const colScratch = useMemo(() => new Color(), []);

  const built = useMemo(() => {
    const gridGeo = buildGridSphere(SPHERE_R);
    const lineMat = new LineBasicMaterial({ color: new Color("#cbccca"), transparent: true, opacity: 0 });

    const strandPoint = (t: number, phase: number) => {
      const a = t * TURNS * Math.PI * 2 + phase;
      return new Vector3(Math.cos(a) * R, (t - 0.5) * H, Math.sin(a) * R);
    };
    const strand = (phase: number) => {
      const pts: Vector3[] = [];
      for (let i = 0; i <= SEG; i++) pts.push(strandPoint(i / SEG, phase));
      return new TubeGeometry(new CatmullRomCurve3(pts), SEG, TUBE_R, 8, false);
    };
    const geoA = strand(0);
    const geoB = strand(Math.PI);
    const rungGeo = new CylinderGeometry(RUNG_R, RUNG_R, 1, 8);
    const up = new Vector3(0, 1, 0);
    const rungs: { pos: [number, number, number]; quat: [number, number, number, number]; len: number }[] = [];
    for (let j = 0; j < RUNGS; j++) {
      const t = (j + 0.5) / RUNGS;
      const A = strandPoint(t, 0);
      const B = strandPoint(t, Math.PI);
      const mid = A.clone().add(B).multiplyScalar(0.5);
      const dir = B.clone().sub(A);
      const len = dir.length();
      const q = new Quaternion().setFromUnitVectors(up, dir.normalize());
      rungs.push({ pos: [mid.x, mid.y, mid.z], quat: [q.x, q.y, q.z, q.w], len });
    }
    const helixMat = new MeshStandardMaterial({
      color: new Color("#cbccca"),
      metalness: 1,
      roughness: 0.25,
      envMapIntensity: 1.0,
      wireframe: true,
      transparent: true,
      opacity: 0,
    });
    return { gridGeo, lineMat, geoA, geoB, rungGeo, rungs, helixMat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const tw = blobTweak.get();
    appear.current += (1 - appear.current) * (1 - Math.pow(0.04, delta));
    const modeTarget = tw.mode === "wire" ? 1 : 0;
    modeVis.current += (modeTarget - modeVis.current) * (1 - Math.pow(0.06, delta));
    const fade = appear.current * modeVis.current;
    g.visible = fade > 0.004;
    if (fade <= 0.004) return;

    const target = reduced ? 0 : Math.max(0, Math.min(1, about?.current ?? 0));
    pres.current += (target - pres.current) * (reduced ? 1 : 1 - Math.pow(0.05, delta));
    const v = pres.current;

    // sphere at hero, helix at About — gate visibility so neither bleeds through
    built.lineMat.opacity = fade * (1 - v);
    built.helixMat.opacity = fade * v;
    if (sphereRef.current) sphereRef.current.visible = (1 - v) * fade > 0.004;
    if (helixRef.current) helixRef.current.visible = v * fade > 0.004;

    colScratch.set(tw.color);
    built.lineMat.color.setRGB(colScratch.r, colScratch.g, colScratch.b);
    built.helixMat.color.setRGB(colScratch.r, colScratch.g, colScratch.b);

    g.position.setX(DOCK_X * v);
    spin.current += delta * (0.5 + tw.speed) * 0.5;
    g.rotation.set(0, spin.current + (scroll?.current ?? 0) * Math.PI * 3.0, 0);
  });

  return (
    <group ref={group} visible={false}>
      <lineSegments ref={sphereRef} geometry={built.gridGeo} material={built.lineMat} />
      <group ref={helixRef} visible={false}>
        <mesh geometry={built.geoA} material={built.helixMat} />
        <mesh geometry={built.geoB} material={built.helixMat} />
        {built.rungs.map((r, i) => (
          <mesh
            key={i}
            geometry={built.rungGeo}
            material={built.helixMat}
            position={r.pos}
            quaternion={r.quat}
            scale={[1, r.len, 1]}
          />
        ))}
      </group>
    </group>
  );
}
