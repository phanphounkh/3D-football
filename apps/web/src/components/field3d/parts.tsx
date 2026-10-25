"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FieldSpec } from "./specs";
import { buildPitchTexture } from "./pitch-texture";
import { meshAlpha, turfBump } from "./textures";
import { Instanced, type Placement } from "./instanced";

const whiteMat = new THREE.MeshStandardMaterial({ color: "#f5f5f5", roughness: 0.4, metalness: 0.3 });
const steel = new THREE.MeshStandardMaterial({ color: "#6b7580", roughness: 0.5, metalness: 0.7 });

/** Apply a UV scale so a tiled alpha texture repeats at a constant density (cells per metre). */
function tiled(g: THREE.BufferGeometry, w: number, h: number, density: number) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * density, uv.getY(i) * h * density);
  return g;
}

export function Pitch({ spec }: { spec: FieldSpec }) {
  const tex = useMemo(() => buildPitchTexture(spec), [spec]);
  useEffect(() => () => tex.dispose(), [tex]);
  const w = spec.length + spec.margin * 2, d = spec.width + spec.margin * 2;
  const bump = useMemo(() => {
    const t = turfBump().clone();
    t.repeat.set(w / 2, d / 2);
    t.needsUpdate = true;
    return t;
  }, [w, d]);
  useEffect(() => () => bump.dispose(), [bump]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={tex} bumpMap={bump} bumpScale={0.6} roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.05} receiveShadow>
        <planeGeometry args={[w * 6, d * 6]} />
        <meshStandardMaterial color="#1c3a22" roughness={1} />
      </mesh>
    </group>
  );
}

/** Both goals: one merged frame mesh + one merged net mesh each (2 draw calls per goal, not 12). */
export function Goals({ spec }: { spec: FieldSpec }) {
  const { frame, net } = useMemo(() => {
    const { goalWidth: gw, goalHeight: gh, goalDepth: gd } = spec;
    const r = 0.06;
    const post = (z: number) => new THREE.CylinderGeometry(r, r, gh, 10).translate(0, gh / 2, z);
    const bar = new THREE.CylinderGeometry(r, r, gw + r * 2, 10).rotateX(Math.PI / 2).translate(0, gh, 0);
    const frame = mergeGeometries([post(-gw / 2), post(gw / 2), bar])!;
    const back = tiled(new THREE.PlaneGeometry(gw, gh).rotateY(Math.PI / 2).translate(-gd, gh / 2, 0), gw, gh, 4);
    const top = tiled(new THREE.PlaneGeometry(gd, gw).rotateX(Math.PI / 2).translate(-gd / 2, gh, 0), gd, gw, 4);
    const side = (z: number) => tiled(new THREE.PlaneGeometry(gd, gh).translate(-gd / 2, gh / 2, z), gd, gh, 4);
    return { frame, net: mergeGeometries([back, top, side(-gw / 2), side(gw / 2)])! };
  }, [spec]);
  const netMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff", alphaMap: meshAlpha("net"), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }), []);
  useEffect(() => () => { frame.dispose(); net.dispose(); netMat.dispose(); }, [frame, net, netMat]);
  return (
    <>
      {([-1, 1] as const).map((side) => (
        <group key={side} position-x={(side * spec.length) / 2} rotation-y={side < 0 ? 0 : Math.PI}>
          {/* local -x points away from the pitch, so the net sits behind the goal line */}
          <mesh geometry={frame} material={whiteMat} castShadow />
          <mesh geometry={net} material={netMat} />
        </group>
      ))}
    </>
  );
}

export function CornerFlags({ spec }: { spec: FieldSpec }) {
  const pole = useMemo(() => new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8).translate(0, 0.75, 0), []);
  const flag = useMemo(() => new THREE.PlaneGeometry(0.4, 0.28).translate(0.2, 1.38, 0), []);
  const flagMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffd23f", side: THREE.DoubleSide }), []);
  const places = useMemo<Placement[]>(() => [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([x, z]) => ({ position: [(x * spec.length) / 2, 0, (z * spec.width) / 2] })), [spec]);
  return (
    <>
      <Instanced geometry={pole} material={whiteMat} placements={places} />
      <Instanced geometry={flag} material={flagMat} placements={places} />
    </>
  );
}

