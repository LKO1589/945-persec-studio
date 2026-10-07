import { supabase, configured, BUCKET, esc, $ } from './common.js';

const app = $('#app');
const modal = $('#modal');
const S = { user: null, cats: [], images: [], settings: {}, filter: '', faq: [] };
let booted = false;
let routed = false;

const ICON = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  categories: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7h7l2 2h9v10H3z"/></svg>',
  images: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  site: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 3h7v7M21 3l-9 9M19 14v7H3V5h7"/></svg>',
};

// ---------------- helpers ----------------
function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), err ? 6000 : 3000);
}
const errMsg = (e) => {
  if (e?.code === '23505') return 'slug นี้ถูกใช้แล้ว ลองชื่ออื่น';
  return e?.message || String(e);
};
const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at).localeCompare(String(b.created_at));
const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const catImages = (id) => S.images.filter((i) => i.category_id === id).sort(bySort);
const catName = (id) => S.cats.find((c) => c.id === id)?.name || '—';

async function resizeImage(file, max = 2000) {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return { blob: file, ext: file.name.split('.').pop() };
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.88));
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    ext = 'jpg';
  }
  return { blob, ext };
}

async function uploadFile(file, folder) {
  const { blob, ext } = await resizeImage(file);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || file.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

async function removeFiles(paths) {
  paths = paths.filter(Boolean);
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.warn('storage remove', error);
}

function openModal(html, onSubmit) {
  modal.innerHTML = `<form novalidate>${html}</form>`;
  const form = modal.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      const res = await onSubmit(form);
      if (res !== false) modal.close();
    } catch (err) {
      console.error(err);
      toast(errMsg(err), true);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
  form.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => modal.close()));
  form.querySelectorAll('input[type=file][data-preview]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const img = form.querySelector(inp.dataset.preview);
      if (inp.files[0] && img) {
        img.src = URL.createObjectURL(inp.files[0]);
        img.classList.remove('ph');
      }
    })
  );
  modal.showModal();
  return form;
}

async function move(list, idx, dir, table) {
  const j = idx + dir;
  if (j < 0 || j >= list.length) return;
  [list[idx], list[j]] = [list[j], list[idx]];
  const changed = [];
  list.forEach((it, k) => {
    if (it.sort_order !== k) {
      it.sort_order = k;
      changed.push(it);
    }
  });
  const results = await Promise.all(changed.map((it) => supabase.from(table).update({ sort_order: it.sort_order }).eq('id', it.id)));
  const bad = results.find((r) => r.error);
  if (bad) toast(errMsg(bad.error), true);
}

// ---------------- auth ----------------
function renderSetup() {
  app.innerHTML = `<div class="center-screen"><div class="login-card">
    <h1>ยังไม่ได้ตั้งค่า</h1>
    <p class="sub">ใส่ Supabase URL และ anon key ในไฟล์ <code>assets/js/config.js</code> ก่อน แล้ว deploy ใหม่</p>
  </div></div>`;
}

