"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

/** Writes renderer stats into a DOM node (no React re-render per frame). Enabled with ?debug=1. */
export function DebugStats() {
  const gl = useThree((s) => s.gl);
  const el = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    const pre = document.createElement("pre");
    pre.id = "r3f-stats";
    pre.style.cssText = "position:absolute;left:8px;bottom:56px;z-index:5;font:11px monospace;color:#9ff;background:#0008;padding:4px 6px;border-radius:6px;pointer-events:none";
    gl.domElement.parentElement?.parentElement?.appendChild(pre);
    el.current = pre;
    return () => pre.remove();
  }, [gl]);
  useFrame(() => {
    const { calls, triangles } = gl.info.render;
    const { geometries, textures } = gl.info.memory;
    if (el.current) el.current.textContent = `calls ${calls} · tris ${triangles} · geo ${geometries} · tex ${textures}`;
  });
  return null;
}
