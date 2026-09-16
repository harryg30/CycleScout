import type { PanoLayout } from "../../domain/types.js";

export function chromeOverlayParent(doc: {
  documentElement: HTMLElement;
}): HTMLElement {
  return doc.documentElement;
}

export function setImportant(el: HTMLElement, name: string, value: string): void {
  if (typeof el.style.setProperty === "function") {
    el.style.setProperty(name, value, "important");
    return;
  }
  const camel = name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  (el.style as unknown as Record<string, string>)[camel] = value;
}

export function applyPanoWindowLayout(
  el: HTMLElement,
  layout: PanoLayout,
): void {
  el.style.zIndex = "2147483647";
  el.style.flexDirection = "column";
  el.style.minWidth = "280px";
  el.style.minHeight = "200px";
  el.style.background = "#1a1a1a";
  el.style.border = "1px solid #3a3a3a";
  el.style.color = "#f2f2f2";
  el.style.overflow = "hidden";
  el.style.boxSizing = "border-box";
  // Do not use the inset shorthand — it wipes left/top and pins the window.
  setImportant(el, "position", "fixed");
  setImportant(el, "margin", "0");
  setImportant(el, "right", "auto");
  setImportant(el, "bottom", "auto");
  setImportant(el, "left", `${layout.x}px`);
  setImportant(el, "top", `${layout.y}px`);
  setImportant(el, "width", `${layout.width}px`);
  setImportant(el, "height", `${layout.height}px`);
}

/**
 * HTML popover top-layer sits above the Route Builder canvas.
 * Re-open after hidePopover: a closed popover is display:none / under the map.
 * Do not set display:flex until after showPopover — that override keeps a
 * closed popover in the page stacking context (behind the canvas).
 */
export function promoteChromeOverlay(
  el: HTMLElement,
  layout: PanoLayout,
): void {
  const parent = chromeOverlayParent(document);
  if (el.parentElement !== parent) parent.appendChild(el);
  else if (parent.lastElementChild !== el) parent.appendChild(el);
  if (typeof el.showPopover === "function") {
    el.setAttribute("popover", "manual");
    try {
      if (!el.matches(":popover-open")) el.showPopover();
    } catch {
      /* already open */
    }
  }
  applyPanoWindowLayout(el, layout);
  setImportant(el, "display", "flex");
}