function renderLogin(message = '') {
  app.innerHTML = `<div class="center-screen"><form class="login-card" id="loginForm">
    <h1>945 Persec<br>Studio</h1>
    <p class="sub">เข้าสู่ระบบหลังบ้าน</p>
    ${message ? `<p class="err">${esc(message)}</p>` : ''}
    <label class="field"><span>อีเมล</span><input type="email" name="email" autocomplete="username" required></label>
    <label class="field"><span>รหัสผ่าน</span><input type="password" name="password" autocomplete="current-password" required></label>
    <button class="btn primary" type="submit">เข้าสู่ระบบ</button>
  </form></div>`;
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'กำลังเข้าสู่ระบบ…';
    const { error } = await supabase.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    if (error) renderLogin('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });
}

async function boot() {
  app.innerHTML = '<div class="center-screen"><div class="spinner"></div></div>';
  const { data: ok, error } = await supabase.rpc('is_admin');
  if (error) {
    app.innerHTML = `<div class="center-screen"><div class="login-card"><h1>เชื่อมต่อไม่ได้</h1>
      <p class="sub">${esc(error.message)}<br><br>ตรวจว่ารัน supabase/schema.sql แล้วหรือยัง</p>
      <button class="btn" id="lo">ออกจากระบบ</button></div></div>`;
    $('#lo').onclick = () => supabase.auth.signOut();
    return;
  }
  if (!ok) {
    app.innerHTML = `<div class="center-screen"><div class="login-card"><h1>ไม่มีสิทธิ์</h1>
      <p class="sub">บัญชี ${esc(S.user.email)} ยังไม่อยู่ในตาราง admins</p>
      <button class="btn" id="lo">ออกจากระบบ</button></div></div>`;
    $('#lo').onclick = () => supabase.auth.signOut();
    return;
  }
  try {
    await loadAll();
  } catch (e) {
    toast(errMsg(e), true);
  }
  renderShell();
  if (!routed) {
    window.addEventListener('hashchange', route);
    routed = true;
  }
  route();
}

async function loadAll() {
  const [c, i, s] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order').order('created_at'),
    supabase.from('images').select('*').order('sort_order').order('created_at'),
    supabase.from('site_settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  for (const r of [c, i, s]) if (r.error) throw r.error;
  S.cats = c.data || [];
  S.images = i.data || [];
  S.settings = s.data || { id: 1 };
}

// ---------------- shell & routing ----------------
const NAV = [
  ['dashboard', 'แดชบอร์ด'],
  ['categories', 'หมวดหมู่'],
  ['images', 'รูปภาพ'],
  ['settings', 'ตั้งค่าเว็บ'],
];

function renderShell() {
  app.innerHTML = `<div class="shell">
    <aside class="sidebar">
      <div class="brand">945 Persec Studio<small>หลังบ้าน</small></div>
      ${NAV.map(([k, t]) => `<a class="side-link" href="#${k}" data-nav="${k}">${ICON[k]}<span>${t}</span></a>`).join('')}
      <a class="side-link" href="/" target="_blank">${ICON.site}<span>ดูหน้าเว็บ</span></a>
      <div class="side-foot">
        <span class="who">${esc(S.user?.email || '')}</span>
        <button class="btn sm" id="logout">ออกจากระบบ</button>
      </div>
    </aside>
    <main class="main" id="view"></main>
  </div>`;
  $('#logout').onclick = () => supabase.auth.signOut();
}

function route() {
  if (!$('#view')) return;
  const view = location.hash.slice(1) || 'dashboard';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === view));
  ({ dashboard: renderDashboard, categories: renderCategories, images: renderImages, settings: renderSettings }[view] || renderDashboard)();
  window.scrollTo(0, 0);
}

// ---------------- dashboard ----------------
function renderDashboard() {
  const total = S.images.length;
  const hidden = S.images.filter((i) => !i.is_visible).length;
  const sold = S.images.filter((i) => i.is_sold).length;
  const recent = [...S.images].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 12);
  $('#view').innerHTML = `
    <div class="page-head">
      <div><h1>Dashboard</h1><p>ภาพรวมเว็บไซต์</p></div>
      <div class="actions"><a class="btn primary" href="#images">+ อัปโหลดรูป</a></div>
    </div>
    <div class="stats">
      <div class="stat"><b>${S.cats.length}</b><span>หมวดหมู่</span></div>
      <div class="stat"><b>${total}</b><span>รูปทั้งหมด</span></div>
      <div class="stat"><b>${hidden}</b><span>รูปที่ซ่อนอยู่</span></div>
      <div class="stat"><b>${sold}</b><span>ลายที่ขายแล้ว</span></div>
    </div>
    <div class="panel">
      <h2>หมวดหมู่ <a class="btn sm" href="#categories">จัดการ</a></h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th></th><th>หมวด</th><th>ลิงก์</th><th>รูป</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${S.cats
          .map((c) => {
            const imgs = catImages(c.id);
            const cover = c.cover_url || imgs[0]?.url;
            return `<tr>
            <td>${cover ? `<img class="thumb" src="${esc(cover)}" alt="">` : '<div class="thumb ph"></div>'}</td>
            <td>${esc(c.name)}</td>
            <td><a class="slug" href="/${esc(c.slug)}" target="_blank">/${esc(c.slug)}</a></td>
            <td>${imgs.length}</td>
            <td><span class="pill ${c.is_visible ? 'on' : ''}">${c.is_visible ? 'แสดง' : 'ซ่อน'}</span></td>
            <td><div class="row-actions"><button class="btn sm" data-upload="${c.id}">อัปโหลด</button></div></td>
          </tr>`;
          })
          .join('') || '<tr><td colspan="6" class="empty">ยังไม่มีหมวดหมู่</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="panel">
      <h2>อัปโหลดล่าสุด</h2>
      ${recent.length ? `<div class="recent">${recent.map((i) => `<img src="${esc(i.url)}" alt="" loading="lazy" title="${esc(catName(i.category_id))}">`).join('')}</div>` : '<p class="empty">ยังไม่มีรูป</p>'}
    </div>`;
  $('#view').querySelectorAll('[data-upload]').forEach((b) =>
    b.addEventListener('click', () => {
      S.filter = b.dataset.upload;
      location.hash = 'images';
    })
  );
}

