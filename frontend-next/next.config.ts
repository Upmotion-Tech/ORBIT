import path from "path";
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
  // Pin the workspace root to THIS directory. Next.js/Turbopack infers the
  // root by walking up for a lockfile, and there's a stray leftover
  // package.json + package-lock.json sitting in the Windows home directory
  // (C:\Users\<user>\) — so it was picking the home directory as the root
  // and treating all of it, OneDrive included, as the project. That's what
  // produced the "inferred your workspace root, but it may not be correct /
  // Detected additional lockfiles" warning on every build and dev start,
  // with source paths logged as "[project]/OneDrive/Desktop/Orbit/...".
  // Beyond the noise it means filesystem watching and module resolution
  // span an enormous, actively cloud-syncing tree, which makes compiles
  // slower and file-watching flaky. Both keys below are the documented fix
  // (see node_modules/next/dist/docs — turbopack.md and output.md):
  // `turbopack.root` for dev/build resolution, `outputFileTracingRoot` for
  // the production output trace.
  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: __dirname,
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
