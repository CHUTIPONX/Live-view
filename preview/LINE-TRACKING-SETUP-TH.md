# LINE Tracking for Live-view

แพตช์นี้เพิ่มหน้า `/line-tracking` และ Windows Agent สำหรับจับเลขพัสดุจาก LINE Chrome Extension

## วิธีใช้แพตช์

วาง `APPLY-LINE-TRACKING.mjs` ที่ root ของ repo `Live-view` แล้วรัน:

```bat
node APPLY-LINE-TRACKING.mjs
```

สคริปต์จะ:
- backup ไฟล์เดิมเป็น `*.pre-line-tracking.bak`
- เพิ่มหน้า `/line-tracking`
- เพิ่ม API ผ่าน `/api/diagnostics` เดิม เพื่อคง Vercel Hobby ไว้ที่ 12 Functions
- เพิ่ม Vercel Private Blob state
- เพิ่ม `line-agent/`
- รัน `npm test`

หลัง PASS:

```bat
git add .
git commit -m "Add LINE parcel tracking agent"
git push
```

จากนั้นตั้ง `LINE_AGENT_SECRET` ใน Vercel และติดตั้ง Agent ตาม `line-agent/README-TH.md`
