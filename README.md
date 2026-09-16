# CycleScout

Chrome Manifest V3 extension: street-level preview for cycling routes. A view-only **Pano Window** on the **Route Builder** (Strava at `https://www.strava.com/maps/*`, Ride with GPS at `https://ridewithgps.com/routes/new` and route edit URLs). Settings live in the **Extension Popup**. Domain language: [`CONTEXT.md`](CONTEXT.md). Design decisions: [`docs/adr/`](docs/adr/).

## Status

Riders generate a **Maps Key** in their own Google Cloud project and paste it in the Extension Popup. Store and Dev are the same experience. Access Service is not part of this product (ADR 0007).

## Setup

Riders create a **Maps Key** in their own billable Google Cloud project and paste it in the **Extension Popup**. Follow [Set up a Google Maps API key](docs/maps-key.md). Google Maps cost is billed to your Google Cloud account. This extension does not mint, share, or rate-limit a key.

```bash
npm install
npm run build
npm test
```

## Sideload (Chrome)

1. `npm run build`
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked**
3. Select the `dist/` folder
4. Paste your Maps Key in the Extension Popup
5. Open a **Route Builder**: Strava `https://www.strava.com/maps/*`, or Ride with GPS `https://ridewithgps.com/routes/new` (or `/routes/:id/edit`)
6. Click the map to set an **Anchor Point** and load Street View

Content script matching is those Route Builder URL patterns; elsewhere the extension does not inject / is a silent no-op. Ride with GPS route *view* pages (`/routes/:id` without `/edit`) are not Route Builder.

## Layout

| Path | Role |
|------|------|
| `src/core/` | Extension application core (Anchor Point, Pano lifecycle, Coverage Gap) |
| `src/ports/` | Host Page, Street View surface, Settings |
| `src/adapters/` | Strava and Ride with GPS Host Pages, Maps JS surface (isolated-world RPC), chrome.storage |
| `src/extension/` | Content script, popup; **page-world** injectables (`maps-page-bridge`, `host-mre-bridge`, `host-maplibre-bridge`) that cannot use `chrome.*` |
| `tests/` | Seam tests with fakes (no Host DOM / Maps SDK internals); unit tests OK for pure helpers |
| `scripts/build.mjs` | esbuild; one artifact for Store and Dev |

## Popup

- **Set Anchor with** Left click / Right click / Scroll wheel (default Right; persisted)
- **Maps Key** field plus generate steps, with a link to [Set up a Google Maps API key](docs/maps-key.md)

## Notes

- Non–Route Builder pages: silent no-op (no Pano, no listeners, no toasts).
- **Coverage Gap**: keeps last successful Pano + “No Street View at this point”; never blanks or auto-snaps.
- Maps Key is stored in `chrome.storage.local` for this browser profile.
