# Pancake Live Sales Monitor v1.2.2

Database-free live Pancake POS sales monitor designed for Vercel and multiple devices.

## v1.2.2 — Live sales summary fix

The live amount now reads Pancake's real statistics response directly from `response.summary.price`. Pancake returns money in satang, so the app converts it using `summary.price / 100`. The order count uses `summary.order_count`.

The current-day request is separate from historical cards. Previous-day history is cached for 5 minutes so the small 5-day view does not need to be recalculated every second. If historical parsing fails, it does not replace a valid current total with zero and does not trigger a fake cancellation animation.

## v1.2 — Shared multi-device mode

This version supports two configuration modes:

1. **Shared Vercel Environment mode (recommended)** — Pancake API credentials live in Vercel Environment Variables. Every phone/computer that logs in sees the same live sales configuration.
2. **Browser cookie mode** — useful for local testing only. Settings apply only to that browser.

If any `PANCAKE_POS_API_KEY_*` variable is present, Shared mode automatically takes priority.

## Login

The build contains the Owner login requested for first run. For an internet-facing deployment, set your own values in Vercel:

```text
APP_USER=Owner
APP_PASSWORD=<your password>
APP_SECRET=<long random secret>
```

## Shared Pancake configuration on Vercel

In **Vercel → Project → Settings → Environment Variables**, set:

```text
PANCAKE_POS_API_KEY_1=<your Pancake POS API key>
PANCAKE_LABEL_1=Main Account
PANCAKE_SHOP_IDS_1=ALL
```

`ALL` means the server automatically discovers every store available to the API key. Store discovery is cached in warm serverless instances to avoid rediscovering on every request.

If you want only specific stores:

```text
PANCAKE_SHOP_IDS_1=12345,67890,99887
```

Up to three API keys are supported:

```text
PANCAKE_POS_API_KEY_2=...
PANCAKE_LABEL_2=Second Account
PANCAKE_SHOP_IDS_2=ALL

PANCAKE_POS_API_KEY_3=...
PANCAKE_LABEL_3=Third Account
PANCAKE_SHOP_IDS_3=ALL
```

A shop visible under more than one API key is counted only once by Shop ID.

## Run locally

Requires Node.js 20+.

```bash
npm i
npm test
npm run dev
```

Open:

```text
http://localhost:3000
```

For local shared-env testing, set the variables before starting the server or copy `.env.example` into your own environment loader/workflow. This project intentionally has no database.

## Settings page

Open:

```text
/settings
```

When Shared Vercel mode is active, the page becomes read-only for credentials and clearly displays **Shared Vercel Configuration**. You can still run `Test & Load Stores` against the shared key.

To change the shared API key or store selection, edit Vercel Environment Variables and redeploy.

When Shared mode is not configured, `/settings` falls back to the original encrypted HttpOnly browser-cookie mode for local testing.

## Live dashboard

- polls `/api/sales` every 1 second using single-flight polling
- 5-day sales display
- positive sales animation
- cancellation / negative sales animation
- seasonal animated backgrounds
- iOS Liquid Glass UI
- no database / Supabase / Firebase

If Pancake temporarily fails, the dashboard keeps the last known good total instead of turning an API failure into a fake cancellation animation.

## Vercel deployment

1. Upload/import the project to Vercel.
2. Add the Environment Variables shown above.
3. Deploy/redeploy.
4. Open the Vercel URL on any device.
5. Sign in with the same Owner account.
6. All devices use the same Pancake API/shop configuration.

No local SQLite/database is required.

## Security

Do not commit real Pancake API keys or production passwords to a public Git repository. Use Vercel Environment Variables.

Change `APP_SECRET` to a long random value before public deployment. Changing it invalidates existing login cookies, which is expected.

## Pancake API endpoints used

```text
GET https://pos.pages.fm/api/v1/shops?api_key=...
GET https://pos.pages.fm/api/v1/shops/{SHOP_ID}/orders/statistics?api_key=...&start_date=...&end_date=...

Live total: `response.summary.price / 100`

Live orders: `response.summary.order_count`

Historical requests may also use `group_by=date`, with exact single-day summary fallback.
```

## Tests

```bash
npm test
```
