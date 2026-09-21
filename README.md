# Pancake Live Sales Monitor v1.4.0

รุ่นนี้ปรับ flow ยอดขายให้ยึด Pancake POS > ยอดขาย > Employee Statistic เป็น source of truth และแก้ปัญหาที่เจอจากการใช้งานจริงกับหลาย Account / 50+ ร้าน

## กฎยอดขาย

- Endpoint: `/shops/{SHOP_ID}/analytics/sale`
- Group: `split_by[]=User.id`
- ยอดขายของร้าน: `summary.price / 100`
- จำนวนออเดอร์: `summary.order_count`
- จำนวนสินค้า: `summary.product_count`
- ห้ามรวม `data[].result.price` เพื่อสร้างยอด Live เอง
- `success:true + data:[] + summary:{}` = ร้านไม่มีขายในช่วงนั้น = `0 บาท` อย่างถูกต้อง
- ถ้า response คลุมเครือ/permission error/network error จะไม่เดาเป็น 0

## Complete snapshot only

หน้า Live จะเปลี่ยนยอดก็ต่อเมื่อได้ผลครบทุก Store ที่ตั้งไว้เท่านั้น

- 52/52 = LIVE และเผยแพร่ยอดใหม่
- 51/52 = HOLD และค้างยอดที่ยืนยันแล้วรอบก่อน
- ร้าน timeout/permission error จะไม่ถูกแทนด้วย 0
- `+ / -` คำนวณเฉพาะ Complete Snapshot → Complete Snapshot เท่านั้น

## Vercel timeout protection

ระบบไม่ให้ Serverless Function ตัวเดียวรอครบทุก Store อีกแล้ว

- แบ่งครั้งละ 6 Store
- Browser เรียกพร้อมกันสูงสุด 3 batch
- แต่ละ Store มี timeout + retry ของตัวเอง
- Batch request มี client retry เพิ่มอีก 1 รอบ
- ต่อให้ batch หนึ่งพัง batch อื่นยังตรวจต่อ เพื่อรายงานจำนวน Store ที่ขาดจริง

## หลายเครื่องให้ยอดตรงกันมากขึ้น

Live snapshot ใช้ cutoff 10 วินาทีร่วมกัน (มี safety lag 2 วินาที) เช่นทุกเครื่องในรอบเดียวกันจะถาม Pancake ด้วย `until` เดียวกัน ไม่ใช่เครื่อง A เวลา 16:30:04 และเครื่อง B เวลา 16:30:08

Plan ID ถูกสร้างจาก shop set + time window จริง จึงเหมือนกันข้ามเครื่องเมื่ออยู่ snapshot เดียวกัน

## Regression tests ที่มีใน v1.4.0

- Response จริง `summary.price=75300` → `฿753`
- Summary ชนะ employee rows
- Empty sales `data:[] + summary:{}` → ฿0
- Response คลุมเครือ → fail closed ไม่เดายอด
- 52 unique shops / 3 accounts / 9 batches
- ร้านหนึ่งยอด 0 แต่ snapshot ยัง complete
- Shop ซ้ำข้าม Account ไม่ถูกบวกซ้ำ
- Credential แรกไม่มีสิทธิ์ → fallback credential ถัดไป
- Timeout ครั้งแรก → retry แล้วผ่าน
- History batching
- Partial snapshot ไม่ publish subtotal
- Stable cutoff / deterministic planId ข้ามเครื่อง

รันตรวจได้ด้วย:

```bash
npm test
```

ต้องได้:

```text
Syntax check: PASS
Self-test: PASS
```

## Deploy

1. แตก ZIP
2. เข้าโฟลเดอร์จนเห็น `api`, `lib`, `public`, `package.json`, `vercel.json`
3. เลือกของข้างในทั้งหมดแล้ว Upload ทับใน GitHub repo เดิม
4. Commit
5. รอ Vercel เป็น Ready
6. หน้า Live กด `Ctrl + Shift + R`

Environment Variables เดิมใช้ต่อได้ ไม่ต้องสร้าง Database
