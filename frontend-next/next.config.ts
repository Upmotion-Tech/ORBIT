import type { NextConfig } from "next";

// The ported API client (src/lib/orbit-client.js) calls relative `/api/...`
// paths unchanged from the original app, which relied on same-origin serving
// (FastAPI serving the bundle directly) or Vercel's rewrite proxy
// (frontend/vercel.json) to reach the backend. Next.js's dev server has
// no knowledge of the FastAPI backend on its own, so without this rewrite
// every /api/* call 404s against Next.js itself (HTML response, not JSON —
// which is why login failed with the generic "Something went wrong" error
// rather than a real network error). This mirrors frontend/vercel.json's
// rewrite for local dev, and doubles as the production rewrite too (Next.js
// rewrites work the same way on Vercel, replacing the need for a separate
// vercel.json in this app).
const BACKEND_ORIGIN = process.env.ORBIT_BACKEND_ORIGIN || "http://localhost:8000";

const nextConfig: NextConfig = {
  // The round bottom-left "N" badge is Next.js's dev-only route indicator
  // (see devIndicators docs) — harmless in dev, but distracting, and not
  // worth anyone mistaking for a real product affordance.
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
