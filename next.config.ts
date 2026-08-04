import type { NextConfig } from "next";
import path from "node:path";

/**
 * The heavy static assets — the models, the HDRI, the plate textures, the fonts.
 *
 * Next's own /_next/static output is content-hashed and already served
 * `immutable`; everything under /public is NOT, and its default is
 * `public, max-age=0`. For this page that default is expensive: the form cannot
 * appear without ~4 MB of glb + hdr, so every repeat visit was revalidating the
 * whole of it before a single frame could be drawn.
 *
 * A month, plus stale-while-revalidate so a return visit paints from cache and
 * refreshes behind itself. NOT `immutable`, deliberately: these filenames carry
 * no hash, and the models are still being re-exported — an immutable year on
 * `/models/frame.glb` would pin a stale moulding on every returning visitor with
 * no way to break it short of renaming the file. If they ever settle, put a
 * version in the path (and in layout.tsx's preloads, which must match byte for
 * byte or the browser fetches twice) and raise this to a year.
 */
const ASSET_CACHE = "public, max-age=2592000, stale-while-revalidate=86400";

const nextConfig: NextConfig = {
  // Pin the workspace root (a parent lockfile exists in the home dir).
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      {
        source: "/:dir(models|env|textures|fonts|images)/:path*",
        headers: [{ key: "Cache-Control", value: ASSET_CACHE }],
      },
    ];
  },
};

export default nextConfig;
