# Pancake Live Sales Monitor v1.7.2

Live Pancake POS sales dashboard with complete verified Employee Statistic snapshots, real per-order hit animation, shared multi-account configuration, hardened server-side security and minute-rotating seasonal atmospheres.

## v1.7.2 visual behavior

The background is atmosphere-only: no people, animals, cars, boats or decorative scene objects. Twelve global season/weather moods rotate every 60 seconds. Each season combines multiple subtle effects such as petals, leaves, rain, mist, snow, frost, aurora, stars, heat shimmer and light sparkle.

Verified positive order values are shown as **green text only**. There is no popup card or background. A value such as `+199` falls from above and lands directly over the matching right-most digits of the main total. Several verified orders can arrive rapidly and overlap there. Verified decreases rise from below in red.

The total remains a scoreboard: it moves quickly while far from the new value, then slows down and finishes the final digits one-by-one before stopping exactly on the verified Pancake total.

Sale sound uses Web Audio and has two quiet stages: a short clear entry tone, then a softer glass-like landing chime. Browsers require one user gesture before audio can start; the sound button can mute/unmute it.

## Sales truth rules

- Live total comes from Pancake Employee Statistic `/analytics/sale`.
- A total is committed only after a complete selected-shop snapshot.
- Timeout/permission/incomplete shops never become a fake decrease.
- Individual order text is shown only when `/orders` reconciliation matches the Employee Statistic delta exactly.
- No average, guessed split or fabricated order amount is displayed.
- Employee Statistic remains the final value even after all animation finishes.

## Deploy

Extract the ZIP and upload the **contents inside the project folder** to the GitHub repository root. Wait for Vercel to show Ready, then hard refresh the dashboard (`Ctrl + Shift + R`).

Keep `APP_SECRET` and Pancake credentials private. If shared runtime account editing is enabled, follow `VERCEL-SETUP.txt` for Vercel Blob setup.
