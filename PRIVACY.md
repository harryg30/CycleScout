# CycleScout privacy policy

Last updated: 16 September 2026

CycleScout is a Chrome extension that shows a view-only Google Street View panorama on cycling Route Builder pages (Strava and Ride with GPS).

## Who we are

CycleScout is published as an open-source Chrome extension. It has no backend, no accounts, and no analytics service.

## Data we handle

All of the following stays on the rider’s computer unless noted.

1. Maps Key. The rider pastes their Google Maps JavaScript API key in the Extension Popup. It is stored in chrome.storage.local for this browser profile and used only to load Google’s Maps JavaScript API / Street View on the Route Builder.

2. Settings. Map Click Button (left, right, or scroll wheel) and Pano Window size/position are stored in chrome.storage so they persist.

3. Map click location. When the rider clicks the Route Builder map, that latitude/longitude is used as the Anchor Point and sent to Google as part of the Street View request, using the rider’s Maps Key.

CycleScout does not collect names, emails, payment information, or browsing history. It does not scrape routes or account data from Strava or Ride with GPS.

## How we use data

Only to show Street View for the Anchor Point and to remember popup/overlay settings.

## What we share

CycleScout does not send data to CycleScout servers. There are none.

Street View requests go to Google (maps.googleapis.com) with the rider’s Maps Key. Google’s handling of that traffic is governed by Google’s terms and the rider’s Google Cloud project.

We do not sell or transfer user data. We do not use data for advertising, credit, or profiling.

## Retention and deletion

Data remains in this Chrome profile until the rider clears extension storage, removes the Maps Key from the popup, or uninstalls CycleScout.

## Contact

https://github.com/harryg30/CycleScout/issues
