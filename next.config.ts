import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // CSS Modules are enabled by default in Next.js — no extra config needed
  // Transpile ESM packages from the 3d-force-graph / Three.js ecosystem
  transpilePackages: [
    "react-force-graph-3d",
    "3d-force-graph",
    "three-forcegraph",
    "three-render-objects",
    "three-spritetext",
    "d3-force-3d",
  ],
}

export default nextConfig
