# 945 Persec Studio — เว็บ + ระบบหลังบ้าน

- หน้าเว็บ: `/` (หน้าแรก), `/flash`, `/minimal`, `/anime`, `/merchandise` (หมวดที่เพิ่มใหม่จะได้ลิงก์ `/slug` อัตโนมัติ)
- หลังบ้าน: `/admin` มีแดชบอร์ด, จัดการหมวดหมู่, อัปโหลด/แก้ไข/ลบ/เรียงรูป, ตั้งค่าข้อมูลเว็บ + FAQ + ช่องทางติดต่อ
- เก็บข้อมูลและรูปไว้ที่ Supabase ส่วน Vercel ใช้โฮสต์หน้าเว็บ (ไม่ต้อง build)

---

## ขั้นที่ 1 — ตั้งค่า Supabase

1. เปิดโปรเจกต์ใน Supabase แล้วไปที่ **SQL Editor** → **New query**
2. เปิดไฟล์ `supabase/schema.sql` แก้บรรทัด
   `insert into public.admins (email) values ('your-email@example.com')`
   ให้เป็น **อีเมลที่จะใช้ล็อกอินหลังบ้าน**
3. วางทั้งไฟล์ลงใน SQL Editor แล้วกด **Run**
   คำสั่งนี้จะสร้างตาราง, สิทธิ์ (RLS), ที่เก็บรูป `media` และหมวดเริ่มต้น 4 หมวด
4. ไปที่ **Authentication → Users → Add user → Create new user**
   ใส่อีเมลเดียวกับข้อ 2 และตั้งรหัสผ่าน (ติ๊ก Auto Confirm User)
5. ปิดการสมัครสมาชิกจากภายนอกที่ **Authentication → Sign In / Providers**
   ปิด **Allow new users to sign up**
6. ไปที่ **Project Settings → API Keys** (และ **Data API**) แล้วคัดลอกค่าเหล่านี้
   - Project URL (เช่น `https://abcd.supabase.co`)
   - anon public key หรือ publishable key

## ขั้นที่ 2 — ใส่ค่าในโค้ด

เปิด `assets/js/config.js` แล้วแทนค่า

```js
export const SUPABASE_URL = 'https://abcd.supabase.co';
export const SUPABASE_ANON_KEY = 'ค่า anon / publishable key';
```

> ห้ามใส่ `service_role` หรือ secret key ในไฟล์นี้

## ขั้นที่ 3 — Deploy ขึ้น Vercel

1. สร้าง repository ใหม่ใน GitHub แล้วกด **uploading an existing file**
   ลากไฟล์และโฟลเดอร์ทั้งหมดในโปรเจกต์นี้ขึ้นไป (`index.html` ต้องอยู่ชั้นบนสุด) แล้วกด Commit
2. ใน Vercel กด **Add New → Project** → Import repository นั้น
3. Framework Preset เลือก **Other** ไม่ต้องตั้ง Build Command แล้วกด **Deploy**

หลังจากนี้ถ้าแก้โค้ดใน GitHub Vercel จะ deploy ใหม่ให้อัตโนมัติ
ส่วนการเพิ่มรูปหรือแก้ข้อมูลทำผ่าน `/admin` ได้เลย ไม่ต้อง deploy ใหม่

## การใช้งานหลังบ้าน

| เมนู | ทำอะไรได้ |
|---|---|
| แดชบอร์ด | ดูจำนวนหมวด/รูป/รูปที่ซ่อน/ลายที่ขายแล้ว, รูปล่าสุด, ปุ่มอัปโหลดเร็ว |
| หมวดหมู่ | เพิ่ม/แก้ไข/ลบหมวด, ตั้ง slug (ลิงก์), คำอธิบาย, ราคา, รูปปก, ซ่อน/แสดง, เลื่อนลำดับ |
| รูปภาพ | ลากหลายรูปมาวางเพื่ออัปโหลด (ย่อเหลือ 2000px ให้อัตโนมัติ), ตั้งชื่อ/ราคา/รายละเอียด, ติดป้าย SOLD, ย้ายหมวด, เปลี่ยนไฟล์, ซ่อน, เรียงลำดับ, ลบ |
| ตั้งค่าเว็บ | ชื่อสตูดิโอ, คำโปรย, เกี่ยวกับเรา, รูปหน้าแรก, วิธีจองคิว, FAQ, ช่องทางติดต่อ |

ถ้าจะเพิ่มแอดมินอีกคน ให้สร้าง user ใน Supabase แล้วรันคำสั่งนี้ใน SQL Editor

```sql
insert into public.admins (email) values ('อีเมลใหม่@example.com');
```

## ทดสอบในเครื่อง (ไม่บังคับ)

```bash
npx serve .
```

ในเครื่องให้เปิดหน้าหมวดด้วย `/category.html?c=flash` เพราะลิงก์สั้น `/flash` ใช้ได้เฉพาะบน Vercel
