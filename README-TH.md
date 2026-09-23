# Live-view v1.9.0 — 100 WORLDS

แพตช์นี้ทำตามชุดที่ขอทั้งหมด:
- 100 ฉาก
- Smart Shuffle แบบใช้ครบทั้ง 100 ฉากก่อนเริ่มรอบใหม่
- จำ 10 ฉากล่าสุด ไม่ให้วนซ้ำใกล้ ๆ
- กันหมวดเดิมติดกันเกิน 2 ครั้ง
- ฉากละ 1 นาที
- 25 Nature / 20 Cyber / 20 Space / 15 Fantasy / 10 Future-AI / 10 Abstract
- เอฟเฟกต์ procedural หลายชั้น ไม่ใช้รูปหรือวิดีโอพื้นหลังภายนอก
- เพิ่มเสียงขาย 1.85x พร้อม DynamicsCompressor ลดโอกาสเสียงแตก
- ไม่แก้สูตรยอด, Pancake API, LIVE ORDERS, discount logic

## วิธีใช้
1. แตก ZIP นี้
2. เอาไฟล์ทั้งหมดในโฟลเดอร์นี้ไปวางที่ root ของ repo `Live-view`
3. ดับเบิลคลิก `APPLY-100-WORLDS.bat`
4. ตัวสคริปต์จะ backup ไฟล์ที่แก้เป็น `*.pre-100-worlds.bak`
5. มันจะรัน `npm test` ต่อให้ทันที
6. ถ้า PASS ค่อย commit/push แล้ว redeploy Vercel

> หมายเหตุ: GitHub connector ในแชตนี้ถูก GitHub ปฏิเสธสิทธิ์ write ด้วย 403
> ดังนั้นแพตช์นี้ถูกทำเป็น self-applying package เพื่อไม่แก้ repo หลักแบบเสี่ยง ๆ
