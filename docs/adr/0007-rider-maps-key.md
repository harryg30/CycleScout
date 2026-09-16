# Rider owns the Maps Key; no Access Service

Store and Personal were going to share a project-owned Maps key behind Access Service metering (ADR 0002). That fights the actual product we want: a Chrome extension that shows Street View, with Google’s bill on the rider. Riders generate a Maps Key in their own Google Cloud project and paste it in the Extension Popup. There is no Access Service, no product Quota, no Membership, and no Dev Key Override. Store and Dev are the same experience. One build.

Google’s own Cloud billing and quotas still apply on the rider’s project. HTTP referrer restriction for the key must cover every Route Builder origin where Maps JS loads (`https://www.strava.com/*`, `https://ridewithgps.com/*`, `https://www.ridewithgps.com/*`), not `chrome-extension://`.

## Status

accepted

## Considered Options

- **Access Service mints a project key** (ADR 0002): we pay, we meter, we run OAuth. Rejected — we will not provide a key.
- **`.env` bake at build time** (Dev Key Override): works for the author only; a Store install cannot rebuild. Rejected so Store and Dev stay one path.
- **Rider Maps Key in the Extension Popup**: chosen.

This supersedes [ADR 0002](0002-access-service-credentials.md). ADR 0001 still stands for using the official Maps JavaScript API; billing is the rider’s Google Cloud account, not the project’s.
