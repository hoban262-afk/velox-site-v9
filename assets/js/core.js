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
    var acceptBtn = document.getElementById('eg-accept');
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

  // ── FAQ accordion ────────────────────────────────────────────────────────────
  // Native <details> handles this — no JS needed.

}());
