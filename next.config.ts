import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root (a parent lockfile exists in the home dir).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
