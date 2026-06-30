/**
 * /api/design-lab-leaderboard  (routed from /design-lab/leaderboard via vercel.json)
 * Server-rendered, crawlable leaderboard of PUBLIC Design Lab runs, ranked by a
 * blend of novelty and synthesisability. Drives the community design challenge,
 * adds indexable internal links to run pages + the tool. Research-use framing.
 */
const SB_URL  = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function runScore(cands) {
  let best = 0, bestName = '';
  (cands || []).forEach((c) => {
    const sc = c.scores || {}, nv = c.novelty || {};
    const nov = nv.badge === 'novel' ? 100 : nv.badge === 'partial' ? Math.max(20, 100 - ((nv.match && nv.match.pct) || 50)) : 0;
    const v = Math.round(nov * 0.6 + (sc.sy || 0) * 0.4);
    if (v > best) { best = v; bestName = c.name || ''; }
  });
  return { score: best, bestName };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  let rows = [];
  try {
    const r = await fetch(`${SB_URL}/rest/v1/design_lab_runs?is_shared=eq.true&select=name,target,brief,candidates,share_token,created_at&order=created_at.desc&limit=150`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    rows = r.ok ? await r.json() : [];
  } catch (e) { rows = []; }

  const ranked = (Array.isArray(rows) ? rows : [])
    .map((run) => {
      const cands = Array.isArray(run.candidates) ? run.candidates : [];
      const s = runScore(cands);
      const mech = (run.brief && run.brief.target_mechanism) || run.target || '';
      return { name: run.name || (cands[0] && cands[0].name) || 'Untitled design', token: run.share_token, mech, score: s.score, n: cands.length };
    })
    .filter((x) => x.token)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);

  const medal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
  const list = ranked.length ? ranked.map((x, i) => (
    `<a class="row" href="/design-lab/r/${esc(x.token)}">`
    + `<div class="rk">${medal(i)}</div>`
    + `<div class="mid"><div class="nm">${esc(x.name)}</div><div class="mech">${esc(String(x.mech).slice(0, 90))}</div></div>`
    + `<div class="sc">${x.score}<span>/100</span></div></a>`
  )).join('') : '<p class="empty">No public designs yet — be the first on the board.</p>';

  const HEADER = `<header class="site-header">
  <nav class="nav" aria-label="Primary">
    <a class="nav-logo" href="/" aria-label="Velox Peptides">
      <img class="nav-logo-img" src="/assets/images/veloxpeps2.png" alt="Velox Peptides" width="150" height="auto">
    </a>
    <div class="nav-links">
      <a class="nl" href="/compounds/">Shop</a>
      <div class="nl-drop"><a class="nl nl-drop-btn active" href="/design-lab/">Tools <span class="nl-caret">&#9662;</span></a><div class="nl-menu"><a class="nl-item" href="/design-lab/"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c.4 4 2.6 6.2 6.6 6.6C14.6 10 12.4 12.2 12 16.2 11.6 12.2 9.4 10 5.4 9.6 9.4 9.2 11.6 7 12 3Z"/></svg>Design Lab</a><a class="nl-item" href="/tools/compare/"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v17M6 21h12M12 6 5 8l3 5a3 3 0 0 1-6 0l3-5M12 6l7 2-3 5a3 3 0 0 0 6 0l-3-5"/></svg>Compare peptides</a><a class="nl-item" href="/tools/scheduler/"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>Protocol Scheduler</a></div></div>
      <a class="nl" href="/pro/" style="color:#01D3A0;font-weight:700">Pro</a>
      <div class="nl-drop">
        <a class="nl nl-drop-btn" href="/guides/">Guide Hub <span class="nl-caret">&#9662;</span></a>
        <div class="nl-menu">
          <a class="nl-item" href="/guides/">Guide Hub</a>
          <a class="nl-item" href="/guides/glossary/">Glossary</a>
        </div>
      </div>
      <div class="nl-drop">
        <a class="nl nl-drop-btn" href="/about/">About <span class="nl-caret">&#9662;</span></a>
        <div class="nl-menu">
          <a class="nl-item" href="/about/">About</a>
          <a class="nl-item" href="/faq/">FAQ</a>
          <a class="nl-item" href="/contact/">Contact</a>
        </div>
      </div>
    </div>
    <div class="nav-actions">
      <form class="vp-search vp-search-nav" role="search" onsubmit="return false">
        <div class="vp-search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="vp-search-input" type="search" placeholder="Search&hellip;" aria-label="Search the catalogue" autocomplete="off">
        </div>
        <div class="vp-search-results" hidden></div>
      </form>
      <a class="nav-ig" href="https://www.instagram.com/veloxpeptides" target="_blank" rel="noopener noreferrer" aria-label="Velox Peptides on Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a>
      <a class="nav-ig" href="/account/" aria-label="My account" title="My account"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></a>
      <a class="nav-cart" href="/cart/" aria-label="View cart"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg><span class="nav-cart-label">Order</span><span class="nav-cart-count" id="nav-cart-count">0</span></a>
      <button class="hamburger" id="hamburger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>
  </nav>
  <div class="mob-menu" id="mob-menu" aria-hidden="true"><form class="vp-search mob-search" role="search" onsubmit="return false"><div class="vp-search-box"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input class="vp-search-input" type="search" placeholder="Search compounds&hellip;" aria-label="Search the catalogue" autocomplete="off"></div><div class="vp-search-results" hidden></div></form>
    <a href="/compounds/" class="mob-nl">Shop</a>
    <a href="/design-lab/" class="mob-nl" style="color:#01D3A0">Design Lab</a>
    <a href="/pro/" class="mob-nl">Pro</a>
    <a href="/guides/" class="mob-nl">Guide Hub</a>
    <a href="/guides/glossary/" class="mob-nl">Glossary</a>
    <a href="/about/" class="mob-nl">About</a>
    <a href="/contact/" class="mob-nl">Contact</a>
    <a href="/cart/" class="mob-nl">Order</a>
    <a href="/account/" class="mob-nl">My account</a>
  </div>
</header>`;

  const body = `<!DOCTYPE html><html lang="en-GB"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design Lab Leaderboard – Top AI-Designed Peptides | Velox</title>
<meta name="description" content="The top community-designed research peptides on Velox Design Lab, ranked by novelty and synthesisability. For in vitro research use only.">
<link rel="canonical" href="https://veloxpeps.com/design-lab/leaderboard/">
<meta property="og:title" content="Velox Design Lab Leaderboard"><meta property="og:description" content="The most novel, most makeable AI-designed research peptides this season.">
<meta property="og:image" content="https://veloxpeps.com/assets/images/og-default.png"><meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/assets/css/core.css">
<style>
 body{background:#030407;color:#e7edf0;font-family:Inter,system-ui,sans-serif;margin:0}
 .w{max-width:760px;margin:0 auto;padding:44px 20px 90px}
 .ey{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#01D3A0;margin:0 0 10px}
 h1{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;font-size:clamp(32px,6vw,54px);line-height:1;margin:0 0 12px;color:#fff}
 .sub{color:#aeb9bd;font-size:16px;line-height:1.6;margin:0 0 28px;max-width:560px}
 .cta{display:inline-block;background:#01D3A0;color:#04140f;font-weight:800;text-decoration:none;padding:13px 22px;border-radius:10px;margin-bottom:30px}
 .row{display:flex;align-items:center;gap:16px;padding:16px 18px;background:#0a0d12;border:1px solid #1a2230;border-radius:12px;margin-bottom:10px;text-decoration:none}
 .row:hover{border-color:#01D3A0}
 .rk{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px;color:#8aa0a0;width:34px;text-align:center;flex:0 0 34px}
 .mid{flex:1;min-width:0}
 .nm{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .mech{font-size:13px;color:#8aa0a0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .sc{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:#01D3A0;flex:0 0 auto}
 .sc span{font-size:11px;color:#475262;font-family:'DM Mono',monospace}
 .empty{color:#8aa0a0}
 .dis{font-size:12px;color:#5a6675;line-height:1.6;margin-top:30px;border-top:1px solid #1a2230;padding-top:18px}
</style></head><body>${HEADER}
<div class="w">
<p class="ey">Velox Design Lab · Leaderboard</p>
<h1>The most novel designs<br>on the board.</h1>
<p class="sub">Community-designed research peptides, ranked by a blend of novelty and synthesisability. Design one, share it, and climb. For in vitro research use only.</p>
<a class="cta" href="/design-lab/app/">Design yours free →</a>
${list}
<div class="dis">Scores blend computational novelty and synthesisability estimates. Velox Design Lab outputs are hypotheses for <em>in vitro</em> research use only — not validated compounds, not medical advice, not for human or veterinary use.</div>
</div>
<script src="/assets/js/core.js"></script>
<script src="/assets/js/search.js" defer></script>
</body></html>`;

  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600');
  return res.status(200).send(body);
};
