# Pancake Live Sales Monitor v1.6.4

## JAPAN ONLY · Smooth Score Edition

v1.6.4 keeps the verified Pancake sales logic, multi-account support, Japan-only video playlist and server-side security unchanged. This release focuses on presentation.

### Sale animation
- Multiple verified order prices from the same refresh can appear on screen together.
- Each verified price flies into the main total instead of replacing the previous popup.
- The main sales score begins counting during the impact.
- Counting moves quickly while far from the target, then finishes the final numbers one-by-one with progressively slower timing.
- If per-order reconciliation is unavailable, the UI shows only the exact verified aggregate delta; it never invents an order split.
- Final displayed value always snaps to the complete Employee Statistic snapshot.

### Typography / security screen
- Dashboard font: Manrope + IBM Plex Sans Thai + Noto Sans JP.
- Inspect warning redesigned with lighter Thai typography, cleaner spacing and a compact Japanese security motif.
- Google Fonts are explicitly allowed by CSP; all existing CSRF, same-origin and server secret protections remain active.

### Background
- 100 Japan-only scenic videos.
- Full-clip playback, crossfade, no forced timer rotation and no artificial zoom.

### Install
Upload the contents of this folder to the repository root and redeploy on Vercel.
