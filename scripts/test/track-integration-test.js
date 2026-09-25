/** Integration: real track.js handler -> Supabase insert + CAPI call. */
const ROOT = require('path').resolve(__dirname, '../..');
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.META_PIXEL_ID = 'PIX1';
process.env.META_CAPI_TOKEN = 'TOK1';

let pass = 0, fail = 0;
const check = (n, c, e) => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${e ? '  -> ' + e : ''}`)); };

const calls = [];
global.fetch = (url, opts) => {
  calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
  return Promise.resolve({ ok: true, text: () => Promise.resolve(''), status: 201 });
};

const handler = require(ROOT + '/api/track.js');

function mkRes() {
  const r = { code: null, ended: false, endedAt: null };
  r.status = (c) => { r.code = c; return r; };
  r.end = () => { r.ended = true; r.endedAt = calls.length; };
  return r;
}

(async () => {
  console.log('\n1. Funnel event with fb block -> both Supabase and Meta');
  calls.length = 0;
  let res = mkRes();
  await handler({
    method: 'POST',
    headers: { 'user-agent': 'UA', 'x-forwarded-for': '9.9.9.9, 10.0.0.1' },
    socket: { remoteAddress: '10.0.0.1' },
    body: {
      sid: 'abc123', event: 'purchase', path: '/checkout/payment-complete/',
      meta: { method: 'fena', ref: 'VP9', value: 92.5, currency: 'GBP' },
      fb: { event: 'Purchase', eid: 'purchase.VP9', fbp: 'fb.1.2.3', fbc: 'fb.1.9.clk' },
    },
  }, res);

  const sb = calls.find((c) => c.url.includes('sb.test'));
  const meta = calls.find((c) => c.url.includes('graph.facebook.com'));
  check('Supabase events insert made', !!sb, calls.map(c => c.url.split('?')[0]).join(', '));
  check('Meta CAPI call made', !!meta);
  check('responded 204', res.code === 204 && res.ended);

  console.log('\n2. The freeze bug must not regress — response AFTER both calls');
  check('all network calls happened before res.end()', res.endedAt === calls.length,
    `endedAt=${res.endedAt} totalCalls=${calls.length}`);

  console.log('\n3. Dedup id preserved through the handler');
  check('event_id forwarded unchanged', meta.body.data[0].event_id === 'purchase.VP9',
    meta.body.data[0].event_id);
  check('fbc forwarded', meta.body.data[0].user_data.fbc === 'fb.1.9.clk');
  check('real client ip taken from x-forwarded-for (not the proxy)',
    meta.body.data[0].user_data.client_ip_address === '9.9.9.9',
    meta.body.data[0].user_data.client_ip_address);
  check('value forwarded', meta.body.data[0].custom_data.value === 92.5);

  console.log('\n4. Privacy — public endpoint sends no email even if one is injected');
  calls.length = 0;
  res = mkRes();
  await handler({
    method: 'POST', headers: {}, socket: {},
    body: {
      sid: 'abc123', event: 'purchase', path: '/x/',
      meta: { ref: 'VP8', email: 'victim@example.com' },
      fb: { event: 'Purchase', eid: 'purchase.VP8', fbp: 'fb.1.2.3', em: 'victim@example.com' },
    },
  }, res);
  const all = JSON.stringify(calls);
  check('injected email never reaches Meta', !all.includes('victim@example.com'));
  check('injected email never reaches the database', !all.includes('victim'));

  console.log('\n5. Page view (no fb block) -> visits only, no Meta call');
  calls.length = 0;
  res = mkRes();
  await handler({
    method: 'POST', headers: {}, socket: {},
    body: { sid: 'abc123', path: '/', utm: { source: 'facebook', medium: 'cpc' } },
  }, res);
  check('visits insert made', calls.some((c) => c.url.includes('/visits')));
  check('no Meta call for a plain page view', !calls.some((c) => c.url.includes('graph.facebook.com')));

  console.log('\n6. Hostile fb block is dropped, beacon still works');
  calls.length = 0;
  res = mkRes();
  await handler({
    method: 'POST', headers: {}, socket: {},
    body: { sid: 'abc123', event: 'add_to_cart', path: '/x/', fb: { event: 'EvilEvent', eid: 'x' } },
  }, res);
  check('no Meta call for a non-standard event', !calls.some((c) => c.url.includes('graph.facebook.com')));
  check('first-party insert still happened', calls.some((c) => c.url.includes('/events')));
  check('still responded 204', res.code === 204);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
