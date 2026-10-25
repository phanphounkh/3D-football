export type Tier = "high" | "low";

export interface Quality {
  tier: Tier;
  dpr: [number, number];
  shadowMap: number;
  trees: number;
  stars: number;
  antialias: boolean;
}

/** Cheap device heuristic: touch-first, small screen or few cores => low tier. */
export function detectQuality(): Quality {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = Math.min(screen.width, screen.height) < 700;
  const cores = navigator.hardwareConcurrency ?? 4;
  const low = coarse || small || cores <= 4;
  return low
    ? { tier: "low", dpr: [1, 1.25], shadowMap: 1024, trees: 14, stars: 800, antialias: false }
    : { tier: "high", dpr: [1, 1.75], shadowMap: 2048, trees: 40, stars: 2500, antialias: true };
}
