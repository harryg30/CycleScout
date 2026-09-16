import {
  clampPanoLayoutToViewport,
  type CoverageStatus,
  type LatLng,
  type PanoLayout,
  type StreetViewCredential,
} from "../../domain/types.js";
import { extensionResourceUrl } from "../../extension/extension-context.js";
import type { StreetViewSurface } from "../../ports/index.js";
import {
  applyPanoWindowLayout,
  chromeOverlayParent,
  promoteChromeOverlay,
} from "./pano-window-overlay.js";

const ROOT_ID = "strava-streets-pano-root";
const VIEWPORT_ID = "strava-streets-pano-viewport";
const NOTICE_TEXT = "No Street View at this point";
const BRIDGE_REQUEST = "ssp-isolated";
const BRIDGE_SOURCE = "ssp-page-bridge";

type CloseListener = () => void;
type LayoutListener = (layout: PanoLayout) => void;

type BridgeResponse = {
  source: string;
  id?: string;
  type?: string;
  ok?: boolean;
  coverage?: CoverageStatus;
  error?: string;
};

/**
 * In-page Pano Window overlay. Chrome/DOM run in the isolated content script;
 * Maps JS runs in a page-world bridge (see maps-page-bridge.ts) because
 * injected <script src="maps…"> is invisible to the isolated world.
 */
