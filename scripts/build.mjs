#!/usr/bin/env node
import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const shared = {
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
};

await esbuild.build({
  ...shared,
  entryPoints: {
    content: path.join(root, "src/extension/content.ts"),
    popup: path.join(root, "src/extension/popup/popup.ts"),
  },
  outdir: dist,
  entryNames: "[name]",
});

// Page-world bridges must be classic IIFE (no chrome.*, no ESM).
await esbuild.build({
  entryPoints: [
    path.join(root, "src/extension/maps-page-bridge.ts"),
    path.join(root, "src/extension/host-mre-bridge.ts"),
    path.join(root, "src/extension/host-maplibre-bridge.ts"),
  ],
  outdir: dist,
  entryNames: "[name]",
  bundle: true,
  format: "iife",
  target: "chrome120",
  logLevel: "info",
});

fs.copyFileSync(
  path.join(root, "src/extension/popup/popup.html"),
  path.join(dist, "popup.html"),
);
fs.copyFileSync(
  path.join(root, "src/extension/popup/popup.css"),
  path.join(dist, "popup.css"),
);

const routeBuilderMatches = [
  "https://www.strava.com/maps/*",
  "https://ridewithgps.com/routes/new*",
  "https://ridewithgps.com/routes/*/edit*",
  "https://www.ridewithgps.com/routes/new*",
  "https://www.ridewithgps.com/routes/*/edit*",
];

const manifest = {
  manifest_version: 3,
  name: "CycleScout",
  version: "0.1.0",
  description:
    "Street-level preview for cycling routes — view-only Pano Window on the Route Builder.",
  permissions: ["storage"],
  host_permissions: routeBuilderMatches,
  action: {
    default_popup: "popup.html",
    default_title: "CycleScout",
  },
  content_scripts: [
    {
      // Isolated world keeps chrome.* + avoids page JS collisions.
      // Maps JS + host lat/lng run via page-world bridges.
      matches: routeBuilderMatches,
      js: ["content.js"],
      css: ["content.css"],
      run_at: "document_idle",
    },
  ],
  web_accessible_resources: [
    {
      resources: [
        "maps-page-bridge.js",
        "host-mre-bridge.js",
        "host-maplibre-bridge.js",
      ],
      matches: [
        "https://www.strava.com/*",
        "https://ridewithgps.com/*",
        "https://www.ridewithgps.com/*",
      ],
    },
  ],
};

fs.writeFileSync(
  path.join(dist, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
fs.copyFileSync(
  path.join(root, "src/extension/content.css"),
  path.join(dist, "content.css"),
);

console.log(`[build] → ${dist}`);
