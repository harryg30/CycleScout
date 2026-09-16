/**
 * Page-world bridge: Ride with GPS MapLibre mapEngine → lat/lng.
 * Injected via chrome.runtime.getURL — no chrome.* APIs here.
 */
import {
  clientPointToMapPixel,
  latLngFromUnknown,
} from "../adapters/host-page/maplibre-coords.js";

(() => {
  const SOURCE = "ssp-rwgps-bridge";
  const REQUEST = "ssp-rwgps-isolated";

  type MapEngine = {
    pixelCoordinateToLatLng?: (pt: { x: number; y: number }) => unknown;
    latLngToPageCoordinate?: (ll: { lat: number; lng: number }) => unknown;
    getContainer?: () => HTMLElement | null | undefined;
    _map?: {
      unproject?: (xy: [number, number]) => unknown;
      project?: (ll: { lat: number; lng: number }) => { x: number; y: number };
      getContainer?: () => HTMLElement | null | undefined;
    };
  };

  function reply(id: string, payload: Record<string, unknown>): void {
    window.postMessage({ source: SOURCE, id, ...payload }, "*");
  }

  function getMapEngine(): MapEngine | null {
    const fromDelegate = (
      window as Window & {
        rwgps?: { MapDelegate?: { props?: { mapEngine?: MapEngine } } };
      }
    ).rwgps?.MapDelegate?.props?.mapEngine;
    if (fromDelegate && typeof fromDelegate === "object") {
      return fromDelegate;
    }

    const el = document.querySelector(".maplibregl-map");
    if (!el) return null;
    const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
    if (!fiberKey) return null;
    let node: { return?: unknown; stateNode?: { _map?: unknown } } | null = (
      el as unknown as Record<string, unknown>
    )[fiberKey] as typeof node;
    for (let i = 0; i < 40; i++) {
      node = (node?.return ?? null) as typeof node;
      if (!node) break;
      const state = node.stateNode as { _map?: unknown } | undefined;
      if (state && typeof state === "object" && "_map" in state) {
        return state as MapEngine;
      }
    }
    return null;
  }

  function mapContainer(engine: MapEngine): HTMLElement | null {
    const fromEngine = engine.getContainer?.();
    if (fromEngine instanceof HTMLElement) return fromEngine;
    const fromMap = engine._map?.getContainer?.();
    if (fromMap instanceof HTMLElement) return fromMap;
    const el = document.querySelector(".maplibregl-map");
    return el instanceof HTMLElement ? el : null;
  }

  function screenToLatLng(
    clientX: number,
    clientY: number,
  ): {
    ok: boolean;
    point?: { lat: number; lng: number };
    error?: string;
  } {
    const engine = getMapEngine();
    if (!engine) {
      return { ok: false, error: "Ride with GPS map engine not found" };
    }
    const container = mapContainer(engine);
    if (!container) {
      return { ok: false, error: "Ride with GPS map container not found" };
    }
    const rect = container.getBoundingClientRect();
    const pixel = clientPointToMapPixel(clientX, clientY, rect);

    try {
      if (typeof engine.pixelCoordinateToLatLng === "function") {
        const point = latLngFromUnknown(engine.pixelCoordinateToLatLng(pixel));
        if (point) return { ok: true, point };
      }
      if (typeof engine._map?.unproject === "function") {
        const point = latLngFromUnknown(
          engine._map.unproject([pixel.x, pixel.y]),
        );
        if (point) return { ok: true, point };
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    return { ok: false, error: "Could not read map coordinates." };
  }

  function latLngToScreen(
    lat: number,
    lng: number,
  ): {
    ok: boolean;
    clientX?: number;
    clientY?: number;
    error?: string;
  } {
    const engine = getMapEngine();
    if (!engine) {
      return { ok: false, error: "Ride with GPS map engine not found" };
    }
    try {
      if (typeof engine.latLngToPageCoordinate === "function") {
        const page = engine.latLngToPageCoordinate({ lat, lng }) as {
          x?: number;
          y?: number;
        } | null;
        if (
          page &&
          typeof page.x === "number" &&
          typeof page.y === "number" &&
          Number.isFinite(page.x) &&
          Number.isFinite(page.y)
        ) {
          return { ok: true, clientX: page.x, clientY: page.y };
        }
      }
      const container = mapContainer(engine);
      if (container && typeof engine._map?.project === "function") {
        const projected = engine._map.project({ lat, lng });
        const rect = container.getBoundingClientRect();
        if (
          projected &&
          typeof projected.x === "number" &&
          typeof projected.y === "number"
        ) {
          return {
            ok: true,
            clientX: projected.x + rect.left,
            clientY: projected.y + rect.top,
          };
        }
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    return { ok: false, error: "Could not project Anchor to screen." };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data as {
      source?: string;
      id?: string;
      type?: string;
      clientX?: number;
      clientY?: number;
      lat?: number;
      lng?: number;
    } | null;
    if (!data || data.source !== REQUEST || typeof data.id !== "string") return;

    const { id, type } = data;
    try {
      if (type === "screenToLatLng") {
        if (
          typeof data.clientX !== "number" ||
          typeof data.clientY !== "number"
        ) {
          reply(id, { ok: false, error: "clientX/clientY required" });
          return;
        }
        reply(id, screenToLatLng(data.clientX, data.clientY));
        return;
      }
      if (type === "latLngToScreen") {
        if (typeof data.lat !== "number" || typeof data.lng !== "number") {
          reply(id, { ok: false, error: "lat/lng required" });
          return;
        }
        reply(id, latLngToScreen(data.lat, data.lng));
        return;
      }
      reply(id, { ok: false, error: `Unknown type: ${type}` });
    } catch (err) {
      reply(id, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  window.postMessage({ source: SOURCE, type: "ready" }, "*");
})();
