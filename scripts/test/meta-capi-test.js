/** Server-side: cleanFb whitelist, CAPI payload shape, privacy guarantees. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '  -> ' + extra : ''}`); }
}

// Extract cleanFb from track.js without running the handler.
const trackSrc = fs.readFileSync(ROOT + '/api/track.js', 'utf8');
const m = trackSrc.match(/const FB_EVENTS[\s\S]*?\n\}\n/);
const cleanFb = new Function(m[0] + '; return cleanFb;')();

console.log('\n1. cleanFb — public unsigned endpoint, so treat input as hostile');
check('valid event accepted', !!cleanFb({ event: 'Purchase', eid: 'purchase.VP1', fbp: 'fb.1.2.3' }));
check('non-standard event rejected', cleanFb({ event: 'Hacked', eid: 'x' }) === null);
check('missing eid rejected', cleanFb({ event: 'Purchase' }) === null);
check('array rejected', cleanFb(['Purchase']) === null);
check('null rejected', cleanFb(null) === null);
check('string rejected', cleanFb('Purchase') === null);
check('unknown keys dropped', (() => {
  const r = cleanFb({ event: 'AddToCart', eid: 'a.1', evil: 'x', em: 'a@b.com' });
  return r && !('evil' in r) && !('em' in r);
})(), JSON.stringify(cleanFb({ event: 'AddToCart', eid: 'a.1', evil: 'x', em: 'a@b.com' })));
check('script injection stripped from eid', (() => {
  const r = cleanFb({ event: 'AddToCart', eid: '<script>alert(1)</script>' });
  return r && !/[<>()]/.test(r.eid);
})(), JSON.stringify(cleanFb({ event: 'AddToCart', eid: '<script>alert(1)</script>' })));
check('oversized fbp capped at 128', (() => {
  const r = cleanFb({ event: 'AddToCart', eid: 'a.1', fbp: 'x'.repeat(500) });
  return r && r.fbp.length === 128;
})());
check('nested object rejected in fbp (coerced, not exploded)', (() => {
  const r = cleanFb({ event: 'AddToCart', eid: 'a.1', fbp: { a: 1 } });
  return r && (!r.fbp || typeof r.fbp === 'string');
})());

console.log('\n2. CAPI payload shape');
process.env.META_PIXEL_ID = 'PIX1';
process.env.META_CAPI_TOKEN = 'TOK1';
delete process.env.META_CAPI_ADVANCED_MATCHING;
delete require.cache[require.resolve(ROOT + '/lib/meta-capi.js')];
let sent = null;
global.fetch = (url, opts) => {
  sent = { url, body: JSON.parse(opts.body) };
  return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
};
const capi = require(ROOT + '/lib/meta-capi.js');

(async () => {
  await capi.sendEvent({
    eventName: 'AddToCart', eventId: 'atc.1',
    sourceUrl: 'https://veloxpeps.com/compounds/bpc-157/',
    userData: { fbp: 'fb.1.2.3', ip: '1.2.3.4', userAgent: 'UA', email: 'a@b.com' },
    customData: { value: 31, currency: 'GBP', contentIds: ['bpc-157'], contentType: 'product' },
  });
  const ev = sent.body.data[0];
  check('posts to the pixel id', sent.url.includes('/PIX1/events'), sent.url.split('?')[0]);
  check('token not in body (query only)', !JSON.stringify(sent.body).includes('TOK1'));
  check('event_name set', ev.event_name === 'AddToCart');
  check('event_id set', ev.event_id === 'atc.1');
  check('action_source website', ev.action_source === 'website');
  check('event_time is unix seconds', ev.event_time > 1e9 && ev.event_time < 2e10);
  check('fbp forwarded', ev.user_data.fbp === 'fb.1.2.3');
  check('ip forwarded', ev.user_data.client_ip_address === '1.2.3.4');
  check('value + currency', ev.custom_data.value === 31 && ev.custom_data.currency === 'GBP');
  check('content_ids', JSON.stringify(ev.custom_data.content_ids) === '["bpc-157"]');

  console.log('\n3. Privacy — advanced matching is OFF by default');
  check('email NOT sent when flag unset', !ev.user_data.em,
    JSON.stringify(ev.user_data.em || null));
  check('raw email never appears anywhere in payload',
    !JSON.stringify(sent.body).includes('a@b.com'));

  process.env.META_CAPI_ADVANCED_MATCHING = '1';
  delete require.cache[require.resolve(ROOT + '/lib/meta-capi.js')];
  const capi2 = require(ROOT + '/lib/meta-capi.js');
  await capi2.sendEvent({
    eventName: 'Purchase', eventId: 'p.1',
    userData: { fbp: 'fb.1.2.3', email: 'A@B.com ' },
  });
  const ev2 = sent.body.data[0];
  const expected = require('crypto').createHash('sha256').update('a@b.com').digest('hex');
  check('email sent as sha256 when flag ON', ev2.user_data.em && ev2.user_data.em[0] === expected,
    JSON.stringify(ev2.user_data.em));
  check('email normalised (lowercased + trimmed) before hashing',
    ev2.user_data.em[0] === expected);
  check('raw email still never in payload', !JSON.stringify(sent.body).includes('A@B.com'));

  console.log('\n4. Fails safe');
  delete process.env.META_PIXEL_ID; delete process.env.META_CAPI_TOKEN;
  delete require.cache[require.resolve(ROOT + '/lib/meta-capi.js')];
  const capi3 = require(ROOT + '/lib/meta-capi.js');
  sent = null;
  const r = await capi3.sendEvent({ eventName: 'Purchase', eventId: 'p.2', userData: { fbp: 'x' } });
  check('no network call when unconfigured', sent === null);
  check('returns skipped, not throw', r.skipped === true && r.reason === 'not_configured');
  const r2 = await capi.sendEvent({ eventName: 'Purchase', eventId: 'p.3', userData: {} });
  check('skips when no match signal at all', r2.skipped === true && r2.reason === 'no_match_signal');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
