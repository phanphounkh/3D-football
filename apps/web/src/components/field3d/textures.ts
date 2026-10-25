import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, size: number, draw: (g: CanvasRenderingContext2D, n: number) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Diamond mesh with transparent holes — used as alphaMap for chain-link fences and goal nets. */
export const meshAlpha = (kind: "net" | "fence") =>
  make(kind, 64, (g, n) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, n, n);
    g.strokeStyle = "#fff"; g.lineWidth = kind === "net" ? 3 : 4;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(n, n); g.moveTo(n, 0); g.lineTo(0, n);
    g.stroke();
  });

/** Greyscale noise for subtle turf relief. */
export const turfBump = () =>
  make("turf-bump", 256, (g, n) => {
    const img = g.createImageData(n, n);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.random() * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
