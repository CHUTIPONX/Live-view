# Pancake Live Sales Monitor v1.7.0

Live Pancake POS sales dashboard with verified complete snapshots, per-order price animation, shared multi-account configuration, hardened server-side security, and a lightweight animated world-scene background.

## v1.7.0 visual system

The dashboard no longer uses background videos. It renders 24 vector/CSS living scenes and changes scene every 60 seconds. Locations and climates include Japan, Thailand, Indonesia, Switzerland, Italy, France, Norway, Iceland, USA, Canada, Caribbean, Patagonia, Amazon, Sahara, Serengeti, Cape Town, Dubai, Sydney, New Zealand and Lapland.

People, animals, weather and objects react to the scene: hot scenes can show a resting person, panting dog and drinking cow; rainy scenes use umbrellas and sheltering animals; winter scenes add coats, curled animals, snow and chimney smoke; coast scenes use boats and gulls; savanna/desert scenes animate wildlife and dust.

See `SCENE-PLAN-v1.7.0.txt` for the full scene list.

## Sales truth rules

- Live total comes from Pancake Employee Statistic `/analytics/sale`.
- The dashboard commits a total only after a complete shop snapshot.
- Incomplete/timeout results never become a fake decrease.
- Individual price popups are shown only when real orders reconcile exactly to the Employee Statistic delta.
- Multiple verified prices can appear together, then fly into the main score one by one.
- The main score counts quickly while far from the target and slows down for the final digits.

## Deploy

Extract the ZIP and upload the contents of the project folder to the GitHub repository root. Wait for Vercel to become Ready, then hard-refresh the dashboard.

Keep `APP_SECRET` and Pancake credentials private. If shared runtime account editing is enabled, follow `VERCEL-SETUP.txt` for the Vercel Blob configuration.
