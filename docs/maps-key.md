# Set up a Maps Key

CycleScout shows Street View with **your** Google Maps JavaScript API key (the **Maps Key**). Google bills that usage to **your** Cloud account. CycleScout does not mint, share, or rate-limit a key.

You need a Google Cloud **project with billing enabled**. Use Google Maps Platform **pay-as-you-go** (not a Maps subscription plan). Google requires a payment method even if you stay inside the monthly free usage for Street View.

Official Google docs: [Get started with Maps Platform](https://developers.google.com/maps/get-started), [Set up the Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/get-api-key), and [Pay-as-you-go billing](https://developers.google.com/maps/billing-and-pricing/pay-as-you-go).

## 1. Create a Google Cloud project

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and sign in.
2. In the project picker at the top, choose **New Project**.
3. Name it something you will recognize (for example `CycleScout`).
4. Click **Create**, then select that project in the picker so the rest of these steps apply to it.

Do not reuse an unrelated work project if you can avoid it. A dedicated project makes billing and key restrictions easier to keep tight.

## 2. Enable pay-as-you-go billing on that project

Maps JavaScript API keys do not work on a project with no billing account, even for “free” usage. CycleScout should use Maps Platform **pay-as-you-go**: you are charged per billable event after each SKU’s monthly free cap, with no upfront fees or termination charges. Skip Maps **subscription** plans unless you already know you need a fixed monthly bundle.

How it is billed: [Pay-as-you-go](https://developers.google.com/maps/billing-and-pricing/pay-as-you-go). SKU prices and free caps: [Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing).

1. Open [Billing](https://console.cloud.google.com/billing) (or **Billing** in the console menu).
2. If you have no billing account, create a self-serve (online) account and add a payment method. Google’s steps: [Create a Cloud Billing account](https://docs.cloud.google.com/billing/docs/how-to/create-billing-account).
3. **Link** that billing account to the CycleScout project.

Google Cloud may offer a time-limited trial credit for new accounts. Pay-as-you-go still includes **per-SKU monthly free usage** that resets each month.

CycleScout loads an interactive Street View panorama (`StreetViewPanorama`). That is the **Dynamic Street View** SKU, not Static Street View or a map embed.

## 3. Cap what you might spend (recommended)

A payment method is required; a budget is how you get warned before a surprise bill.

1. Open [Budgets & alerts](https://console.cloud.google.com/billing/budgets) for the linked billing account.
2. Create a budget for this project (for example a few dollars a month).
3. Turn on email alerts at 50%, 90%, and 100%.

Optional extra cap: in Google Cloud, open **Maps JavaScript API** and set a daily request limit you are comfortable with.

## 4. Enable only the Maps JavaScript API

1. Open the [Maps API library](https://console.cloud.google.com/google/maps-apis/api-list) (or **APIs & Services → Library** and search for Maps).
2. Open **Maps JavaScript API**.
3. Click **Enable** (or **Manage** if it is already on).

You do **not** need Places, Directions, Geocoding, Street View Static, or Embed for CycleScout. Enabling extra APIs only widens what a stolen key could spend.

## 5. Create a Maps Key

1. Open [Credentials](https://console.cloud.google.com/google/maps-apis/credentials) (**Google Maps Platform → Credentials**, or **APIs & Services → Credentials**).
2. **Create credentials → API key**.
3. Copy the key. You will paste it into the CycleScout **Extension Popup**.

Treat the key like a password. Anyone with it can bill your project until you restrict or rotate it.

## 6. Restrict the key

Restrictions take a few minutes to apply. Edit the key from the Credentials list:

**Application restrictions**

1. Choose **Websites** (HTTP referrers).
2. Add these referrers (Maps JS loads on the Route Builder page, not as `chrome-extension://`):

   - `https://www.strava.com/*`
   - `https://ridewithgps.com/*`
   - `https://www.ridewithgps.com/*`

**API restrictions**

1. Choose **Restrict key**.
2. Allow only **Maps JavaScript API**.
3. Save.

## 7. Paste the key in CycleScout

1. Click the CycleScout icon in the Chrome toolbar to open the **Extension Popup**.
2. Paste the key into **Maps Key**.
3. Open a **Route Builder** (Strava `https://www.strava.com/maps/*`, or Ride with GPS `https://ridewithgps.com/routes/new` / a route **edit** URL).
4. Use your chosen Map Click Button to set an **Anchor Point**. Street View should load in the Pano Window.

The key stays in `chrome.storage.local` on this browser profile. CycleScout has no backend and does not upload the key.

## If Street View does not load

- Confirm the Cloud project in the picker is the one with billing, the API, and this key.
- Confirm **Maps JavaScript API** is enabled (not only “Maps SDK for Android/iOS”).
- Confirm billing is **linked** to that same project and the payment method is valid.
- Confirm referrers match the host you are on (`strava.com` vs `ridewithgps.com`).
- After changing restrictions, wait a few minutes or try an incognito window with the extension allowed.
- In Google Cloud, check **APIs & Services → Credentials** (key status) and **Billing → Reports** for errors or blocked requests.

If Google shows “This page can't load Google Maps correctly”, the usual causes are billing not enabled, the API not enabled, or a referrer/API restriction that does not match CycleScout.

## Rotate or remove the key

In Google Cloud Credentials you can **regenerate** or delete the key, then paste the new value in the Extension Popup (or clear the field). Uninstalling CycleScout removes the copy stored in Chrome.
