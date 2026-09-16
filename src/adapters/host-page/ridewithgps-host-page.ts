import type { LatLng, MapBox, MapClickButton } from "../../domain/types.js";
import { extensionResourceUrl } from "../../extension/extension-context.js";
import type { HostPage } from "../../ports/index.js";
import {
  clickScreenMatchesAnchor,
  exceedsDragThreshold,
  finishPointerGestureState,
  idlePointerGestureState,
  mapClickAuxClickPlan,
  mapClickContextMenuPlan,
  mapClickPointerDownPlan,
} from "./map-click-gesture.js";

const RW_REQUEST = "ssp-rwgps-isolated";
const RW_SOURCE = "ssp-rwgps-bridge";
const ANCHOR_PEG_ID = "ssp-anchor-peg";

const NEW_ROUTE = /^\/routes\/new(?:\/|$)/i;
const EDIT_ROUTE = /^\/routes\/[^/]+\/edit(?:\/|$)/i;

export function isRideWithGpsHost(hostname: string): boolean {
  return /^(?:www\.)?ridewithgps\.com$/i.test(hostname);
}

export function isRideWithGpsRouteBuilderUrl(pathname: string): boolean {
  return NEW_ROUTE.test(pathname) || EDIT_ROUTE.test(pathname);
}

/** Map Click only on the MapLibre canvas, not planner chrome or dialogs. */
export function isMapLibreSurfaceTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (
    target.closest(
      ".maplibregl-ctrl, button, a, input, textarea, select, [role='dialog']",
    )
  ) {
    return false;
  }
  return Boolean(
    target.closest(".maplibregl-canvas-container, .maplibregl-canvas"),
  );
}

type MapClickListener = (point: LatLng, button: MapClickButton) => void;
type MapClickMissListener = (reason: string) => void;
type RouteBuilderListener = (active: boolean) => void;

type BridgeResponse = {
  source: string;
  id?: string;
  type?: string;
  ok?: boolean;
  point?: LatLng;
  clientX?: number;
  clientY?: number;
  error?: string;
};

/**
 * Ride with GPS Host Page adapter.
 * Map Click → lat/lng via MapLibre mapEngine (page-world bridge).
 */
export class RideWithGpsHostPage implements HostPage {
  private readonly routeListeners = new Set<RouteBuilderListener>();
  private readonly mapListeners = new Set<MapClickListener>();
  private readonly missListeners = new Set<MapClickMissListener>();
  private mapRoot: HTMLElement | null = null;
  private mapAttached = false;
  private popstateHandler: (() => void) | null = null;
  private mutationObserver: MutationObserver | null = null;
  private lastActive: boolean | null = null;
  private bridgeReady: Promise<void> | null = null;
  private pending = new Map<
    string,
    { resolve: (v: BridgeResponse) => void; reject: (e: Error) => void }
  >();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private reqSeq = 0;
  private pointerDown: { x: number; y: number; button: MapClickButton } | null =
    null;
  private dragExceeded = false;
  private mapClickButton: MapClickButton = "right";
  private anchorPoint: LatLng | null = null;
  private lastClickScreen: {
    point: LatLng;
    clientX: number;
    clientY: number;
  } | null = null;
  private pegEl: HTMLElement | null = null;
  private pegTrackUntil = 0;
  private pegTrackRaf: number | null = null;

  isRouteBuilder(): boolean {
    return isRideWithGpsRouteBuilderUrl(window.location.pathname);
  }

  setMapClickButton(button: MapClickButton): void {
    this.mapClickButton = button;
  }

  getMapBounds(): MapBox | null {
    const visible = document.querySelector('[class*="_mapCol"]');
    const root =
      (visible instanceof HTMLElement ? visible : null) ??
      this.mapRoot ??
      findMapRoot();
    if (!root) return null;
    const box = root.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return null;
    return {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    };
  }

