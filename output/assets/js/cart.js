(function () {
  'use strict';

  var SHIPPING_FLAT = 3.80;
  var FREE_THRESHOLD = 100;

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem('vp_cart') || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem('vp_cart', JSON.stringify(cart));
  }

  function fmt(n) {
    var v = Math.round(n * 100) / 100;
    return '£' + (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
  }

  function render() {
    var cart = getCart();
    var itemsEl  = document.getElementById('cart-items');
    var emptyEl  = document.getElementById('cart-empty');
    var summaryEl = document.getElementById('cart-summary');
    var subtotalEl = document.getElementById('cart-subtotal');
    var shippingEl = document.getElementById('cart-shipping');
    var totalEl    = document.getElementById('cart-total');

    if (!itemsEl) return;

    if (!cart.length) {
      if (emptyEl) emptyEl.style.display = '';
      if (summaryEl) summaryEl.style.display = 'none';
      itemsEl.innerHTML = '';
      var n0 = document.getElementById('vp-freeship'); if (n0) n0.remove();
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (summaryEl) summaryEl.style.display = '';

    // Render rows
    itemsEl.innerHTML = '';
    cart.forEach(function (item, idx) {
      var row = document.createElement('div');
      row.className = 'cart-item';
      // Only allow relative paths (starting with /) to prevent javascript: / data: XSS via item.url
      var safeUrl = (item.url && typeof item.url === 'string' && /^\//.test(item.url)) ? item.url : '#';
      row.innerHTML = '<div class="cart-item-info">' +
        '<a class="cart-item-name" href="' + safeUrl + '">' + escHtml(item.name) + '</a>' +
        '<div class="cart-item-size">' + escHtml(item.size) + '</div>' +
        '</div>' +
        '<div class="cart-item-price">' + fmt(item.price) + '</div>' +
        '<div class="cart-item-qty">' +
        '<button class="cart-qty-btn" data-idx="' + idx + '" data-delta="-1">−</button>' +
        '<span class="cart-qty-val">' + (item.qty || 1) + '</span>' +
        '<button class="cart-qty-btn" data-idx="' + idx + '" data-delta="1">+</button>' +
        '</div>' +
        '<button class="cart-remove" data-idx="' + idx + '" aria-label="Remove">✕</button>';
      itemsEl.appendChild(row);
    });

    // Qty / remove handlers
    itemsEl.querySelectorAll('.cart-qty-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-idx'), 10);
        var d = parseInt(btn.getAttribute('data-delta'), 10);
        var c = getCart();
        c[i].qty = Math.max(1, (c[i].qty || 1) + d);
        saveCart(c);
        render();
      });
    });
    itemsEl.querySelectorAll('.cart-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-idx'), 10);
        var c = getCart();
        c.splice(i, 1);
        saveCart(c);
        render();
      });
    });

    // Totals — vial volume discount: SPEND-based on the discountable vial subtotal —
    //   £75 → 5%, £150 → 10%, £200 → 15%, £250 → 20%.
    // Pens, BAC water and 10-packs are excluded: never on the vial track, never count to its threshold.
    function isPen(i) { return /pen/i.test(i.size || ''); }
    function isBac(i) { return i.slug === 'bacteriostatic-water'; }
    function is10pack(i) { return /10-?pack/i.test(i.size || ''); }
    function isExcluded(i) { return isPen(i) || isBac(i) || is10pack(i); }
    // SPEND ladder — input is the discountable vial subtotal in GBP.
    function vialVolumeRate(spend) { return spend >= 250 ? 0.20 : (spend >= 200 ? 0.15 : (spend >= 150 ? 0.10 : (spend >= 75 ? 0.05 : 0))); }
    // 10-pack volume — separate track, stacks only 10-packs: 2=10%, 3=17.5%, 4=25%, 5+=30%.
    function packVolumeRate(q) { return q >= 5 ? 0.30 : (q === 4 ? 0.25 : (q === 3 ? 0.175 : (q === 2 ? 0.10 : 0))); }
    var subtotal = cart.reduce(function (s, i) { return s + i.price * (i.qty || 1); }, 0);
    var totalQty = cart.reduce(function (s, i) { return s + (i.qty || 1); }, 0);
    var discBase = cart.reduce(function (s, i) { return s + (isExcluded(i) ? 0 : i.price * (i.qty || 1)); }, 0);
    var rate = vialVolumeRate(discBase);
    var volSaving = Math.round(discBase * rate * 100) / 100;
    var packQty  = cart.reduce(function (s, i) { return s + (is10pack(i) ? (i.qty || 1) : 0); }, 0);
    var packBase = cart.reduce(function (s, i) { return s + (is10pack(i) ? i.price * (i.qty || 1) : 0); }, 0);
    var packRate = packVolumeRate(packQty);
    var packSaving = Math.round(packBase * packRate * 100) / 100;
    var discSub = Math.max(0, subtotal - volSaving - packSaving);
    var isMember = (window.VELOX_MEMBER_PCT || 0) > 0;   // Velox Peps Pro = free shipping
    var shipping = (isMember || subtotal >= FREE_THRESHOLD) ? 0 : SHIPPING_FLAT;
    var total = discSub + shipping;

    if (subtotalEl) subtotalEl.textContent = fmt(subtotal);
    if (shippingEl) shippingEl.textContent = shipping === 0 ? 'Free' : fmt(shipping);
    if (totalEl)    totalEl.textContent = fmt(total);
    renderVolumeRow(volSaving, rate);
    renderPackVolumeRow(packSaving, packRate);
    renderVolumeNudge(discBase, rate);
    renderPackVolumeNudge(packBase, packQty);

    // Update nav count
    var countEl = document.getElementById('nav-cart-count');
    if (countEl) {
      countEl.textContent = String(totalQty);
    }

    // Free-shipping progress nudge — based on the pre-discount subtotal (matches checkout & the '£80' promise).
    renderFreeShipNudge(subtotal);
  }

  function renderPackVolumeRow(saving, rate) {
    var totalRow = document.querySelector('.cart-sum-total');
    if (!totalRow || !totalRow.parentNode) return;
    var row = document.getElementById('vp-pack-vol-row');
    if (saving > 0) {
      if (!row) {
        row = document.createElement('div');
        row.id = 'vp-pack-vol-row';
        row.className = 'cart-sum-row';
        row.style.color = '#01D3A0';
        totalRow.parentNode.insertBefore(row, totalRow);
      }
      row.innerHTML = '<span>10-Pack volume discount (' + (rate * 100) + '% off)</span>' +
        '<span>−' + fmt(saving) + '</span>';
    } else if (row) {
      row.remove();
    }
  }

  function renderVolumeRow(saving, rate) {
    var totalRow = document.querySelector('.cart-sum-total');
    if (!totalRow || !totalRow.parentNode) return;
    var row = document.getElementById('vp-vol-row');
    if (saving > 0) {
      if (!row) {
        row = document.createElement('div');
        row.id = 'vp-vol-row';
        row.className = 'cart-sum-row';
        row.style.color = '#01D3A0';
        totalRow.parentNode.insertBefore(row, totalRow);
      }
      row.innerHTML = '<span>Volume discount (' + Math.round(rate * 100) + '% off)</span>' +
        '<span>−' + fmt(saving) + '</span>';
    } else if (row) {
      row.remove();
    }
  }

  // 10-pack goal-gradient nudge — count-based: 2=10%, 3=17.5%, 4=25%, 5+=30%.
  // Shows how many more 10-packs unlock the next pack tier (separate from the vial ladder).
  function renderPackVolumeNudge(packBase, packQty) {
    var totalRow = document.querySelector('.cart-sum-total');
    if (!totalRow || !totalRow.parentNode) return;
    var PACK_TIERS = [{ q: 2, pct: 10 }, { q: 3, pct: 17.5 }, { q: 4, pct: 25 }, { q: 5, pct: 30 }];
    var n = document.getElementById('vp-pack-nudge');
    var next = null;
    for (var k = 0; k < PACK_TIERS.length; k++) { if (packQty < PACK_TIERS[k].q) { next = PACK_TIERS[k]; break; } }
    // Only when there is at least one 10-pack in the basket and a higher tier remains.
    if (packQty <= 0 || !next) { if (n) n.remove(); return; }
    if (!n) {
      n = document.createElement('div');
      n.id = 'vp-pack-nudge';
      n.className = 'cart-sum-row';
      n.style.cssText = 'display:block;color:#01D3A0;font-size:12px;margin:2px 0 6px';
      totalRow.parentNode.insertBefore(n, totalRow);
    }
    var need = next.q - packQty;
    n.innerHTML = 'Add <strong>' + need + '</strong> more 10-pack' + (need === 1 ? '' : 's') +
      ' to unlock <strong>' + next.pct + '% off</strong>';
  }

  // Spend-tier nudge — the goal-gradient prompt that makes the spend ladder convert.
  // Shows how little more is needed to reach the next vial discount tier.
  function renderVolumeNudge(discBase, rate) {
    var totalRow = document.querySelector('.cart-sum-total');
    if (!totalRow || !totalRow.parentNode) return;
    var TIERS = [{ min: 75, pct: 5 }, { min: 150, pct: 10 }, { min: 200, pct: 15 }, { min: 250, pct: 20 }];
    var n = document.getElementById('vp-vol-nudge');
    var next = null;
    for (var k = 0; k < TIERS.length; k++) { if (discBase < TIERS[k].min) { next = TIERS[k]; break; } }
    // Only show when there are discountable vials in the basket and a next tier exists.
    if (discBase <= 0 || !next) { if (n) n.remove(); return; }
    if (!n) {
      n = document.createElement('div');
      n.id = 'vp-vol-nudge';
      n.className = 'cart-sum-row';
      n.style.cssText = 'display:block;color:#01D3A0;font-size:12px;margin:2px 0 6px';
      totalRow.parentNode.insertBefore(n, totalRow);
    }
    var remaining = Math.round((next.min - discBase) * 100) / 100;
    n.innerHTML = 'Spend <strong>' + fmt(remaining) + '</strong> more on vials to unlock <strong>' + next.pct + '% off</strong>';
  }

  function renderFreeShipNudge(subtotal) {
    var itemsEl = document.getElementById('cart-items');
    if (!itemsEl || !itemsEl.parentNode) return;
    var n = document.getElementById('vp-freeship');
    if (!n) {
      n = document.createElement('div');
      n.id = 'vp-freeship';
      n.style.cssText = 'margin:0 0 18px;padding:12px 16px;border:1px solid #1a1a1a;border-radius:8px;background:#0d0d0d;font-size:13px;color:#9CA3AF';
      itemsEl.parentNode.insertBefore(n, itemsEl);
    }
    var memberFree = (window.VELOX_MEMBER_PCT || 0) > 0;
    var remaining = FREE_THRESHOLD - subtotal;
    var pct = memberFree ? 100 : Math.max(0, Math.min(100, (subtotal / FREE_THRESHOLD) * 100));
    var msg = memberFree
      ? '<strong style="color:#01D3A0">✓ Free UK shipping included with Velox Peps Pro</strong>'
      : (remaining > 0
        ? 'You’re <strong style="color:#fff">' + fmt(remaining) + '</strong> away from <strong style="color:#01D3A0">free UK shipping</strong>'
        : '<strong style="color:#01D3A0">✓ You’ve unlocked free UK shipping</strong>');
    n.innerHTML = '<div style="margin-bottom:8px">' + msg + '</div>' +
      '<div style="height:6px;background:#1a1a1a;border-radius:99px;overflow:hidden">' +
      '<div style="height:100%;width:' + pct.toFixed(0) + '%;background:#01D3A0;border-radius:99px;transition:width .3s"></div></div>';
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  render();
  // Re-render once Velox Peps Pro status resolves (free shipping + member prices
  // appear without a manual refresh).
  try { window.addEventListener('velox:member', render); } catch (e) {}
  // Re-render after pricing.js re-prices stored lines from the live source, so
  // the cart always reflects the current shop price (no stale snapshots).
  try { document.addEventListener('vp:cart-repriced', render); } catch (e) {}

}());
