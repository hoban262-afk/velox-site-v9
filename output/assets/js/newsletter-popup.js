/**
 * newsletter-popup.js — Velox Peptides handbook + 10%-off welcome popup
 * Self-contained, vanilla JS, no dependencies. Loaded site-wide except
 * /checkout and /account. Fires 10s after first load, once per session.
 *
 * SALE MODE (temporary): while the BIG30WEEK window is open (to 1 Oct) the popup
 * leads with the 30%-off sale instead of the standard 10% welcome offer. It is
 * SELF-EXPIRING — once SALE_END passes it reverts to the normal handbook copy
 * with no deploy needed. Keep SALE_END in sync with assets/js/core.js.
 * Note the signup itself still issues the usual VELOX- welcome code; the 30%
 * is the public BIG30WEEK code, so nothing we promise here is contingent on
 * subscribing (it is openly shareable by design).
 */
(function () {
  'use strict';

  // ── Sale config ───────────────────────────────────────────────────────────
  var SALE_CODE = 'BIG30WEEK';
  var SALE_END  = Date.parse('2026-10-01T23:59:59+01:00'); // sync w/ core.js + discount-codes.js
  function saleOn() { return Date.now() < SALE_END; }
  // Human deadline ("1 October") derived from SALE_END so the wording can never
  // contradict the timer. Pinned to Europe/London so an overseas visitor doesn't
  // see the date roll over into the next day.
  function saleEndLabel() {
    try {
      return new Date(SALE_END).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', timeZone: 'Europe/London'
      });
    } catch (e) { return '1 October'; }
  }
  function saleFmt() {
    var t = Math.max(0, Math.floor((SALE_END - Date.now()) / 1000));
    var d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600),
        m = Math.floor((t % 3600) / 60), s = t % 60;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return (d > 0 ? d + 'd ' : '') + p(h) + 'h ' + p(m) + 'm ' + p(s) + 's';
  }
  var saleTick = null;
  function startSaleTick() {
    stopSaleTick();
    saleTick = setInterval(function () {
      var el = document.getElementById('vp-nl-timer');
      if (!el) return stopSaleTick();
      if (!saleOn()) { el.textContent = 'Offer ended'; return stopSaleTick(); }
      el.textContent = saleFmt();
    }, 1000);
  }
  function stopSaleTick() { if (saleTick) { clearInterval(saleTick); saleTick = null; } }

  // ── Suppression rules ─────────────────────────────────────────────────────
  var path = window.location.pathname;
  if (path.indexOf('/checkout') === 0 || path.indexOf('/account') === 0 || path.indexOf('/admin') === 0) return; // not on checkout/account/admin
  if (new URLSearchParams(window.location.search).has('code')) return;                  // arrived with a code param
  try {
    if (sessionStorage.getItem('velox_popup_seen') === '1') return;                     // already shown this session
    if (localStorage.getItem('velox_subscribed') === '1') return;                       // already subscribed
  } catch (e) {}

  var FIRE_DELAY = 10000; // 10s
  var overlay, modal, escHandler;

  // ── Styles (scoped, injected once) ──────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('vp-nl-styles')) return;
    var s = document.createElement('style');
    s.id = 'vp-nl-styles';
    s.textContent =
      '.vp-nl-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .2s ease}' +
      '.vp-nl-overlay.vp-show{opacity:1}' +
      '.vp-nl-card{background:#0d1117;border:1px solid rgba(1,211,160,.2);border-radius:12px;max-width:440px;width:100%;padding:32px 30px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.5);transform:translateY(12px);opacity:0;transition:transform .25s ease-out,opacity .25s ease-out;font-family:Inter,Arial,sans-serif}' +
      '.vp-nl-overlay.vp-show .vp-nl-card{transform:translateY(0);opacity:1}' +
      '.vp-nl-close{position:absolute;top:14px;right:16px;background:none;border:none;color:#6B7280;font-size:24px;line-height:1;cursor:pointer;padding:4px}' +
      '.vp-nl-close:hover{color:#fff}' +
      '.vp-nl-h{font-size:24px;font-weight:800;color:#fff;margin:0 0 8px;line-height:1.2}' +
      '.vp-nl-h em{color:#01D3A0;font-style:normal}' +
      '.vp-nl-sub{font-size:14px;color:#9CA3AF;margin:0 0 20px;line-height:1.5}' +
      '.vp-nl-input{width:100%;box-sizing:border-box;background:#030407;border:1px solid #1F2937;border-radius:8px;color:#fff;padding:13px 14px;font-size:15px;margin-bottom:12px;outline:none;transition:border-color .15s,box-shadow .15s}' +
      '.vp-nl-input:focus{border-color:#01D3A0;box-shadow:0 0 0 3px rgba(1,211,160,.2)}' +
      '.vp-nl-btn{width:100%;background:#01D3A0;color:#021;border:none;border-radius:8px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity .15s}' +
      '.vp-nl-btn:disabled{opacity:.65;cursor:default}' +
      '.vp-nl-fine{font-size:11px;color:#6B7280;margin:12px 0 0;line-height:1.6;text-align:center}' +
      '.vp-nl-msg{font-size:13px;margin:12px 0 0;line-height:1.5}' +
      '.vp-nl-msg.err{color:#f87171}.vp-nl-msg.ok{color:#01D3A0}' +
      '.vp-nl-spin{display:inline-block;width:16px;height:16px;border:2px solid rgba(0,0,0,.3);border-top-color:#021;border-radius:50%;animation:vp-nl-spin .7s linear infinite;vertical-align:middle}' +
      '@keyframes vp-nl-spin{to{transform:rotate(360deg)}}' +
      '.vp-nl-codehint{font-family:"Courier New",monospace;color:#01D3A0;font-weight:700;letter-spacing:.06em}' +
      // Sale-week extras
      '.vp-nl-pill{display:inline-block;background:#01D3A0;color:#021;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:4px 9px;border-radius:3px;margin-bottom:14px}' +
      '.vp-nl-codebox{display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(1,211,160,.08);border:1px dashed rgba(1,211,160,.45);border-radius:8px;padding:12px 14px;margin:0 0 14px}' +
      '.vp-nl-codebox .lbl{font-size:11px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em;display:block;margin-bottom:3px}' +
      '.vp-nl-codebox .val{font-family:"DM Mono","Courier New",monospace;font-size:17px;font-weight:700;color:#01D3A0;letter-spacing:.06em}' +
      '.vp-nl-timer{font-family:"DM Mono","Courier New",monospace;font-size:14px;font-weight:700;color:#fff;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.12);border-radius:5px;padding:5px 9px;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.vp-nl-share{font-size:12.5px;color:#01D3A0;margin:0 0 16px;line-height:1.5;font-weight:600}';
    document.head.appendChild(s);
  }

  // ── Build + show ──────────────────────────────────────────────────────────
  function markSeen() { try { sessionStorage.setItem('velox_popup_seen', '1'); } catch (e) {} }

  function close() {
    if (!overlay) return;
    stopSaleTick();
    overlay.classList.remove('vp-show');
    document.removeEventListener('keydown', escHandler);
    setTimeout(function () { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); overlay = null; }, 220);
  }

  function defaultBody() {
    if (saleOn()) return saleBody();
    return '' +
      '<h2 class="vp-nl-h"><em>Free</em> Researcher&rsquo;s Handbook + 10% off</h2>' +
      '<p class="vp-nl-sub">Join the Velox research community &mdash; get our reconstitution, storage &amp; CoA handbook (PDF), plus a 10% code for your first order. For research use only.</p>' +
      '<input class="vp-nl-input" id="vp-nl-email" type="email" placeholder="Your email address" autocomplete="email">' +
      '<button class="vp-nl-btn" id="vp-nl-submit">Email me the handbook &rarr;</button>' +
      '<div class="vp-nl-msg" id="vp-nl-msg"></div>' +
      '<p class="vp-nl-fine">One-time use. No spam. Unsubscribe any time.<br>For research use only. Not for human consumption.</p>';
  }

  // Sale-week variant: lead with the 30% off, give them the code immediately
  // (it is public and shareable), then still capture the email for the handbook.
  function saleBody() {
    return '' +
      '<span class="vp-nl-pill">Limited time &middot; ends ' + saleEndLabel() + '</span>' +
      '<h2 class="vp-nl-h"><em>30% off</em> everything</h2>' +
      '<p class="vp-nl-sub">Our biggest discount of the year, for the Velox research community. Use the code below at checkout &mdash; no minimum, no limit on uses.</p>' +
      '<div class="vp-nl-codebox">' +
        '<span><span class="lbl">Your code</span><span class="val">' + SALE_CODE + '</span></span>' +
        '<span class="vp-nl-timer" id="vp-nl-timer">' + saleFmt() + '</span>' +
      '</div>' +
      '<p class="vp-nl-share">&#127873; Share it with friends &amp; family &mdash; anyone can use it, until ' + saleEndLabel() + '.</p>' +
      '<p class="vp-nl-sub" style="margin-bottom:12px">Want the free Researcher&rsquo;s Handbook too? Drop your email &mdash; reconstitution, storage &amp; CoA guidance (PDF).</p>' +
      '<input class="vp-nl-input" id="vp-nl-email" type="email" placeholder="Your email address" autocomplete="email">' +
      '<button class="vp-nl-btn" id="vp-nl-submit">Email me the handbook &rarr;</button>' +
      '<div class="vp-nl-msg" id="vp-nl-msg"></div>' +
      '<p class="vp-nl-fine">No spam. Unsubscribe any time.<br>For research use only. Not for human consumption.</p>';
  }

  function successBody(hint, already) {
    var sale = saleOn()
      ? '<div class="vp-nl-codebox">' +
          '<span><span class="lbl">30% off this week</span><span class="val">' + SALE_CODE + '</span></span>' +
          '<span class="vp-nl-timer" id="vp-nl-timer">' + saleFmt() + '</span>' +
        '</div>' +
        '<p class="vp-nl-share">&#127873; Share it with friends &amp; family &mdash; anyone can use it.</p>'
      : '';
    return '' +
      '<h2 class="vp-nl-h">' + (already ? "You're on the list" : 'Check your inbox') + '</h2>' +
      '<p class="vp-nl-sub">' + (already
        ? "You're already subscribed — check your inbox for your handbook and code."
        : 'Your handbook and 10% off code are on the way. The code starts with <span class="vp-nl-codehint">VELOX-</span>') +
      '</p>' +
      sale +
      '<button class="vp-nl-btn" id="vp-nl-done">Got it</button>' +
      '<p class="vp-nl-fine">For research use only. Not for human consumption.</p>';
  }

  function render(html) {
    modal.innerHTML = '<button class="vp-nl-close" aria-label="Close">&times;</button>' + html;
    modal.querySelector('.vp-nl-close').addEventListener('click', close);
    if (document.getElementById('vp-nl-timer')) startSaleTick();
    wire();
  }

  function wire() {
    var submit = document.getElementById('vp-nl-submit');
    var done   = document.getElementById('vp-nl-done');
    if (done) done.addEventListener('click', close);
    if (!submit) return;
    var input = document.getElementById('vp-nl-email');
    function go() {
      var msg = document.getElementById('vp-nl-msg');
      var email = (input.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.className = 'vp-nl-msg err'; msg.textContent = 'Please enter a valid email address.'; return;
      }
      submit.disabled = true;
      submit.innerHTML = '<span class="vp-nl-spin"></span>';
      msg.className = 'vp-nl-msg'; msg.textContent = '';
      fetch('/api/newsletter/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (res.ok && res.d.success) {
            try { localStorage.setItem('velox_subscribed', '1'); } catch (e) {}
            // GA4 generate_lead (new newsletter subscriber only).
            if (!res.d.already) {
              try { if (window.vpGA) window.vpGA('generate_lead', { currency: 'GBP', value: 0, method: 'newsletter_popup' }); } catch (e) {}
            }
            render(successBody(res.d.codeHint, res.d.already));
          } else {
            submit.disabled = false; submit.innerHTML = 'Email me the handbook &rarr;';
            msg.className = 'vp-nl-msg err';
            msg.textContent = (res.d && res.d.error) || 'Something went wrong. Try again.';
          }
        })
        .catch(function () {
          submit.disabled = false; submit.innerHTML = 'Email me the handbook &rarr;';
          msg.className = 'vp-nl-msg err'; msg.textContent = 'Something went wrong. Try again.';
        });
    }
    submit.addEventListener('click', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    setTimeout(function () { input.focus(); }, 120);
  }

  function show() {
    markSeen();
    injectStyles();
    overlay = document.createElement('div');
    overlay.className = 'vp-nl-overlay';
    modal = document.createElement('div');
    modal.className = 'vp-nl-card';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    render(defaultBody());

    // Click-outside to dismiss
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    // ESC to dismiss
    escHandler = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);

    requestAnimationFrame(function () { overlay.classList.add('vp-show'); });
  }

  setTimeout(show, FIRE_DELAY);
}());
