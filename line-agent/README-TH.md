# LINE Tracking Agent (Windows)

ตัว Agent นี้อ่าน DOM ของ **LINE Chrome Extension ทางการ** ผ่าน Chrome DevTools Protocol บน `127.0.0.1` เท่านั้น

มันจะไม่:
- ขยับเมาส์
- พิมพ์ข้อความ
- ส่งข้อความเข้า LINE
- กดอ่านห้องอื่น
- อัปโหลดชื่อ เบอร์ ที่อยู่ หรือข้อความลูกค้าไปเว็บ

ข้อมูลที่ส่งขึ้น Vercel มีเฉพาะ:
- request id แบบสุ่ม/แฮช
- เวลา
- สถานะ
- เลขพัสดุ `TH...`
- heartbeat ของ Agent

## ติดตั้ง

1. ที่ Vercel เชื่อม Blob Storage (ถ้าเว็บเดิมใช้ Blob อยู่แล้วไม่ต้องสร้างใหม่)
2. รัน `SETUP.bat`
3. Copy ค่า `LINE_AGENT_SECRET` ที่ SETUP สร้าง ไปใส่ Vercel:
   - Project → Settings → Environment Variables
   - ชื่อ `LINE_AGENT_SECRET`
4. Redeploy Vercel
5. ใน Chrome profile ที่ SETUP เปิด:
   - ติดตั้ง LINE Chrome Extension
   - Login ด้วย QR
   - เปิดกลุ่ม `ติดตามของ ขอเลขพัสดุ` ค้างไว้
6. รัน `START.bat`

หน้าเว็บใหม่:
`https://<project>.vercel.app/line-tracking`

## การรอข้ามวัน

งานที่ Agent เห็นตอนส่งจะถูกเก็บใน `%LOCALAPPDATA%\LineTrackingAgent\state.json`
จึงรอ Reply ได้หลายวัน แม้ Agent restart ระหว่างนั้น

- 0–2 วัน = WAITING
- เกิน 2 วัน = OVERDUE
- Reply + TH... = RECEIVED
- TH... ที่ไม่มีข้อความต้นฉบับให้จับ = UNMATCHED

## Log

`%LOCALAPPDATA%\LineTrackingAgent\agent.log`

## หมายเหตุ

Chrome profile ของ Agent เป็น profile แยก เพื่อไม่รบกวน Chrome ที่ใช้ทำงานประจำ
Remote debugging bind เฉพาะ `127.0.0.1`
