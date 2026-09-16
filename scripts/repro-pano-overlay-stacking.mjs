/**
 * Feedback loop: Pano Window hidden behind a Route Builder-style canvas.
 *
 * Symptom: Map Click + Street View init succeed, but the rider cannot see
 * the chrome. A closed popover (hidePopover / display:flex override) sits
 * under the map while tiles still load.
 *
 * Pass: after hidePopover, re-promoting to the top layer makes the title
 * bar hit-testable above the canvas.
 *
 * Usage: node scripts/repro-pano-overlay-stacking.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contentCss = fs.readFileSync(
  path.join(rootDir, "src/extension/content.css"),
  "utf8",
);

const overlayFn = `function setImportant(el, name, value) {
  el.style.setProperty(name, value, "important");
}
function applyPanoWindowLayout(el, box) {
  el.style.zIndex = "2147483647";
  el.style.flexDirection = "column";
  el.style.background = "#1a1a1a";
  el.style.color = "#f2f2f2";
  setImportant(el, "position", "fixed");
  setImportant(el, "margin", "0");
  setImportant(el, "right", "auto");
  setImportant(el, "bottom", "auto");
  setImportant(el, "left", box.x + "px");
  setImportant(el, "top", box.y + "px");
  setImportant(el, "width", box.width + "px");
  setImportant(el, "height", box.height + "px");
}
function promoteChromeOverlay(el, box) {
  const parent = document.documentElement;
  if (parent.lastElementChild !== el) parent.appendChild(el);
  el.setAttribute("popover", "manual");
  try {
    if (!el.matches(":popover-open")) el.showPopover();
  } catch {}
  applyPanoWindowLayout(el, box);
  setImportant(el, "display", "flex");
}
function measure(root) {
  const rect = root.getBoundingClientRect();
  const hit = document.elementFromPoint(
    (rect.width > 0 ? rect.left : 24) + 80,
    (rect.height > 0 ? rect.top : 24) + 12,
  );
  return {
    popoverOpen: root.matches(":popover-open"),
    display: getComputedStyle(root).display,
    overlayOnTop:
      hit instanceof Element &&
      Boolean(hit.closest("#strava-streets-pano-root")),
    hitTag: hit instanceof Element ? hit.tagName + "#" + (hit.id || hit.className) : String(hit),
  };
}
function mountOverlay() {
  const layout = { x: 24, y: 24, width: 420, height: 320 };
  const root = document.createElement("div");
  root.id = "strava-streets-pano-root";
  root.className = "ssp-pano";
  root.innerHTML = '<div class="ssp-pano__title">Street View</div>';
  document.documentElement.appendChild(root);
  promoteChromeOverlay(root, layout);
  const open = measure(root);
  try { root.hidePopover(); } catch {}
  const closed = measure(root);
  promoteChromeOverlay(root, layout);
  const restored = measure(root);
  return { open, closed, restored };
}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.setContent(`<!doctype html>
<html>
  <head>
    <style>
      html, body { margin: 0; height: 100%; }
      #map-canvas {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: #4a90d9;
      }
    </style>
    <style id="ssp-content">${contentCss}</style>
  </head>
  <body>
    <canvas id="map-canvas" width="1280" height="800"></canvas>
  </body>
</html>`);

const result = await page.evaluate(
  `(() => { ${overlayFn}; return mountOverlay(); })()`,
);
await browser.close();

console.log(JSON.stringify(result, null, 2));
if (result?.open?.overlayOnTop !== true) {
  console.error("FAIL: Pano Window is not above the canvas when opened");
  process.exit(1);
}
if (result?.restored?.overlayOnTop !== true || result?.restored?.popoverOpen !== true) {
  console.error("FAIL: re-promote did not put the Pano Window above the canvas");
  process.exit(1);
}
console.log("PASS: Pano Window stays above the map canvas after popover dismiss");
