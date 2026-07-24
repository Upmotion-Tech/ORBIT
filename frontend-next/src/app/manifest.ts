import type { MetadataRoute } from "next";

// Next.js auto-serves this at /manifest.webmanifest and injects the
// <link rel="manifest"> tag — no manual wiring needed in layout.tsx. This is
// what Chrome's "Install app" / "Add to Home Screen" reads for the app name
// and icon; without it, Chrome had nothing but the stale default Next.js
// favicon.ico to fall back to (and stretch to icon size, hence the blur).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ORBIT",
    short_name: "ORBIT",
    description: "Operational Revenue & Business Intelligence Tool",
    start_url: "/",
    display: "standalone",
    background_color: "#F0F2F7",
    theme_color: "#4F46E5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
