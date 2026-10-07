import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured =
  /^https:\/\//.test(SUPABASE_URL) && !SUPABASE_URL.includes('YOUR-') && !SUPABASE_ANON_KEY.includes('YOUR-');

export const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
export const BUCKET = 'media';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (s, r = document) => r.querySelector(s);

export function setupNotice() {
  document.body.insertAdjacentHTML(
    'afterbegin',
    `<div class="notice">ยังไม่ได้เชื่อม Supabase — แก้ไฟล์ <code>assets/js/config.js</code> ตามคู่มือใน README</div>`
  );
}

export async function loadPublic() {
  const [s, c] = await Promise.all([
    supabase.from('site_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('categories').select('*').eq('is_visible', true).order('sort_order').order('created_at'),
  ]);
  if (s.error) console.error(s.error);
  if (c.error) console.error(c.error);
  return { settings: s.data || {}, cats: c.data || [] };
}

export function renderHeader(cats, settings, activeSlug = '') {
  const name = settings.studio_name || '945 Persec Studio';
  const links = cats
    .map((c) => `<a href="/${esc(c.slug)}" class="${c.slug === activeSlug ? 'active' : ''}">${esc(c.name)}</a>`)
    .join('');
  $('#siteHeader').innerHTML = `
    <a class="logo" href="/">${esc(name)}</a>
    <button class="menu-btn" aria-label="เมนู" aria-expanded="false"><span></span><span></span></button>
    <nav class="nav">${links}<a href="/#booking">Booking</a><a href="/#contact">Contact</a></nav>`;
  const btn = $('.menu-btn');
  btn.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open);
  });
  $('.nav').addEventListener('click', (e) => {
    if (e.target.tagName === 'A') document.body.classList.remove('nav-open');
  });
}

export function renderFooter(settings) {
  const c = settings.contact || {};
  const items = [
    c.instagram && `<a href="${esc(link(c.instagram, 'https://instagram.com/'))}" target="_blank" rel="noopener">Instagram</a>`,
    c.facebook && `<a href="${esc(link(c.facebook, 'https://facebook.com/'))}" target="_blank" rel="noopener">Facebook</a>`,
    c.line && `<a href="${esc(link(c.line, 'https://line.me/R/ti/p/'))}" target="_blank" rel="noopener">LINE</a>`,
    c.phone && `<a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a>`,
    c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`,
  ].filter(Boolean);
  const address = c.address
    ? `<p class="address">${esc(c.address)}${c.map_url ? ` · <a href="${esc(c.map_url)}" target="_blank" rel="noopener">แผนที่</a>` : ''}</p>`
    : '';
  $('#contact').innerHTML = `
    <div class="footer-inner">
      <p class="footer-name">${esc(settings.studio_name || '945 Persec Studio')}</p>
      <div class="footer-links">${items.join('')}</div>
      ${address}
      <p class="copy">© ${new Date().getFullYear()} ${esc(settings.studio_name || '945 Persec Studio')}</p>
    </div>`;
}

function link(v, prefix) {
  v = String(v).trim();
  if (/^https?:\/\//.test(v)) return v;
  return prefix + v.replace(/^@/, '');
}
