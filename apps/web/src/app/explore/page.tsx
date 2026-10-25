import { Suspense } from "react";
import { ExploreClient } from "./explore-client";

export const metadata = { title: "Explore football fields — Pitchside" };

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold sm:text-5xl">Explore fields</h1>
      <p className="mt-2 text-mute">Find the right pitch by location, size, surface and price.</p>
      <Suspense fallback={null}><ExploreClient /></Suspense>
    </div>
  );
}
