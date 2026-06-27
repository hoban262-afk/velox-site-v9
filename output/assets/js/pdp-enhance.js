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

  var FREE_THRESHOLD = 100; // matches cart.js
  function fmt(n) { var v = Math.round(n * 100) / 100; return '£' + (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)); }

  // ── Scoped styles ───────────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '.vp-ship-nudge{display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:12.5px;color:#9CA3AF;background:rgba(1,211,160,.06);border:1px solid rgba(1,211,160,.22);border-radius:8px;padding:9px 12px;line-height:1.4}',
    '.vp-ship-nudge b{color:#01D3A0;font-weight:600}',
    '.vp-vol-nudge{display:block;margin:0 0 14px;font-size:12.5px;color:#9CA3AF;background:rgba(1,211,160,.06);border:1px solid rgba(1,211,160,.22);border-radius:8px;padding:10px 14px;line-height:1.4}',
    '.vp-vol-nudge b{color:#01D3A0;font-weight:600}',
    '.vp-vol-track{position:relative;height:6px;margin:15px 18px 26px;background:rgba(255,255,255,.1);border-radius:99px}',
    '.vp-vol-trackfill{position:absolute;left:0;top:0;height:100%;background:#01D3A0;border-radius:99px;width:0;transition:width .35s ease}',
    '.vp-vol-cp{position:absolute;top:50%;width:13px;height:13px;margin:-6.5px 0 0 -6.5px;border-radius:50%;background:#0d0d0d;border:2px solid rgba(255,255,255,.28);z-index:1;transition:background .25s,border-color .25s}',
    '.vp-vol-cp.hit{background:#01D3A0;border-color:#01D3A0;box-shadow:0 0 9px rgba(1,211,160,.65)}',
    '.vp-vol-cplbl{position:absolute;top:15px;left:50%;transform:translateX(-50%);font-family:var(--mono,monospace);font-size:10px;color:#6B7280;white-space:nowrap}',
    '.vp-vol-cp.hit .vp-vol-cplbl{color:#01D3A0;font-weight:600}',
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

  // Vial volume discount mirrors cart.js / checkout.js: SPEND-based on the DISCOUNTABLE
  // vial subtotal (pens, BAC water and 10-packs excluded). £75->5, £150->10, £200->15, £250->20%.
  var VOL_TIERS = [{ min: 75, pct: 5 }, { min: 150, pct: 10 }, { min: 200, pct: 15 }, { min: 250, pct: 20 }];
  function isPenSz(sz) { return /pen/i.test(sz || ''); }
  function is10packSz(sz) { return /10-?pack/i.test(sz || ''); }
  function itemExcluded(i) { return isPenSz(i.size) || is10packSz(i.size) || i.slug === 'bacteriostatic-water'; }
  function vialSubtotal() {
    var c = [];
    try { c = JSON.parse(localStorage.getItem('vp_cart') || '[]'); } catch (e) { c = []; }
    return c.reduce(function (s, i) { return s + (itemExcluded(i) ? 0 : (parseFloat(i.price) || 0) * (i.qty || 1)); }, 0);
  }
  function selectedIsVial() {
    var sl = selected();
    if (!sl) return false;
    return !isPenSz(sl.value) && !is10packSz(sl.value) && (form.getAttribute('data-compound') !== 'bacteriostatic-water');
  }

  // ── (1) Free-shipping nudge in the buy box ─────────────────────────────────
  var btn = document.getElementById('add-to-order-btn');
  var nudge = document.createElement('div');
  nudge.className = 'vp-ship-nudge';
  nudge.id = 'vp-pdp-ship';
  if (btn && btn.parentNode) btn.parentNode.insertBefore(nudge, btn.nextSibling);
  else form.appendChild(nudge);

  function updateNudge() {
    // Basket-based: reflects only what's actually in the cart, so the bar starts
    // at £0 on an empty basket and only fills as items are added.
    var projected = cartSubtotal();
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

  // ── (2b) Volume-discount progress nudge in the buy box ─────────────────────
  var volNudge = document.createElement('div');
  volNudge.className = 'vp-vol-nudge';
  volNudge.id = 'vp-pdp-vol';
  if (nudge && nudge.parentNode) nudge.parentNode.insertBefore(volNudge, nudge.nextSibling);
  else form.appendChild(volNudge);

  function updateVolNudge() {
    // Basket-based discountable vial spend (pens, BAC water and 10-packs excluded),
    // so the track starts at £0 and only moves as vials are added to the basket.
    var spend = vialSubtotal();
    if (spend <= 0) { volNudge.style.display = 'none'; return; }
    volNudge.style.display = 'block';

    var MAX = VOL_TIERS[VOL_TIERS.length - 1].min; // £250 = full track
    var fillPct = Math.max(0, Math.min(100, (spend / MAX) * 100));

    // Current unlocked rate + the next checkpoint still to reach.
    var currentPct = 0, next = null;
    for (var k = 0; k < VOL_TIERS.length; k++) {
      if (spend >= VOL_TIERS[k].min) currentPct = VOL_TIERS[k].pct;
      else if (!next) next = VOL_TIERS[k];
    }

    var msg;
    if (next) {
      var remaining = Math.round((next.min - spend) * 100) / 100;
      msg = (currentPct > 0 ? 'You’ve unlocked <b>' + currentPct + '% off</b> — add ' : 'Add ') +
        '<b>' + fmt(remaining) + '</b> more to reach <b>' + next.pct + '% off</b>';
    } else {
      msg = '<b>✓ You’ve unlocked the full ' + currentPct + '% volume discount</b>';
    }

    // Checkpoint markers at each tier position along a single £0–£250 track.
    var cps = '';
    for (var t = 0; t < VOL_TIERS.length; t++) {
      var pos = (VOL_TIERS[t].min / MAX) * 100;
      var hit = spend >= VOL_TIERS[t].min;
      cps += '<span class="vp-vol-cp' + (hit ? ' hit' : '') + '" style="left:' + pos + '%">' +
        '<span class="vp-vol-cplbl">' + VOL_TIERS[t].pct + '%</span></span>';
    }

    volNudge.innerHTML = '<div>' + msg + '</div>' +
      '<div class="vp-vol-track"><span class="vp-vol-trackfill" style="width:' + fillPct + '%"></span>' + cps + '</div>';
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
    setTimeout(refresh, 90);
  });

  // ── Wire updates ────────────────────────────────────────────────────────────
  function refresh() { updateNudge(); updateVolNudge(); updateBar(); }
  form.querySelectorAll('input[name="size"]').forEach(function (i) {
    i.addEventListener('change', refresh);
  });
  if (btn) btn.addEventListener('click', function () { setTimeout(refresh, 60); });

  // pricing.js hydrates data-price from product_variants AFTER this script's
  // initial render — without this the sticky bar keeps showing the stale
  // hardcoded HTML price (e.g. £24.99 while the buy box shows the live £29).
  document.addEventListener('vp:prices-updated', refresh);
  // Fallback: if hydration resolved from sessionStorage cache, the event can
  // fire before this listener attaches (deferred scripts run in order, and the
  // cache path resolves on a microtask between them). Re-read shortly after.
  setTimeout(refresh, 800);
  setTimeout(refresh, 2500);

  refresh();
}());
