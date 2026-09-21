# Pancake Live Sales Monitor v1.2.7

Database-free live Pancake POS sales monitor for Vercel and multiple devices.

## v1.2.7 — Employee Statistic / analytics endpoint fix

The live report now reads Pancake's sales analytics endpoint:

```text
GET /shops/{SHOP_ID}/analytics/sale
```

The request uses Bangkok-day `since` / `until` values. Historical cards use:

```text
split_by[]=Time.day
```

The old `/orders/statistics` route is no longer used. On affected Pancake accounts that route was interpreted like an order-detail path and could return an Order permission message even with HTTP 200.

For installations with many shops, the dashboard uses rolling batches instead of trying to query every shop inside one serverless invocation. The default live batch is 8 shops; the screen commits a new total only after a full shop cycle completes. This avoids Vercel timeouts and prevents partial batches from creating fake increase/decrease animations.

## Login

For production on Vercel set:

```text
APP_USER=Owner
APP_PASSWORD=<your password>
APP_SECRET=<long random secret>
```

## Shared Pancake configuration

In **Vercel → Project → Settings → Environment Variables**:

```text
PANCAKE_POS_API_KEY_1=<your Pancake POS API key>
PANCAKE_LABEL_1=Main Account
PANCAKE_SHOP_IDS_1=ALL
```

`ALL` automatically discovers every shop visible to that key. Or specify IDs:

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

A Shop ID present under more than one API key is counted once.

### Money unit

The captured Pancake sales metric used by this project is converted with a divisor of `100` by default. If your account returns whole currency units instead, set:

```text
PANCAKE_MONEY_DIVISOR=1
```

Normally leave it unset.

## Dashboard behavior

- Browser requests one live batch every second.
- Default live batch: 8 shops (server clamps requests to 12 max).
- A total is displayed as a completed snapshot only after all selected shops have been visited in the cycle.
- Historical 4-day data is loaded separately in batches and merged with today's live total.
- Last complete good total remains on screen during temporary API errors.
- Failed shops are shown as `DEGRADED` instead of silently replacing the total with zero.
- No database / Supabase / Firebase is required.

## Safe diagnostics

While logged in, open:

```text
/api/diagnostics
```

It probes a small sample of configured shops and reports the analytics response shape and parsed revenue/order values. API keys are not returned.

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

## Pancake endpoints used

```text
GET https://pos.pages.fm/api/v1/shops?api_key=...
GET https://pos.pages.fm/api/v1/shops/{SHOP_ID}/analytics/sale?api_key=...&since=...&until=...
GET https://pos.pages.fm/api/v1/shops/{SHOP_ID}/analytics/sale?api_key=...&since=...&until=...&split_by[]=Time.day
```

## Verification

Run:

```bash
npm test
```

The test suite checks syntax, authentication/config masking, captured sales parsing, analytics response parsing, rolling multi-shop batches, correct `/analytics/sale` URLs, `since`/`until`, daily `split_by[]`, and verifies that `/orders/statistics` is never called.
