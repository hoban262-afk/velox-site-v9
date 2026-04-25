(function () {
  'use strict';

  // ── Entry gate ──────────────────────────────────────────────────────────────
  function getCookie(name) {
    var m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }

  var gate = document.getElementById('entry-gate');
  if (gate) {
    if (!getCookie('vp_entry')) {
      gate.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    } else {
      gate.style.display = 'none';
    }

    // Checkbox validation — all four must be checked to confirm
    var acceptBtn = document.getElementById('eg-accept');
    var checkboxes = gate.querySelectorAll('.eg-cb');

    function syncBtn() {
      if (!acceptBtn) return;
      var allChecked = true;
      for (var i = 0; i < checkboxes.length; i++) {
        if (!checkboxes[i].checked) { allChecked = false; break; }
      }
      acceptBtn.disabled = !allChecked;
    }

    for (var i = 0; i < checkboxes.length; i++) {
      checkboxes[i].addEventListener('change', syncBtn);
    }
    syncBtn(); // set initial state

    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () {
        document.cookie = 'vp_entry=1; Path=/; Max-Age=2592000; SameSite=Lax';
        gate.style.display = 'none';
        document.body.style.overflow = '';
      });
    }
  }

  // ── Mobile nav ───────────────────────────────────────────────────────────────
  var hamburger = document.getElementById('hamburger');
  var mobMenu = document.getElementById('mob-menu');
  if (hamburger && mobMenu) {
    hamburger.addEventListener('click', function () {
      var expanded = hamburger.getAttribute('aria-expanded') === 'true';
      hamburger.setAttribute('aria-expanded', String(!expanded));
      mobMenu.setAttribute('aria-hidden', String(expanded));
      mobMenu.style.display = expanded ? 'none' : 'flex';
    });
  }

  // ── Cart count ───────────────────────────────────────────────────────────────
  function updateCartCount() {
    var el = document.getElementById('nav-cart-count');
    if (!el) return;
    try {
      var cart = JSON.parse(localStorage.getItem('vp_cart') || '[]');
      var total = cart.reduce(function (sum, item) { return sum + (item.qty || 1); }, 0);
      el.textContent = String(total);
      el.style.display = total > 0 ? '' : '';
    } catch (e) {
      el.textContent = '0';
    }
  }

  updateCartCount();

  window.addEventListener('storage', function (e) {
    if (e.key === 'vp_cart') updateCartCount();
  });

  // ── Toast ────────────────────────────────────────────────────────────────────
  var toastTimer;
  window.toast = function (msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 3000);
  };

  // ── Card Add-to-Cart ─────────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.cc-atc');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    var slug  = btn.getAttribute('data-slug')  || '';
    var name  = btn.getAttribute('data-name')  || '';
    var url   = btn.getAttribute('data-url')   || '';
    var size  = btn.getAttribute('data-size')  || 'default';
    var price = parseFloat(btn.getAttribute('data-price')) || 0;

    var cart = [];
    try { cart = JSON.parse(localStorage.getItem('vp_cart') || '[]'); } catch (err) { cart = []; }

    var existing = null;
    for (var j = 0; j < cart.length; j++) {
      if (cart[j].slug === slug && cart[j].size === size) { existing = cart[j]; break; }
    }
    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
    } else {
      cart.push({ slug: slug, name: name, url: url, size: size, price: price, qty: 1 });
    }

    localStorage.setItem('vp_cart', JSON.stringify(cart));
    updateCartCount();
    if (window.toast) window.toast('Added to order \u2014 ' + name);
  });

  // ── FAQ accordion ────────────────────────────────────────────────────────────
  // Native <details> handles this — no JS needed.

}());
