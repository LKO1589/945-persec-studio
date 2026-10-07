import { supabase, configured, esc, $, setupNotice, loadPublic, renderHeader, renderFooter } from './common.js';

async function main() {
  if (!configured) {
    setupNotice();
    renderHeader([], {});
    renderFooter({});
    $('#catGrid').innerHTML = '';
    return;
  }

  const { settings, cats } = await loadPublic();
  renderHeader(cats, settings);
  renderFooter(settings);

  if (settings.studio_name) {
    const parts = settings.studio_name.trim().split(/\s+/);
    const last = parts.length > 1 ? parts.pop() : '';
    $('#studioName').innerHTML = esc(parts.join(' ')) + (last ? '<br>' + esc(last) : '');
    document.title = `${settings.studio_name} — Tattoo`;
  }
  $('#tagline').textContent = settings.tagline || '';

  if (settings.hero_url) {
    $('#heroMedia').innerHTML = `<img src="${esc(settings.hero_url)}" alt="">`;
  } else {
    $('#heroMedia').classList.add('empty');
  }

  // Covers: use the category cover, otherwise the first visible image in it.
  const missing = cats.filter((c) => !c.cover_url).map((c) => c.id);
  const firstImg = {};
  const counts = {};
  if (cats.length) {
    const { data } = await supabase
      .from('images')
      .select('category_id,url,sort_order,created_at')
      .in('category_id', cats.map((c) => c.id))
      .order('sort_order')
      .order('created_at');
    (data || []).forEach((im) => {
      counts[im.category_id] = (counts[im.category_id] || 0) + 1;
      if (missing.includes(im.category_id) && !firstImg[im.category_id]) firstImg[im.category_id] = im.url;
    });
  }

  $('#catGrid').innerHTML = cats.length
    ? cats
        .map((c, i) => {
          const cover = c.cover_url || firstImg[c.id];
          return `
        <a class="cat-card" href="/${esc(c.slug)}">
          <div class="cat-cover">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : '<span class="cat-placeholder"></span>'}</div>
          <div class="cat-meta">
            <span class="cat-index">${String(i + 1).padStart(2, '0')}</span>
            <h3>${esc(c.name)}</h3>
            ${c.price_text ? `<p class="price">${esc(c.price_text)}</p>` : ''}
            <p class="count">${counts[c.id] || 0} ชิ้น →</p>
          </div>
        </a>`;
        })
        .join('')
    : '<p class="empty-msg">ยังไม่มีหมวดหมู่</p>';

  if (settings.about) {
    $('#aboutText').textContent = settings.about;
    $('#about').hidden = false;
  }
  if (settings.booking) {
    $('#bookingText').textContent = settings.booking;
    $('#booking').hidden = false;
  }
  const faq = Array.isArray(settings.faq) ? settings.faq.filter((f) => f.q) : [];
  if (faq.length) {
    $('#faqList').innerHTML = faq
      .map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
      .join('');
    $('#faq').hidden = false;
  }
}

main();
