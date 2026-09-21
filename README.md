# Pancake Live Sales Monitor v1.2.8

Database-free Pancake POS live sales monitor for Vercel.

## v1.2.8: verified complete snapshot only

This release prioritizes correctness over showing a partial number.

- A total is published only when every selected Shop ID returns a valid Pancake analytics result.
- If any shop fails, times out, or lacks permission, the API returns `complete:false` and the dashboard keeps the last verified total.
- Positive/negative animations happen only between two complete snapshots for the same shop set and Bangkok date.
- The money parser is fail-closed: it accepts Pancake `price` / `price_data` only. It no longer guesses among `revenue`, `total_price`, `amount`, or other fields.
- Historical values follow the same all-shops-complete rule.
- Live checks happen every second in the browser, while verified source snapshots are aligned to a 5-second server window to reduce request pressure and make devices compare the same time window more closely.

## Pancake source

```text
GET https://pos.pages.fm/api/v1/shops/{SHOP_ID}/analytics/sale
```

Today uses Bangkok 00:00 as `since` and the current fixed snapshot cutoff as `until`.
Historical data uses `split_by[]=Time.day`.

The legacy `/orders/statistics` route is not used for sales totals.

## Status meanings

- `LIVE`: every selected store is present in the current verified snapshot.
- `HOLD`: one or more stores are incomplete. The displayed total stays at the last verified value and no +/- animation occurs.
- `UNCONFIGURED`: no Pancake connection is configured.

## Tests

```bash
npm test
```

The self-test verifies that partial shop data can never become the displayed total and that generic money fields are rejected.
