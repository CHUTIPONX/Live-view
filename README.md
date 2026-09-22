# v1.7.9 HOTFIX

อัปไฟล์ทั้งหมดในโฟลเดอร์นี้ทับไฟล์เดิมของ v1.7.8 แล้ว Commit จากนั้นรอ Vercel Ready และกด Ctrl+Shift+R

แก้หลัก:
- เพิ่ม API account แล้วไม่ถูก JSON/Blob config เก่าบัง
- สแกน /shops แบบ pagination เมื่อรายการใหญ่
- แสดงจำนวน POS shops / unique contribution / overlap ต่อ API
- ใช้ total_price_after_sub_discount สำหรับยอดรายออเดอร์เมื่อ Pancake ส่งมา
