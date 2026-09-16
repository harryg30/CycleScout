import { createHostPage } from "../adapters/host-page/create-host-page.js";
import { ChromeSettingsStore } from "../adapters/settings/chrome-settings-store.js";
import { MapsStreetViewSurface } from "../adapters/street-view/maps-street-view-surface.js";
import { ExtensionApplication } from "../core/extension-application.js";

/**
 * Content script entry — injected on Strava /maps/* and Ride with GPS planner URLs.
 * Host Page still gates on that Host’s Route Builder path for SPA leave/return.
 */
function showBootError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[CycleScout] content script failed:", err);
  const existing = document.getElementById("ssp-boot-error");
  if (existing) {
    existing.textContent = `CycleScout error: ${message}`;
    return;
  }
  const el = document.createElement("div");
  el.id = "ssp-boot-error";
  el.textContent = `CycleScout error: ${message}`;
  el.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "left:12px",
    "bottom:12px",
    "max-width:420px",
    "padding:10px 12px",
    "background:#3b0f0f",
    "color:#ffe8e8",
    "border:1px solid #c45c26",
    "font:12px/1.4 sans-serif",
  ].join(";");
  document.documentElement.appendChild(el);
}

try {
  const app = new ExtensionApplication({
    hostPage: createHostPage(),
    streetView: new MapsStreetViewSurface(),
    settings: new ChromeSettingsStore(),
  });

  void app.start().catch(showBootError);
} catch (err) {
  showBootError(err);
}
