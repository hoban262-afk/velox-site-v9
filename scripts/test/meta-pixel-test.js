/**
 * Verifies the Meta pixel wiring. The property that actually matters is
 * deduplication: browser event_id must equal server event_id, or Meta counts
 * every conversion twice and reported CPA halves.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '../..');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '  -> ' + extra : ''}`); }
}

// ── Run core.js in a fake browser and capture what it emits ──────────────────
function runCore({ pixelId = '123456789', url = 'https://veloxpeps.com/compounds/bpc-157/', cookie = '' } = {}) {
  const captured = { fbq: [], beacons: [] };
  const u = new URL(url);
  const store = {};

  const sandbox = {
    console,
    URLSearchParams,
    URL,
    Blob: function (parts) { this.parts = parts; },
    Date,
    Math,
    JSON,
    Number,
    String,
    Object,
    Array,
    parseFloat,
    parseInt,
    setInterval: () => 0,
    setTimeout: () => 0,
    isNaN,
    document: {
      cookie,
      referrer: '',
      createElement: () => ({ setAttribute() {}, getElementsByTagName: () => [] }),
      getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }],
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      visibilityState: 'visible',
      documentElement: { classList: { add() {}, remove() {} } },
      body: { classList: { add() {}, remove() {} }, appendChild() {} },
    },
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: () => 0,
    IntersectionObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    location: {
      pathname: u.pathname, search: u.search, href: u.href,
      hostname: u.hostname, origin: u.origin, protocol: u.protocol,
    },
    navigator: {
      userAgent: 'test',
      sendBeacon: (endpoint, blob) => {
        try { captured.beacons.push({ endpoint, body: JSON.parse(blob.parts[0]) }); } catch (e) {}
        return true;
      },
    },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  let src = fs.readFileSync(path.join(ROOT, 'output/assets/js/core.js'), 'utf8');
  // Configure the pixel, and stand in for the real fbevents.js loader so we can
  // observe the calls rather than hitting the network.
  src = src.replace("var VP_FB_PIXEL_ID = '';", `var VP_FB_PIXEL_ID = '${pixelId}';`);
  src = src.replace(
    /!function \(f, b, e, v, n, t, s\) \{[\s\S]*?\}\(window, document, 'script', 'https:\/\/connect\.facebook\.net\/en_US\/fbevents\.js'\);/,
    "window.fbq = function(){ captured.fbq.push(Array.prototype.slice.call(arguments)); };"
  );
  sandbox.captured = captured;

  try { vm.runInNewContext(src, sandbox, { timeout: 5000 }); }
  catch (e) { console.log('  (core.js threw: ' + e.message + ')'); }
  return { captured, sandbox };
}

console.log('\n1. Pixel base code + PageView');
{
  const { captured, sandbox } = runCore();
  check('fbq init called with the pixel id',
    captured.fbq.some((c) => c[0] === 'init' && c[1] === '123456789'),
    JSON.stringify(captured.fbq));
  check('PageView fired once',
    captured.fbq.filter((c) => c[0] === 'track' && c[1] === 'PageView').length === 1);
  check('vpFBReady is true', sandbox.window.vpFBReady === true);
}

console.log('\n2. Pixel is a no-op until configured (safe to ship unconfigured)');
{
  const { captured, sandbox } = runCore({ pixelId: '' });
  check('no fbq calls at all', captured.fbq.length === 0);
  check('vpFBReady false', sandbox.window.vpFBReady === false);
  check('vpFB still callable (no throw)', (() => {
    try { sandbox.window.vpFB('AddToCart', {}, 'x'); return true; } catch (e) { return false; }
  })());
  check('beacon still sent — first-party analytics unaffected',
    captured.beacons.length >= 1);
  const b = captured.beacons[0];
  check('beacon carries no fb block when pixel is off', b && !b.body.fb);
}

console.log('\n3. THE DEDUPE PROPERTY — browser event_id vs server event_id');
{
  const { captured, sandbox } = runCore();
  captured.fbq.length = 0; captured.beacons.length = 0;
  sandbox.window.vpTrack('purchase', { method: 'fena', ref: 'VP1234', value: 92.5, currency: 'GBP' });

  const fbCall = captured.fbq.find((c) => c[1] === 'Purchase');
  const beacon = captured.beacons.find((b) => b.body.event === 'purchase');
  const browserEid = fbCall && fbCall[3] && fbCall[3].eventID;
  const beaconEid = beacon && beacon.body.fb && beacon.body.fb.eid;

  check('browser pixel fired Purchase', !!fbCall);
  check('browser eventID is purchase.VP1234', browserEid === 'purchase.VP1234', browserEid);
  check('beacon carries the same eid', beaconEid === browserEid, `${beaconEid} vs ${browserEid}`);
  check('beacon names the Meta event', beacon && beacon.body.fb.event === 'Purchase');
  check('value passed to pixel', fbCall && fbCall[2].value === 92.5);
  check('currency passed to pixel', fbCall && fbCall[2].currency === 'GBP');

  // The server-side authoritative purchase must derive the identical id.
  const { sendPurchase } = require(path.join(ROOT, 'lib/meta-capi.js'));
  let serverEid = null;
  global.fetch = (url, opts) => {
    serverEid = JSON.parse(opts.body).data[0].event_id;
    return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
  };
  process.env.META_PIXEL_ID = 'x'; process.env.META_CAPI_TOKEN = 'y';
  delete require.cache[require.resolve(path.join(ROOT, 'lib/meta-capi.js'))];
  const capi = require(path.join(ROOT, 'lib/meta-capi.js'));

  return capi.sendPurchase(
    { customer_email: 'a@b.com', total: 92.5, items: [{ slug: 'bpc-157' }] },
    { orderRef: 'VP1234', cookieHeader: '_fbp=fb.1.123.456' }
  ).then(() => {
    check('SERVER eventId matches BROWSER eventId', serverEid === browserEid,
      `server=${serverEid} browser=${browserEid}`);
    return { browserEid };
  });
}
