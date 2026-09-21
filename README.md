# Pancake Live Sales Monitor v1.5.1

Dashboard ยอดขายจาก Pancake POS Employee Statistic โดยยึด `summary.price / 100` เป็นยอดรวมจริงเท่านั้น

## v1.5.1 — เด้งยอดทีละออเดอร์จริง

- ยอดรวมหลักยังมาจาก `GET /shops/{SHOP_ID}/analytics/sale` เท่านั้น
- เมื่อ Complete Snapshot ใหม่มียอดและจำนวนออเดอร์เพิ่ม ระบบจะตรวจร้านที่เปลี่ยน แล้วเรียก `GET /shops/{SHOP_ID}/orders` เฉพาะช่วงระหว่าง Snapshot
- ใช้ `total_price / 100` ของออเดอร์จริงเพื่อทำ animation ทีละบิล เช่น `+199`, `+199` แทนการเด้ง `+398` ก้อนเดียว
- ก่อนเล่น animation ระบบ reconcile ทั้งจำนวนออเดอร์และยอดเงิน **รายร้าน** และ **ยอดรวม** ให้ตรงกับ Employee Statistic 100%
- ถ้า order list ไม่ครบ, timeout, มีการแก้/ยกเลิกปน, หรือผลรวมไม่ตรง ระบบจะ **ไม่หารเฉลี่ยและไม่เดา**; จะอัปเดตยอดรวมจาก Employee Statistic โดยไม่สร้าง popup รายบิลปลอม
- ลบ/ยกเลิกยังแสดง delta จาก Complete Employee Statistic ได้ แต่จะไม่ปลอมเป็นออเดอร์ใหม่

## ความถูกต้อง

1. Complete Snapshot ทุก shop ก่อนเปลี่ยนยอด
2. ร้านไม่มีขาย (`success:true`, `data:[]`, `summary:{}`) = ฿0
3. timeout/permission ไม่ถูกนับเป็น ฿0
4. Shop ID ซ้ำข้าม Account นับครั้งเดียว
5. Per-order animation เป็นชั้นแสดงผลเท่านั้น ไม่สามารถเปลี่ยนยอดจริงได้

## API ที่ใช้

- `/analytics/sale` — authoritative total
- `/orders` — animation evidence only, filter ด้วย `inserted_at` ระหว่าง Snapshot

## Deploy

แตก ZIP แล้วอัปไฟล์ด้านในทั้งหมดไปที่ root ของ GitHub repo จากนั้นรอ Vercel Ready และ hard refresh (`Ctrl+Shift+R`).
