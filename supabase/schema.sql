-- =====================================================================
-- 945 Persec Studio — Supabase schema
-- วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run
-- ⚠️ แก้อีเมลแอดมินในบรรทัด "ADMIN EMAIL" ด้านล่างก่อนกด Run
-- รันซ้ำได้ ไม่ทำให้ข้อมูลเดิมหาย
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Admins ----------
create table if not exists public.admins (
  email text primary key
);

-- ADMIN EMAIL: 945persec@gmail.com
insert into public.admins (email) values ('945persec@gmail.com')
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Site settings (single row) ----------
create table if not exists public.site_settings (
  id          int primary key default 1 check (id = 1),
  studio_name text default '945 Persec Studio',
  tagline     text,
  about       text,
  booking     text,
  faq         jsonb default '[]'::jsonb,
  contact     jsonb default '{}'::jsonb,
  hero_url    text,
  updated_at  timestamptz default now()
);

-- ---------- Categories ----------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  description text,
  price_text  text,
  cover_url   text,
  cover_path  text,
  sort_order  int default 0,
  is_visible  boolean default true,
  created_at  timestamptz default now()
);

-- ---------- Images ----------
create table if not exists public.images (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories(id) on delete cascade,
  url          text not null,
  storage_path text,
  title        text,
  description  text,
  price_text   text,
  is_sold      boolean default false,
  is_visible   boolean default true,
  sort_order   int default 0,
  created_at   timestamptz default now()
);
create index if not exists images_category_idx on public.images(category_id, sort_order);

-- ---------- Row Level Security ----------
alter table public.admins        enable row level security;
alter table public.site_settings enable row level security;
alter table public.categories    enable row level security;
alter table public.images        enable row level security;

drop policy if exists "admins read"       on public.admins;
drop policy if exists "settings read"     on public.site_settings;
drop policy if exists "settings write"    on public.site_settings;
drop policy if exists "categories read"   on public.categories;
drop policy if exists "categories write"  on public.categories;
drop policy if exists "images read"       on public.images;
drop policy if exists "images write"      on public.images;

create policy "admins read" on public.admins
  for select using (public.is_admin());

create policy "settings read" on public.site_settings
  for select using (true);
create policy "settings write" on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());

create policy "categories read" on public.categories
  for select using (is_visible or public.is_admin());
create policy "categories write" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy "images read" on public.images
  for select using (
    public.is_admin()
    or (is_visible and exists (
      select 1 from public.categories c where c.id = category_id and c.is_visible))
  );
create policy "images write" on public.images
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Storage bucket ----------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "media admin insert" on storage.objects;
drop policy if exists "media admin update" on storage.objects;
drop policy if exists "media admin delete" on storage.objects;

create policy "media admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());
create policy "media admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.is_admin());
create policy "media admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());

-- ---------- Seed data ----------
insert into public.site_settings (id, studio_name, tagline, about, booking, faq, contact)
values (
  1,
  '945 Persec Studio',
  'Flash · Minimal · Anime · Merchandise',
  'สตูดิโอสักลายที่ออกแบบลายเองทุกชิ้น ตั้งแต่ลายมินิมอลน่ารัก ๆ ไปจนถึงงานมังงะเต็มแขน',
  E'1. ทักมาบอกชื่อ และวัน-เวลาที่ต้องการจอง\n2. ส่งลายที่อยากได้ ตำแหน่งที่จะสัก (แขน/ขา/คอ ฯลฯ) และขนาดโดยประมาณ (ซม.)\n3. ช่างสรุปราคาให้ แล้วโอนมัดจำเพื่อยืนยันคิว\n\n• เลื่อนคิวได้ 1 ครั้ง โดยแจ้งล่วงหน้า 1 วัน\n• หากไม่มาตามนัด ขออนุญาตไม่คืนมัดจำทุกกรณี',
  '[
    {"q":"อยากสักแต่ยังนึกไม่ออกเอาลายอะไรดี?","a":"มาคุยกันก่อน เดี๋ยวช่วยคิดให้"},
    {"q":"อยากสัก แต่ต้องเป็นลายที่ช่างวาดเองเท่านั้นมั้ย?","a":"ไม่จำเป็น"},
    {"q":"อยากสั่ง custom ลาย ทำยังไง?","a":"1. แชร์ไอเดียคร่าว ๆ ว่าอยากได้อะไร สไตล์ไหน (มินิมอล, black work ฯลฯ)\n2. มี reference สัก 2-3 รูป\n3. บอกตำแหน่งที่อยากสักและขนาด\n*ไม่จำเป็นต้องมีภาพในหัวชัดมาก เดี๋ยวช่างช่วยทำต่อให้"},
    {"q":"จ้าง custom ลายแล้วเอาไปให้ช่างคนอื่นสักให้ได้ไหม?","a":"ไม่ได้"},
    {"q":"ลาย Flash ที่ขายไปแล้วจะโดนซื้อซ้ำมั้ย?","a":"ไม่ 1 คนต่อ 1 ลาย ไม่มีซ้ำ"}
  ]'::jsonb,
  '{"instagram":"","facebook":"","line":"","phone":"","email":"","address":"","map_url":""}'::jsonb
)
on conflict (id) do nothing;

insert into public.categories (slug, name, description, price_text, sort_order) values
  ('flash',       'Flash',       'ลาย Flash ที่ออกแบบไว้แล้ว 1 คนต่อ 1 ลาย ไม่มีซ้ำ', 'เริ่มต้น 1,000 บาท', 1),
  ('merchandise', 'Merchandise', 'สินค้าและของที่ระลึกจากสตูดิโอ', '', 2),
  ('minimal',     'Minimal',     'ลายเส้นเล็ก น่ารัก เรียบง่าย', 'เริ่มต้น 500 บาท', 3),
  ('anime',       'Anime',       'งานมังงะ / อนิเมะ ลงรายละเอียดเต็มที่', 'เริ่มต้น 1,000 บาท', 4)
on conflict (slug) do nothing;
