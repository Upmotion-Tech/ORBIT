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

// DO NOT add `turbopack.root` or `outputFileTracingRoot` here. Both were
// tried (pinned to __dirname) purely to silence a local-only Windows
// warning — "inferred your workspace root… Detected additional lockfiles" —
// caused by a stray leftover package.json/package-lock.json sitting in the
// developer's home directory. They work locally but FAIL the build on
// Vercel, whose cloud containers have a different directory layout: the
// hardcoded absolute path breaks Vercel's output tracer and config
// validation. That mistake took production down once already. Fix that
// warning at its source instead (delete the stray home-directory lockfile);
// it's cosmetic and must never be traded for a deployment risk.
const nextConfig: NextConfig = {
  // Version-skew protection. Without an identifier here, a tab that was
  // loaded before a deploy keeps running the OLD build's JS, and its
  // client-side router then asks for RSC payloads from a deployment that
  // no longer exists. That request fails, Next.js abandons the navigation,
  // and — since a client-side navigation only updates the URL once the
  // new route commits — the address bar never changes either. The visible
  // result is that every in-app nav (sidebar links, the Finance/HR/Dev tab
  // pills) silently stops working a couple of minutes after a deploy, with
  // no error and no crash, until a full page load picks up the new build.
  // With an id set, Next.js sends it as `x-deployment-id`, notices the
  // mismatch against the server's, and does a hard navigation instead of
  // failing silently. Undefined locally (dev never has this env var), which
  // simply leaves the feature off — it only matters for real deployments.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA,
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
