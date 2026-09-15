# CycleScout

A Chrome extension that shows street-level context beside a Route Builder so the rider can see the road while drawing a cycling route. Settings live in the Extension Popup; the Pano Window is an in-page overlay on the Route Builder only (torn down when leaving that page; size/position remembered). Imagery uses the official Google Maps JavaScript API. The Pano is view-only: it never edits the route.

The rider generates a Maps Key in their own Google Cloud project and pastes it in the Extension Popup. The project does not mint, share, or rate-limit a key. Google Maps cost is billed to the rider’s Google Cloud account.

## Language

**Route Builder**:
Strava’s map page for creating or editing a route (plotting the path before saving), at `https://www.strava.com/maps/*`.
_Avoid_: activity page, segment explorer, heatmap, treating `/routes/new` as the product URL

**Pano Window**:
A draggable, resizable floating overlay on the Route Builder that shows a Google Street View panorama. Closed from the overlay or when leaving the Route Builder; position and size are remembered across visits.
_Avoid_: separate Chrome window, side panel, replacing Strava’s map, full-tab navigate-away, surviving on other Strava pages

**Pano**:
The street-level 360° Street View image shown in the Pano Window for the current Anchor Point. View-only — looking around does not change the route.
_Avoid_: basemap, satellite, Google Maps (as the whole product)

**Anchor Point**:
The map location that determines which Pano is shown. Updated by Map Click. A peg on the Route Builder map marks the Pano currently shown (stays on the last successful Pano during a Coverage Gap).
_Avoid_: waypoint, GPS fix

**Map Click**:
A click on the Route Builder map that sets the Anchor Point. The rider chooses Left or Right in the Extension Popup (default Right). Only the chosen button moves the Anchor; the other does not. Left click still places/extends the route on Strava when Strava handles it.
_Avoid_: map hover-follow, Tip Follow, always tracking the route tip

**Map Click Button**:
The Extension Popup choice of which mouse button performs Map Click: `left` or `right` (default `right`).
_Avoid_: Tip Follow toggle, modifier-key chords

**Extension Popup**:
The UI opened from the extension’s Chrome toolbar icon. Holds Map Click Button (Left / Right) and the Maps Key field, plus a pointer to generate a key in Google Cloud.
_Avoid_: in-page settings panel, Connect with Google, account row, Access Service login

**Coverage Gap**:
An Anchor Point with no Street View imagery. The Pano Window keeps showing the last successful Pano and tells the rider there is no Street View at this point; the surface should still look alive and working. The notice clears when a covered Anchor Point succeeds. “Covered” means imagery within a short search of the Anchor, shown as that resolved Pano — not a long pull to the nearest street. Before any successful Pano, a gap may show an empty viewport plus the notice.
_Avoid_: blanking a prior successful Pano, auto-snap to distant nearest imagery, treating a loose nearby hit then re-applying the raw click coordinate

**Maps Key**:
The rider’s Google Maps JavaScript API key, created in their Google Cloud project and stored from the Extension Popup. Street View loads with this key. Google’s own Cloud billing and quotas apply on their project; this product does not cap usage.
_Avoid_: Grant, Mint, Dev Key Override, project-owned key, Access Service credential, Quota
