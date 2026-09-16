/** Shared domain types — language from CONTEXT.md */

export type LatLng = {
  lat: number;
  lng: number;
};

export type PanoLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const PANO_WINDOW_SIZE = { width: 420, height: 320 };
export const PANO_MARGIN_PX = 24;

/** Size used when a remembered layout is missing; position is map bottom-right. */
export const DEFAULT_PANO_LAYOUT: PanoLayout = {
  x: PANO_MARGIN_PX,
  y: PANO_MARGIN_PX,
  width: PANO_WINDOW_SIZE.width,
  height: PANO_WINDOW_SIZE.height,
};

/** Client rect of the Route Builder map (not the full window). */
export type MapBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** First-show box: bottom-right of the map, 24px inset. */
export function defaultPanoLayoutForMap(box: MapBox): PanoLayout {
  const { width, height } = PANO_WINDOW_SIZE;
  return {
    x: Math.max(
      box.left + PANO_MARGIN_PX,
      box.left + box.width - width - PANO_MARGIN_PX,
    ),
    y: Math.max(
      box.top + PANO_MARGIN_PX,
      box.top + box.height - height - PANO_MARGIN_PX,
    ),
    width,
    height,
  };
}

/** Keep the Pano Window on-screen so a stored layout cannot park it off the viewport. */
export function clampPanoLayoutToViewport(
  layout: PanoLayout,
  viewport: { width: number; height: number },
): PanoLayout {
  const width = Math.min(
    Math.max(280, layout.width),
    Math.max(280, viewport.width),
  );
  const height = Math.min(
    Math.max(200, layout.height),
    Math.max(200, viewport.height),
  );
  const boxW = Math.min(width, viewport.width);
  const boxH = Math.min(height, viewport.height);
  return {
    x: Math.min(Math.max(0, layout.x), Math.max(0, viewport.width - boxW)),
    y: Math.min(Math.max(0, layout.y), Math.max(0, viewport.height - boxH)),
    width: boxW,
    height: boxH,
  };
}

export type StreetViewCredential = {
  /** Rider Maps Key passed to Street View at show time. */
  apiKey: string;
};

export type CoverageStatus = "covered" | "coverage_gap";

/** Which mouse button performs Map Click (sets the Anchor Point). */
export type MapClickButton = "left" | "right" | "middle";