// ---------------- categories ----------------
function renderCategories() {
  const cats = [...S.cats].sort(bySort);
  $('#view').innerHTML = `
    <div class="page-head">
      <div><h1>หมวดหมู่</h1><p>หมวดที่แสดงจะอยู่ในเมนูและหน้าแรก ลิงก์ของแต่ละหมวดคือ /slug</p></div>
      <div class="actions"><button class="btn primary" id="newCat">+ เพิ่มหมวด</button></div>
    </div>
    <div class="panel"><div class="table-wrap"><table class="table">
      <thead><tr><th></th><th>ชื่อ</th><th>ลิงก์</th><th>ราคา</th><th>รูป</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>${cats
        .map((c, i) => {
          const cover = c.cover_url || catImages(c.id)[0]?.url;
          return `<tr>
          <td>${cover ? `<img class="thumb" src="${esc(cover)}" alt="">` : '<div class="thumb ph"></div>'}</td>
          <td>${esc(c.name)}</td>
          <td><a class="slug" href="/${esc(c.slug)}" target="_blank">/${esc(c.slug)}</a></td>
          <td class="muted">${esc(c.price_text || '—')}</td>
          <td>${catImages(c.id).length}</td>
          <td><button class="pill ${c.is_visible ? 'on' : ''}" data-act="toggle" data-id="${c.id}" style="cursor:pointer;background:none">${c.is_visible ? 'แสดง' : 'ซ่อน'}</button></td>
          <td><div class="row-actions">
            <button class="btn icon" data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="เลื่อนขึ้น">↑</button>
            <button class="btn icon" data-act="down" data-i="${i}" ${i === cats.length - 1 ? 'disabled' : ''} title="เลื่อนลง">↓</button>
            <button class="btn sm" data-act="edit" data-id="${c.id}">แก้ไข</button>
            <button class="btn sm danger" data-act="del" data-id="${c.id}">ลบ</button>
          </div></td>
        </tr>`;
        })
        .join('') || '<tr><td colspan="7" class="empty">ยังไม่มีหมวดหมู่</td></tr>'}</tbody>
    </table></div></div>`;

  $('#newCat').onclick = () => categoryForm();
  $('#view').querySelector('tbody').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'up' || act === 'down') {
      await move(cats, +b.dataset.i, act === 'up' ? -1 : 1, 'categories');
      S.cats.sort(bySort);
      return renderCategories();
    }
    const cat = S.cats.find((c) => c.id === b.dataset.id);
    if (act === 'edit') return categoryForm(cat);
    if (act === 'toggle') {
      const { error } = await supabase.from('categories').update({ is_visible: !cat.is_visible }).eq('id', cat.id);
      if (error) return toast(errMsg(error), true);
      cat.is_visible = !cat.is_visible;
      return renderCategories();
    }
    if (act === 'del') {
      const imgs = catImages(cat.id);
      if (!confirm(`ลบหมวด "${cat.name}" และรูปทั้งหมด ${imgs.length} รูปในหมวดนี้?\nกู้คืนไม่ได้`)) return;
      const { error } = await supabase.from('categories').delete().eq('id', cat.id);
      if (error) return toast(errMsg(error), true);
      await removeFiles([cat.cover_path, ...imgs.map((i) => i.storage_path)]);
      S.cats = S.cats.filter((c) => c.id !== cat.id);
      S.images = S.images.filter((i) => i.category_id !== cat.id);
      if (S.filter === cat.id) S.filter = '';
      toast('ลบหมวดแล้ว');
      renderCategories();
    }
  });
}

