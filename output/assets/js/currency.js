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
  var PREF_KEY  = 'vx_currency';   // set ONLY when the visitor explicitly picks
  var GEO_KEY   = 'vx_geo_cur';    // cached auto-detected currency (per device)
  var TTL       = 86400000;        // 24 hours (FX rates)
  var GEO_TTL   = 604800000;       // 7 days (geo currency)

  var rates = null;
  var currentCode = 'GBP';

  // ── Auto-detect the visitor's local currency ────────────────────────────────
  // Country (ISO-3166 alpha-2) → one of our supported currencies. Eurozone
  // members all map to EUR. Anything not here falls back to GBP.
  var COUNTRY_TO_CURRENCY = {
    GB: 'GBP', US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF',
    SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
    RO: 'RON', BG: 'BGN', IS: 'ISK', TR: 'TRY', RU: 'RUB', UA: 'UAH',
    JP: 'JPY', CN: 'CNY', HK: 'HKD', TW: 'TWD', KR: 'KRW', SG: 'SGD',
    MY: 'MYR', TH: 'THB', PH: 'PHP', ID: 'IDR', IN: 'INR', PK: 'PKR',
    BD: 'BDT', AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD',
    IL: 'ILS', EG: 'EGP', ZA: 'ZAR', NG: 'NGN', KE: 'KES', BR: 'BRL',
    MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
    // Eurozone
    AT: 'EUR', BE: 'EUR', HR: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR',
    FR: 'EUR', DE: 'EUR', GR: 'EUR', IE: 'EUR', IT: 'EUR', LV: 'EUR',
    LT: 'EUR', LU: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SK: 'EUR',
    SI: 'EUR', ES: 'EUR', AD: 'EUR', MC: 'EUR', SM: 'EUR', VA: 'EUR', ME: 'EUR', XK: 'EUR'
  };

  // Common IANA timezones → country, for an instant (offline) first guess.
  var TZ_TO_COUNTRY = {
    'Europe/London': 'GB',
    'America/New_York': 'US', 'America/Detroit': 'US', 'America/Chicago': 'US',
    'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Los_Angeles': 'US',
    'America/Anchorage': 'US', 'America/Boise': 'US', 'America/Indiana/Indianapolis': 'US',
    'Pacific/Honolulu': 'US',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
    'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA',
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
    'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU',
    'Pacific/Auckland': 'NZ',
    'Europe/Zurich': 'CH', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO',
    'Europe/Copenhagen': 'DK', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
    'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG',
    'Atlantic/Reykjavik': 'IS', 'Europe/Istanbul': 'TR', 'Europe/Moscow': 'RU',
    'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA',
    'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES',
    'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
    'Europe/Vienna': 'AT', 'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT',
    'Europe/Helsinki': 'FI', 'Europe/Athens': 'GR',
    'Asia/Tokyo': 'JP', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK',
    'Asia/Taipei': 'TW', 'Asia/Seoul': 'KR', 'Asia/Singapore': 'SG',
    'Asia/Kuala_Lumpur': 'MY', 'Asia/Bangkok': 'TH', 'Asia/Manila': 'PH',
    'Asia/Jakarta': 'ID', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
    'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Dubai': 'AE',
    'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW',
    'Asia/Bahrain': 'BH', 'Asia/Jerusalem': 'IL',
    'Africa/Cairo': 'EG', 'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG',
    'Africa/Nairobi': 'KE',
    'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX',
    'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL',
    'America/Bogota': 'CO', 'America/Lima': 'PE'
  };

  function isSupported(code) { return !!CURRENCIES.find(function (c) { return c.code === code; }); }

  function currencyForCountry(cc) {
    if (!cc) return null;
    var cur = COUNTRY_TO_CURRENCY[String(cc).toUpperCase()];
    return (cur && isSupported(cur)) ? cur : null;
  }

  // Instant, offline best-guess from the browser: timezone first (most reliable
  // for actual location), then the locale region (e.g. en-US → US).
  function detectFromBrowser() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      var cur = currencyForCountry(TZ_TO_COUNTRY[tz]);
      if (cur) return cur;
    } catch (e) {}
    try {
      var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
      for (var i = 0; i < langs.length; i++) {
        var m = String(langs[i] || '').match(/[-_]([A-Za-z]{2})$/);
        if (m) { var c = currencyForCountry(m[1]); if (c) return c; }
      }
    } catch (e) {}
    return null;
  }

  function readGeoCache() {
    try {
      var g = JSON.parse(localStorage.getItem(GEO_KEY));
      if (g && g.t && (Date.now() - g.t) < GEO_TTL && g.code && isSupported(g.code)) return g.code;
    } catch (e) {}
    return null;
  }

  // Accurate location lookup by IP (only runs once per device per GEO_TTL, and
  // never when the visitor has made an explicit choice). Fails silently.
  function geoDetectByIP() {
    return fetch('https://ipwho.is/?fields=success,country_code,currency')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || d.success === false) return null;
        var cur = currencyForCountry(d.country_code) ||
                  (d.currency && isSupported(d.currency.code) ? d.currency.code : null);
        if (cur) { try { localStorage.setItem(GEO_KEY, JSON.stringify({ t: Date.now(), code: cur })); } catch (e) {} }
        return cur;
      })
      .catch(function () { return null; });
  }

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
      '[data-gbp], .hp-aov-price, .aov-price, .dotd-now, .dotd-was, .vp-vol-note'
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

  var GLOBE_SVG = '<svg class="vx-cur-globe" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/></svg>';
  var CHEV_SVG = '<svg class="vx-cur-chev" width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function btnHTML(code) { return GLOBE_SVG + '<span class="vx-cur-code">' + code + '</span>' + CHEV_SVG; }

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
    btn.innerHTML = btnHTML(currentCode);

    var backdrop = document.createElement('div');
    backdrop.className = 'vx-cur-backdrop';
    document.body.appendChild(backdrop);

    var panel = document.createElement('div');
    panel.className = 'vx-cur-panel';

    var handle = document.createElement('div');
    handle.className = 'vx-cur-handle';
    panel.appendChild(handle);

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
    // The panel lives on <body>, NOT inside the header. The header is a sticky,
    // backdrop-filtered element so it forms its own stacking context capped at
    // z-index:300 — a panel nested inside it can never rise above the backdrop
    // (z-index:9998, on <body>). Mounting the panel on <body> lets its
    // z-index:9999 actually sit above the backdrop so its rows are clickable.
    document.body.appendChild(panel);
    nav.insertBefore(wrap, ig);

    // Desktop: pin the panel just under the button. Mobile (<=600) uses the CSS
    // bottom-sheet, so clear any inline coords and let the stylesheet take over.
    function positionPanel() {
      if (isMobile()) { panel.style.top = ''; panel.style.left = ''; panel.style.right = ''; panel.style.bottom = ''; return; }
      var r = btn.getBoundingClientRect();
      panel.style.top = (r.bottom + 6) + 'px';
      panel.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
      panel.style.left = 'auto';
      panel.style.bottom = 'auto';
    }

    function setChatVisible(show) {
      var cb = document.querySelector('.vcw-btn');
      if (cb) cb.style.display = show ? '' : 'none';
    }

    function openPanel() {
      positionPanel();
      panel.classList.add('open');
      backdrop.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      search.value = ''; filterList('');
      if (!isMobile()) search.focus();
      if (isMobile()) setChatVisible(false);
    }
    window.addEventListener('resize', function () { if (panel.classList.contains('open')) positionPanel(); });

    function closePanel() {
      panel.classList.remove('open');
      backdrop.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      if (isMobile()) setChatVisible(true);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.classList.contains('open')) { closePanel(); } else { openPanel(); }
    });

    search.addEventListener('input', function () { filterList(this.value); });
    search.addEventListener('click', function (e) { e.stopPropagation(); });

    backdrop.addEventListener('click', closePanel);
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open') && !wrap.contains(e.target)) closePanel();
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

  // Explicit user pick — persists, so we stop auto-detecting for this device.
  function selectCurrency(code) { applyCurrency(code, true); }

  // Apply a currency to the UI + prices. persist=true records it as the user's
  // choice; persist=false is used by auto-detection (stays "auto").
  function applyCurrency(code, persist) {
    currentCode = code;
    if (persist) { try { localStorage.setItem(PREF_KEY, code); } catch (e) {} }

    // Update button label
    var btn = document.querySelector('.vx-cur-btn');
    if (btn) btn.innerHTML = btnHTML(code);

    // Update active state in list
    document.querySelectorAll('.vx-cur-row').forEach(function (r) {
      r.classList.toggle('active', r.getAttribute('data-code') === code);
    });

    // Close panel + backdrop
    var panel = document.querySelector('.vx-cur-panel');
    var backdrop = document.querySelector('.vx-cur-backdrop');
    if (panel) panel.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');

    // Convert prices — always revert to GBP first so snapshots stay clean
    revertAllPrices();
    if (code !== 'GBP') convertAllPrices();
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  function isMobile() { return window.innerWidth <= 600; }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
      '.vx-cur-wrap{position:relative;display:flex;align-items:center;flex-shrink:0}' +
      '.vx-cur-btn{display:flex;align-items:center;gap:3px;background:none;border:1px solid var(--brd,#1a1a1a);border-radius:6px;padding:5px 6px;cursor:pointer;color:var(--t2,#8a8f9a);font-family:inherit;font-size:11px;transition:border-color .15s,color .15s;line-height:1;white-space:nowrap}' +
      '.vx-cur-btn:hover{border-color:var(--brd2,#2a323a);color:#fff}' +
      '.vx-cur-globe{flex-shrink:0}' +
      '.vx-cur-code{font-family:var(--mono,monospace);font-weight:600;letter-spacing:.04em;font-size:10px}' +
      '.vx-cur-chev{flex-shrink:0;opacity:.5}' +
      '.vx-cur-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;-webkit-tap-highlight-color:transparent}' +
      '.vx-cur-backdrop.open{display:block}' +
      '.vx-cur-panel{position:fixed;top:64px;right:8px;width:280px;max-height:360px;background:var(--bg3,#0d1117);border:1px solid var(--brd2,#2a323a);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.5);display:none;flex-direction:column;z-index:9999;overflow:hidden}' +
      '.vx-cur-panel.open{display:flex}' +
      '.vx-cur-search{width:100%;padding:10px 12px;background:var(--bg2,#0a0e13);border:none;border-bottom:1px solid var(--brd,#1a1a1a);color:#fff;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box}' +
      '.vx-cur-search::placeholder{color:var(--t3,#6b7280)}' +
      '.vx-cur-list{overflow-y:auto;flex:1;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}' +
      '.vx-cur-row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;background:none;border:none;cursor:pointer;color:var(--t2,#8a8f9a);font-size:13px;font-family:inherit;text-align:left;transition:background .1s}' +
      '.vx-cur-row:hover{background:var(--bg4,#161b22);color:#fff}' +
      '.vx-cur-row.active{color:#16d6a6}' +
      '.vx-cur-row-flag{font-size:16px;line-height:1;flex-shrink:0}' +
      '.vx-cur-row-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.vx-cur-row-code{font-family:var(--mono,monospace);font-size:11px;opacity:.6;flex-shrink:0}' +
      '.vx-cur-handle{display:none}' +
      '@media(max-width:768px){.vx-cur-code{display:none}.vx-cur-btn{padding:4px 5px}}' +
      '@media(max-width:600px){' +
        '.vx-cur-panel{position:fixed;top:auto;bottom:0;left:0;right:0;width:100%;max-height:60vh;border-radius:16px 16px 0 0;border-bottom:none;padding-bottom:env(safe-area-inset-bottom,0)}' +
        '.vx-cur-handle{display:block;width:36px;height:4px;background:#3a3f47;border-radius:2px;margin:10px auto 4px}' +
        '.vx-cur-row{padding:13px 16px;font-size:15px}' +
        '.vx-cur-row-flag{font-size:20px}' +
        '.vx-cur-search{padding:12px 16px;font-size:15px}' +
      '}';
    document.head.appendChild(s);
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    // Priority: explicit user choice → cached geo currency → instant browser
    // guess → GBP. Auto-detection never overrides an explicit pick.
    var explicit = null;
    try { explicit = localStorage.getItem(PREF_KEY); } catch (e) {}
    if (explicit && isSupported(explicit)) {
      currentCode = explicit;
    } else {
      currentCode = readGeoCache() || detectFromBrowser() || 'GBP';
    }

    injectStyles();
    buildDropdown();
    loadRates().then(function () {
      if (currentCode !== 'GBP') convertAllPrices();
      // First visit (no explicit choice, no cached geo): confirm by IP and
      // upgrade the guess if it differs. Runs at most once per GEO_TTL.
      if (!explicit && !readGeoCache()) {
        geoDetectByIP().then(function (code) {
          if (code && code !== currentCode) applyCurrency(code, false);
        });
      }
    });

    // Re-apply the chosen currency after cart.js re-renders (qty change, member
    // status, reprice). cart.js always writes GBP, so we clear the cached GBP
    // snapshots ONLY inside the cart region it just rewrote — these currently
    // hold fresh GBP text, so re-snapshotting + converting them is safe and
    // can't double-convert. Elements outside the cart keep their snapshots.
    document.addEventListener('vp:cart-rendered', function () {
      if (currentCode === 'GBP' || !rates) return;
      ['#cart-items', '#cart-summary', '#vp-freeship'].forEach(function (sel) {
        var root = document.querySelector(sel);
        if (!root) return;
        if (root.hasAttribute('data-gbp-html')) root.removeAttribute('data-gbp-html');
        root.querySelectorAll('[data-gbp-html]').forEach(function (el) { el.removeAttribute('data-gbp-html'); });
      });
      convertAllPrices();
    });

    // Re-convert after pricing.js hydrates live prices
    var HYDRATED_SEL = '.cc-price, .cc-was, .cp-size-p, .cp-size-was, .sc-price, .sc-was, .sc-cp-price, .csp-price';
    document.addEventListener('vp:prices-updated', function () {
      if (currentCode !== 'GBP') {
        document.querySelectorAll(HYDRATED_SEL).forEach(function (el) {
          el.removeAttribute('data-gbp-html');
        });
        convertAllPrices();
      }
    });

    // Watch for late-loading sections (deal of the week, etc.) that inject £ prices after init
    var observer = new MutationObserver(function () {
      if (currentCode === 'GBP' || !rates) return;
      document.querySelectorAll('.dotd-now, .dotd-was').forEach(function (el) {
        if (el.textContent.indexOf('£') < 0) return;
        el.removeAttribute('data-gbp-html');
        snapshotAndConvert(el);
      });
    });
    var dotdSec = document.getElementById('dotd-sec');
    if (dotdSec) observer.observe(dotdSec, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
