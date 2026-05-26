(function () {
  'use strict';

  var SHIPPING_FLAT  = 3.80;
  var FREE_THRESHOLD = 80;

  function fmt(n) { return '£' + parseFloat(n).toFixed(2); }
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Show / hide states ────────────────────────────────────────────────────
  function showSuccess() {
    var loading  = document.getElementById('pc-loading');
    var success  = document.getElementById('pc-success');
    var fallback = document.getElementById('pc-fallback');
    if (loading)  loading.style.display  = 'none';
    if (success)  success.style.display  = '';
    if (fallback) fallback.style.display = 'none';
  }

  function showFallback() {
    var loading  = document.getElementById('pc-loading');
    var success  = document.getElementById('pc-success');
    var fallback = document.getElementById('pc-fallback');
    if (loading)  loading.style.display  = 'none';
    if (success)  success.style.display  = 'none';
    if (fallback) fallback.style.display = '';
  }

  // ── Read URL params ───────────────────────────────────────────────────────
  var params      = new URLSearchParams(window.location.search);
  var urlOrderId  = params.get('order_id'); // Supabase UUID
  var urlRef      = params.get('ref');      // VP-YYYYMMDD-XXXX

  // ── Read sessionStorage ───────────────────────────────────────────────────
  var chk = {};
  try { chk = JSON.parse(sessionStorage.getItem('vp_checkout') || '{}'); } catch (ex) {}

  var orderRef = urlRef || chk.orderRef || null;
  var cart     = [];
  try { cart = JSON.parse(localStorage.getItem('vp_cart') || '[]'); } catch (ex) {}
  if (!cart.length && chk.cart_snapshot) {
    try { cart = JSON.parse(chk.cart_snapshot); } catch (ex) {}
  }

  // ── Clear cart ────────────────────────────────────────────────────────────
  localStorage.removeItem('vp_cart');
  var countEl = document.getElementById('nav-cart-count');
  if (countEl) countEl.textContent = '0';

  // ── Clean URL (remove query string) ──────────────────────────────────────
  window.history.replaceState({}, document.title, '/checkout/payment-complete/');

  // ── Build products string ─────────────────────────────────────────────────
  var productsList = cart.map(function (item) {
    return item.name + ' ' + item.size + ' x' + (item.qty || 1) +
           ' — ' + fmt(item.price * (item.qty || 1));
  }).join('\n');

  // ── Render order summary table ────────────────────────────────────────────
  function renderSummary() {
    var el = document.getElementById('pc-summary');
    if (!el || !cart.length) return;
    var html = '<ul class="co-cart-list" style="margin-top:24px;">';
    cart.forEach(function (item) {
      html += '<li class="co-cart-row"><span class="co-cart-name">' + escHtml(item.name) +
        ' <span class="co-cart-size">' + escHtml(item.size) + '</span></span>' +
        '<span class="co-cart-price">' + fmt(item.price * (item.qty || 1)) + '</span></li>';
    });
    if (chk.total) {
      html += '<li class="co-cart-row" style="border-top:1px solid var(--brd);margin-top:8px;padding-top:8px;">' +
        '<span class="co-cart-name" style="font-weight:600;">Total</span>' +
        '<span class="co-cart-price" style="color:var(--g);font-weight:600;">' + fmt(chk.total) + '</span></li>';
    }
    html += '</ul>';
    el.innerHTML = html;
  }

  // ── Update DOM with order ref ─────────────────────────────────────────────
  function updateRefDisplay() {
    var refEl      = document.getElementById('pc-ref');
    var fbRefEl    = document.getElementById('pc-fallback-ref-val');
    var fbRefBlock = document.getElementById('pc-fallback-ref');
    if (refEl  && orderRef) refEl.textContent = orderRef;
    if (fbRefEl && orderRef) {
      fbRefEl.textContent = orderRef;
      if (fbRefBlock) fbRefBlock.style.display = '';
    }
  }

  // ── Fire order emails + Google Sheets (once per order) ───────────────────
  function fireOrderEmails() {
    var alreadyFired = sessionStorage.getItem('vp_order_fired') === '1';
    if (alreadyFired || !chk.orderRef || !chk.email) return;
    try { sessionStorage.setItem('vp_order_fired', '1'); } catch (ex) {}

    var shippingAddr = [chk.addr1, chk.addr2, chk.city, chk.postcode, chk.country]
      .filter(Boolean).join(', ');

    // Email via Resend
    fetch('/api/send-order', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_number:     chk.orderRef,
        customer_name:    ((chk.fname || '') + ' ' + (chk.lname || '')).trim(),
        customer_email:   chk.email,
        customer_phone:   chk.phone     || '',
        addr1:            chk.addr1     || '',
        addr2:            chk.addr2     || '',
        city:             chk.city      || '',
        postcode:         chk.postcode  || '',
        country:          chk.country   || 'United Kingdom',
        shipping_address: shippingAddr,
        shipping_method:  'Royal Mail Tracked 48',
        order_items:      productsList,
        order_subtotal:   (Number(chk.subtotal)       || 0).toFixed(2),
        shipping_cost:    (Number(chk.shipping)        || 0).toFixed(2),
        discount_code:    chk.discount_code             || '',
        discount_saving:  (Number(chk.discount_saving) || 0).toFixed(2),
        order_total:      (Number(chk.total)           || 0).toFixed(2),
        payment_method:   'fena',
      }),
    }).catch(function () { /* silent */ });

    // Google Sheets log
    try {
      fetch(
        'https://script.google.com/macros/s/AKfycbwC6RyBK2pMsU7crR7TXpbUtgKNN6305hNvePzFmkMtz3kpXWZShIgdFkT68AhHAb1ZOg/exec',
        {
          method:  'POST',
          mode:    'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            orderId:       chk.orderRef,
            date:          new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
            name:          ((chk.fname || '') + ' ' + (chk.lname || '')).trim(),
            email:         chk.email || '',
            phone:         chk.phone || '',
            address:       shippingAddr,
            products:      productsList,
            total:         '£' + (Number(chk.total) || 0).toFixed(2),
            discountCode:  chk.discount_code || 'None',
            paymentMethod: 'Fena Pay by Bank',
          }),
        }
      ).catch(function () {});
    } catch (ex) {}
  }

  // ── Main flow ─────────────────────────────────────────────────────────────
  // We have a URL order_id or at least a ref from sessionStorage — treat as success
  if (urlOrderId || orderRef) {
    updateRefDisplay();
    renderSummary();
    showSuccess();
    fireOrderEmails();
  } else {
    // Landed here with nothing — probably direct navigation
    showFallback();
  }

}());