function categoryForm(cat) {
  const isNew = !cat;
  cat = cat || { name: '', slug: '', description: '', price_text: '', is_visible: true };
  const form = openModal(
    `<header>${isNew ? 'เพิ่มหมวดหมู่' : 'แก้ไขหมวดหมู่'}</header>
    <div class="body">
      <label class="field"><span>ชื่อหมวด</span><input type="text" name="cat_name" value="${esc(cat.name)}" required placeholder="เช่น Flash"></label>
      <label class="field"><span>Slug (ลิงก์)</span><input type="text" name="slug" value="${esc(cat.slug)}" required placeholder="เช่น flash">
        <p class="hint">ภาษาอังกฤษตัวเล็ก ตัวเลข และ - เท่านั้น · หน้าเว็บจะเป็น /<b id="slugPreview">${esc(cat.slug || 'slug')}</b></p></label>
      <label class="field"><span>คำอธิบาย</span><textarea name="description" placeholder="แสดงใต้ชื่อหมวด">${esc(cat.description || '')}</textarea></label>
      <label class="field"><span>ราคา</span><input type="text" name="price_text" value="${esc(cat.price_text || '')}" placeholder="เช่น เริ่มต้น 1,000 บาท"></label>
      <span class="hint" style="display:block;margin-bottom:6px">รูปปก (ไม่ใส่ก็ได้ จะใช้รูปแรกในหมวดแทน)</span>
      <div class="img-field">
        <img class="preview ${cat.cover_url ? '' : 'ph'}" id="coverPrev" ${cat.cover_url ? `src="${esc(cat.cover_url)}"` : ''} alt="">
        <div>
          <input type="file" name="cover" accept="image/*" data-preview="#coverPrev">
          ${cat.cover_url ? '<label class="check" style="margin-top:8px"><input type="checkbox" name="removeCover"> ลบรูปปก</label>' : ''}
        </div>
      </div>
      <label class="check"><input type="checkbox" name="is_visible" ${cat.is_visible ? 'checked' : ''}> แสดงบนหน้าเว็บ</label>
    </div>
    <footer><button type="button" class="btn" data-close>ยกเลิก</button><button type="submit" class="btn primary">บันทึก</button></footer>`,
    async (f) => {
      const name = f.cat_name.value.trim();
      const slug = slugify(f.slug.value);
      if (!name) return toast('กรุณาใส่ชื่อหมวด', true), false;
      if (!slug) return toast('กรุณาใส่ slug เป็นภาษาอังกฤษ', true), false;
      if (['admin', 'assets', 'category', 'index'].includes(slug)) return toast('slug นี้ใช้ไม่ได้', true), false;
      const row = {
        name,
        slug,
        description: f.description.value.trim(),
        price_text: f.price_text.value.trim(),
        is_visible: f.is_visible.checked,
      };
      let oldCover = null;
      if (f.cover.files[0]) {
        const up = await uploadFile(f.cover.files[0], 'covers');
        row.cover_url = up.url;
        row.cover_path = up.path;
        oldCover = cat.cover_path;
      } else if (f.removeCover?.checked) {
        row.cover_url = null;
        row.cover_path = null;
        oldCover = cat.cover_path;
      }
      if (isNew) {
        row.sort_order = S.cats.reduce((m, c) => Math.max(m, c.sort_order ?? 0), -1) + 1;
        const { data, error } = await supabase.from('categories').insert(row).select().single();
        if (error) throw error;
        S.cats.push(data);
      } else {
        const { data, error } = await supabase.from('categories').update(row).eq('id', cat.id).select().single();
        if (error) throw error;
        Object.assign(cat, data);
      }
      await removeFiles([oldCover]);
      toast('บันทึกแล้ว');
      renderCategories();
    }
  );
  let touched = !isNew;
  form.slug.addEventListener('input', () => {
    touched = true;
    $('#slugPreview').textContent = slugify(form.slug.value) || 'slug';
  });
  form.cat_name.addEventListener('input', () => {
    if (touched) return;
    form.slug.value = slugify(form.cat_name.value);
    $('#slugPreview').textContent = form.slug.value || 'slug';
  });
}

