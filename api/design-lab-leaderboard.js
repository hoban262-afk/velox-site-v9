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

  const body = `<!DOCTYPE html><html lang="en-GB"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design Lab Leaderboard — Top AI-designed research peptides | Velox</title>
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
</style></head><body><div class="w">
<p class="ey">Velox Design Lab · Leaderboard</p>
<h1>The most novel designs<br>on the board.</h1>
<p class="sub">Community-designed research peptides, ranked by a blend of novelty and synthesisability. Design one, share it, and climb. For in vitro research use only.</p>
<a class="cta" href="/design-lab/app/">Design yours free →</a>
${list}
<div class="dis">Scores blend computational novelty and synthesisability estimates. Velox Design Lab outputs are hypotheses for <em>in vitro</em> research use only — not validated compounds, not medical advice, not for human or veterinary use.</div>
</div></body></html>`;

  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600');
  return res.status(200).send(body);
};
