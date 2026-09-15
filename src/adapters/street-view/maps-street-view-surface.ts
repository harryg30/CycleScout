import type {
  CoverageStatus,
  LatLng,
  PanoLayout,
  StreetViewCredential,
} from "../../domain/types.js";
import { extensionResourceUrl } from "../../extension/extension-context.js";
import type { StreetViewSurface } from "../../ports/index.js";

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
  private reqSeq = 0;

  mount(layout: PanoLayout): void {
    if (this.root?.isConnected) return;
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    this.layout = { ...layout };
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "ssp-pano";
    root.setAttribute("role", "complementary");
    root.setAttribute("aria-label", "Street View Pano Window");
    applyPanoWindowLayout(root, layout);

    root.innerHTML = `
      <div class="ssp-pano__chrome" data-drag-handle>
        <div class="ssp-pano__title">Street View</div>
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
    showChromeOverlay(root);
    this.root = root;
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
  }

  isMounted(): boolean {
    return this.root !== null && this.root.isConnected;
  }

  setLayout(layout: PanoLayout): void {
    this.layout = { ...layout };
    if (this.root) applyPanoWindowLayout(this.root, layout);
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
    window.removeEventListener("pointermove", this.onDragMove);
    window.removeEventListener("pointerup", this.onDragUp);
    if (!this.dragState) return;
    this.dragState = null;
    this.emitLayout();
  }

  private onDragMove = (e: PointerEvent): void => {
    if (!this.dragState || !this.layout || !this.root) return;
    this.layout = nextPanoLayoutFromDrag(
      {
        x: this.dragState.origX,
        y: this.dragState.origY,
        width: this.layout.width,
        height: this.layout.height,
      },
      { x: this.dragState.startX, y: this.dragState.startY },
      { x: e.clientX, y: e.clientY },
    );
    applyPanoWindowLayout(this.root, this.layout);
  };

  private onDragUp = (): void => {
    this.endDrag();
  };

  private wireDrag(root: HTMLElement): void {
    const handle = root.querySelector("[data-drag-handle]");
    if (!(handle instanceof HTMLElement)) return;

    handle.addEventListener("pointerdown", (e) => {
      if (!this.layout) return;
      if (e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest(".ssp-pano__close")) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.endDrag();
      this.dragState = {
        startX: e.clientX,
        startY: e.clientY,
        origX: this.layout.x,
        origY: this.layout.y,
      };
      window.addEventListener("pointermove", this.onDragMove);
      window.addEventListener("pointerup", this.onDragUp);
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

    const onMove = (e: PointerEvent) => {
      if (!resizing || !this.layout || !this.root) return;
      this.layout = {
        ...this.layout,
        width: Math.max(280, resizing.origW + (e.clientX - resizing.startX)),
        height: Math.max(200, resizing.origH + (e.clientY - resizing.startY)),
      };
      applyPanoWindowLayout(this.root, this.layout);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!resizing) return;
      resizing = null;
      this.emitLayout();
    };

    handle.addEventListener("pointerdown", (e) => {
      if (!this.layout) return;
      e.preventDefault();
      e.stopPropagation();
      resizing = {
        startX: e.clientX,
        startY: e.clientY,
        origW: this.layout.width,
        origH: this.layout.height,
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
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

export function applyPanoWindowLayout(
  el: HTMLElement,
  layout: PanoLayout,
): void {
  el.style.position = "fixed";
  el.style.zIndex = "2147483646";
  el.style.display = "flex";
  el.style.flexDirection = "column";
  el.style.left = `${layout.x}px`;
  el.style.top = `${layout.y}px`;
  el.style.width = `${layout.width}px`;
  el.style.height = `${layout.height}px`;
  el.style.minWidth = "280px";
  el.style.minHeight = "200px";
  el.style.background = "#1a1a1a";
  el.style.border = "1px solid #3a3a3a";
  el.style.color = "#f2f2f2";
  el.style.overflow = "hidden";
  el.style.boxSizing = "border-box";
  el.style.setProperty?.("inset", "auto", "important");
  el.style.setProperty?.("margin", "0", "important");
  el.style.setProperty?.("position", "fixed", "important");
}

function applyPanoInnerLayout(root: HTMLElement): void {
  const chrome = root.querySelector(".ssp-pano__chrome");
  if (chrome instanceof HTMLElement) {
    chrome.style.cssText = [
      "display:flex",
      "align-items:center",
      "flex:0 0 auto",
      "padding:6px 8px",
      "background:#242424",
      "border-bottom:1px solid #3a3a3a",
      "cursor:grab",
      "touch-action:none",
      "user-select:none",
    ].join(";");
  }
  const title = root.querySelector(".ssp-pano__title");
  if (title instanceof HTMLElement) {
    title.style.flex = "1";
    title.style.fontWeight = "600";
    title.style.pointerEvents = "none";
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
}

function chromeOverlayParent(doc: {
  body: HTMLElement | null;
  documentElement: HTMLElement;
}): HTMLElement {
  return doc.body ?? doc.documentElement;
}

function showChromeOverlay(el: HTMLElement): void {
  if (typeof el.showPopover !== "function") return;
  el.setAttribute("popover", "manual");
  try {
    el.showPopover();
  } catch {
    el.removeAttribute("popover");
  }
}