// ---------------- images ----------------
function renderImages() {
  if (S.filter && !S.cats.some((c) => c.id === S.filter)) S.filter = '';
  if (!S.filter && S.cats.length) S.filter = [...S.cats].sort(bySort)[0].id;
  const all = S.filter === 'all';
  const list = all ? [...S.images].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) : catImages(S.filter);
  const cat = S.cats.find((c) => c.id === S.filter);

  $('#view').innerHTML = `
    <div class="page-head">
      <div><h1>รูปภาพ</h1><p>เลือกหมวด แล้วลากรูปมาวางเพื่ออัปโหลด (เลือกได้หลายรูปพร้อมกัน)</p></div>
    </div>
    ${
      S.cats.length
        ? `<div class="toolbar">
      <select id="catFilter">
        ${[...S.cats].sort(bySort).map((c) => `<option value="${c.id}" ${c.id === S.filter ? 'selected' : ''}>${esc(c.name)} (${catImages(c.id).length})</option>`).join('')}
        <option value="all" ${all ? 'selected' : ''}>ทุกหมวด (${S.images.length})</option>
      </select>
      ${cat ? `<a class="btn sm" href="/${esc(cat.slug)}" target="_blank">ดูหน้า /${esc(cat.slug)}</a>` : ''}
    </div>
    ${
      cat
        ? `<div class="dropzone" id="drop">
      <input type="file" id="fileInput" accept="image/*" multiple hidden>
      <b>ลากรูปมาวางที่นี่</b> หรือคลิกเพื่อเลือกไฟล์ — จะอัปโหลดเข้าหมวด <b>${esc(cat.name)}</b>
      <p class="hint">รูปจะถูกย่อให้ด้านยาวไม่เกิน 2000px อัตโนมัติ</p>
      <div class="progress" id="prog" hidden><div></div></div>
    </div>`
        : ''
    }
    <div class="img-grid" id="grid">
      ${
        list
          .map(
            (im, i) => `
        <div class="img-card ${im.is_visible ? '' : 'hidden-img'}">
          <div class="ph" data-act="edit" data-id="${im.id}">
            <img src="${esc(im.url)}" alt="" loading="lazy">
            <div class="tags">${im.is_sold ? '<span class="tag">SOLD</span>' : ''}${im.is_visible ? '' : '<span class="tag">ซ่อน</span>'}${all ? `<span class="tag">${esc(catName(im.category_id))}</span>` : ''}</div>
          </div>
          <div class="info"><div class="t">${esc(im.title || '') || '<span class="muted">ไม่มีชื่อ</span>'}</div>${im.price_text ? `<div class="muted">${esc(im.price_text)}</div>` : ''}</div>
          <div class="bar">
            ${all ? '<span></span>' : `<span style="display:flex;gap:4px">
              <button class="btn icon" data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="เลื่อนขึ้น">↑</button>
              <button class="btn icon" data-act="down" data-i="${i}" ${i === list.length - 1 ? 'disabled' : ''} title="เลื่อนลง">↓</button></span>`}
            <span style="display:flex;gap:4px">
              <button class="btn sm" data-act="edit" data-id="${im.id}">แก้ไข</button>
              <button class="btn sm danger" data-act="del" data-id="${im.id}">ลบ</button>
            </span>
          </div>
        </div>`
          )
          .join('') || '<p class="empty" style="grid-column:1/-1">ยังไม่มีรูปในหมวดนี้</p>'
      }
    </div>`
        : '<div class="panel empty">ยังไม่มีหมวดหมู่ — <a href="#categories">สร้างหมวดก่อน</a></div>'
    }`;

  if (!S.cats.length) return;
  $('#catFilter').onchange = (e) => {
    S.filter = e.target.value;
    renderImages();
  };

  const drop = $('#drop');
  if (drop) {
    const input = $('#fileInput');
    drop.addEventListener('click', (e) => {
      if (e.target !== input) input.click();
    });
    input.addEventListener('change', () => uploadMany(input.files));
    ['dragenter', 'dragover'].forEach((ev) =>
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add('over');
      })
    );
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadMany(e.dataTransfer.files);
    });
  }

  $('#grid').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'up' || act === 'down') {
      b.disabled = true;
      await move(list, +b.dataset.i, act === 'up' ? -1 : 1, 'images');
      return renderImages();
    }
    const im = S.images.find((x) => x.id === b.dataset.id);
    if (act === 'edit') return imageForm(im);
    if (act === 'del') {
      if (!confirm('ลบรูปนี้? กู้คืนไม่ได้')) return;
      const { error } = await supabase.from('images').delete().eq('id', im.id);
      if (error) return toast(errMsg(error), true);
      await removeFiles([im.storage_path]);
      S.images = S.images.filter((x) => x.id !== im.id);
      toast('ลบรูปแล้ว');
      renderImages();
    }
  });
}

