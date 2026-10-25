"use client";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Sky, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { FIELD_SPECS, HOTSPOTS, cameraPreset, type FieldType, type ViewName } from "./specs";
import { Pitch, Goals, CornerFlags, Floodlights, Fence, Benches, Seating, Surroundings } from "./parts";
import type { Quality } from "@/lib/quality";

export interface SceneProps {
  type: FieldType;
  view: ViewName;
  viewNonce: number;
  night: boolean;
  lights: boolean;
  hotspots: boolean;
  onHotspot?: (id: string | null) => void;
  activeHotspot?: string | null;
  quality: Quality;
}

export function FieldScene({ type, view, viewNonce, night, lights, hotspots, onHotspot, activeHotspot, quality }: SceneProps) {
  const spec = FIELD_SPECS[type];
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const p = cameraPreset(view, spec);
    goal.current = { pos: new THREE.Vector3(...p.position), target: new THREE.Vector3(...p.target) };
  }, [view, viewNonce, spec]);

  useFrame((_, dt) => {
    const g = goal.current, c = controls.current;
    if (!g || !c) return;
    const k = 1 - Math.pow(0.001, dt);
    camera.position.lerp(g.pos, k);
    c.target.lerp(g.target, k);
    c.update();
    if (camera.position.distanceTo(g.pos) < 0.05) goal.current = null;
  });

  const lit = night && lights;
  const maxDist = Math.max(spec.length, spec.width) * 2.2;
  return (
    <>
      <color attach="background" args={[night ? "#050a14" : "#9ccbe8"]} />
      <fog attach="fog" args={[night ? "#050a14" : "#b9d8ea", maxDist * 0.8, maxDist * 3]} />
      {night ? <Stars radius={300} depth={60} count={quality.stars} factor={5} fade /> : <Sky sunPosition={[80, 60, 40]} turbidity={6} />}
      <ambientLight intensity={night ? 0.12 : 0.55} color={night ? "#6f86c9" : "#ffffff"} />
      <directionalLight
        castShadow
        position={[spec.length * 0.6, spec.length * 0.7, spec.width * 0.4]}
        intensity={night ? 0.08 : 2.2}
        color={night ? "#8fa8ff" : "#fff3dd"}
        shadow-mapSize={[quality.shadowMap, quality.shadowMap]}
        shadow-camera-left={-spec.length * 0.7}
        shadow-camera-right={spec.length * 0.7}
        shadow-camera-top={spec.width}
        shadow-camera-bottom={-spec.width}
        shadow-camera-far={spec.length * 3}
        shadow-bias={-0.0004}
      />
      <Pitch spec={spec} />
      <Goals spec={spec} />
      <CornerFlags spec={spec} />
      <Floodlights spec={spec} on={lit} />
      <Fence spec={spec} />
      <Benches spec={spec} />
      {spec.seating && <Seating spec={spec} />}
      <Surroundings spec={spec} count={quality.trees} />

      {hotspots && HOTSPOTS(spec).map((h) => (
        <Html key={h.id} position={h.pos} center zIndexRange={[10, 0]}>
          <button
            aria-label={h.title}
            onClick={() => onHotspot?.(activeHotspot === h.id ? null : h.id)}
            className="grid h-6 w-6 place-items-center rounded-full bg-pitch-500 text-xs font-bold text-ink-950 shadow-[0_0_0_4px_rgba(16,208,129,.3)]"
          >i</button>
        </Html>
      ))}

      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI / 2 - 0.03}
        minDistance={2}
        maxDistance={maxDist}
        screenSpacePanning={false}
        onStart={() => (goal.current = null)}
      />
    </>
  );
}
