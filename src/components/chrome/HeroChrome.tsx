"use client";

import { ChromeMount } from "./ChromeMount";

/**
 * Hero chrome form. The shape/material/layout values below are the tuned
 * defaults that were previously exposed through a dev-only Leva panel; the panel
 * is gone and these are now the single source of truth.
 */
const SIZE = 108; // vmin-ish footprint
const DIM = `min(${SIZE}vw, ${SIZE * 0.96}vh, ${SIZE * 11}px)`;

const LIGHTS = {
	ambient: 0.35,
	streaks: 1.6,
	key: { intensity: 160, color: "#ffffff", position: [5, 6, 5] as [number, number, number] },
	fill: { intensity: 60, color: "#8fb4ff", position: [-6, -2, 4] as [number, number, number] },
	rim: { intensity: 40, color: "#ffffff", position: [4, -5, 3] as [number, number, number] },
};

export function HeroChrome() {
	return (
		<div
			className="pointer-events-none absolute inset-0 flex items-center justify-center"
			style={{ zIndex: 10 }}
		>
			<ChromeMount
				style={{ width: DIM, height: DIM }}
				glow={0.3}
				envMode="studio"
				hdriPreset="studio"
				envRotationY={2.4}
				geometry="torusKnot"
				glbUrl="/models/chrome-blob.glb"
				color="#cbccca"
				roughness={0.12}
				envMapIntensity={1.1}
				lights={LIGHTS}
				distort={0.42}
				freq={0.5}
				speed={0.5}
				scale={2.0}
				pointerStrength={0.24}
				slosh={0.4}
				clickHoles={0.7}
			/>
		</div>
	);
}