  setAnchorMarker(point: LatLng | null): void {
    this.anchorPoint = point ? { ...point } : null;
    if (!this.anchorPoint) {
      this.lastClickScreen = null;
      this.removePeg();
      return;
    }
    if (
      this.lastClickScreen &&
      clickScreenMatchesAnchor(this.lastClickScreen.point, this.anchorPoint)
    ) {
      this.placeFixedPeg(
        this.lastClickScreen.clientX,
        this.lastClickScreen.clientY,
      );
    } else {
      this.lastClickScreen = null;
    }
    void this.refinePegFromBridge();
  }

  onRouteBuilderChange(listener: RouteBuilderListener): () => void {
    this.routeListeners.add(listener);
    this.ensureNavigationHooks();
    const active = this.isRouteBuilder();
    this.lastActive = active;
    listener(active);
    this.syncMapAttachment(active);
    return () => {
      this.routeListeners.delete(listener);
      if (this.routeListeners.size === 0) {
        this.teardownNavigationHooks();
        this.detachMapRoot();
      }
    };
  }

  onMapClick(listener: MapClickListener): () => void {
    this.mapListeners.add(listener);
    if (this.isRouteBuilder()) {
      this.attachMapRoot();
    }
    return () => {
      this.mapListeners.delete(listener);
      if (this.mapListeners.size === 0) {
        this.detachMapRoot();
      }
    };
  }

  onMapClickMiss(listener: MapClickMissListener): () => void {
    this.missListeners.add(listener);
    return () => this.missListeners.delete(listener);
  }

