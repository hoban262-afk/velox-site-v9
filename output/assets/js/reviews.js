/**
 * reviews.js — Product reviews for Velox Peptides
 *
 * Self-injecting: on any /compounds/<slug>/ or /stacks/<slug>/ page it
 *   1. reads approved reviews from Supabase for that product,
 *   2. renders an average-rating header, the review list, and a submit form,
 *   3. injects aggregateRating + Review JSON-LD so Google can show ⭐ stars.
 *
 * Requires the Supabase CDN + supabase-client.js to be loaded first.
 * Fails silently if Supabase is unavailable — never blocks the page.
 */
(function () {
  'use strict';

  // ── Detect product slug from the URL ────────────────────────────────────────
  var m = window.location.pathname.match(/\/(compounds|stacks)\/([^\/]+)\/?$/);
  if (!m) return;                       // not a product page
  var slug = m[2];
  if (slug === '' ) return;
  // Skip category index pages (cognitive, metabolic, etc. live under /compounds/ too,
  // but those are category listings). We only attach where there's a single product H1.
  var h1 = document.querySelector('.page-h1, .prod-h1, h1');
  var productName = h1 ? h1.textContent.trim() : slug;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function stars(n) {
    n = Math.round(n);
    var out = '';
    for (var i = 1; i <= 5; i++) out += '<span class="rv-star' + (i <= n ? ' on' : '') + '">★</span>';
    return out;
  }

  // ── Inject styles (scoped, matches dark theme) ──────────────────────────────
  var css = document.createElement('style');
  css.textContent =
    '.rv-sec{max-width:1200px;margin:0 auto;padding:48px 24px;border-top:1px solid var(--brd,#1a1a1a)}' +
    '.rv-hdr{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:8px}' +
    '.rv-title{font-size:22px;font-weight:700;color:#fff;margin:0}' +
    '.rv-avg{display:flex;align-items:center;gap:10px;margin:6px 0 28px;color:var(--t2,#9ca3af);font-size:14px}' +
    '.rv-star{color:#3a3f4a;font-size:18px;line-height:1}.rv-star.on{color:#f5b301}' +
    '.rv-list{display:grid;gap:16px;margin-bottom:36px}' +
    '.rv-card{background:var(--bg2,#0d0d0d);border:1px solid var(--brd,#1a1a1a);border-radius:8px;padding:16px 18px}' +
    '.rv-card-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px}' +
    '.rv-card-name{font-weight:600;color:#fff;font-size:14px}' +
    '.rv-vp{font-size:10px;font-family:var(--mono,monospace);color:var(--g,#01D3A0);border:1px solid rgba(1,211,160,.3);border-radius:3px;padding:1px 6px;margin-left:8px}' +
    '.rv-card-date{font-size:12px;color:var(--t3,#6b7280)}' +
    '.rv-card-title{font-weight:600;color:#fff;font-size:14px;margin:6px 0 4px}' +
    '.rv-card-body{color:var(--t2,#9ca3af);font-size:13px;line-height:1.6}' +
    '.rv-empty{color:var(--t3,#6b7280);font-size:14px;margin-bottom:28px}' +
    '.rv-form{background:var(--bg2,#0d0d0d);border:1px solid var(--brd,#1a1a1a);border-radius:8px;padding:22px 20px;max-width:560px}' +
    '.rv-form h3{font-size:15px;color:#fff;margin:0 0 14px}' +
    '.rv-rate{display:flex;gap:4px;margin-bottom:14px;cursor:pointer}' +
    '.rv-rate .rv-star{font-size:26px;cursor:pointer;transition:color .1s}' +
    '.rv-form .f-inp,.rv-form textarea{width:100%;box-sizing:border-box;margin-bottom:12px;background:var(--bg3,#111);border:1px solid var(--brd,#1a1a1a);color:#fff;padding:10px 12px;border-radius:6px;font:inherit;font-size:14px}' +
    '.rv-form textarea{min-height:90px;resize:vertical}' +
    '.rv-msg{font-size:13px;margin-top:8px}.rv-msg.ok{color:var(--g,#01D3A0)}.rv-msg.err{color:#f87171}' +
    /* top-of-page rating summary (below the product image) */
    '.cp-rating-summary{display:flex;align-items:center;gap:9px;margin:16px 0 0;text-decoration:none;font-family:var(--mono,monospace);font-size:13px;color:var(--t2,#9ca3af);transition:color .15s}' +
    '.cp-rating-summary .rv-star{font-size:20px}' +
    '.cp-rating-summary .crs-num{color:#fff;font-weight:700;font-size:15px}' +
    '.cp-rating-summary .crs-text{letter-spacing:.02em}' +
    '.cp-rating-summary .crs-text b{color:var(--g,#01D3A0);font-weight:600}' +
    '.cp-rating-summary:hover .crs-text{color:#fff}';
  document.head.appendChild(css);

  // ── Build the section shell and insert before the compliance block ─────────
  var anchor = document.querySelector('.compliance-block') ||
               document.querySelector('.site-footer');
  if (!anchor) return;

  var sec = document.createElement('section');
  sec.className = 'rv-sec';
  sec.id = 'reviews';
  sec.innerHTML =
    '<div class="rv-hdr"><h2 class="rv-title">Researcher reviews</h2></div>' +
    '<div class="rv-avg" id="rv-avg"></div>' +
    '<div class="rv-list" id="rv-list"></div>' +
    '<div class="rv-form">' +
      '<h3>Leave a review for ' + esc(productName) + '</h3>' +
      '<div class="rv-rate" id="rv-rate" aria-label="Rating">' +
        '<span class="rv-star" data-v="1">★</span><span class="rv-star" data-v="2">★</span>' +
        '<span class="rv-star" data-v="3">★</span><span class="rv-star" data-v="4">★</span>' +
        '<span class="rv-star" data-v="5">★</span>' +
      '</div>' +
      '<input class="f-inp" id="rv-name" placeholder="Your name (or initials)" maxlength="60">' +
      '<input class="f-inp" id="rv-title" placeholder="Review title (optional)" maxlength="120">' +
      '<textarea id="rv-body" placeholder="Share your experience with this compound in a laboratory research context. Note: reviews must not describe personal use, dosing, or health outcomes — these cannot be published." maxlength="1200"></textarea>' +
      '<button class="btn-p" id="rv-submit" type="button">Submit review</button>' +
      '<div class="rv-msg" id="rv-msg"></div>' +
    '</div>';
  anchor.parentNode.insertBefore(sec, anchor);

  // ── Rating picker ───────────────────────────────────────────────────────────
  var chosen = 0;
  var rateEl = document.getElementById('rv-rate');
  rateEl.querySelectorAll('.rv-star').forEach(function (st) {
    st.addEventListener('click', function () {
      chosen = parseInt(st.getAttribute('data-v'), 10);
      rateEl.querySelectorAll('.rv-star').forEach(function (s2) {
        s2.classList.toggle('on', parseInt(s2.getAttribute('data-v'), 10) <= chosen);
      });
    });
  });

  // ── Top-of-page rating summary (sits below the product image) ───────────────
  function renderSummary(avg, count) {
    var el = document.getElementById('cp-rating-summary');
    if (!el) return;
    if (!count) {
      el.innerHTML = stars(0) + '<span class="crs-text">No reviews yet — <b>be the first</b></span>';
    } else {
      el.innerHTML = stars(avg) +
        '<span class="crs-num">' + avg.toFixed(1) + '</span>' +
        '<span class="crs-text">(' + count + ' review' + (count === 1 ? '' : 's') + ')</span>';
    }
  }

  // ── Render reviews + schema ─────────────────────────────────────────────────
  function render(reviews) {
    var listEl = document.getElementById('rv-list');
    var avgEl  = document.getElementById('rv-avg');
    if (!reviews || !reviews.length) {
      avgEl.innerHTML = '';
      listEl.innerHTML = '<p class="rv-empty">No reviews yet — be the first to review ' + esc(productName) + '.</p>';
      renderSummary(0, 0);
      return;
    }
    var sum = reviews.reduce(function (s, r) { return s + r.rating; }, 0);
    var avg = sum / reviews.length;
    renderSummary(avg, reviews.length);

    avgEl.innerHTML = '<span>' + stars(avg) + '</span>' +
      '<strong style="color:#fff">' + avg.toFixed(1) + '</strong> / 5 · ' +
      reviews.length + ' review' + (reviews.length === 1 ? '' : 's');

    listEl.innerHTML = reviews.map(function (r) {
      var d = new Date(r.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      return '<div class="rv-card">' +
        '<div class="rv-card-top">' +
          '<div><span class="rv-card-name">' + esc(r.author_name) + '</span>' +
            (r.verified_purchase ? '<span class="rv-vp">VERIFIED</span>' : '') + '</div>' +
          '<div>' + stars(r.rating) + '</div>' +
        '</div>' +
        (r.title ? '<div class="rv-card-title">' + esc(r.title) + '</div>' : '') +
        (r.body  ? '<div class="rv-card-body">' + esc(r.body) + '</div>' : '') +
        '<div class="rv-card-date" style="margin-top:8px">' + d + '</div>' +
      '</div>';
    }).join('');

    // JSON-LD aggregateRating + reviews → eligible for ⭐ in Google
    var ld = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': productName,
      'aggregateRating': {
        '@type': 'AggregateRating',
        'ratingValue': avg.toFixed(1),
        'reviewCount': reviews.length,
        'bestRating': '5', 'worstRating': '1'
      },
      'review': reviews.slice(0, 10).map(function (r) {
        return {
          '@type': 'Review',
          'author': { '@type': 'Person', 'name': r.author_name },
          'datePublished': (r.created_at || '').slice(0, 10),
          'reviewRating': { '@type': 'Rating', 'ratingValue': r.rating, 'bestRating': '5', 'worstRating': '1' },
          'reviewBody': r.body || r.title || ''
        };
      })
    };
    // Only inject if the page doesn't already ship a server-side aggregateRating
    // (avoids duplicate Product rating nodes for products with baked-in ratings).
    var hasStaticRating = Array.prototype.some.call(
      document.querySelectorAll('script[type="application/ld+json"]'),
      function (el) { return el.textContent.indexOf('aggregateRating') > -1; }
    );
    if (!hasStaticRating) {
      var s = document.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(ld);
      document.head.appendChild(s);
    }
  }

  function load() {
    if (!window._sb) { render([]); return; }
    window._sb.from('reviews')
      .select('author_name,rating,title,body,verified_purchase,created_at')
      .eq('product_slug', slug)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .then(function (r) { render(r.error ? [] : (r.data || [])); });
  }

  // ── Submit handler ──────────────────────────────────────────────────────────
  document.getElementById('rv-submit').addEventListener('click', function () {
    var msg  = document.getElementById('rv-msg');
    var name = document.getElementById('rv-name').value.trim();
    var title = document.getElementById('rv-title').value.trim();
    var body = document.getElementById('rv-body').value.trim();
    msg.className = 'rv-msg';

    if (!chosen)        { msg.className = 'rv-msg err'; msg.textContent = 'Please choose a star rating.'; return; }
    if (!name)          { msg.className = 'rv-msg err'; msg.textContent = 'Please add your name.'; return; }
    if (body.length < 4){ msg.className = 'rv-msg err'; msg.textContent = 'Please write a short review.'; return; }

    var btn = document.getElementById('rv-submit');
    btn.disabled = true; btn.textContent = 'Submitting…';

    // Submit via the server endpoint (service-role) — same pattern as orders,
    // newsletter and interest. Avoids anon-client/RLS fragility.
    fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_slug: slug, product_name: productName,
        author_name: name, rating: chosen, title: title || null, body: body
      })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (res) {
      if (!res.ok) {
        msg.className = 'rv-msg err';
        msg.textContent = (res.d && res.d.error) || 'Could not submit — please try again.';
        btn.disabled = false; btn.textContent = 'Submit review';
      } else {
        msg.className = 'rv-msg ok';
        msg.textContent = 'Thank you — your review has been submitted for approval.';
        document.getElementById('rv-name').value = '';
        document.getElementById('rv-title').value = '';
        document.getElementById('rv-body').value = '';
        btn.textContent = 'Submitted ✓';
      }
    }).catch(function () {
      msg.className = 'rv-msg err'; msg.textContent = 'Could not submit — please try again.';
      btn.disabled = false; btn.textContent = 'Submit review';
    });
  });

  load();
}());
