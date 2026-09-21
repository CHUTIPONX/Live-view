# Pancake Live Sales Monitor v1.3.1

This build uses the same Pancake sales analytics family as **ยอดขาย → Employee Statistic** and fixes Vercel `FUNCTION_INVOCATION_TIMEOUT` by removing the all-shops-in-one-function design.

## v1.3.1 — timeout-safe complete snapshots

The dashboard now works in two stages:

1. `GET /api/report-plan?kind=live` creates a signed snapshot plan and freezes one Bangkok-time cutoff.
2. `POST /api/report-batch` fetches only 6 shops per Vercel invocation.

The browser runs up to 3 small batches in parallel, accumulates them locally, and publishes a new total only after every configured shop in the signed plan has succeeded.

This means a deployment with dozens of shops no longer requires one `/api/sales` invocation to remain alive until all shops finish.

## Authoritative live metric

Each shop uses:

```text
GET /shops/{SHOP_ID}/analytics/sale
split_by[]=User.id
since=<Bangkok day 00:00:00>
until=<one fixed snapshot cutoff>

TOTAL SALES = response.summary.price / 100
ORDERS      = response.summary.order_count
PRODUCTS    = response.summary.product_count
```

The live total never sums `data[].result.price`. Pancake's top-level `summary.price` is the source of truth.

## Fixed cutoff

Every batch in one snapshot uses the same `since` and `until`. If a 51-shop cycle takes several seconds, shop 1 and shop 51 are still queried for the same reporting window rather than different moments in time.

## No fake +/-

- 51/51 valid shops: publish the new total.
- 50/51 valid shops: `HOLD`; keep the last verified total.
- Timeout / HTTP failure / permission error: never replace a shop with zero.
- +/- is calculated only between complete snapshots for the same shop set and Bangkok date.

## Historical cards

History uses the same batch architecture with:

```text
split_by[]=Time.day
split_by[]=User.id
```

Historical totals are also published only after every selected shop succeeds.

## Money units

Captured Employee Statistic responses use 1/100-baht raw units:

```text
summary.price        75300 -> 753.00 THB
summary.shipping_fee 18200 -> 182.00 THB
summary.cod          93500 -> 935.00 THB
```

The divisor is fixed at `100` in code.

## Verify

```bash
npm test
```

The self-test includes a 13-shop batched live snapshot, timeout-and-retry recovery, fixed-cutoff verification, and batched history.