  private ensureNavigationHooks(): void {
    if (this.popstateHandler) return;

    this.popstateHandler = () => this.emitRouteBuilderIfChanged();
    window.addEventListener("popstate", this.popstateHandler);

    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    const notify = () => this.emitRouteBuilderIfChanged();
    history.pushState = ((...args: Parameters<History["pushState"]>) => {
      origPush(...args);
      notify();
    }) as History["pushState"];
    history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
      origReplace(...args);
      notify();
    }) as History["replaceState"];

    this.mutationObserver = new MutationObserver(() => {
      this.emitRouteBuilderIfChanged();
      if (this.isRouteBuilder() && this.mapListeners.size > 0) {
        if (!this.mapAttached) this.attachMapRoot();
      }
    });
    this.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  private teardownNavigationHooks(): void {
    if (this.popstateHandler) {
      window.removeEventListener("popstate", this.popstateHandler);
      this.popstateHandler = null;
    }
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
  }

  private emitRouteBuilderIfChanged(): void {
    const active = this.isRouteBuilder();
    if (active === this.lastActive) return;
    this.lastActive = active;
    this.syncMapAttachment(active);
    for (const l of this.routeListeners) l(active);
  }

  private syncMapAttachment(active: boolean): void {
    if (active && this.mapListeners.size > 0) {
      this.attachMapRoot();
    } else if (!active) {
      this.detachMapRoot();
    }
  }

  private attachMapRoot(): void {
    if (this.mapAttached) return;
    const root = findMapRoot();
    if (!root) return;
    this.mapRoot = root;
    root.addEventListener("pointerdown", this.onMapPointerDown, true);
    root.addEventListener("pointermove", this.onMapPointerMove, true);
    root.addEventListener("click", this.onMapDomClick, true);
    root.addEventListener("auxclick", this.onMapAuxClick, true);
    root.addEventListener("contextmenu", this.onMapContextMenu, true);
    this.mapAttached = true;
    this.wirePegRefresh(root);
    if (this.anchorPoint) {
      if (
        this.lastClickScreen &&
        clickScreenMatchesAnchor(this.lastClickScreen.point, this.anchorPoint)
      ) {
        this.placeFixedPeg(
          this.lastClickScreen.clientX,
          this.lastClickScreen.clientY,
        );
      }
      void this.refinePegFromBridge();
    }
    void this.ensureBridge().catch(() => {
      /* miss path still reports via DOM click */
    });
  }

  private detachMapRoot(): void {
    if (!this.mapAttached || !this.mapRoot) return;
    this.unwirePegRefresh();
    this.mapRoot.removeEventListener("pointerdown", this.onMapPointerDown, true);
    this.mapRoot.removeEventListener("pointermove", this.onMapPointerMove, true);
    this.mapRoot.removeEventListener("click", this.onMapDomClick, true);
    this.mapRoot.removeEventListener("auxclick", this.onMapAuxClick, true);
    this.mapRoot.removeEventListener("contextmenu", this.onMapContextMenu, true);
    this.mapRoot = null;
    this.mapAttached = false;
    this.pointerDown = null;
    this.dragExceeded = false;
    this.removePeg();
  }

  private onMapPointerDown = (event: PointerEvent): void => {
    const plan = mapClickPointerDownPlan(event.button, this.mapClickButton);
    if (plan.action === "ignore") return;
    if (plan.preventDefault) event.preventDefault();
    this.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      button: plan.button,
    };
    this.dragExceeded = false;
  };

  private onMapPointerMove = (event: PointerEvent): void => {
    if (!this.pointerDown || this.dragExceeded) return;
    if (
      exceedsDragThreshold(this.pointerDown, {
        x: event.clientX,
        y: event.clientY,
      })
    ) {
      this.dragExceeded = true;
    }
  };

  private onMapDomClick = (event: MouseEvent): void => {
    if (this.mapListeners.size === 0) return;
    if (event.button !== 0) return;
    if (!isMapLibreSurfaceTarget(event.target)) return;
    if (this.finishPointerGesture(event.clientX, event.clientY)) return;
    void this.resolveClick(event, "left");
  };

  private onMapAuxClick = (event: MouseEvent): void => {
    if (this.mapListeners.size === 0) return;
    const plan = mapClickAuxClickPlan(event.button, this.mapClickButton);
    if (plan.action === "ignore") return;
    if (plan.action === "discard") {
      this.clearPointerGesture();
      return;
    }
    if (!isMapLibreSurfaceTarget(event.target)) {
      this.clearPointerGesture();
      return;
    }

    if (
      this.finishPointerGesture(event.clientX, event.clientY, {
        requireButton: "middle",
      })
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void this.resolveClick(event, "middle");
  };

  private onMapContextMenu = (event: MouseEvent): void => {
    if (this.mapListeners.size === 0) return;
    const plan = mapClickContextMenuPlan(this.mapClickButton);
    if (plan.action === "discard") {
      this.clearPointerGesture();
      return;
    }
    if (!isMapLibreSurfaceTarget(event.target)) {
      this.clearPointerGesture();
      return;
    }

    if (
      this.finishPointerGesture(event.clientX, event.clientY, {
        requireButton: "right",
      })
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void this.resolveClick(event, "right");
  };

  private finishPointerGesture(
    clientX: number,
    clientY: number,
    options?: { requireButton?: MapClickButton },
  ): boolean {
    const { dragged, next } = finishPointerGestureState(
      {
        pointerDown: this.pointerDown,
        dragExceeded: this.dragExceeded,
      },
      clientX,
      clientY,
      options,
    );
    this.pointerDown = next.pointerDown;
    this.dragExceeded = next.dragExceeded;
    return dragged;
  }

  private clearPointerGesture(): void {
    const idle = idlePointerGestureState();
    this.pointerDown = idle.pointerDown;
    this.dragExceeded = idle.dragExceeded;
  }

  private async resolveClick(
    event: MouseEvent,
    button: MapClickButton,
  ): Promise<void> {
    try {
      await this.ensureBridge();
      const response = await this.callBridge({
        type: "screenToLatLng",
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (response.ok && response.point) {
        this.rememberClickScreen(response.point, event.clientX, event.clientY);
        for (const l of this.mapListeners) l(response.point, button);
        return;
      }
      this.emitMiss(response.error ?? "Could not read map coordinates.");
    } catch (err) {
      this.emitMiss(
        err instanceof Error ? err.message : "Map coordinate bridge failed",
      );
    }
  }

  private rememberClickScreen(
    point: LatLng,
    clientX: number,
    clientY: number,
  ): void {
    this.lastClickScreen = { point: { ...point }, clientX, clientY };
  }

  private emitMiss(reason: string): void {
    for (const l of this.missListeners) l(reason);
  }

  private wirePegRefresh(root: HTMLElement): void {
    root.addEventListener("wheel", this.onPegMapInteraction, {
      passive: true,
      capture: true,
    });
    root.addEventListener("pointerdown", this.onPegMapInteraction, true);
    root.addEventListener("pointermove", this.onPegPointerMove, true);
    root.addEventListener("pointerup", this.onPegMapInteraction, true);
    window.addEventListener("wheel", this.onPegMapInteraction, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", this.onPegMapInteraction);
  }

  private unwirePegRefresh(): void {
    if (this.mapRoot) {
      this.mapRoot.removeEventListener("wheel", this.onPegMapInteraction, true);
      this.mapRoot.removeEventListener(
        "pointerdown",
        this.onPegMapInteraction,
        true,
      );
      this.mapRoot.removeEventListener(
        "pointermove",
        this.onPegPointerMove,
        true,
      );
      this.mapRoot.removeEventListener(
        "pointerup",
        this.onPegMapInteraction,
        true,
      );
    }
    window.removeEventListener("wheel", this.onPegMapInteraction, true);
    window.removeEventListener("resize", this.onPegMapInteraction);
    this.stopPegTracking();
  }

  private onPegMapInteraction = (): void => {
    this.startPegTracking(600);
  };

  private onPegPointerMove = (event: PointerEvent): void => {
    if (event.buttons === 0) return;
    this.startPegTracking(400);
  };

  private startPegTracking(ms: number): void {
    if (!this.anchorPoint) return;
    const until = performance.now() + ms;
    if (until > this.pegTrackUntil) this.pegTrackUntil = until;
    if (this.pegTrackRaf != null) return;
    const tick = () => {
      this.pegTrackRaf = null;
      void this.refinePegFromBridge();
      if (performance.now() < this.pegTrackUntil && this.anchorPoint) {
        this.pegTrackRaf = requestAnimationFrame(tick);
      }
    };
    this.pegTrackRaf = requestAnimationFrame(tick);
  }

  private stopPegTracking(): void {
    this.pegTrackUntil = 0;
    if (this.pegTrackRaf != null) {
      cancelAnimationFrame(this.pegTrackRaf);
      this.pegTrackRaf = null;
    }
  }

  private removePeg(): void {
    this.stopPegTracking();
    if (this.pegEl) {
      this.pegEl.remove();
      this.pegEl = null;
    }
  }

  private ensurePegEl(): HTMLElement {
    if (this.pegEl) return this.pegEl;
    const el = document.createElement("div");
    el.id = ANCHOR_PEG_ID;
    el.className = "ssp-anchor-peg ssp-anchor-peg--fixed";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<div class="ssp-anchor-peg__pin"></div>`;
    el.style.cssText = [
      "position:fixed",
      "z-index:2147483645",
      "width:20px",
      "height:28px",
      "margin-left:-10px",
      "margin-top:-28px",
      "pointer-events:none",
      "display:block",
    ].join(";");
    const pin = el.firstElementChild as HTMLElement | null;
    if (pin) {
      pin.style.cssText = [
        "position:absolute",
        "left:1px",
        "top:0",
        "width:18px",
        "height:18px",
        "border-radius:50% 50% 50% 0",
        "background:#fc4c02",
        "border:2px solid #fff",
        "box-shadow:0 1px 4px rgba(0,0,0,0.45)",
        "transform:rotate(-45deg)",
        "box-sizing:border-box",
      ].join(";");
    }
    this.pegEl = el;
    return el;
  }

  private placeFixedPeg(clientX: number, clientY: number): void {
    const el = this.ensurePegEl();
    const parent = document.body ?? document.documentElement;
    if (el.parentElement !== parent) {
      parent.appendChild(el);
    }
    el.style.left = `${Math.round(clientX)}px`;
    el.style.top = `${Math.round(clientY)}px`;
    el.hidden = false;
    el.style.display = "block";
  }

  private async refinePegFromBridge(): Promise<void> {
    const point = this.anchorPoint;
    if (!point) return;
    const fromBridge = await this.tryLatLngToScreen(point);
    if (fromBridge) {
      this.placeFixedPeg(fromBridge.clientX, fromBridge.clientY);
    }
  }

  private async tryLatLngToScreen(
    point: LatLng,
  ): Promise<{ clientX: number; clientY: number } | null> {
    try {
      await this.ensureBridge();
      const response = await this.callBridge({
        type: "latLngToScreen",
        lat: point.lat,
        lng: point.lng,
      });
      if (
        response.ok &&
        typeof response.clientX === "number" &&
        typeof response.clientY === "number"
      ) {
        return { clientX: response.clientX, clientY: response.clientY };
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  private ensureMessageHandler(): void {
    if (this.messageHandler) return;
    this.messageHandler = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as BridgeResponse | null;
      if (!data || data.source !== RW_SOURCE) return;
      if (data.type === "ready") return;
      if (data.id && this.pending.has(data.id)) {
        const entry = this.pending.get(data.id)!;
        this.pending.delete(data.id);
        entry.resolve(data);
      }
    };
    window.addEventListener("message", this.messageHandler);
  }

  private ensureBridge(): Promise<void> {
    if (this.bridgeReady) return this.bridgeReady;
    this.ensureMessageHandler();

    this.bridgeReady = new Promise((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onReady);
        if (timer !== undefined) window.clearTimeout(timer);
        if (err) {
          this.bridgeReady = null;
          reject(err);
        } else {
          resolve();
        }
      };

      const onReady = (event: MessageEvent) => {
        const data = event.data as BridgeResponse | null;
        if (event.source !== window) return;
        if (!data || data.source !== RW_SOURCE || data.type !== "ready") return;
        finish();
      };
      window.addEventListener("message", onReady);

      try {
        if (document.getElementById("ssp-host-maplibre-bridge")) {
          finish();
          return;
        }

        const script = document.createElement("script");
        script.id = "ssp-host-maplibre-bridge";
        const url = extensionResourceUrl("host-maplibre-bridge.js");
        if (!url) {
          finish(new Error("Extension context invalidated."));
          return;
        }
        script.src = url;
        script.onerror = () =>
          finish(new Error("Failed to inject Ride with GPS map bridge"));
        (document.head || document.documentElement).appendChild(script);
      } catch (err) {
        finish(
          err instanceof Error
            ? err
            : new Error("Ride with GPS map bridge inject threw"),
        );
        return;
      }

      timer = window.setTimeout(() => {
        finish(new Error("Timed out waiting for Ride with GPS map bridge"));
      }, 5000);
    });

    return this.bridgeReady;
  }

  private callBridge(payload: Record<string, unknown>): Promise<BridgeResponse> {
    const id = `rwgps-${++this.reqSeq}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Ride with GPS map bridge timed out"));
      }, 8000);
      this.pending.set(id, {
        resolve: (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          window.clearTimeout(timer);
          reject(err);
        },
      });
      window.postMessage({ source: RW_REQUEST, id, ...payload }, "*");
    });
  }
}

function findMapRoot(): HTMLElement | null {
  const selectors = [
    ".maplibregl-map",
    ".maplibregl-canvas-container",
    ".maplibregl-canvas",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}
