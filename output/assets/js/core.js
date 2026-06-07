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

  function closeMobMenu() {
    if (!hamburger || !mobMenu) return;
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.classList.remove('open');
    mobMenu.setAttribute('aria-hidden', 'true');
    mobMenu.style.display = 'none';
  }

  if (hamburger && mobMenu) {
    hamburger.addEventListener('click', function () {
      var expanded = hamburger.getAttribute('aria-expanded') === 'true';
      hamburger.setAttribute('aria-expanded', String(!expanded));
      hamburger.classList.toggle('open');
      mobMenu.setAttribute('aria-hidden', String(expanded));
      mobMenu.style.display = expanded ? 'none' : 'flex';
    });

    // Close menu when tapping outside
    document.addEventListener('click', function (e) {
      if (mobMenu.style.display === 'flex' &&
          !mobMenu.contains(e.target) &&
          !hamburger.contains(e.target)) {
        closeMobMenu();
      }
    });

    // Close menu when a nav link is followed
    mobMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMobMenu);
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

  // ── Newsletter subscribe ──────────────────────────────────────────────────────
  var nlBtn = document.querySelector('.nl-btn');
  var nlInp = document.querySelector('.nl-inp');

  if (nlBtn && nlInp) {
    nlBtn.addEventListener('click', function () {
      var email = nlInp.value.trim();
      if (!email || !email.includes('@')) {
        if (window.toast) window.toast('Please enter a valid email address.');
        return;
      }

      // Issue (or re-send) the handbook + 10%-off welcome code via the signup API —
      // same path as the popup, so the inline form's promise is real.
      nlBtn.disabled = true;
      nlBtn.textContent = 'Sending…';
      fetch('/api/newsletter/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, d: d }; });
      }).then(function (res) {
        if (res.ok && res.d && res.d.success) {
          try { localStorage.setItem('velox_subscribed', '1'); } catch (e) {}
          nlInp.value = '';
          nlBtn.textContent = res.d.already ? 'Already sent ✓' : 'Code sent ✓';
          if (window.toast) window.toast(res.d.already
            ? "You're already subscribed — check your inbox for your handbook and code."
            : 'Your handbook and 10% off code are on the way — check your inbox.');
        } else {
          nlBtn.disabled = false;
          nlBtn.textContent = 'Send my code';
          if (window.toast) window.toast((res.d && res.d.error) || 'Something went wrong. Please try again.');
        }
      }).catch(function () {
        nlBtn.disabled = false;
        nlBtn.textContent = 'Send my code';
        if (window.toast) window.toast('Something went wrong. Please try again.');
      });
    });

    nlInp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') nlBtn.click();
    });
  }

  // ── FAQ accordion ────────────────────────────────────────────────────────────
  // Native <details> handles this — no JS needed.

}());

// ── Affiliate ?ref= capture (30-day attribution window) ───────────────────────
// Any page reached via an affiliate link (e.g. /design-lab/?ref=CODE) stores the
// code so checkout can auto-apply it. Without this, affiliate links attribute
// nothing. First-touch wins (don't overwrite an existing, unexpired ref).
(function () {
  try {
    var m = location.search.match(/[?&]ref=([A-Za-z0-9_-]{2,32})/);
    if (!m) return;
    var code = m[1].toUpperCase();
    var existing = null;
    try { existing = JSON.parse(localStorage.getItem('vp_ref') || 'null'); } catch (e) {}
    var THIRTY_DAYS = 30 * 864e5;
    if (existing && existing.code && existing.ts && (Date.now() - existing.ts) < THIRTY_DAYS) return; // keep first touch
    try { localStorage.setItem('vp_ref', JSON.stringify({ code: code, ts: Date.now() })); } catch (e) {}
  } catch (e) {}
})();

// ── First-party analytics beacon (no cookies, no PII) ─────────────────────────
(function () {
  try {
    if (location.pathname.indexOf('/admin') === 0) return; // never track the admin
    var sid;
    try { sid = localStorage.getItem('vp_sid'); } catch (e) {}
    if (!sid) {
      sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('vp_sid', sid); } catch (e) {}
    }
    var payload = JSON.stringify({ sid: sid, path: location.pathname, ref: document.referrer || '' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
    }

    // ── Live-presence heartbeat (powers the admin "live on site" counter) ──
    function vpPing() {
      if (document.visibilityState === 'hidden') return;
      var p = JSON.stringify({ sid: sid });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/presence', new Blob([p], { type: 'application/json' }));
      } else {
        fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: p, keepalive: true }).catch(function () {});
      }
    }
    vpPing();
    setInterval(vpPing, 60000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') vpPing(); });
  } catch (e) {}
}());
