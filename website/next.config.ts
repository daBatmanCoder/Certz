import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // @certz/sdk is a sibling package (brain/sdk) linked via file:. Point the
  // Turbopack root at the repo root so it can bundle that symlinked package,
  // and transpile it (it ships ESM that Next should process).
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  transpilePackages: ["@certz/sdk"],
  // Expose the site's own Certz cert at the conventional path. Route handlers
  // can't live under a dot-directory, so we rewrite to a normal API route.
  async rewrites() {
    return [
      { source: "/.well-known/certz/:file", destination: "/api/well-known/:file" },
    ];
  },
};

export default nextConfig;