export function Floodlights({ spec, on }: { spec: FieldSpec; on: boolean }) {
  const x = spec.length / 2 - spec.length * 0.08;
  const z = spec.width / 2 + spec.margin + 1;
  const h = spec.floodlightHeight;
  const corners = useMemo(() => [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const, []);
  const pole = useMemo(() => new THREE.CylinderGeometry(0.15, 0.25, h, 8).translate(0, h / 2, 0), [h]);
  const head = useMemo(() => new THREE.BoxGeometry(2.4, 1.2, 0.2).translate(0, h, 0), [h]);
  const headMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#222" }), []);
  useEffect(() => {
    headMat.emissive.set(on ? "#fff4c2" : "#000");
    headMat.emissiveIntensity = on ? 3 : 0;
  }, [on, headMat]);
  const poles = useMemo<Placement[]>(() => corners.map(([sx, sz]) => ({ position: [sx * x, 0, sz * z] })), [corners, x, z]);
  return (
    <>
      <Instanced geometry={pole} material={steel} placements={poles} castShadow />
      <Instanced geometry={head} material={headMat} placements={poles} />
      {on && corners.map(([sx, sz]) => (
        <spotLight key={`${sx}${sz}`} position={[sx * x, h, sz * z]} angle={0.9} penumbra={0.6} intensity={h * 900} distance={h * 8} decay={2} color="#fff4d6" />
      ))}
    </>
  );
}

/** Chain-link perimeter: instanced posts + one merged top rail + one merged alpha-mapped mesh panel. */
export function Fence({ spec }: { spec: FieldSpec }) {
  const x = spec.length / 2 + spec.margin - 0.5;
  const z = spec.width / 2 + spec.margin - 0.5;
  const h = 3;
  const { panels, rail, posts } = useMemo(() => {
    const wall = (len: number, px: number, pz: number, ry: number) =>
      tiled(new THREE.PlaneGeometry(len, h).rotateY(ry).translate(px, h / 2, pz), len, h, 1.2);
    const panels = mergeGeometries([wall(x * 2, 0, z, 0), wall(x * 2, 0, -z, 0), wall(z * 2, x, 0, Math.PI / 2), wall(z * 2, -x, 0, Math.PI / 2)])!;
    const bar = (len: number, px: number, pz: number, ry: number) => new THREE.BoxGeometry(len, 0.06, 0.06).rotateY(ry).translate(px, h, pz);
    const rail = mergeGeometries([bar(x * 2, 0, z, 0), bar(x * 2, 0, -z, 0), bar(z * 2, x, 0, Math.PI / 2), bar(z * 2, -x, 0, Math.PI / 2)])!;
    const posts: Placement[] = [];
    const step = 3;
    for (let px = -x; px <= x + 0.01; px += step) posts.push({ position: [px, h / 2, z] }, { position: [px, h / 2, -z] });
    for (let pz = -z + step; pz < z - 0.01; pz += step) posts.push({ position: [x, h / 2, pz] }, { position: [-x, h / 2, pz] });
    return { panels, rail, posts };
  }, [x, z]);
  const postGeo = useMemo(() => new THREE.BoxGeometry(0.1, h, 0.1), []);
  const panelMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#a9bdb2", alphaMap: meshAlpha("fence"), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), []);
  useEffect(() => () => { panels.dispose(); rail.dispose(); postGeo.dispose(); panelMat.dispose(); }, [panels, rail, postGeo, panelMat]);
  return (
    <group>
      <mesh geometry={panels} material={panelMat} />
      <mesh geometry={rail} material={steel} />
      <Instanced geometry={postGeo} material={steel} placements={posts} />
    </group>
  );
}

export function Benches({ spec }: { spec: FieldSpec }) {
  const z = spec.width / 2 + spec.margin * 0.6;
  const { seat, roof, legs } = useMemo(() => {
    const seat = new THREE.BoxGeometry(4, 0.1, 0.5).translate(0, 0.25, 0);
    const roof = new THREE.BoxGeometry(4.2, 0.05, 1).translate(0, 1.1, 0.3);
    const leg = (px: number) => new THREE.BoxGeometry(0.06, 1.1, 0.06).translate(px, 0.55, 0.3);
    return { seat, roof, legs: mergeGeometries([leg(-1.9), leg(1.9)])! };
  }, []);
  const mats = useMemo(() => ({
    seat: new THREE.MeshStandardMaterial({ color: "#d8dde0" }),
    roof: new THREE.MeshStandardMaterial({ color: "#1d2b33", transparent: true, opacity: 0.7 }),
    legs: new THREE.MeshStandardMaterial({ color: "#333" }),
  }), []);
  const places = useMemo<Placement[]>(() => [-1, 1].map((sx) => ({ position: [sx * spec.length * 0.12, 0, z] })), [spec, z]);
  return (
    <>
      <Instanced geometry={seat} material={mats.seat} placements={places} castShadow receiveShadow />
      <Instanced geometry={roof} material={mats.roof} placements={places} castShadow />
      <Instanced geometry={legs} material={mats.legs} placements={places} />
    </>
  );
}

export function Seating({ spec }: { spec: FieldSpec }) {
  const z0 = -(spec.width / 2 + spec.margin + 2);
  const geo = useMemo(() => new THREE.BoxGeometry(spec.length * 0.8, 0.5, 0.8), [spec]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8 }), []);
  const places = useMemo<Placement[]>(() => Array.from({ length: 8 }, (_, i) => ({ position: [0, 0.4 + i * 0.5, z0 - i * 0.8], color: i % 2 ? "#0aa866" : "#1c2a24" })), [z0]);
  return <Instanced geometry={geo} material={mat} placements={places} castShadow receiveShadow />;
}

export function Surroundings({ spec, count }: { spec: FieldSpec; count: number }) {
  const places = useMemo<Placement[]>(() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rx = spec.length / 2 + spec.margin + 14, rz = spec.width / 2 + spec.margin + 14;
    return Array.from({ length: count }, () => {
      const a = rnd() * Math.PI * 2, k = 1 + rnd() * 0.8;
      return { position: [Math.cos(a) * rx * k * 1.2, 0, Math.sin(a) * rz * k * 1.5] as [number, number, number], scale: 0.8 + rnd() * 0.8 };
    });
  }, [spec, count]);
  const trunk = useMemo(() => new THREE.CylinderGeometry(0.2, 0.3, 2, 6).translate(0, 1, 0), []);
  const crown = useMemo(() => new THREE.ConeGeometry(1.6, 4.2, 8).translate(0, 3.4, 0), []);
  const mats = useMemo(() => ({ trunk: new THREE.MeshStandardMaterial({ color: "#5b3f2a" }), crown: new THREE.MeshStandardMaterial({ color: "#1f5a31", roughness: 1 }) }), []);
  return (
    <>
      <Instanced geometry={trunk} material={mats.trunk} placements={places} castShadow />
      <Instanced geometry={crown} material={mats.crown} placements={places} castShadow />
    </>
  );
}
