import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets CI or a local check run `next build` without touching a running dev server's .next folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
