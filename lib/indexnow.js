/**
 * lib/indexnow.js — submit URLs to IndexNow (Bing, Yandex, Seznam, Naver, etc.).
 *
 * IndexNow is the modern replacement for the now-deprecated sitemap "ping"
 * endpoints. Google does NOT participate in IndexNow, so this covers Bing/Yandex
 * and friends; Google discovery is handled by a fresh sitemap + GSC.
 *
 * Key verification: the key must be readable at https://<host>/<key>.txt
 * (file lives in output/<key>.txt and is served as a static asset).
 */
const HOST = 'veloxpeps.com';
const KEY  = process.env.INDEXNOW_KEY || 'a4cf036e4e0666c870ccabf4b5546567';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/**
 * Submit a list of absolute URLs. IndexNow accepts up to 10,000 per request.
 * Returns { ok, status, submitted }.
 */
async function submitUrls(urls) {
  const list = (urls || []).filter((u) => typeof u === 'string' && u.startsWith(`https://${HOST}`));
  if (!list.length) return { ok: false, status: 0, submitted: 0, error: 'no valid urls' };

  const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: list.slice(0, 10000) };
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    // IndexNow returns 200 (accepted) or 202 (accepted, pending). 4xx = key/format problem.
    return { ok: r.status === 200 || r.status === 202, status: r.status, submitted: list.length };
  } catch (e) {
    return { ok: false, status: 0, submitted: 0, error: e.message };
  }
}

/**
 * Fetch the live sitemap and return every <loc> URL in it.
 */
async function urlsFromSitemap(sitemapUrl = `https://${HOST}/sitemap.xml`) {
  const r = await fetch(sitemapUrl, { headers: { 'User-Agent': 'velox-indexnow/1.0' } });
  if (!r.ok) throw new Error(`sitemap fetch ${r.status}`);
  const xml = await r.text();
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) locs.push(m[1].trim());
  return Array.from(new Set(locs));
}

module.exports = { submitUrls, urlsFromSitemap, HOST, KEY, KEY_LOCATION };
