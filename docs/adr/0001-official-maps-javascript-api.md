# Use the official Google Maps JavaScript API for Street View

We need Street View panoramas tied to Anchor Points on Strava’s Route Builder. Embed/iframe shortcuts are simpler to stand up but are weaker to control and easier to break. We use the official Maps JavaScript API so Street View is ToS-clean and scriptable. Billing is the rider’s Google Cloud account via their Maps Key (ADR 0007), not a project-owned Access Service.
