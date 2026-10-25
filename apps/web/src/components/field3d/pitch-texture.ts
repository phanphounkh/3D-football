import * as THREE from "three";
import type { FieldSpec } from "./specs";

/** Draws grass stripes + official markings into a canvas (1 px = 1/ppm metre). */
export function buildPitchTexture(s: FieldSpec): THREE.CanvasTexture {
  const ppm = Math.min(24, 2048 / (s.length + s.margin * 2));
  const W = Math.round((s.length + s.margin * 2) * ppm);
  const H = Math.round((s.width + s.margin * 2) * ppm);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;

  const stripes = Math.max(8, Math.round(s.length / 5));
  const sw = (s.length * ppm) / stripes;
  g.fillStyle = "#2f7d32"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? "#2c7530" : "#348538";
    g.fillRect(s.margin * ppm + i * sw, s.margin * ppm, sw, s.width * ppm);
  }
  // fine grain
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},0.025)`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  const cx = W / 2, cy = H / 2;
  g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineWidth = Math.max(2, 0.12 * ppm);
  const L = s.margin * ppm, T = s.margin * ppm, R = L + s.length * ppm, B = T + s.width * ppm;
  g.strokeRect(L, T, R - L, B - T);
  g.beginPath(); g.moveTo(cx, T); g.lineTo(cx, B); g.stroke();
  g.beginPath(); g.arc(cx, cy, s.circleRadius * ppm, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx, cy, 0.25 * ppm, 0, Math.PI * 2); g.fill();

  for (const side of [-1, 1] as const) {
    const gx = side < 0 ? L : R;
    const box = (d: number, w: number) => g.strokeRect(side < 0 ? gx : gx - d * ppm, cy - (w * ppm) / 2, d * ppm, w * ppm);
    box(s.penaltyDepth, s.penaltyWidth);
    box(s.goalAreaDepth, s.goalAreaWidth);
    const spot = side < 0 ? gx + s.penaltySpot * ppm : gx - s.penaltySpot * ppm;
    g.beginPath(); g.arc(spot, cy, 0.25 * ppm, 0, Math.PI * 2); g.fill();
    // penalty arc outside the box
    const dx = s.penaltyDepth - s.penaltySpot;
    const a = Math.acos(Math.min(1, dx / s.circleRadius));
    g.beginPath();
    if (side < 0) g.arc(spot, cy, s.circleRadius * ppm, -a, a); else g.arc(spot, cy, s.circleRadius * ppm, Math.PI - a, Math.PI + a);
    g.stroke();
  }
  // corner arcs
  const cr = Math.min(1, s.length / 55) * ppm;
  ([[L, T, 0], [R, T, Math.PI / 2], [R, B, Math.PI], [L, B, -Math.PI / 2]] as const).forEach(([x, y, a]) => {
    g.beginPath(); g.arc(x, y, cr, a, a + Math.PI / 2); g.stroke();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
