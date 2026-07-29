"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
} from "three";
import { blobTweak } from "@/lib/blobTweak";
import { formState } from "@/lib/formClock";
import { plateView } from "@/lib/plateView";
import { FRAME_T, FRAME_W, LINER_W, PLATE_H, PLATE_T } from "@/lib/formPhoto";

/**
 * The work's MOULDING, as a mesh — the skull's technique applied to the frame.
 *
 * The frame used to be part of the raymarched field (a profiled ring with a carved
 * displacement), and it was the field's most expensive tenant: ornament resolved by
 * marching costs per pixel per step, and the entrance morph paid it across the whole
 * screen. A mesh pays for its detail ONCE, in vertices and a normal map, and the GPU
 * rasterises it for free — so the moulding is now four chrome bars and four corner
 * blocks, carved by the same drawn trim (frame-trim.png, as a normal map), lit by the
 * same studio environment the liquid reflects.
 *
 * Like the skull, it cannot melt with the liquid — so it does not try: it GROWS in on
 * the last stretch of the roll-out (the same 0.55→1 window the field used to raise its
 * ring in), scaling from just inside the sheet's rim to its seat, and leaves the same
 * way backwards. The canvas — the photograph, the metamorphosis, the breathing —
 * stays raymarched: the mesh only ever carries what never deforms.
 *
 * It follows the clock the way every representation does: same dock, same spin (the
 * page turn's revolution included), same scale, and the sheet's eased aspect
 * (plateView.asp), so it resizes in flight with the canvas it frames.
 */

/** The hover's step forward — mirrors PLATE_GROW in LiquidDna. */
const GROW = 0.1;

/** Half-depth of the moulding band per side, local units (the SDF's FRAME_W). */
const W2 = FRAME_W * 2;

/** Build a normal map from the drawn trim's height — Sobel over the red channel. */
function trimNormalMap(img: HTMLImageElement): CanvasTexture {
  const w = img.width;
  const h = img.height;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, w, h).data;
  const out = ctx.createImageData(w, h);
  const at = (x: number, y: number) =>
    src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  // The strength is the carve depth the SDF used (0.14 local over a ~0.5-unit cell),
  // scaled up a touch because a normal map has no silhouette to help it.
  const K = 2.4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const inv = 1 / Math.hypot(dx * K, dy * K, 1);
      const i = (y * w + x) * 4;
      out.data[i] = (-dx * K * inv * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy * K * inv * 0.5 + 0.5) * 255;
      out.data[i + 2] = inv * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const tex = new CanvasTexture(cv);
  tex.wrapS = RepeatWrapping;
  return tex;
}

export function ChromeFrame() {
  const group = useRef<Group>(null);
  const bars = useRef<Mesh[]>([]);
  const corners = useRef<Mesh[]>([]);

  const { barGeo, cornerGeo, mats, cornerMat } = useMemo(() => {
    // One unit bar along X, scaled per frame to each run's length; the moulding's
    // cross-section is the SDF profile's bounding box — the sculpting is the map's job.
    const barGeo = new BoxGeometry(1, W2, FRAME_T * 2);
    const cornerGeo = new BoxGeometry(W2 * 1.35, W2 * 1.35, FRAME_T * 2.3);
    const chrome = () =>
      new MeshStandardMaterial({
        color: "#cbccca",
        metalness: 1,
        roughness: 0.16,
        envMapIntensity: 1.1,
        transparent: true,
        opacity: 0,
      });
    // One material per bar: each run repeats the trim by its own length, so the
    // ornament keeps its size instead of stretching with the bar.
    const mats = [chrome(), chrome(), chrome(), chrome()];
    const cornerMat = chrome();
    return { barGeo, cornerGeo, mats, cornerMat };
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const base = trimNormalMap(img);
      mats.forEach((m) => {
        m.normalMap = base.clone();
        m.normalMap.needsUpdate = true;
        m.needsUpdate = true;
      });
      cornerMat.normalMap = base;
      cornerMat.needsUpdate = true;
    };
    img.src = "/textures/frame-trim.png";
    return () => {
      mats.forEach((m) => m.normalMap?.dispose());
      cornerMat.normalMap?.dispose();
    };
  }, [mats, cornerMat]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const s = formState();
    const tw = blobTweak.get();

    // The same window the field used to raise its ring in: the moulding grows out of
    // the sheet's rim on the roll-out's last stretch, and withdraws backwards.
    const grown =
      s.mood.flat <= 0.55 ? 0 : Math.min(1, (s.mood.flat - 0.55) / 0.45);
    const ease = grown * grown * (3 - 2 * grown);
    const on = tw.mode === "blob" && ease > 0.004;
    g.visible = on;
    if (!on) return;

    // The sheet's half-extents, in local units — the same numbers the field draws with.
    const k = plateView.k;
    const hw = PLATE_H * plateView.asp * k;
    const hh = PLATE_H * k;
    const inW = hw + LINER_W + FRAME_W; // the moulding's centreline, per axis
    const inH = hh + LINER_W + FRAME_W;

    // Four runs — full lengths so they meet under the corner blocks.
    const lenX = 2 * (hw + LINER_W + W2);
    const lenY = 2 * (hh + LINER_W + W2);
    const set = (m: Mesh, x: number, y: number, rz: number, len: number, mi: number) => {
      m.position.set(x, y, 0);
      m.rotation.z = rz;
      m.scale.x = len;
      const mat = mats[mi];
      mat.opacity = ease;
      if (mat.normalMap) {
        const rep = Math.max(1, Math.round(len / 1.25));
        if (mat.normalMap.repeat.x !== rep) mat.normalMap.repeat.set(rep, 1);
      }
    };
    set(bars.current[0], 0, inH, 0, lenX, 0);
    set(bars.current[1], 0, -inH, Math.PI, lenX, 1);
    set(bars.current[2], inW, 0, -Math.PI / 2, lenY, 2);
    set(bars.current[3], -inW, 0, Math.PI / 2, lenY, 3);
    corners.current.forEach((c, i) => {
      c.position.set(i % 2 ? -inW : inW, i < 2 ? inH : -inH, 0);
    });
    cornerMat.opacity = ease;

    // The clock, exactly as the field reads it: dock, the whole turntable angle (page
    // turn included), the choreography's scale with the hover's step forward — and the
    // moulding scales from just inside the rim to its seat as it grows.
    const grow = 1 + GROW * s.mood.hover;
    const seat = 0.86 + 0.14 * ease;
    g.position.set(s.dockX, s.dockY, 0);
    g.rotation.y = s.spin;
    g.scale.setScalar(s.scale * grow * seat);
  });

  return (
    <group ref={group} visible={false}>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={`bar${i}`}
          ref={(m) => {
            if (m) bars.current[i] = m;
          }}
          geometry={barGeo}
          material={mats[i]}
        />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={`corner${i}`}
          ref={(m) => {
            if (m) corners.current[i] = m;
          }}
          geometry={cornerGeo}
          material={cornerMat}
        />
      ))}
    </group>
  );
}
