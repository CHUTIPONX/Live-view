# Pancake Live Sales Monitor v1.2.9

This build uses the same Pancake sales analytics family as **ยอดขาย → Employee Statistic**.

## Authoritative live metric

The live total is intentionally fail-closed:

```text
GET /shops/{SHOP_ID}/analytics/sale
split_by[]=User.id
since=<Bangkok day 00:00:00>
until=<Bangkok day 23:59:59>

TOTAL SALES = response.summary.price / 100
ORDERS      = response.summary.order_count
PRODUCTS    = response.summary.product_count
```

The app does **not** add `data[].result.price` to produce the live total. The grouped rows are only detail rows; Pancake's top-level `summary` is the source of truth.

## No fake +/-

A new total is published only when every selected Shop ID returned a valid Employee Statistic summary. If 50/51 shops succeed, the response is `HOLD`; the dashboard keeps the previous verified 51/51 total and does not animate a decrease.

The +/- animation is allowed only between near-consecutive complete snapshots for the same shop set and Bangkok date.

## Money units

The captured Pancake response uses 1/100-baht raw units. For example:

```text
summary.price        75300 -> 753.00 THB
summary.shipping_fee 18200 -> 182.00 THB
summary.cod          93500 -> 935.00 THB
```

The divisor is fixed at `100` in code; an environment variable cannot silently change it.

## Historical cards

Previous days use `/analytics/sale` grouped by both `Time.day` and `User.id`, and a historical result is only published when all selected shops succeed.

## Verify

Run:

```bash
npm test
```

`/api/diagnostics` reports the endpoint, metric policy, raw `summary.price`, converted revenue, order count, and product count for sample shops without returning the API key.
