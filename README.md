# Pancake Live Sales Monitor v1.5.4

## v1.5.4 — 1-minute 4K Scenic View Rotation

รุ่นนี้ต่อยอดจาก v1.5.2 โดย **ไม่เปลี่ยน logic ยอดขาย** และปรับเฉพาะระบบพื้นหลัง:

- เปลี่ยนวิวอัตโนมัติทุก **5 นาที**
- 12 วิว: พระอาทิตย์ขึ้น, แสงเช้า, ภูเขา, ทะเลหมอก, แม่น้ำ, golden hour, sunset, beach, twilight city และ night city
- ใช้ Pexels video sources ที่หน้าแหล่งต้นทางระบุว่าเป็น Free Stock Video Footage / 4K & HD
- ใช้ video 2 layer เพื่อ crossfade: วิวเดิมไม่หายจนกว่าวิวใหม่โหลดข้อมูลได้จริง
- ตัด overscan เดิม (`inset:-5%`) และตัด artificial video zoom ออก (`transform:none`)
- ลดม่านมืดและ blur ของ main panel เหลือ 1.5px เพื่อเห็นรายละเอียดวิวชัดขึ้น
- ถ้าวิดีโอใหม่โหลดพลาด จะค้างวิวเดิมไว้ ไม่ทำพื้นหลังดำ
- ทุกเครื่องเลือกวิวตามช่วงเวลา 5 นาทีเดียวกันโดยอัตโนมัติ

## Sales logic

เหมือน v1.5.2 ทุกอย่าง: Employee Statistic summary.price / 100, complete snapshot only, verified per-order popup, scoreboard counter, unlimited accounts, zero-sales shop = ฿0.

## Deploy

แตก ZIP → เข้าโฟลเดอร์จนเห็น `api`, `lib`, `public`, `package.json`, `vercel.json` → Ctrl+A → GitHub Upload files → Commit → รอ Vercel Ready → Ctrl+Shift+R
