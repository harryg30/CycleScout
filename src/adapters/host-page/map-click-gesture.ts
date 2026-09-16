import type { LatLng, MapClickButton } from "../../domain/types.js";

/** Ignore Map Click when pointer moved this far (px) — treat as pan/drag. */
export const MAP_DRAG_THRESHOLD_PX = 5;

/** True when down→up movement is large enough to count as a map drag, not a click. */
export function exceedsDragThreshold(
  start: { x: number; y: number },
  end: { x: number; y: number },
  thresholdPx: number = MAP_DRAG_THRESHOLD_PX,
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return dx * dx + dy * dy >= thresholdPx * thresholdPx;
}

export type PointerGestureState = {
  pointerDown: { x: number; y: number; button: MapClickButton } | null;
  dragExceeded: boolean;
};

export function idlePointerGestureState(): PointerGestureState {
  return { pointerDown: null, dragExceeded: false };
}

/**
 * Clears pointer tracking after a click, contextmenu, or auxclick.
 * Returns whether the gesture was a drag (caller should ignore the click).
 */
export function finishPointerGestureState(
  state: PointerGestureState,
  clientX: number,
  clientY: number,
  options?: { requireButton?: MapClickButton },
): { dragged: boolean; next: PointerGestureState } {
  const start = state.pointerDown;
  const buttonOk =
    options?.requireButton === undefined ||
    start?.button === options.requireButton;
  const dragged =
    state.dragExceeded ||
    (start != null &&
      buttonOk &&
      exceedsDragThreshold(start, { x: clientX, y: clientY }));
  return {
    dragged,
    next: idlePointerGestureState(),
  };
}

/** Click-pixel cache is only valid when it matches the Anchor being pegged. */
export function clickScreenMatchesAnchor(
  screenPoint: LatLng,
  anchor: LatLng,
  eps = 1e-7,
): boolean {
  return (
    Math.abs(screenPoint.lat - anchor.lat) <= eps &&
    Math.abs(screenPoint.lng - anchor.lng) <= eps
  );
}

/** DOM `event.button` → Map Click Button. 1 is the scroll-wheel (middle) button. */
export function pointerButtonToMapClick(button: number): MapClickButton | null {
  if (button === 0) return "left";
  if (button === 1) return "middle";
  if (button === 2) return "right";
  return null;
}

export type MapClickPointerDownPlan =
  | { action: "ignore" }
  | { action: "track"; button: MapClickButton; preventDefault: boolean };

/**
 * Scroll-wheel tracking and autoscroll suppression only when Scroll wheel
 * is the Map Click Button.
 */
export function mapClickPointerDownPlan(
  eventButton: number,
  mapClickButton: MapClickButton,
): MapClickPointerDownPlan {
  const button = pointerButtonToMapClick(eventButton);
  if (!button) return { action: "ignore" };
  if (button === "middle" && mapClickButton !== "middle") {
    return { action: "ignore" };
  }
  return {
    action: "track",
    button,
    preventDefault: button === "middle",
  };
}

export type MapClickButtonPlan =
  | { action: "ignore" }
  | { action: "discard" }
  | { action: "consume" };

/** auxclick: consume Scroll wheel only when it is the Map Click Button. */
export function mapClickAuxClickPlan(
  eventButton: number,
  mapClickButton: MapClickButton,
): MapClickButtonPlan {
  if (pointerButtonToMapClick(eventButton) !== "middle") {
    return { action: "ignore" };
  }
  if (mapClickButton !== "middle") return { action: "discard" };
  return { action: "consume" };
}

/** contextmenu: consume right-click only when it is the Map Click Button. */
export function mapClickContextMenuPlan(
  mapClickButton: MapClickButton,
): { action: "discard" } | { action: "consume" } {
  if (mapClickButton !== "right") return { action: "discard" };
  return { action: "consume" };
}
