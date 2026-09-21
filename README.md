# Pancake Live Sales Monitor v1.6.0

## 100 Scenic Views · Full Clip Playback

รุ่นนี้เปลี่ยนระบบพื้นหลังจากการตัดคลิปตามเวลา เป็น playlist วิว 100 คลิปที่เล่นจนจบจริงก่อนเปลี่ยนคลิปถัดไป

### Scenic behavior
- 100 unique Pexels scenic videos
- Full-clip playback: เปลี่ยนเมื่อ `ended` เท่านั้น
- Shuffle แบบไม่ซ้ำภายในรอบ 100 คลิป
- ครบ 100 คลิปแล้วค่อย shuffle รอบใหม่
- ไม่ให้คลิปแรกของรอบใหม่ซ้ำคลิปสุดท้ายของรอบก่อนทันที
- Preload แค่คลิปถัดไป 1 คลิป ไม่โหลด 100 คลิปพร้อมกัน
- 2-layer crossfade ประมาณ 1.8 วินาที
- ถ้าคลิป remote โหลดไม่ได้ จะข้ามคลิปนั้นโดยไม่ทำพื้นหลังดำ
- ไม่มี CSS zoom เพิ่ม (`transform:none`) และไม่ blur ตัววิดีโอ

### View mix
Morning / Sunrise / Forest light / River / Lake / Mountain / Tropical beach / Island / Waterfall / Golden hour / Sunset / Twilight / Night city / Winter / Clouds

### Sales system
ระบบยอดขายยังเหมือนเดิม: Employee Statistic `summary.price / 100`, complete snapshot only, HOLD เมื่อข้อมูลไม่ครบ, verified per-order popup, scoreboard counter, unlimited account config via supported Vercel setup.

### Files
- `public/scenic-videos.js` — manifest 100 videos
- `public/app.js` — full-clip playlist controller
- `public/index.html` — video elements without `loop`
- `VIDEO-SOURCES.txt` — list of all 100 Pexels video IDs/streams

Run tests:
```bash
npm test
```
