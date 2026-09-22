# Pancake Live Sales Monitor v1.7.6

Live Pancake POS sales dashboard with complete verified Employee Statistic snapshots, real per-order animation, multi-account configuration, page connection checks, hardened server-side security and minute-rotating seasonal atmospheres.

## v1.7.5 — All Page Connection List

Settings → **Check All Pages** now lists **every unique Shop ID that the configured Pancake API accounts actually return**, not only the failed pages. The list updates while checks are running and shows:

- page/shop name
- Shop ID
- Pancake API Account label(s) that know the shop
- `CONNECTED`, `NEEDS ATTENTION`, `CHECKING`, or `NOT CHECKED`
- per-account failure reason when access fails
- search by page name / Shop ID / API Account
- filters for **ทั้งหมด / ต่อได้ / มีปัญหา**

The list is deduplicated by Shop ID when the same shop exists under multiple API accounts. Failed pages are sorted first so permission problems are easy to spot.

**Important:** the monitor cannot invent or discover a page that Pancake never returns to any configured API key. If the Facebook/Pancake account really owns 100+ pages but `/shops` currently returns 52, the checker can list and test those 52; the remaining page names/Shop IDs become available only after Pancake/API permissions expose them. Previously remembered Shop IDs are retained in the browser and can still be re-tested if they disappear from the newest `/shops` response.

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

## Page Connection Check

Settings → **Check All Pages** checks known shops using `/analytics/sale` and pins inaccessible shops with the reason and Shop ID.

## Deploy

Extract the ZIP and upload the **contents inside the project folder** to the GitHub repository root. Wait for Vercel to show Ready, then hard refresh (`Ctrl + Shift + R`).

Keep `APP_SECRET` and Pancake credentials private. If shared runtime account editing is enabled, follow `VERCEL-SETUP.txt` for Vercel Blob setup.


## v1.7.6 — Live Orders readability + timing fix
- LIVE ORDERS updates on the same frame as each verified +price hit.
- Pancake timestamps without timezone are normalized against the live snapshot, fixing the common 7-hour display/order mismatch.
- Latest 5 are sorted by normalized event time.
- Feed cards now show only: shop name, product code(s), verified order price.
- Larger Thai/Latin typography for TV/desktop viewing.
- New storage key starts a clean feed so stale v1.7.4 cards do not remain after upgrading.
