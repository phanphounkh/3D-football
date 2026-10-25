"use client";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";

export interface Placement { position: [number, number, number]; rotationY?: number; scale?: number | [number, number, number]; color?: string }

/** One draw call for N copies of a geometry. Placements are static after mount. */
export function Instanced({ geometry, material, placements, castShadow = false, receiveShadow = false }: {
  geometry: THREE.BufferGeometry; material: THREE.Material; placements: Placement[]; castShadow?: boolean; receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    placements.forEach((p, i) => {
      o.position.set(...p.position);
      o.rotation.set(0, p.rotationY ?? 0, 0);
      const s = p.scale ?? 1;
      if (typeof s === "number") o.scale.setScalar(s);
      else o.scale.set(...s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (p.color) m.setColorAt(i, col.set(p.color));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [placements]);
  // key forces a fresh InstancedMesh when the count changes (instance buffers are fixed-size)
  return <instancedMesh key={placements.length} ref={ref} args={[geometry, material, placements.length]} castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled={false} />;
}