export class MapsStreetViewSurface implements StreetViewSurface {
  private root: HTMLElement | null = null;
  private panoEl: HTMLElement | null = null;
  private noticeEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private layout: PanoLayout | null = null;
  private closeListeners = new Set<CloseListener>();
  private layoutListeners = new Set<LayoutListener>();
  private dragState: {
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null = null;
  private bridgeReady: Promise<void> | null = null;
  private pending = new Map<
    string,
    {
      resolve: (value: BridgeResponse) => void;
      reject: (err: Error) => void;
    }
  >();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private overlayOnTopObserver: MutationObserver | null = null;
  private overlayOnTopInterval: ReturnType<typeof setInterval> | null = null;
  private overlayUnmounting = false;
  private reqSeq = 0;

  mount(layout: PanoLayout): void {
    if (this.root?.isConnected) return;
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    this.overlayUnmounting = false;
    this.layout = clampPanoLayoutToViewport(layout, viewportSize());
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "ssp-pano";
    root.setAttribute("role", "complementary");
    root.setAttribute("aria-label", "Street View Pano Window");
    applyPanoWindowLayout(root, this.layout);

    root.innerHTML = `
      <div class="ssp-pano__chrome">
        <div class="ssp-pano__title" data-drag-handle>Street View</div>
        <button type="button" class="ssp-pano__close" aria-label="Close Pano Window">×</button>
      </div>
      <div class="ssp-pano__body">
        <div class="ssp-pano__viewport" id="${VIEWPORT_ID}"></div>
        <div class="ssp-pano__notice" hidden>${NOTICE_TEXT}</div>
        <div class="ssp-pano__status" hidden></div>
      </div>
      <div class="ssp-pano__resize" aria-hidden="true"></div>
    `;

    chromeOverlayParent(document).appendChild(root);
    this.root = root;
    this.watchOverlayOnTop(root);
    this.panoEl = root.querySelector(".ssp-pano__viewport");
    this.noticeEl = root.querySelector(".ssp-pano__notice");
    this.statusEl = root.querySelector(".ssp-pano__status");
    applyPanoInnerLayout(root);

    root.querySelector(".ssp-pano__close")?.addEventListener("click", () => {
      for (const l of this.closeListeners) l();
    });

    this.wireDrag(root);
    this.wireResize(root);
    this.ensureMessageHandler();
  }

  unmount(): void {
    if (!this.root) return;
    void this.callBridge({ type: "destroyPanorama" }).catch(() => {
      /* bridge may already be gone */
    });
    this.endDrag();
    this.overlayUnmounting = true;
    this.overlayOnTopObserver?.disconnect();
    this.overlayOnTopObserver = null;
    if (this.overlayOnTopInterval !== null) {
      clearInterval(this.overlayOnTopInterval);
      this.overlayOnTopInterval = null;
    }
    try {
      this.root.hidePopover?.();
    } catch {
      /* already closed */
    }
    this.root.remove();
    this.root = null;
    this.panoEl = null;
    this.noticeEl = null;
    this.statusEl = null;
    this.overlayUnmounting = false;
  }

  isMounted(): boolean {
    return this.root !== null && this.root.isConnected;
  }

  setLayout(layout: PanoLayout): void {
    this.layout = clampPanoLayoutToViewport(layout, viewportSize());
    if (this.root) {
      promoteChromeOverlay(this.root, this.layout);
    }
  }

  async showAnchor(
    point: LatLng,
    credential: StreetViewCredential,
  ): Promise<CoverageStatus> {
    if (!this.root || !this.panoEl) {
      return "coverage_gap";
    }

    await this.ensureBridge();

    const response = await this.callBridge({
      type: "showAnchor",
      apiKey: credential.apiKey,
      viewportId: VIEWPORT_ID,
      point,
    });

    if (!response.ok) {
      throw new Error(response.error ?? "Street View bridge failed");
    }

    if (this.root && this.layout) {
      promoteChromeOverlay(this.root, this.layout);
    }

    return response.coverage === "covered" ? "covered" : "coverage_gap";
  }

  setCoverageGapNotice(visible: boolean): void {
    if (!this.noticeEl) return;
    this.noticeEl.hidden = !visible;
  }

  setStatusMessage(message: string | null): void {
    if (!this.statusEl) return;
    if (!message) {
      this.statusEl.hidden = true;
      this.statusEl.textContent = "";
      return;
    }
    this.statusEl.hidden = false;
    this.statusEl.textContent = message;
  }

  onUserClose(listener: CloseListener): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  onLayoutChange(listener: LayoutListener): () => void {
    this.layoutListeners.add(listener);
    return () => this.layoutListeners.delete(listener);
  }

  private ensureMessageHandler(): void {
    if (this.messageHandler) return;
    this.messageHandler = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as BridgeResponse | null;
      if (!data || data.source !== BRIDGE_SOURCE) return;

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
        if (!data || data.source !== BRIDGE_SOURCE || data.type !== "ready") {
          return;
        }
        finish();
      };
      window.addEventListener("message", onReady);

      try {
        const existing = document.getElementById("ssp-maps-page-bridge");
        if (existing) {
          finish();
          return;
        }

        const url = extensionResourceUrl("maps-page-bridge.js");
        if (!url) {
          finish(new Error("Extension context invalidated."));
          return;
        }

        const script = document.createElement("script");
        script.id = "ssp-maps-page-bridge";
        script.src = url;
        script.onerror = () =>
          finish(new Error("Failed to inject Maps page bridge"));
        (document.head || document.documentElement).appendChild(script);
      } catch (err) {
        finish(
          err instanceof Error
            ? err
            : new Error("Maps page bridge inject threw"),
        );
        return;
      }

      timer = window.setTimeout(() => {
        finish(new Error("Timed out waiting for Maps page bridge"));
      }, 5000);
    });

    return this.bridgeReady;
  }

  private callBridge(payload: Record<string, unknown>): Promise<BridgeResponse> {
    const id = `ssp-${++this.reqSeq}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Maps page bridge timed out"));
      }, 20000);

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

      window.postMessage({ source: BRIDGE_REQUEST, id, ...payload }, "*");
    });
  }

  private emitLayout(): void {
    if (!this.layout) return;
    for (const l of this.layoutListeners) l({ ...this.layout });
  }

  private endDrag(): void {
    if (!this.dragState) return;
    this.dragState = null;
    this.emitLayout();
  }

  /** Keep the overlay in the top layer and last under <html>. */
  private watchOverlayOnTop(el: HTMLElement): void {
    this.overlayOnTopObserver?.disconnect();
    const place = () => {
      if (this.overlayUnmounting || !el.isConnected || !this.layout) return;
      promoteChromeOverlay(el, this.layout);
    };
    place();
    el.addEventListener("toggle", () => {
      if (this.overlayUnmounting) return;
      if (!el.matches(":popover-open")) queueMicrotask(place);
    });
    this.overlayOnTopInterval = setInterval(place, 250);
    if (typeof MutationObserver !== "function") return;
    this.overlayOnTopObserver = new MutationObserver(place);
    this.overlayOnTopObserver.observe(chromeOverlayParent(document), {
      childList: true,
    });
  }

  private wireDrag(root: HTMLElement): void {
    const handle = root.querySelector(".ssp-pano__title");
    if (!(handle instanceof HTMLElement)) return;

    handle.addEventListener("pointerdown", (e) => {
      if (!this.layout) return;
      if (e.button !== 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      this.dragState = {
        startX: e.clientX,
        startY: e.clientY,
        origX: this.layout.x,
        origY: this.layout.y,
      };
    });

    handle.addEventListener("pointermove", (e) => {
      if (!this.dragState || !this.layout || !this.root) return;
      this.layout = clampPanoLayoutToViewport(
        nextPanoLayoutFromDrag(
          {
            x: this.dragState.origX,
            y: this.dragState.origY,
            width: this.layout.width,
            height: this.layout.height,
          },
          { x: this.dragState.startX, y: this.dragState.startY },
          { x: e.clientX, y: e.clientY },
        ),
        viewportSize(),
      );
      applyPanoWindowLayout(this.root, this.layout);
    });

    handle.addEventListener("pointerup", () => {
      this.endDrag();
    });
  }

  private wireResize(root: HTMLElement): void {
    const handle = root.querySelector(".ssp-pano__resize");
    if (!(handle instanceof HTMLElement)) return;

    let resizing: {
      startX: number;
      startY: number;
      origW: number;
      origH: number;
    } | null = null;

    handle.addEventListener("pointerdown", (e) => {
      if (!this.layout) return;
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      resizing = {
        startX: e.clientX,
        startY: e.clientY,
        origW: this.layout.width,
        origH: this.layout.height,
      };
    });

    handle.addEventListener("pointermove", (e) => {
      if (!resizing || !this.layout || !this.root) return;
      this.layout = clampPanoLayoutToViewport(
        nextPanoLayoutFromResize(
          {
            x: this.layout.x,
            y: this.layout.y,
            width: resizing.origW,
            height: resizing.origH,
          },
          { x: resizing.startX, y: resizing.startY },
          { x: e.clientX, y: e.clientY },
        ),
        viewportSize(),
      );
      applyPanoWindowLayout(this.root, this.layout);
    });

    handle.addEventListener("pointerup", () => {
      if (!resizing) return;
      resizing = null;
      this.emitLayout();
    });
  }
}

export function nextPanoLayoutFromDrag(
  orig: PanoLayout,
  pointerStart: { x: number; y: number },
  pointerNow: { x: number; y: number },
): PanoLayout {
  return {
    ...orig,
    x: Math.max(0, orig.x + pointerNow.x - pointerStart.x),
    y: Math.max(0, orig.y + pointerNow.y - pointerStart.y),
  };
}

export function nextPanoLayoutFromResize(
  orig: PanoLayout,
  pointerStart: { x: number; y: number },
  pointerNow: { x: number; y: number },
): PanoLayout {
  return {
    ...orig,
    width: Math.max(280, orig.width + pointerNow.x - pointerStart.x),
    height: Math.max(200, orig.height + pointerNow.y - pointerStart.y),
  };
}

function applyPanoInnerLayout(root: HTMLElement): void {
  const chrome = root.querySelector(".ssp-pano__chrome");
  if (chrome instanceof HTMLElement) {
    chrome.style.cssText = [
      "display:flex",
      "align-items:center",
      "flex:0 0 auto",
      "padding:10px 12px",
      "background:#242424",
      "border-bottom:1px solid #3a3a3a",
      "cursor:grab",
      "touch-action:none",
      "user-select:none",
      "position:relative",
      "z-index:4",
    ].join(";");
  }
  const title = root.querySelector(".ssp-pano__title");
  if (title instanceof HTMLElement) {
    title.style.flex = "1";
    title.style.fontWeight = "600";
    title.style.cursor = "grab";
    title.style.pointerEvents = "auto";
  }
  const close = root.querySelector(".ssp-pano__close");
  if (close instanceof HTMLElement) {
    close.style.cssText =
      "border:none;background:transparent;color:#ccc;font-size:18px;width:28px;height:28px;cursor:pointer";
  }
  const body = root.querySelector(".ssp-pano__body");
  if (body instanceof HTMLElement) {
    body.style.cssText = "position:relative;flex:1 1 auto;min-height:0";
  }
  const viewport = root.querySelector(".ssp-pano__viewport");
  if (viewport instanceof HTMLElement) {
    viewport.style.cssText = "position:absolute;inset:0;background:#111";
  }
  const resize = root.querySelector(".ssp-pano__resize");
  if (resize instanceof HTMLElement) {
    resize.style.cssText = [
      "position:absolute",
      "right:0",
      "bottom:0",
      "width:16px",
      "height:16px",
      "cursor:nwse-resize",
      "touch-action:none",
      "z-index:5",
    ].join(";");
  }
}

function viewportSize(): { width: number; height: number } {
  return {
    width: globalThis.window?.innerWidth ?? 1280,
    height: globalThis.window?.innerHeight ?? 800,
  };
}
