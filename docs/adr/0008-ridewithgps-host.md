# Ride with GPS is a second Host

ADR 0005 deferred extra hosts until Map Click and the Pano Window were proven on Strava. Ride with GPS Route Planner (`/routes/new` and `/routes/:id/edit`) is that additive Host: a second Host Page adapter behind the existing port, with a MapLibre page-world bridge instead of Strava’s MRE bridge. Route view pages stay a silent no-op. Maps JS still loads on the Host page, so the rider’s Maps Key HTTP referrer allowlist must include Ride with GPS as well as Strava.