let uploading = false;
async function uploadMany(fileList) {
  if (uploading) return toast('กำลังอัปโหลดอยู่ รอสักครู่', true);
  const cat = S.cats.find((c) => c.id === S.filter);
  if (!cat) return toast('เลือกหมวดก่อนอัปโหลด', true);
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return toast('ไม่พบไฟล์รูปภาพ', true);
  uploading = true;
  const prog = $('#prog');
  prog.hidden = false;
  const bar = prog.firstElementChild;
  let next = catImages(cat.id).reduce((m, i) => Math.max(m, i.sort_order ?? 0), -1) + 1;
  let ok = 0, fail = 0;
  for (const [n, f] of files.entries()) {
    try {
      const up = await uploadFile(f, cat.slug);
      const { data, error } = await supabase
        .from('images')
        .insert({ category_id: cat.id, url: up.url, storage_path: up.path, sort_order: next++ })
        .select()
        .single();
      if (error) {
        await removeFiles([up.path]);
        throw error;
      }
      S.images.push(data);
      ok++;
    } catch (e) {
      console.error(f.name, e);
      fail++;
      toast(`${f.name}: ${errMsg(e)}`, true);
    }
    bar.style.width = `${((n + 1) / files.length) * 100}%`;
  }
  uploading = false;
  toast(`อัปโหลดสำเร็จ ${ok} รูป${fail ? ` · ไม่สำเร็จ ${fail}` : ''}`, !!fail && !ok);
  renderImages();
}

function imageForm(im) {
  openModal(
    `<header>แก้ไขรูป</header>
    <div class="body">
      <img class="big-preview" id="imPrev" src="${esc(im.url)}" alt="">
      <label class="field"><span>เปลี่ยนไฟล์รูป (ไม่บังคับ)</span><input type="file" name="file" accept="image/*" data-preview="#imPrev"></label>
      <label class="field"><span>ชื่อลาย</span><input type="text" name="im_title" value="${esc(im.title || '')}" placeholder="เช่น Skeleton Bird"></label>
      <label class="field"><span>รายละเอียด</span><textarea name="description" placeholder="ขนาด ตำแหน่งที่แนะนำ ฯลฯ">${esc(im.description || '')}</textarea></label>
      <div class="row2">
        <label class="field"><span>ราคา</span><input type="text" name="price_text" value="${esc(im.price_text || '')}" placeholder="เช่น 1,500 บาท"></label>
        <label class="field"><span>หมวด</span><select name="category_id">${[...S.cats]
          .sort(bySort)
          .map((c) => `<option value="${c.id}" ${c.id === im.category_id ? 'selected' : ''}>${esc(c.name)}</option>`)
          .join('')}</select></label>
      </div>
      <label class="check"><input type="checkbox" name="is_sold" ${im.is_sold ? 'checked' : ''}> ขายแล้ว (แสดงป้าย SOLD)</label>
      <label class="check"><input type="checkbox" name="is_visible" ${im.is_visible ? 'checked' : ''}> แสดงบนหน้าเว็บ</label>
    </div>
    <footer><button type="button" class="btn" data-close>ยกเลิก</button><button type="submit" class="btn primary">บันทึก</button></footer>`,
    async (f) => {
      const row = {
        title: f.im_title.value.trim(),
        description: f.description.value.trim(),
        price_text: f.price_text.value.trim(),
        is_sold: f.is_sold.checked,
        is_visible: f.is_visible.checked,
        category_id: f.category_id.value,
      };
      if (row.category_id !== im.category_id) {
        row.sort_order = catImages(row.category_id).reduce((m, i) => Math.max(m, i.sort_order ?? 0), -1) + 1;
      }
      let oldPath = null;
      if (f.file.files[0]) {
        const folder = S.cats.find((c) => c.id === row.category_id)?.slug || 'misc';
        const up = await uploadFile(f.file.files[0], folder);
        row.url = up.url;
        row.storage_path = up.path;
        oldPath = im.storage_path;
      }
      const { data, error } = await supabase.from('images').update(row).eq('id', im.id).select().single();
      if (error) throw error;
      Object.assign(im, data);
      await removeFiles([oldPath]);
      toast('บันทึกแล้ว');
      renderImages();
    }
  );
}

