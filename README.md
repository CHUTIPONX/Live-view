# Pancake Live Sales Monitor v1.6.2

## WORLD TRAVEL Scenic Expansion

v1.6.2 keeps the verified Pancake sales logic, sequential per-order animation, multi-account setup and v1.6.1 security hardening unchanged.

The visual background playlist is expanded from 100 to **200 unique Pexels videos**.

### New WORLD TRAVEL collection
100 additional destination/travel clips were added, including:
- Switzerland / Swiss Alps
- Amalfi Coast
- Venice
- Iceland
- Cappadocia
- Paris
- Shanghai
- Singapore
- Dubai
- New York
- Patagonia
- Kyoto
- Rome
- Sydney
- Hong Kong
- Bali
- Phuket
- Bangkok
- Maldives
- Barcelona
- Santorini
- London
- Tokyo
- New Zealand
- Banff
- Norway

The collection mixes bright daytime travel, blue-water destinations, mountain scenery, iconic landmarks, sunrise, golden hour, sunset and city-night views.

### Playback behavior
- 200 unique videos total
- Full clip playback — the clip changes only when the current video ends
- Fisher-Yates shuffle
- No repeat until the current 200-video cycle is exhausted
- Two video elements only: current + one preloaded next clip
- 1.8 second crossfade
- Failed remote clips are skipped instead of producing a black screen
- No artificial CSS zoom (`transform:none`)
- Video background remains nearly unblurred

### Security preserved
v1.6.1 server-side CSRF / same-origin / CSP / secure-cookie protections and the visible Inspect warning remain unchanged.

### Sales logic preserved
No change to:
- Employee Statistic `summary.price / 100`
- complete-snapshot-only totals
- zero-sale shop handling
- account add/remove
- shop deduplication
- verified individual-order popup animation
- scoreboard count-up / count-down display

### Run tests
```bash
npm test
```
