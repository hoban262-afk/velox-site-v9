/**
 * pdp-enhance.js — buy-box conversion enhancers for Velox product pages:
 *   (1) per-vial £/mg value line on each size option (pulls buyers up the ladder)
 *   (2) "Add £X for free UK shipping" progress nudge inside the buy box
 *   (3) mobile sticky add-to-order bar (price + button pinned on scroll)
 *
 * Reads the same form + cart (localStorage 'vp_cart') that compound.js writes,
 * so nothing here changes how orders are added — it only reflects state.
 * Bails out quietly if the expected DOM isn't present.
 */
(function () {
  'use strict';

  var form = document.getElementById('order-form');
  if (!form) return;
  if (window.__vpPdpEnhance) return;
  window.__vpPdpEnhance = true;

  var FREE_THRESHOLD = 80; // matches cart.js
  function fmt(n) { return '£' + (Math.round(n * 100) / 100).toFixed(2); }

  // ── Scoped styles ───────────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '.cp-size-permg{display:block;margin-top:4px;font-family:var(--mono,monospace);font-size:10.5px;letter-spacing:.03em;color:var(--t3,#6B7280)}',
    '.cp-size-opt input:checked ~ .cp-size-price-wrap .cp-size-permg{color:var(--g,#01D3A0)}',
    '.vp-ship-nudge{display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:12.5px;color:#9CA3AF;background:rgba(1,211,160,.06);border:1px solid rgba(1,211,160,.22);border-radius:8px;padding:9px 12px;line-height:1.4}',
    '.vp-ship-nudge b{color:#01D3A0;font-weight:600}',
    '.vp-ship-nudge .vpn-bar{flex:0 0 60px;height:5px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden}',
    '.vp-ship-nudge .vpn-fill{display:block;height:100%;background:#01D3A0;width:0;transition:width .35s ease}',
    '.vp-sticky-buy{display:none}',
    '@media(max-width:767px){',
      '.vp-sticky-buy{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:280;align-items:center;gap:12px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:rgba(8,8,8,.97);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid rgba(255,255,255,.1)}',
      '.vp-sticky-buy .vsb-info{display:flex;flex-direction:column;line-height:1.15;min-width:0}',
      '.vp-sticky-buy .vsb-name{font-size:11px;color:#9CA3AF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42vw}',
      '.vp-sticky-buy .vsb-price{font-family:var(--disp,sans-serif);font-weight:800;font-size:21px;color:#fff}',
      '.vp-sticky-buy .vsb-btn{margin-left:auto;flex:0 0 auto;background:#01D3A0;color:#021;font-family:var(--mono,monospace);font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;border:none;border-radius:8px;padding:13px 22px;cursor:pointer}',
      '.vp-sticky-buy .vsb-btn:active{transform:translateY(1px)}',
      'body{padding-bottom:74px}',
    '}'
  ].join('');
  document.head.appendChild(css);

  function selected() { return form.querySelector('input[name="size"]:checked'); }
  function selectedPrice() { var s = selected(); return s ? (parseFloat(s.getAttribute('data-price')) || 0) : 0; }
  function cartSubtotal() {
    var c = [];
    try { c = JSON.parse(localStorage.getItem('vp_cart') || '[]'); } catch (e) { c = []; }
    return c.reduce(function (s, i) { return s + (parseFloat(i.price) || 0) * (i.qty || 1); }, 0);
  }

  // ── (1) Per-mg value line on each size option ──────────────────────────────
  form.querySelectorAll('.cp-size-opt').forEach(function (opt) {
    var input = opt.querySelector('input[name="size"]');
    var wrap = opt.querySelector('.cp-size-price-wrap');
    if (!input || !wrap || opt.querySelector('.cp-size-permg')) return;
    var price = parseFloat(input.getAttribute('data-price')) || 0;
    var m = (input.value || '').match(/([\d.]+)\s*(mg|mcg)/i);
    if (!price || !m) return;
    var mg = parseFloat(m[1]);
    if (m[2].toLowerCase() === 'mcg') mg = mg / 1000;
    if (!mg) return;
    var per = price / mg;
    var span = document.createElement('span');
    span.className = 'cp-size-permg';
    span.textContent = (per >= 1 ? fmt(per) : '£' + per.toFixed(3)) + ' / mg';
    wrap.appendChild(span);
  });

  // ── (2) Free-shipping nudge in the buy box ─────────────────────────────────
  var btn = document.getElementById('add-to-order-btn');
  var nudge = document.createElement('div');
  nudge.className = 'vp-ship-nudge';
  nudge.id = 'vp-pdp-ship';
  if (btn && btn.parentNode) btn.parentNode.insertBefore(nudge, btn.nextSibling);
  else form.appendChild(nudge);

  function updateNudge() {
    var projected = cartSubtotal() + selectedPrice();
    var remaining = FREE_THRESHOLD - projected;
    var pct = Math.max(0, Math.min(100, (projected / FREE_THRESHOLD) * 100));
    if (remaining > 0) {
      nudge.innerHTML = '<span class="vpn-bar"><span class="vpn-fill" style="width:' + pct + '%"></span></span>' +
        '<span>Add <b>' + fmt(remaining) + '</b> for free UK shipping</span>';
    } else {
      nudge.innerHTML = '<span class="vpn-bar"><span class="vpn-fill" style="width:100%"></span></span>' +
        '<span><b>✓ Free UK shipping unlocked</b></span>';
    }
  }

  // ── (3) Mobile sticky add-to-order bar ─────────────────────────────────────
  var bar = document.createElement('div');
  bar.className = 'vp-sticky-buy';
  var pname = form.getAttribute('data-name') || 'this compound';
  bar.innerHTML =
    '<span class="vsb-info"><span class="vsb-name">' + pname + '</span>' +
    '<span class="vsb-price" id="vsb-price"></span></span>' +
    '<button type="button" class="vsb-btn" id="vsb-btn">Add to order</button>';
  document.body.appendChild(bar);

  function updateBar() {
    var p = document.getElementById('vsb-price');
    if (p) p.textContent = fmt(selectedPrice());
  }

  document.getElementById('vsb-btn').addEventListener('click', function () {
    var ack = form.querySelector('input[name="ack"]');
    if (ack && !ack.checked) {
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (window.toast) window.toast('Please tick the research-use acknowledgement.');
      ack.focus();
      return;
    }
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    setTimeout(updateNudge, 90);
  });

  // ── Wire updates ────────────────────────────────────────────────────────────
  function refresh() { updateNudge(); updateBar(); }
  form.querySelectorAll('input[name="size"]').forEach(function (i) {
    i.addEventListener('change', refresh);
  });
  if (btn) btn.addEventListener('click', function () { setTimeout(updateNudge, 60); });

  refresh();
}());