// ---------------- settings ----------------
function renderSettings() {
  const s = S.settings;
  const c = s.contact || {};
  S.faq = (Array.isArray(s.faq) ? s.faq : []).map((x) => ({ q: x.q || '', a: x.a || '' }));
  $('#view').innerHTML = `
    <div class="page-head">
      <div><h1>ตั้งค่าเว็บ</h1><p>ข้อมูลที่แสดงบนหน้าแรกและส่วนท้ายเว็บ</p></div>
    </div>
    <form id="settingsForm" novalidate>
      <div class="panel">
        <h2>ข้อมูลสตูดิโอ</h2>
        <label class="field"><span>ชื่อสตูดิโอ</span><input type="text" name="studio_name" value="${esc(s.studio_name || '')}"></label>
        <label class="field"><span>คำโปรย (ใต้ชื่อในหน้าแรก)</span><input type="text" name="tagline" value="${esc(s.tagline || '')}"></label>
        <label class="field"><span>เกี่ยวกับเรา</span><textarea name="about">${esc(s.about || '')}</textarea></label>
        <span class="hint" style="display:block;margin-bottom:6px">รูปหน้าแรก (Hero)</span>
        <div class="img-field">
          <img class="preview ${s.hero_url ? '' : 'ph'}" id="heroPrev" ${s.hero_url ? `src="${esc(s.hero_url)}"` : ''} alt="">
          <div>
            <input type="file" name="hero" accept="image/*">
            ${s.hero_url ? '<label class="check" style="margin-top:8px"><input type="checkbox" name="removeHero"> ลบรูปหน้าแรก</label>' : ''}
          </div>
        </div>
      </div>
      <div class="panel">
        <h2>วิธีจองคิว</h2>
        <label class="field"><textarea name="booking" style="min-height:180px">${esc(s.booking || '')}</textarea></label>
      </div>
      <div class="panel">
        <h2>คำถามที่พบบ่อย (FAQ) <button type="button" class="btn sm" id="addFaq">+ เพิ่มคำถาม</button></h2>
        <div id="faqEditor"></div>
      </div>
      <div class="panel">
        <h2>ช่องทางติดต่อ</h2>
        <div class="row2">
          <label class="field"><span>Instagram (ชื่อผู้ใช้หรือลิงก์)</span><input type="text" name="instagram" value="${esc(c.instagram || '')}"></label>
          <label class="field"><span>Facebook (ชื่อเพจหรือลิงก์)</span><input type="text" name="facebook" value="${esc(c.facebook || '')}"></label>
          <label class="field"><span>LINE (ID หรือลิงก์)</span><input type="text" name="line" value="${esc(c.line || '')}"></label>
          <label class="field"><span>เบอร์โทร</span><input type="text" name="phone" value="${esc(c.phone || '')}"></label>
          <label class="field"><span>อีเมล</span><input type="text" name="email" value="${esc(c.email || '')}"></label>
          <label class="field"><span>ลิงก์ Google Maps</span><input type="text" name="map_url" value="${esc(c.map_url || '')}"></label>
        </div>
        <label class="field"><span>ที่อยู่</span><input type="text" name="address" value="${esc(c.address || '')}"></label>
      </div>
      <div class="actions"><button type="submit" class="btn primary">บันทึกการตั้งค่า</button></div>
    </form>`;

  const form = $('#settingsForm');
  renderFaq();
  form.hero.addEventListener('change', () => {
    if (form.hero.files[0]) {
      $('#heroPrev').src = URL.createObjectURL(form.hero.files[0]);
      $('#heroPrev').classList.remove('ph');
    }
  });
  $('#addFaq').onclick = () => {
    syncFaq();
    S.faq.push({ q: '', a: '' });
    renderFaq();
  };
  $('#faqEditor').addEventListener('click', (e) => {
    const b = e.target.closest('[data-faq]');
    if (!b) return;
    syncFaq();
    const i = +b.dataset.i;
    if (b.dataset.faq === 'del') S.faq.splice(i, 1);
    if (b.dataset.faq === 'up' && i > 0) [S.faq[i - 1], S.faq[i]] = [S.faq[i], S.faq[i - 1]];
    if (b.dataset.faq === 'down' && i < S.faq.length - 1) [S.faq[i + 1], S.faq[i]] = [S.faq[i], S.faq[i + 1]];
    renderFaq();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    syncFaq();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      const row = {
        id: 1,
        studio_name: form.studio_name.value.trim(),
        tagline: form.tagline.value.trim(),
        about: form.about.value.trim(),
        booking: form.booking.value.trim(),
        faq: S.faq.filter((x) => x.q.trim()).map((x) => ({ q: x.q.trim(), a: x.a.trim() })),
        contact: Object.fromEntries(
          ['instagram', 'facebook', 'line', 'phone', 'email', 'address', 'map_url'].map((k) => [k, form[k].value.trim()])
        ),
        updated_at: new Date().toISOString(),
      };
      let oldHero = null;
      if (form.hero.files[0]) {
        const up = await uploadFile(form.hero.files[0], 'site');
        row.hero_url = up.url;
        oldHero = s.hero_url;
      } else if (form.removeHero?.checked) {
        row.hero_url = null;
        oldHero = s.hero_url;
      }
      const { data, error } = await supabase.from('site_settings').upsert(row).select().single();
      if (error) throw error;
      S.settings = data;
      if (oldHero) await removeFiles([pathFromUrl(oldHero)]);
      toast('บันทึกการตั้งค่าแล้ว');
      renderSettings();
    } catch (err) {
      console.error(err);
      toast(errMsg(err), true);
      btn.disabled = false;
      btn.textContent = 'บันทึกการตั้งค่า';
    }
  });
}

