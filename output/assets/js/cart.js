(function () {
  'use strict';

  var SHIPPING_FLAT = 3.80;
  var FREE_THRESHOLD = 80;

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
    return '£' + n.toFixed(2);
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
      row.innerHTML = '<div class="cart-item-info">' +
        '<a class="cart-item-name" href="' + (item.url || '#') + '">' + escHtml(item.name) + '</a>' +
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

    // Totals — volume discount: 2 vials 5%, 3 vials 10%, 4+ vials 20%.
    // Pens are excluded: never discounted and never count toward the tier.
    function isPen(i) { return /pen/i.test(i.size || ''); }
    var subtotal = cart.reduce(function (s, i) { return s + i.price * (i.qty || 1); }, 0);
    var totalQty = cart.reduce(function (s, i) { return s + (i.qty || 1); }, 0);
    var discQty  = cart.reduce(function (s, i) { return s + (isPen(i) ? 0 : (i.qty || 1)); }, 0);
    var discBase = cart.reduce(function (s, i) { return s + (isPen(i) ? 0 : i.price * (i.qty || 1)); }, 0);
    var rate = discQty >= 4 ? 0.20 : (discQty === 3 ? 0.10 : (discQty === 2 ? 0.05 : 0));
    var volSaving = Math.round(discBase * rate * 100) / 100;
    var discSub = Math.max(0, subtotal - volSaving);
    var shipping = discSub >= FREE_THRESHOLD ? 0 : SHIPPING_FLAT;
    var total = discSub + shipping;

    if (subtotalEl) subtotalEl.textContent = fmt(subtotal);
    if (shippingEl) shippingEl.textContent = shipping === 0 ? 'Free' : fmt(shipping);
    if (totalEl)    totalEl.textContent = fmt(total);
    renderVolumeRow(volSaving, rate);

    // Update nav count
    var countEl = document.getElementById('nav-cart-count');
    if (countEl) {
      countEl.textContent = String(totalQty);
    }

    // Free-shipping progress nudge — based on the discounted subtotal (matches checkout).
    renderFreeShipNudge(discSub);
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
    var remaining = FREE_THRESHOLD - subtotal;
    var pct = Math.max(0, Math.min(100, (subtotal / FREE_THRESHOLD) * 100));
    var msg = remaining > 0
      ? 'You’re <strong style="color:#fff">' + fmt(remaining) + '</strong> away from <strong style="color:#01D3A0">free UK shipping</strong>'
      : '<strong style="color:#01D3A0">✓ You’ve unlocked free UK shipping</strong>';
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

}());
