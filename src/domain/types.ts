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

export const DEFAULT_PANO_LAYOUT: PanoLayout = {
  x: 24,
  y: 80,
  width: 420,
  height: 320,
};

export type StreetViewCredential = {
  /** Rider Maps Key passed to Street View at show time. */
  apiKey: string;
};

export type CoverageStatus = "covered" | "coverage_gap";

/** Which mouse button performs Map Click (sets the Anchor Point). */
export type MapClickButton = "left" | "right";
