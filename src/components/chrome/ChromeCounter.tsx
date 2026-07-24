"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Text3D, Center, Environment } from "@react-three/drei";

function Digits({ value }: { value: number }) {
  const txt = String(value).padStart(2, "0");
  return (
    // fixed, faced head-on (no X tilt) so the light stays stable
    <group rotation={[0, -0.1, 0]}>
      {/* key forces re-center when the digit count changes */}
      <Center key={txt}>
        <Text3D
          font="/fonts/helvetiker_bold.typeface.json"
          size={1.9}
          height={0.7}
          bevelEnabled
          bevelThickness={0.18}
          bevelSize={0.12}
          bevelSegments={10}
          curveSegments={14}
          letterSpacing={-0.22}
        >
          {`${txt}%`}
          {/* same chrome recipe as the hero blob; fat rounded bevels + fused
              spacing give the curvature that makes it read as liquid chrome */}
          <meshStandardMaterial
            metalness={1}
            roughness={0.32}
            color="#cbccca"
            envMapIntensity={1.8}
          />
        </Text3D>
      </Center>
    </group>
  );
}

/** The loader counter rendered as real reflective chrome (like the hero blob). */
export function ChromeCounter({ value }: { value: number }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 32 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.35} />
        {/* same studio HDRI as the hero blob → identical real chrome */}
        <Environment
          preset="studio"
          environmentIntensity={4.6}
          environmentRotation={[0, 2.4, 0]}
        />
        <Digits value={value} />
      </Suspense>
    </Canvas>
  );
}
