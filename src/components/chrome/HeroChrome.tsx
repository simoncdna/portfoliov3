"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useControls, folder, Leva } from "leva";
import { ChromeMount } from "./ChromeMount";
import type { HdriPreset } from "./ChromeCanvas";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Hero chrome form + a dev-only Leva panel to tweak the shape/material/layout
 * live. In production the panel is hidden and the values are the tuned
 * defaults, so the output is identical to hardcoding them.
 */
export function HeroChrome() {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const c = useControls("Chrome blob", {
		envMode: { value: "studio", options: ["studio", "clean"] },
		hdriPreset: {
			value: "studio",
			options: [
				"studio",
				"city",
				"apartment",
				"lobby",
				"warehouse",
				"dawn",
				"sunset",
				"park",
				"forest",
				"night",
			],
			label: "hdri",
		},
		envRotationY: { value: 2.4, min: 0, max: 6.28, step: 0.05, label: "env rotation" },
		geometry: { value: "torusKnot", options: ["torusKnot", "glb"] },
		modelUrl: { value: "/models/chrome-blob.glb", label: "model (glb/fbx)" },
		Layout: folder({
			zIndex: { value: 10, min: 0, max: 60, step: 1 },
			offsetX: { value: 0, min: -50, max: 50, step: 0.5, label: "offset X (%)" },
			offsetY: { value: 0, min: -50, max: 50, step: 0.5, label: "offset Y (%)" },
			size: { value: 108, min: 40, max: 140, step: 1, label: "size (vmin)" },
		}),
		Material: folder({
			color: "#cbccca",
			roughness: { value: 0.12, min: 0, max: 1, step: 0.01 },
			envMapIntensity: { value: 1.1, min: 0, max: 3, step: 0.05 },
		}),
		Shape: folder({
			distort: { value: 0.42, min: 0, max: 1, step: 0.01 },
			freq: { value: 0.5, min: 0.1, max: 2, step: 0.01 },
			speed: { value: 0.5, min: 0, max: 3, step: 0.05 },
			scale: { value: 2.0, min: 0.5, max: 4, step: 0.05 },
			pointerStrength: { value: 0.24, min: 0, max: 1, step: 0.01 },
			slosh: { value: 0.4, min: 0, max: 1.5, step: 0.05, label: "mouse slosh" },
			clickHoles: { value: 0.7, min: 0, max: 1, step: 0.05, label: "click holes" },
		}),
		Lights: folder({
			ambient: { value: 0.35, min: 0, max: 2, step: 0.05 },
			streaks: { value: 1.6, min: 0, max: 4, step: 0.05, label: "reflection streaks" },
			keyIntensity: { value: 160, min: 0, max: 500, step: 5 },
			keyColor: "#ffffff",
			keyPos: { value: { x: 5, y: 6, z: 5 }, label: "key pos" },
			fillIntensity: { value: 60, min: 0, max: 500, step: 5 },
			fillColor: "#8fb4ff",
			fillPos: { value: { x: -6, y: -2, z: 4 }, label: "fill pos" },
			rimIntensity: { value: 40, min: 0, max: 500, step: 5 },
			rimColor: "#ffffff",
			rimPos: { value: { x: 4, y: -5, z: 3 }, label: "rim pos" },
		}),
	});

	const v3 = (p: { x: number; y: number; z: number }) =>
		[p.x, p.y, p.z] as [number, number, number];
	const lights = {
		ambient: c.ambient,
		streaks: c.streaks,
		key: { intensity: c.keyIntensity, color: c.keyColor, position: v3(c.keyPos) },
		fill: { intensity: c.fillIntensity, color: c.fillColor, position: v3(c.fillPos) },
		rim: { intensity: c.rimIntensity, color: c.rimColor, position: v3(c.rimPos) },
	};

	const dim = `min(${c.size}vw, ${c.size * 0.96}vh, ${c.size * 11}px)`;

	return (
		<>
			{mounted &&
				createPortal(
					<Leva hidden={!isDev} collapsed titleBar={{ title: "Blob (dev)" }} />,
					document.body
				)}
			<div
				className="pointer-events-none absolute inset-0 flex items-center justify-center"
				style={{ zIndex: c.zIndex }}
			>
				<ChromeMount
					style={{
						width: dim,
						height: dim,
						transform: `translate(${c.offsetX}%, ${c.offsetY}%)`,
					}}
					glow={0.3}
					envMode={c.envMode as "clean" | "studio"}
					hdriPreset={c.hdriPreset as HdriPreset}
					envRotationY={c.envRotationY}
					geometry={c.geometry as "torusKnot" | "glb"}
					glbUrl={c.modelUrl}
					color={c.color}
					roughness={c.roughness}
					envMapIntensity={c.envMapIntensity}
					lights={lights}
					distort={c.distort}
					freq={c.freq}
					speed={c.speed}
					scale={c.scale}
					pointerStrength={c.pointerStrength}
					slosh={c.slosh}
					clickHoles={c.clickHoles}
				/>
			</div>
		</>
	);
}
