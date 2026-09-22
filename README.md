# Pancake Live Sales Monitor v1.8.0

Live Pancake POS sales dashboard with complete verified Employee Statistic snapshots, real per-order animation, multi-account configuration, page connection checks, hardened server-side security and minute-rotating seasonal atmospheres.


## v1.8.0 — POS Shop vs Facebook Page split + Sales Metric Audit

The Settings screen now separates two different Pancake concepts that were previously easy to confuse:

- **POS Shop Access Check** counts unique Shop IDs returned by the POS `/shops` API. Adding another POS API key can contribute `+0 unique` when it exposes only Shop IDs already visible through another account.
- **Facebook Page Discovery** uses Pancake **User Access Token(s)** against `/api/v1/pages`, filters unusable entries, and de-duplicates by Facebook Page ID. This count is intentionally separate from the POS Shop count and is not added into sales totals.

For the current 52-Shop case, Settings now makes the overlap visible instead of calling those 52 items “Facebook Pages”. To reproduce the old project's Facebook Page count, configure the same Pancake User Access Token(s) in Vercel with `PANCAKE_USER_ACCESS_TOKEN`, `_2`, `_3`, etc.

A new **Sales Metric Audit** card also inspects sample Employee Statistic responses. The authoritative dashboard total remains `summary.price / 100`; the audit exposes discount/coupon/voucher/net-like fields returned by Pancake so the formula can be verified from real payloads before changing it. The monitor does **not** blindly subtract `total_discount` again, avoiding double-discounting when Pancake's summary is already net.

## v1.7.9 — Hit-Synchronized Live Orders

Latest 5 is now tied to the same real order evidence used around each sales hit. When an individual verified order such as `+199` drops over the main score, that exact order is pinned to the top of the feed on the same animation beat. When only the aggregate Employee Statistic delta is safe to animate, real `/orders` rows found for the changed shops refresh the feed at that same moment without being used to split or alter the total.

Each card shows only the requested operational fields: **page/shop name, product name, product code, and real order price**. Product names are preserved from Pancake order item metadata instead of being discarded by the browser normalizer. Shop/page names are carried from Pancake shop discovery in the signed report plan and are also lazily resolved for manually configured Shop IDs when needed.

The display feed uses a small 20-second lookback because Pancake Employee Statistic and `/orders` can expose the same sale a few seconds apart. This lookback is display-only; strict individual `+199 / +99` animations still require exact snapshot-interval reconciliation. The authoritative total remains `summary.price / 100`.


## v1.7.5 — All Page Connection List

Settings → **Check All Shops** now lists **every unique POS Shop ID that the configured Pancake API accounts actually return**, not only the failed pages. The list updates while checks are running and shows:

- POS shop name
- Shop ID
- Pancake API Account label(s) that know the shop
- `CONNECTED`, `NEEDS ATTENTION`, `CHECKING`, or `NOT CHECKED`
- per-account failure reason when access fails
- search by page name / Shop ID / API Account
- filters for **ทั้งหมด / ต่อได้ / มีปัญหา**

The list is deduplicated by Shop ID when the same shop exists under multiple API accounts. Failed POS Shops are sorted first so permission problems are easy to spot.

**Important:** the monitor cannot invent or discover a page that Pancake never returns to any configured API key. If `/shops` returns 52 unique Shop IDs, this checker reports 52 POS Shops even when Pancake Chat contains more Facebook Pages. Use the separate Facebook Page Discovery card for actual Page IDs. Previously remembered Shop IDs are retained in the browser and can still be re-tested if they disappear from the newest `/shops` response.

## v1.7.4 — Verified Live Order Feed

The dashboard now keeps the **latest 5 individually verified real orders** beside the main sales score. Each feed row can show:

- verified order amount
- shop name + Shop ID
- Pancake API account used for that shop
- order code
- product name
- product code / SKU / barcode when Pancake returns it
- product ID / variation ID as a fallback
- quantity
- order time

Only events that already passed the existing reconciliation rules are inserted into the feed. The feed never creates orders from an aggregate delta and never becomes the source of the main total.

Product metadata is normalized only from fields actually returned in the Pancake order object (`items`, `variation_info`, product/variation IDs, etc.). If the order endpoint does not return a product name/code, the UI says that product metadata is unavailable instead of inventing one.

## API account identity

Settings now shows **PANCAKE ACCOUNT** under each configured key. If the `/shops` response exposes an account/user/owner display name, that name is shown. If Pancake does not expose one, the dashboard uses the configured API label so the order can still be traced to the correct credential. No account identity is guessed.

## Existing visual behavior

- Green positive order amount: text only, falling onto the right-most digits of the main score.
- Multiple verified orders can overlap rapidly.
- Verified decreases rise from below in red.
- The scoreboard moves quickly when far from the new total and slows down near the verified target.
- Sale audio uses the existing synthesized two-stage chime.
- Seasonal atmosphere graphics rotate every 60 seconds; no people/animals/vehicles/scene props.

## Sales truth rules

- Live total comes from Pancake Employee Statistic `/analytics/sale`.
- A total is committed only after a complete configured-shop snapshot.
- Timeout/permission/incomplete shops never become a fake decrease.
- Individual orders are shown only when `/orders` event count and revenue reconcile exactly with the Employee Statistic delta.
- No average, guessed split or fabricated order amount is displayed.
- Customer name, phone and shipping address are not copied into the live-order feed.

## POS Shop Connection Check

Settings → **Check All Shops** checks known POS Shops using `/analytics/sale` and pins inaccessible shops with the reason and Shop ID.

## Deploy

Extract the ZIP and upload the **contents inside the project folder** to the GitHub repository root. Wait for Vercel to show Ready, then hard refresh (`Ctrl + Shift + R`).

Keep `APP_SECRET` and Pancake credentials private. If shared runtime account editing is enabled, follow `VERCEL-SETUP.txt` for Vercel Blob setup.



## v1.7.7 — LIVE ORDERS feed fallback fix
- When the verified Employee Statistic total increases, the app now keeps real `/orders` rows separately as `feedEvents`.
- LATEST 5 updates from those actual Pancake orders even if strict per-order sum/count reconciliation is not safe enough for individual score-hit animation.
- Feed data never changes the main total. The total remains Employee Statistic truth.
- Individual `+199 / +99` score hits still require exact reconciliation.

## v1.7.6 — Live Orders readability + timing fix
- LIVE ORDERS updates on the same frame as each verified +price hit.
- Pancake timestamps without timezone are normalized against the live snapshot, fixing the common 7-hour display/order mismatch.
- Latest 5 are sorted by normalized event time.
- Feed cards now show only: shop name, product code(s), verified order price.
- Larger Thai/Latin typography for TV/desktop viewing.
- New storage key starts a clean feed so stale v1.7.4 cards do not remain after upgrading.
