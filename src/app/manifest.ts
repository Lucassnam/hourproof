import type { MetadataRoute } from "next";
import { tokens } from "@/lib/theme/tokens";

// Next 16 prefers a generated app/manifest.ts over a static
// public/manifest.webmanifest — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md.
// Light is the default theme (see src/app/layout.tsx's theme-boot script,
// which only ever flips *to* dark), so background_color/theme_color use the
// light tokens.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HourProof",
    short_name: "HourProof",
    description: "Check CalFresh work-requirement rules and what proof helps, on your phone.",
    start_url: "/",
    display: "standalone",
    background_color: tokens.light.bg,
    theme_color: tokens.light.bg,
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
