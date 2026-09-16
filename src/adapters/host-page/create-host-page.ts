import type { HostPage } from "../../ports/index.js";
import {
  isRideWithGpsHost,
  RideWithGpsHostPage,
} from "./ridewithgps-host-page.js";
import { StravaHostPage } from "./strava-host-page.js";

/** Pick the Host Page adapter for this tab. */
export function createHostPage(
  hostname: string = globalThis.location?.hostname ?? "",
): HostPage {
  if (isRideWithGpsHost(hostname)) {
    return new RideWithGpsHostPage();
  }
  return new StravaHostPage();
}
