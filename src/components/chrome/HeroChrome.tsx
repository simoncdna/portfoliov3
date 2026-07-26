"use client";

import { ChromeMount } from "./ChromeMount";

/**
 * Hero chrome form. The shape/material/layout values below are the tuned
 * defaults that were previously exposed through a dev-only Leva panel; the panel
 * is gone and these are now the single source of truth.
 */
// The canvas box the form is drawn into. Defined in globals.css as --form-dim
// rather than here, because the DOM has to be able to frame the form: Work's notch
// frame is a fraction of this box (see .plate-frame), and the form's on-screen size
// is a function of this height, not of the viewport's.
const DIM = "var(--form-dim)";

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
				// full-width canvas (height keeps the blob's size) so the helix can
				// slide left without being clipped by the canvas's DOM box
				style={{ width: "100%", height: DIM }}
				glow={0}
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
				pointerStrength={0.45}
				slosh={0.4}
				clickHoles={0.7}
			/>
		</div>
	);
}
