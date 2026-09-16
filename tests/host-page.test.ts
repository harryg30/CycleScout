import { describe, expect, it } from "vitest";
import { createHostPage } from "../src/adapters/host-page/create-host-page.js";
import {
  clientPointToMapPixel,
  latLngFromUnknown,
} from "../src/adapters/host-page/maplibre-coords.js";
import {
  isRideWithGpsHost,
  isRideWithGpsRouteBuilderUrl,
  RideWithGpsHostPage,
} from "../src/adapters/host-page/ridewithgps-host-page.js";
import {
  clickScreenMatchesAnchor,
  exceedsDragThreshold,
  finishPointerGestureState,
  isRouteBuilderUrl,
  MAP_DRAG_THRESHOLD_PX,
  StravaHostPage,
} from "../src/adapters/host-page/strava-host-page.js";

describe("Route Builder URL detection", () => {
  it("matches https://www.strava.com/maps/* paths", () => {
    expect(isRouteBuilderUrl("/maps")).toBe(true);
    expect(isRouteBuilderUrl("/maps/")).toBe(true);
    expect(isRouteBuilderUrl("/maps/routes/new")).toBe(true);
    expect(isRouteBuilderUrl("/maps/something")).toBe(true);
  });

  it("rejects other Strava pages", () => {
    expect(isRouteBuilderUrl("/dashboard")).toBe(false);
    expect(isRouteBuilderUrl("/activities/99")).toBe(false);
    expect(isRouteBuilderUrl("/routes")).toBe(false);
    expect(isRouteBuilderUrl("/routes/new")).toBe(false);
    expect(isRouteBuilderUrl("/routes/12345/edit")).toBe(false);
    expect(isRouteBuilderUrl("/mapping")).toBe(false);
  });
});

describe("Ride with GPS Route Builder URL detection", () => {
  it("matches planner new and edit paths", () => {
    expect(isRideWithGpsRouteBuilderUrl("/routes/new")).toBe(true);
    expect(isRideWithGpsRouteBuilderUrl("/routes/new/")).toBe(true);
    expect(isRideWithGpsRouteBuilderUrl("/routes/12345/edit")).toBe(true);
    expect(isRideWithGpsRouteBuilderUrl("/routes/12345/edit/")).toBe(true);
    expect(isRideWithGpsRouteBuilderUrl("/routes/abc-def/edit")).toBe(true);
  });

  it("rejects Ride with GPS pages that are not the Route Planner", () => {
    expect(isRideWithGpsRouteBuilderUrl("/routes")).toBe(false);
    expect(isRideWithGpsRouteBuilderUrl("/routes/12345")).toBe(false);
    expect(isRideWithGpsRouteBuilderUrl("/routes/explore")).toBe(false);
    expect(isRideWithGpsRouteBuilderUrl("/routes/newish")).toBe(false);
    expect(isRideWithGpsRouteBuilderUrl("/maps")).toBe(false);
    expect(isRideWithGpsRouteBuilderUrl("/dashboard")).toBe(false);
  });

  it("recognizes Ride with GPS hosts including www", () => {
    expect(isRideWithGpsHost("ridewithgps.com")).toBe(true);
    expect(isRideWithGpsHost("www.ridewithgps.com")).toBe(true);
    expect(isRideWithGpsHost("www.strava.com")).toBe(false);
    expect(isRideWithGpsHost("maps.ridewithgps.com")).toBe(false);
  });
});

describe("Host Page factory", () => {
  it("uses RideWithGpsHostPage on Ride with GPS", () => {
    expect(createHostPage("ridewithgps.com")).toBeInstanceOf(RideWithGpsHostPage);
    expect(createHostPage("www.ridewithgps.com")).toBeInstanceOf(
      RideWithGpsHostPage,
    );
  });

  it("uses StravaHostPage on Strava", () => {
    expect(createHostPage("www.strava.com")).toBeInstanceOf(StravaHostPage);
    expect(createHostPage("strava.com")).toBeInstanceOf(StravaHostPage);
  });
});

describe("MapLibre client→map pixel", () => {
  it("subtracts the map container origin from client coordinates", () => {
    expect(
      clientPointToMapPixel(250, 180, { left: 50, top: 60 }),
    ).toEqual({ x: 200, y: 120 });
  });

  it("reads lat/lng from MapLibre-like objects", () => {
    expect(latLngFromUnknown({ lat: 42.31, lng: -71.11 })).toEqual({
      lat: 42.31,
      lng: -71.11,
    });
    expect(latLngFromUnknown(null)).toBeNull();
    expect(latLngFromUnknown({ lat: "x", lng: -71 })).toBeNull();
  });
});

describe("Map drag vs Map Click", () => {
  it("treats tiny pointer jitter as a click", () => {
    expect(
      exceedsDragThreshold({ x: 100, y: 100 }, { x: 102, y: 101 }),
    ).toBe(false);
  });

  it("treats movement at/above threshold as a drag (ignore click)", () => {
    expect(
      exceedsDragThreshold(
        { x: 0, y: 0 },
        { x: MAP_DRAG_THRESHOLD_PX, y: 0 },
      ),
    ).toBe(true);
    expect(
      exceedsDragThreshold({ x: 10, y: 10 }, { x: 10, y: 10 + MAP_DRAG_THRESHOLD_PX }),
    ).toBe(true);
  });
});

describe("Map Click Button gesture finish", () => {
  it("clears pointer state when finishing a gesture", () => {
    const { dragged, next } = finishPointerGestureState(
      {
        pointerDown: { x: 10, y: 10, button: "right" },
        dragExceeded: false,
      },
      12,
      10,
    );
    expect(dragged).toBe(false);
    expect(next).toEqual({ pointerDown: null, dragExceeded: false });
  });

  it("treats prior dragExceeded as dragged and still clears", () => {
    const { dragged, next } = finishPointerGestureState(
      {
        pointerDown: { x: 0, y: 0, button: "left" },
        dragExceeded: true,
      },
      0,
      0,
    );
    expect(dragged).toBe(true);
    expect(next.pointerDown).toBeNull();
  });

  it("requireButton ignores mismatch without counting as drag from that start", () => {
    const { dragged, next } = finishPointerGestureState(
      {
        pointerDown: { x: 0, y: 0, button: "left" },
        dragExceeded: false,
      },
      100,
      100,
      { requireButton: "right" },
    );
    expect(dragged).toBe(false);
    expect(next.pointerDown).toBeNull();
  });
});

describe("Anchor peg click-screen cache", () => {
  it("matches when screen coords belong to the Anchor being pegged", () => {
    const covered = { lat: 40.7, lng: -74.0 };
    expect(clickScreenMatchesAnchor(covered, covered)).toBe(true);
    expect(
      clickScreenMatchesAnchor(
        { lat: 40.7 + 1e-9, lng: -74.0 },
        covered,
      ),
    ).toBe(true);
  });

  it("rejects Coverage Gap click coords so remount cannot jump the peg", () => {
    const covered = { lat: 40.7, lng: -74.0 };
    const gap = { lat: 40.8, lng: -74.1 };
    expect(clickScreenMatchesAnchor(gap, covered)).toBe(false);
  });
});
