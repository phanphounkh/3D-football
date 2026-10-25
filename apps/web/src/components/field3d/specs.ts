export type FieldType = "5v5" | "7v7" | "11v11";

/** All dimensions in metres. x = pitch length, z = pitch width. */
export interface FieldSpec {
  length: number;
  width: number;
  goalWidth: number;
  goalHeight: number;
  goalDepth: number;
  penaltyDepth: number;
  penaltyWidth: number;
  goalAreaDepth: number;
  goalAreaWidth: number;
  circleRadius: number;
  penaltySpot: number;
  margin: number; // run-off around the touchlines
  floodlightHeight: number;
  seating: boolean;
}

export const FIELD_SPECS: Record<FieldType, FieldSpec> = {
  "5v5": { length: 40, width: 20, goalWidth: 3, goalHeight: 2, goalDepth: 1, penaltyDepth: 6, penaltyWidth: 14, goalAreaDepth: 2.5, goalAreaWidth: 8, circleRadius: 3, penaltySpot: 6, margin: 3, floodlightHeight: 9, seating: false },
  "7v7": { length: 55, width: 35, goalWidth: 5, goalHeight: 2.1, goalDepth: 1.2, penaltyDepth: 9, penaltyWidth: 22, goalAreaDepth: 4, goalAreaWidth: 12, circleRadius: 6, penaltySpot: 8, margin: 4, floodlightHeight: 12, seating: false },
  "11v11": { length: 105, width: 68, goalWidth: 7.32, goalHeight: 2.44, goalDepth: 2, penaltyDepth: 16.5, penaltyWidth: 40.32, goalAreaDepth: 5.5, goalAreaWidth: 18.32, circleRadius: 9.15, penaltySpot: 11, margin: 6, floodlightHeight: 22, seating: true },
};

export const VIEWS = ["orbit", "top", "side", "goalkeeper"] as const;
export type ViewName = (typeof VIEWS)[number];

export function cameraPreset(view: ViewName, s: FieldSpec): { position: [number, number, number]; target: [number, number, number] } {
  const d = Math.max(s.length, s.width * 1.6);
  switch (view) {
    case "top": return { position: [0, d * 1.05, 0.01], target: [0, 0, 0] };
    case "side": return { position: [0, s.length * 0.22, s.width * 1.1 + s.margin + 8], target: [0, 0, 0] };
    case "goalkeeper": return { position: [-s.length / 2 + 1.2, 1.7, 0], target: [s.length * 0.15, 1.2, 0] };
    default: return { position: [d * 0.55, d * 0.4, d * 0.7], target: [0, 0, 0] };
  }
}

export const HOTSPOTS = (s: FieldSpec) => [
  { id: "surface", pos: [0, 0.3, s.width * 0.25] as [number, number, number], title: "Playing surface", body: "FIFA-quality artificial turf, 50 mm pile." },
  { id: "lights", pos: [s.length / 2, s.floodlightHeight, s.width / 2 + s.margin] as [number, number, number], title: "LED floodlights", body: "500 lux evening lighting." },
  { id: "bench", pos: [0, 1.2, s.width / 2 + s.margin * 0.6] as [number, number, number], title: "Team benches", body: "Covered benches for 8 players each." },
];
