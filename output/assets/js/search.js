/**
 * search.js — instant client-side site search for Velox Peptides.
 * Attaches to any <form class="vp-search"> containing an <input class="vp-search-input">
 * and a <div class="vp-search-results">. Fetches /assets/search-index.json once.
 * Products & bundles rank above guides. Keyboard: ↑/↓ to move, Enter to open, Esc to close.
 */
(function () {
  'use strict';

  var forms = document.querySelectorAll('.vp-search');
  if (!forms.length) return;

  // ── Scoped styles ───────────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '.vp-search{position:relative;width:100%;max-width:560px}',
    '.vp-search-box{position:relative;display:flex;align-items:center}',
    '.vp-search-box svg{position:absolute;left:14px;width:18px;height:18px;stroke:#6B7280;pointer-events:none}',
    '.vp-search-input{width:100%;box-sizing:border-box;background:#0f0f0f;border:1px solid rgba(255,255,255,.14);border-radius:10px;color:#fff;font:inherit;font-size:15px;padding:13px 16px 13px 42px;transition:border-color .15s,box-shadow .15s}',
    '.vp-search-input::placeholder{color:#6B7280}',
    '.vp-search-input:focus{outline:none;border-color:#00D4A0;box-shadow:0 0 0 3px rgba(0,212,160,.15)}',
    '.vp-search-results{position:absolute;top:calc(100% + 8px);left:0;right:0;background:#0b0b0b;border:1px solid rgba(255,255,255,.14);border-radius:10px;overflow:hidden;z-index:400;box-shadow:0 16px 48px rgba(0,0,0,.55);max-height:60vh;overflow-y:auto}',
    '.vp-search-results[hidden]{display:none}',
    '.vp-sr-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.05)}',
    '.vp-sr-item:last-child{border-bottom:none}',
    '.vp-sr-item:hover,.vp-sr-item.is-active{background:rgba(0,212,160,.08)}',
    '.vp-sr-title{color:#F9FAFB;font-size:14px;font-weight:500}',
    '.vp-sr-badge{font-family:var(--mono,monospace);font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#9CA3AF;border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:2px 7px;white-space:nowrap;flex:0 0 auto}',
    '.vp-sr-badge.product{color:#00D4A0;border-color:rgba(0,212,160,.3)}',
    '.vp-sr-badge.bundle{color:#F5C842;border-color:rgba(245,200,66,.3)}',
    '.vp-sr-empty{padding:16px;color:#6B7280;font-size:13px;text-align:center}',
    '.vp-sr-all{display:block;padding:11px 16px;text-align:center;font-family:var(--mono,monospace);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#00D4A0;text-decoration:none;border-top:1px solid rgba(255,255,255,.08);background:rgba(0,212,160,.04)}'
  ].join('');
  document.head.appendChild(css);

  var INDEX = null, pending = [];
  fetch('/assets/search-index.json').then(function (r) { return r.json(); })
    .then(function (data) { INDEX = data; pending.forEach(function (fn) { fn(); }); pending = []; })
    .catch(function () { INDEX = []; });

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function score(item, q, words) {
    var t = item.t.toLowerCase();
    var hay = (item.t + ' ' + (item.c || '') + ' ' + (item.k || '')).toLowerCase();
    for (var i = 0; i < words.length; i++) { if (hay.indexOf(words[i]) === -1) return 0; }
    var s;
    if (t.indexOf(q) === 0) s = 100;
    else if (t.indexOf(q) > -1) s = 60;
    else if ((item.k || '').toLowerCase().indexOf(q) > -1) s = 35;
    else s = 20;
    if (item.y === 'product') s += 15;
    else if (item.y === 'bundle') s += 10;
    return s;
  }

  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    var words = q.split(/\s+/);
    return INDEX
      .map(function (it) { return { it: it, s: score(it, q, words) }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s || a.it.t.length - b.it.t.length; })
      .slice(0, 8)
      .map(function (r) { return r.it; });
  }

  function badgeLabel(it) {
    if (it.y === 'bundle') return 'Bundle';
    if (it.y === 'guide') return 'Guide';
    return it.c || 'Shop';
  }

  forms.forEach(function (form) {
    var input = form.querySelector('.vp-search-input');
    var box   = form.querySelector('.vp-search-results');
    if (!input || !box) return;
    var active = -1, current = [];

    function render(q) {
      if (!INDEX) { pending.push(function () { render(q); }); return; }
      current = search(q);
      active = -1;
      if (!q.trim()) { box.hidden = true; box.innerHTML = ''; return; }
      if (!current.length) {
        box.innerHTML = '<div class="vp-sr-empty">No matches for &ldquo;' + esc(q) + '&rdquo;</div>' +
          '<a class="vp-sr-all" href="/compounds/">Browse all compounds &rarr;</a>';
        box.hidden = false; return;
      }
      box.innerHTML = current.map(function (it) {
        return '<a class="vp-sr-item" href="' + esc(it.u) + '">' +
          '<span class="vp-sr-title">' + esc(it.t) + '</span>' +
          '<span class="vp-sr-badge ' + it.y + '">' + esc(badgeLabel(it)) + '</span></a>';
      }).join('') + '<a class="vp-sr-all" href="/compounds/">Browse all compounds &rarr;</a>';
      box.hidden = false;
    }

    function setActive(i) {
      var items = box.querySelectorAll('.vp-sr-item');
      if (!items.length) return;
      active = (i + items.length) % items.length;
      items.forEach(function (el, idx) { el.classList.toggle('is-active', idx === active); });
      items[active].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('focus', function () { if (input.value.trim()) render(input.value); });

    input.addEventListener('keydown', function (e) {
      var items = box.querySelectorAll('.vp-sr-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') {
        if (active > -1 && items[active]) { e.preventDefault(); window.location.href = items[active].getAttribute('href'); }
        else if (current.length) { e.preventDefault(); window.location.href = current[0].u; }
      } else if (e.key === 'Escape') { box.hidden = true; input.blur(); }
    });

    document.addEventListener('click', function (e) {
      if (!form.contains(e.target)) box.hidden = true;
    });
  });
}());