function pathFromUrl(url) {
  const m = String(url || '').match(/\/object\/public\/media\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function renderFaq() {
  $('#faqEditor').innerHTML =
    S.faq
      .map(
        (f, i) => `<div class="faq-item">
      <div class="faq-bar"><span>คำถามที่ ${i + 1}</span><span style="display:flex;gap:4px">
        <button type="button" class="btn icon" data-faq="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn icon" data-faq="down" data-i="${i}" ${i === S.faq.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn sm danger" data-faq="del" data-i="${i}">ลบ</button></span></div>
      <input type="text" data-q="${i}" value="${esc(f.q)}" placeholder="คำถาม">
      <textarea data-a="${i}" placeholder="คำตอบ">${esc(f.a)}</textarea>
    </div>`
      )
      .join('') || '<p class="empty">ยังไม่มีคำถาม</p>';
}

function syncFaq() {
  S.faq.forEach((f, i) => {
    const q = document.querySelector(`[data-q="${i}"]`);
    const a = document.querySelector(`[data-a="${i}"]`);
    if (q) f.q = q.value;
    if (a) f.a = a.value;
  });
}

// ---------------- start ----------------
if (!configured) {
  renderSetup();
} else {
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session) {
      booted = false;
      S.user = null;
      setTimeout(() => renderLogin(), 0);
      return;
    }
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      if (booted && S.user?.id === session.user.id) return;
      S.user = session.user;
      booted = true;
      setTimeout(boot, 0);
    }
  });
}
