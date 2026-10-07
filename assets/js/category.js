import { supabase, configured, esc, $, setupNotice, loadPublic, renderHeader, renderFooter } from './common.js';

const slug = (
  new URLSearchParams(location.search).get('c') ||
  location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] ||
  ''
).toLowerCase();

let images = [];
let current = 0;

async function main() {
  if (!configured) {
    setupNotice();
    renderHeader([], {});
    renderFooter({});
    return;
  }
  const { settings, cats } = await loadPublic();
  renderHeader(cats, settings, slug);
  renderFooter(settings);

  const cat = cats.find((c) => c.slug === slug);
  if (!cat) {
    $('#catName').textContent = 'ไม่พบหน้านี้';
    $('#catDesc').textContent = 'หมวดหมู่นี้อาจถูกซ่อนหรือลบไปแล้ว';
    document.title = `ไม่พบหน้า — ${settings.studio_name || '945 Persec Studio'}`;
    return;
  }

  document.title = `${cat.name} — ${settings.studio_name || '945 Persec Studio'}`;
  $('#catName').textContent = cat.name;
  $('#catDesc').textContent = cat.description || '';
  $('#catPrice').textContent = cat.price_text || '';

  const { data, error } = await supabase
    .from('images')
    .select('*')
    .eq('category_id', cat.id)
    .eq('is_visible', true)
    .order('sort_order')
    .order('created_at');
  if (error) console.error(error);
  images = data || [];

  $('#gallery').innerHTML = images.length
    ? images
        .map(
          (im, i) => `
      <button class="tile ${im.is_sold ? 'sold' : ''}" data-i="${i}">
        <img src="${esc(im.url)}" alt="${esc(im.title || cat.name)}" loading="lazy">
        ${im.is_sold ? '<span class="badge">SOLD</span>' : ''}
        ${im.title || im.price_text ? `<span class="tile-cap">${esc(im.title || '')}${im.title && im.price_text ? ' · ' : ''}${esc(im.price_text || '')}</span>` : ''}
      </button>`
        )
        .join('')
    : '<p class="empty-msg">ยังไม่มีผลงานในหมวดนี้</p>';
}

// ---------- Lightbox ----------
const lb = $('#lightbox');
function show(i) {
  current = (i + images.length) % images.length;
  const im = images[current];
  $('#lbImg').src = im.url;
  const cap = [im.title, im.price_text, im.is_sold ? 'SOLD' : ''].filter(Boolean).join(' · ');
  $('#lbCap').innerHTML = esc(cap) + (im.description ? `<small>${esc(im.description)}</small>` : '');
  if (!lb.open) lb.showModal();
}
$('#gallery').addEventListener('click', (e) => {
  const t = e.target.closest('.tile');
  if (t) show(+t.dataset.i);
});
$('.lb-close').addEventListener('click', () => lb.close());
$('.lb-prev').addEventListener('click', () => show(current - 1));
$('.lb-next').addEventListener('click', () => show(current + 1));
lb.addEventListener('click', (e) => {
  if (e.target === lb) lb.close();
});
document.addEventListener('keydown', (e) => {
  if (!lb.open) return;
  if (e.key === 'ArrowLeft') show(current - 1);
  if (e.key === 'ArrowRight') show(current + 1);
});

main();
