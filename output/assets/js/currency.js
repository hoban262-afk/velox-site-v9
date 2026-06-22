/**
 * currency.js — global currency selector + price converter
 *
 * Injects a small dropdown into .nav-actions (between search and the IG icon).
 * Fetches live GBP rates from exchangerate-api (cached 24h in localStorage).
 * Converts every visible price on the page when a currency is chosen.
 * Stores the user's choice in localStorage so it persists across pages.
 */
(function () {
  'use strict';

  var CURRENCIES = [
    { code: 'GBP', symbol: '£',    flag: '🇬🇧', name: 'British Pound' },
    { code: 'EUR', symbol: '€',    flag: '🇪🇺', name: 'Euro' },
    { code: 'USD', symbol: '$',    flag: '🇺🇸', name: 'US Dollar' },
    { code: 'CAD', symbol: 'C$',   flag: '🇨🇦', name: 'Canadian Dollar' },
    { code: 'AUD', symbol: 'A$',   flag: '🇦🇺', name: 'Australian Dollar' },
    { code: 'NZD', symbol: 'NZ$',  flag: '🇳🇿', name: 'New Zealand Dollar' },
    { code: 'CHF', symbol: 'CHF',  flag: '🇨🇭', name: 'Swiss Franc' },
    { code: 'SEK', symbol: 'kr',   flag: '🇸🇪', name: 'Swedish Krona' },
    { code: 'NOK', symbol: 'kr',   flag: '🇳🇴', name: 'Norwegian Krone' },
    { code: 'DKK', symbol: 'kr',   flag: '🇩🇰', name: 'Danish Krone' },
    { code: 'PLN', symbol: 'zł',   flag: '🇵🇱', name: 'Polish Zloty' },
    { code: 'CZK', symbol: 'Kč',   flag: '🇨🇿', name: 'Czech Koruna' },
    { code: 'HUF', symbol: 'Ft',   flag: '🇭🇺', name: 'Hungarian Forint' },
    { code: 'RON', symbol: 'lei',  flag: '🇷🇴', name: 'Romanian Leu' },
    { code: 'BGN', symbol: 'лв',   flag: '🇧🇬', name: 'Bulgarian Lev' },
    { code: 'HRK', symbol: 'kn',   flag: '🇭🇷', name: 'Croatian Kuna' },
    { code: 'ISK', symbol: 'kr',   flag: '🇮🇸', name: 'Icelandic Króna' },
    { code: 'TRY', symbol: '₺',    flag: '🇹🇷', name: 'Turkish Lira' },
    { code: 'RUB', symbol: '₽',    flag: '🇷🇺', name: 'Russian Ruble' },
    { code: 'UAH', symbol: '₴',    flag: '🇺🇦', name: 'Ukrainian Hryvnia' },
    { code: 'JPY', symbol: '¥',    flag: '🇯🇵', name: 'Japanese Yen' },
    { code: 'CNY', symbol: '¥',    flag: '🇨🇳', name: 'Chinese Yuan' },
    { code: 'HKD', symbol: 'HK$',  flag: '🇭🇰', name: 'Hong Kong Dollar' },
    { code: 'TWD', symbol: 'NT$',  flag: '🇹🇼', name: 'Taiwan Dollar' },
    { code: 'KRW', symbol: '₩',    flag: '🇰🇷', name: 'South Korean Won' },
    { code: 'SGD', symbol: 'S$',   flag: '🇸🇬', name: 'Singapore Dollar' },
    { code: 'MYR', symbol: 'RM',   flag: '🇲🇾', name: 'Malaysian Ringgit' },
    { code: 'THB', symbol: '฿',    flag: '🇹🇭', name: 'Thai Baht' },
    { code: 'PHP', symbol: '₱',    flag: '🇵🇭', name: 'Philippine Peso' },
    { code: 'IDR', symbol: 'Rp',   flag: '🇮🇩', name: 'Indonesian Rupiah' },
    { code: 'INR', symbol: '₹',    flag: '🇮🇳', name: 'Indian Rupee' },
    { code: 'PKR', symbol: 'Rs',   flag: '🇵🇰', name: 'Pakistani Rupee' },
    { code: 'BDT', symbol: '৳',    flag: '🇧🇩', name: 'Bangladeshi Taka' },
    { code: 'AED', symbol: 'د.إ',  flag: '🇦🇪', name: 'UAE Dirham' },
    { code: 'SAR', symbol: 'ر.س',  flag: '🇸🇦', name: 'Saudi Riyal' },
    { code: 'QAR', symbol: 'ر.ق',  flag: '🇶🇦', name: 'Qatari Riyal' },
    { code: 'KWD', symbol: 'د.ك',  flag: '🇰🇼', name: 'Kuwaiti Dinar' },
    { code: 'BHD', symbol: 'BD',   flag: '🇧🇭', name: 'Bahraini Dinar' },
    { code: 'ILS', symbol: '₪',    flag: '🇮🇱', name: 'Israeli Shekel' },
    { code: 'EGP', symbol: 'E£',   flag: '🇪🇬', name: 'Egyptian Pound' },
    { code: 'ZAR', symbol: 'R',    flag: '🇿🇦', name: 'South African Rand' },
    { code: 'NGN', symbol: '₦',    flag: '🇳🇬', name: 'Nigerian Naira' },
    { code: 'KES', symbol: 'KSh',  flag: '🇰🇪', name: 'Kenyan Shilling' },
    { code: 'BRL', symbol: 'R$',   flag: '🇧🇷', name: 'Brazilian Real' },
    { code: 'MXN', symbol: 'MX$',  flag: '🇲🇽', name: 'Mexican Peso' },
    { code: 'ARS', symbol: 'AR$',  flag: '🇦🇷', name: 'Argentine Peso' },
    { code: 'CLP', symbol: 'CL$',  flag: '🇨🇱', name: 'Chilean Peso' },
    { code: 'COP', symbol: 'CO$',  flag: '🇨🇴', name: 'Colombian Peso' },
    { code: 'PEN', symbol: 'S/',   flag: '🇵🇪', name: 'Peruvian Sol' },
  ];

  var CACHE_KEY = 'vx_fx_rates';
  var PREF_KEY  = 'vx_currency';
  var TTL       = 86400000; // 24 hours

  var rates = null;
  var currentCode = 'GBP';

  // ── Rate fetching ──────────────────────────────────────────────────────────

  function loadRates() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (c && c.t && (Date.now() - c.t) < TTL && c.r) { rates = c.r; return Promise.resolve(rates); }
    } catch (e) {}

    return fetch('https://api.exchangerate-api.com/v4/latest/GBP')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.rates) {
          rates = d.rates;
          rates.GBP = 1;
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), r: rates })); } catch (e) {}
        }
        return rates;
      })
      .catch(function () { return rates; });
  }

  // ── Price conversion ───────────────────────────────────────────────────────

  function convert(gbp, code) {
    if (!rates || !rates[code] || code === 'GBP') return null;
    return gbp * rates[code];
  }

  function formatPrice(val, cur) {
    var c = CURRENCIES.find(function (x) { return x.code === cur; }) || CURRENCIES[0];
    // Zero-decimal currencies
    var noDecimals = ['JPY', 'KRW', 'CLP', 'HUF', 'ISK', 'IDR', 'VND', 'KWD', 'BHD'].indexOf(cur) >= 0;
    // KWD + BHD use 3 decimal places
    if (cur === 'KWD' || cur === 'BHD') {
      return c.symbol + val.toFixed(3);
    }
    if (noDecimals) {
      return c.symbol + Math.round(val).toLocaleString('en');
    }
    var v = Math.round(val * 100) / 100;
    return c.symbol + (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
  }

  // Match £ prices in text nodes and elements
  var PRICE_RE = /£(\d[\d,]*\.?\d{0,2})/g;

  function extractGBP(text) {
    var m = text.match(/£([\d,]+\.?\d{0,2})/);
    if (!m) return null;
    return parseFloat(m[1].replace(/,/g, ''));
  }

  function convertAllPrices() {
    if (currentCode === 'GBP' || !rates || !rates[currentCode]) return;

    // 1) Elements with data-gbp (already snapshotted) or text containing £
    var priceEls = document.querySelectorAll(
      '.cc-price, .cc-was, .cp-size-p, .cp-size-was, .sc-price, .sc-was, ' +
      '.sc-cp-price, .csp-price, .cart-line-price, .cart-total-val, ' +
      '[data-gbp], .hp-aov-price, .aov-price'
    );
    priceEls.forEach(function (el) {
      snapshotAndConvert(el);
    });

    // 2) Broader sweep: any element whose text starts with £ (catches stray prices)
    document.querySelectorAll('span, div, td, strong, b, p, li, h2, h3, h4').forEach(function (el) {
      if (el.children.length > 0) return; // only leaf text nodes
      var t = el.textContent.trim();
      if (t.charAt(0) === '£' || t.indexOf('£') >= 0) {
        snapshotAndConvert(el);
      }
    });
  }

  function snapshotAndConvert(el) {
    // Save original GBP HTML once
    if (!el.hasAttribute('data-gbp-html')) {
      el.setAttribute('data-gbp-html', el.innerHTML);
    }
    var orig = el.getAttribute('data-gbp-html');
    if (currentCode === 'GBP') {
      el.innerHTML = orig;
      return;
    }
    el.innerHTML = orig.replace(PRICE_RE, function (match, numStr) {
      var gbp = parseFloat(numStr.replace(/,/g, ''));
      if (isNaN(gbp)) return match;
      var converted = convert(gbp, currentCode);
      if (converted == null) return match;
      return formatPrice(converted, currentCode);
    });
  }

  function revertAllPrices() {
    document.querySelectorAll('[data-gbp-html]').forEach(function (el) {
      el.innerHTML = el.getAttribute('data-gbp-html');
    });
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  function buildDropdown() {
    var nav = document.querySelector('.nav-actions');
    if (!nav) return;
    var ig = nav.querySelector('.nav-ig');
    if (!ig) return;

    var wrap = document.createElement('div');
    wrap.className = 'vx-cur-wrap';

    var btn = document.createElement('button');
    btn.className = 'vx-cur-btn';
    btn.setAttribute('aria-label', 'Select currency');
    btn.setAttribute('aria-expanded', 'false');
    var cur = CURRENCIES.find(function (c) { return c.code === currentCode; }) || CURRENCIES[0];
    btn.innerHTML = '<span class="vx-cur-flag">' + cur.flag + '</span><span class="vx-cur-code">' + cur.code + '</span><svg class="vx-cur-chev" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var panel = document.createElement('div');
    panel.className = 'vx-cur-panel';
    panel.classList.remove('open');

    var search = document.createElement('input');
    search.className = 'vx-cur-search';
    search.type = 'text';
    search.placeholder = 'Search currency…';
    search.setAttribute('autocomplete', 'off');
    panel.appendChild(search);

    var list = document.createElement('div');
    list.className = 'vx-cur-list';

    CURRENCIES.forEach(function (c) {
      var row = document.createElement('button');
      row.className = 'vx-cur-row' + (c.code === currentCode ? ' active' : '');
      row.setAttribute('data-code', c.code);
      row.innerHTML = '<span class="vx-cur-row-flag">' + c.flag + '</span><span class="vx-cur-row-name">' + c.name + '</span><span class="vx-cur-row-code">' + c.code + ' (' + c.symbol + ')</span>';
      row.addEventListener('click', function () { selectCurrency(c.code); });
      list.appendChild(row);
    });
    panel.appendChild(list);
    wrap.appendChild(btn);
    wrap.appendChild(panel);
    nav.insertBefore(wrap, ig);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = panel.classList.contains('open');
      panel.classList.toggle('open');
      btn.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
      if (!wasOpen) { search.value = ''; filterList(''); search.focus(); }
    });

    search.addEventListener('input', function () { filterList(this.value); });
    search.addEventListener('click', function (e) { e.stopPropagation(); });

    document.addEventListener('click', function () {
      if (panel.classList.contains('open')) { panel.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });

    function filterList(q) {
      var term = q.toLowerCase().trim();
      list.querySelectorAll('.vx-cur-row').forEach(function (row) {
        var code = row.getAttribute('data-code').toLowerCase();
        var text = row.textContent.toLowerCase();
        row.style.display = (!term || text.indexOf(term) >= 0 || code.indexOf(term) >= 0) ? '' : 'none';
      });
    }
  }

  function selectCurrency(code) {
    currentCode = code;
    try { localStorage.setItem(PREF_KEY, code); } catch (e) {}

    // Update button label
    var cur = CURRENCIES.find(function (c) { return c.code === code; }) || CURRENCIES[0];
    var btn = document.querySelector('.vx-cur-btn');
    if (btn) btn.innerHTML = '<span class="vx-cur-flag">' + cur.flag + '</span><span class="vx-cur-code">' + cur.code + '</span><svg class="vx-cur-chev" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    // Update active state in list
    document.querySelectorAll('.vx-cur-row').forEach(function (r) {
      r.classList.toggle('active', r.getAttribute('data-code') === code);
    });

    // Close panel
    var panel = document.querySelector('.vx-cur-panel');
    if (panel) panel.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');

    // Convert prices
    if (code === 'GBP') { revertAllPrices(); } else { convertAllPrices(); }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
      '.vx-cur-wrap{position:relative;display:flex;align-items:center}' +
      '.vx-cur-btn{display:flex;align-items:center;gap:4px;background:none;border:1px solid var(--brd,#1a1a1a);border-radius:6px;padding:5px 8px;cursor:pointer;color:var(--t2,#8a8f9a);font-family:inherit;font-size:11px;transition:border-color .15s,color .15s;line-height:1}' +
      '.vx-cur-btn:hover{border-color:var(--brd2,#2a323a);color:#fff}' +
      '.vx-cur-flag{font-size:14px;line-height:1}' +
      '.vx-cur-code{font-family:var(--mono,monospace);font-weight:600;letter-spacing:.04em}' +
      '.vx-cur-chev{flex-shrink:0;opacity:.5}' +
      '.vx-cur-panel{position:absolute;top:calc(100% + 6px);right:0;width:280px;max-height:360px;background:var(--bg3,#0d1117);border:1px solid var(--brd2,#2a323a);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.5);display:none;flex-direction:column;z-index:9999;overflow:hidden}' +
      '.vx-cur-panel.open{display:flex}' +
      '.vx-cur-search{width:100%;padding:10px 12px;background:var(--bg2,#0a0e13);border:none;border-bottom:1px solid var(--brd,#1a1a1a);color:#fff;font-size:13px;font-family:inherit;outline:none}' +
      '.vx-cur-search::placeholder{color:var(--t3,#6b7280)}' +
      '.vx-cur-list{overflow-y:auto;flex:1;overscroll-behavior:contain}' +
      '.vx-cur-row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;background:none;border:none;cursor:pointer;color:var(--t2,#8a8f9a);font-size:13px;font-family:inherit;text-align:left;transition:background .1s}' +
      '.vx-cur-row:hover{background:var(--bg4,#161b22);color:#fff}' +
      '.vx-cur-row.active{color:#01D3A0}' +
      '.vx-cur-row-flag{font-size:16px;line-height:1;flex-shrink:0}' +
      '.vx-cur-row-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.vx-cur-row-code{font-family:var(--mono,monospace);font-size:11px;opacity:.6;flex-shrink:0}' +
      '@media(max-width:768px){.vx-cur-code{display:none}.vx-cur-btn{padding:5px 6px}.vx-cur-panel{right:-40px;width:260px}}' +
      '@media(max-width:480px){.vx-cur-panel{position:fixed;top:auto;bottom:0;left:0;right:0;width:100%;max-height:55vh;border-radius:14px 14px 0 0;border-bottom:none}}';
    document.head.appendChild(s);
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    try { currentCode = localStorage.getItem(PREF_KEY) || 'GBP'; } catch (e) {}
    if (!CURRENCIES.find(function (c) { return c.code === currentCode; })) currentCode = 'GBP';
    injectStyles();
    buildDropdown();
    loadRates().then(function () {
      if (currentCode !== 'GBP') convertAllPrices();
    });

    // Re-convert after pricing.js hydrates live prices
    document.addEventListener('vp:prices-updated', function () {
      if (currentCode !== 'GBP') {
        // Clear snapshots so fresh hydrated prices get re-snapshotted
        document.querySelectorAll('[data-gbp-html]').forEach(function (el) {
          el.removeAttribute('data-gbp-html');
        });
        convertAllPrices();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
