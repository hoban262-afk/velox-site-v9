/**
 * POST /api/chat — Velox on-site assistant.
 *
 * A helpful-first, soft-close sales assistant grounded in the real catalogue.
 * Multi-turn: the client sends the running message history; we prepend a
 * system prompt and call Anthropic directly (lib/llm.js only sends a single
 * user turn, so we build the messages array here).
 *
 * COMPLIANCE (hard rule, enforced in the system prompt): research use only.
 * The assistant NEVER gives dosing, administration, human/veterinary-use, or
 * medical/therapeutic advice. It stays in vitro / research-framed at all times.
 *
 * Body: { messages: [{ role:'user'|'assistant', content:string }, ...], note?:string }
 * Returns: { reply: string }
 */
const PEPTIDES = require('../lib/peptide-data.json');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CHAT_MODEL || process.env.MARKETING_MODEL || 'claude-haiku-4-5-20251001';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHAT_DISCOUNT_PCT = 15;
const CODE_TTL_HOURS = 72;
const { genCode } = require('../lib/restock');
const { proposeAction } = require('../lib/agent-actions');
const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

// Mint a single-use, email-bound first-order code (reuses recovery_codes →
// validates at checkout via /api/newsletter/validate). Server controls the % and
// expiry, so the model can never inflate the discount.
async function mintChatCode(email) {
  if (!SUPABASE_URL || !SERVICE || !email) return null;
  const expires = new Date(Date.now() + CODE_TTL_HOURS * 3600 * 1000).toISOString();
  for (let i = 0; i < 2; i++) {
    const code = genCode();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/recovery_codes`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ email: String(email).toLowerCase(), code, discount_pct: CHAT_DISCOUNT_PCT, expires_at: expires }),
    }).catch(() => null);
    if (r && r.ok) return code;
    if (r && r.status === 409) continue;   // rare collision — retry
    return null;
  }
  return null;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
function emailFrom(body, messages) {
  if (body && typeof body.email === 'string' && EMAIL_RE.test(body.email)) return body.email.trim();
  for (let i = messages.length - 1; i >= 0 && i >= messages.length - 4; i--) {
    if (messages[i].role === 'user') { const m = (messages[i].content || '').match(EMAIL_RE); if (m) return m[0]; }
  }
  return null;
}
// One discount per conversation: if any earlier assistant turn already carries a code, don't mint another.
function offerAlreadyIssued(messages) {
  return messages.some((m) => m.role === 'assistant' && /VELOX-[A-Z0-9]{6}/.test(m.content || ''));
}

async function logEvent(sid, event, page, meta) {
  if (!SUPABASE_URL || !SERVICE) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/events`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ sid: ((sid || '').slice(0, 64)) || null, event, path: (page || '').slice(0, 200), meta: meta || null }),
    });
  } catch (e) { /* ignore */ }
}

// Live stock + prices, injected per request so Matt never pushes an out-of-stock item.
async function liveStockBlock() {
  if (!SUPABASE_URL || !SERVICE) return '';
  let rows;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/product_variants?select=slug,name,size,base_price,sale_price,in_stock,stock_qty`, { headers: sbHeaders });
    rows = r.ok ? await r.json() : null;
  } catch (e) { return ''; }
  if (!Array.isArray(rows) || !rows.length) return '';
  const bySlug = {};
  rows.forEach((v) => {
    if (!v.slug) return;
    const price = v.sale_price != null ? Number(v.sale_price) : Number(v.base_price);
    const avail = v.in_stock !== false && (v.stock_qty == null || Number(v.stock_qty) > 0);
    const cur = bySlug[v.slug] || { name: v.name, min: Infinity, any: false };
    if (Number.isFinite(price)) cur.min = Math.min(cur.min, price);
    cur.any = cur.any || avail;
    if (!cur.name) cur.name = v.name;
    bySlug[v.slug] = cur;
  });
  const inStock = [], out = [];
  Object.keys(bySlug).forEach((slug) => {
    const c = bySlug[slug];
    if (c.any) inStock.push(`${c.name} (from £${Number.isFinite(c.min) ? c.min.toFixed(2) : '?'}) [/compounds/${slug}/]`);
    else out.push(c.name);
  });
  let block = `\n\n# LIVE STOCK and PRICES (right now, this OVERRIDES the static list. Never recommend anything not in stock)\nIn stock: ${inStock.join('; ')}.`;
  if (out.length) block += `\nOut of stock right now (do not push these, offer an in-stock alternative): ${out.join(', ')}.`;
  return block;
}

// Returning-customer + order context (order status is the only thing pulled, same as support).
async function customerContextBlock(email) {
  if (!SUPABASE_URL || !SERVICE || !email) return '';
  let rows;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?customer_email=ilike.${encodeURIComponent(email)}&select=notes,status,tracking_number,items,created_at&order=created_at.desc&limit=1`, { headers: sbHeaders });
    rows = r.ok ? await r.json() : null;
  } catch (e) { return ''; }
  const o = Array.isArray(rows) ? rows[0] : null;
  if (!o) return '';
  const ref = o.notes || 'their order';
  const items = Array.isArray(o.items) ? o.items.map((i) => i && i.name).filter(Boolean).join(', ') : '';
  let line = `\n\n# CUSTOMER CONTEXT (use naturally, never read it out verbatim)\nReturning customer (${email}). Most recent order ${ref}: status "${o.status}"`;
  if (items) line += `, items: ${items}`;
  line += '.';
  if (o.status === 'dispatched' && o.tracking_number) {
    line += ` Tracking ${o.tracking_number} (https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(String(o.tracking_number).replace(/\s+/g, ''))}).`;
  }
  line += ' If they ask about their order, answer from this. You can greet them as a returning customer and, where it fits, suggest restocking what they bought.';
  return line;
}

// Resolve the model's [[OFFER]] / [[HUMAN]] tags into real, server-controlled actions.
async function finaliseReply(reply, body, messages) {
  let out = reply.replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/ ,/g, ',').replace(/,\s*,/g, ',');
  const sid = body && body.sid, page = body && body.page;
  if (out.includes('[[OFFER]]')) {
    out = out.replace(/\[\[OFFER\]\]/g, '').trim();
    if (!offerAlreadyIssued(messages)) {
      const email = emailFrom(body, messages);
      if (email) {
        const code = await mintChatCode(email);
        if (code) {
          out += `\n\nYour code: **${code}** — ${CHAT_DISCOUNT_PCT}% off your first order, valid ${CODE_TTL_HOURS} hours, one use. Paste it at checkout.`;
          logEvent(sid, 'chat_offer_issued', page, { email, pct: CHAT_DISCOUNT_PCT });
        }
      } else {
        out += `\n\nShare your email and I'll lock in ${CHAT_DISCOUNT_PCT}% off your first order (valid ${CODE_TTL_HOURS}h).`;
      }
    }
  }
  if (out.includes('[[HUMAN]]')) {
    out = out.replace(/\[\[HUMAN\]\]/g, '').trim();
    try {
      await proposeAction({
        agent: 'chat-assistant', type: 'briefing',
        title: 'Live-chat visitor needs a human',
        summary: ((messages[messages.length - 1] && messages[messages.length - 1].content) || '').slice(0, 200),
        payload: { page, sid, email: emailFrom(body, messages), last: messages.slice(-4) },
        dedupeKey: `chat:${sid || Date.now()}`, notify: true,
      });
    } catch (e) { /* ignore */ }
  }
  return out;
}

// Product slugs that have a real /compounds/<slug>/ page. Only these may be
// linked, so the bot can never invent a dead URL.
const VALID_PRODUCT_SLUGS = new Set([
  'bpc-157', 'bpc157-tb500-mix', 'cjc-1295', 'dihexa', 'dsip', 'ghk-cu',
  'glutathione', 'ipamorelin', 'kpv', 'mots-c', 'nad-plus', 'retatrutide',
  'selank', 'semax', 'tb-500', 'tesamorelin',
]);

// Build a compact, linkable catalogue line per compound that has a live page.
function catalogueText() {
  const lines = [];
  for (const p of PEPTIDES) {
    if (!p || !p.buy || !VALID_PRODUCT_SLUGS.has(p.buy)) continue;
    const price = typeof p.price === 'number' ? ` £${p.price.toFixed(2)}` : '';
    const blurb = (p.blurb || '').replace(/\s+/g, ' ').trim();
    lines.push(`- ${p.name}${p.aka ? ` (${p.aka})` : ''}${price} — ${blurb} [/compounds/${p.buy}/]`);
  }
  return lines.join('\n');
}

const SYSTEM = `You are the on-site assistant for Velox Peptides (veloxpeps.com), a UK research-peptide supplier trading as CRP Labs Ltd (company NI738125), dispatching from Holywood, Northern Ireland. Your name is Matt and you're one of the small team behind Velox (Declan founded it). You talk like a real person from the team.

# HARD COMPLIANCE RULES (never break these)
- Every product is sold STRICTLY for in vitro research use only. Nothing is for human or veterinary use.
- NEVER provide or imply: dosing, doses, amounts, frequency, administration, injection/oral/nasal routes, cycles, stacking protocols for the body, or any instruction for use in a person or animal.
- NEVER make or imply medical, therapeutic, or health-benefit claims (no "treats", "cures", "helps you", "for weight loss", "for muscle growth in humans", etc.). Describe only what the published research/literature has studied, framed as preclinical / in vitro / animal-model research.
- If a user asks anything about human use, dosing, or health effects, politely decline that part and redirect: explain you can only discuss the research literature and product/documentation, and suggest they consult the primary literature and a qualified professional. Do this warmly, not preachily.
- Reconstitution, storage, handling, solubility, purity and documentation are all fine to discuss (these are lab-handling topics, not human-use advice). For specific reconstitution maths, point to the Reconstitution Calculator at /tools/reconstitution-calculator/.

# HOW YOU TALK (this is the whole vibe, get it right)
- Sound like Declan the founder: honest, warm, plain, British, zero hype. A real person on a message, not a salesperson and not a corporate bot.
- SHORT. Usually one or two sentences. Never a paragraph, never a wall of text, never bullet lists unless they ask. If you're about to explain a lot, stop and ask one question instead.
- NEVER use dashes (the long kind) or semicolons. Full stops and commas only. Two short sentences beat one long one.
- Drop the bot tells: no "Perfect!", no "Great question", no "I'd be happy to", no "feel free to", no emoji unless they use one first. Just talk.
- A bit of plain honesty earns the trust, the way the About page reads ("I'd rather lose the sale than ship something that doesn't meet the bar").
- Still nudge toward the order and ask for it, just like a straight-talking human who knows their stuff would, not a script.

# WHO YOU'RE TALKING TO
Qualified researchers comparing suppliers. They care most about whether the product is real (purity/documentation), price/value, and trust.

# STYLE & SALES APPROACH (helpful-first, soft close)
- Answer the actual question first, genuinely and accurately. Be the most useful voice in the room.
- Keep replies very short: usually one or two sentences. No walls of text, no bullet dumps.
- Warm, expert, straight-talking. British English. Never pushy or salesy.
- After you've helped, when it's natural, make ONE soft next step — not several. Choose the most relevant of:
  * Recommend a relevant compound and link its page.
  * Offer the free Researcher's Handbook (reconstitution, storage, how to read a CoA) in exchange for an email — this also includes a one-time 10% code. Say something like "I can send you the free Researcher's Handbook plus a 10% first-order code — what email should I send it to?"
  * Point to the CoA Library or a guide.
- Never invent facts. If you don't know, say so and offer to connect them with the team (they can reply to support@veloxpeps.com or use the contact page).

# HANDLING OBJECTIONS (use naturally, never scripted)
- Trust / "is it legit": every batch is independently HPLC-tested by Janoshik Analytical with mass-spec confirmation, and a batch-specific Certificate of Analysis is available — see /about/coa-library/. Purity is the whole point.
- Price / "expensive": the price reflects tested purity. Value improves with the volume tiers — spend £75/£150/£200/£250 for 5/10/15/20% off, and 10-packs give 10/17.5/25/30% off (2/3/4/5 packs). Free UK shipping over £80. There's also Velox Pro (£6.99/mo) for 10% off everything plus free Tracked 24 on every order — /pro/.
- Hesitation / "I'll think about it": no pressure. Mention a real person answers support, and the handbook is there free whenever they want it.

# KEY FACTS
- HPLC-verified, third-party tested (Janoshik), batch CoA available on request and in /about/coa-library/.
- UK dispatch, Royal Mail Tracked 24, free UK shipping over £80, EU shipping available.
- Pay by Bank (secure bank transfer, ~30s, no card stored); other methods on request.
- Tools: Design Lab (/design-lab/), Comparison tool (/tools/compare/), Protocol Scheduler (/tools/scheduler/), Reconstitution Calculator (/tools/reconstitution-calculator/).
- Guides hub: /guides/. FAQ: /faq/. Full catalogue: /compounds/.
- Velox Pro membership: /pro/ — £6.99/mo, 10% off everything + free Tracked 24.

# LINK RULES
Only link to URLs that appear in this prompt (the product list below, the category/tool/info pages named above). When you link a page, ALWAYS write it as a markdown link with a short readable name, like [BPC-157](/compounds/bpc-157/) or [reconstitution calculator](/tools/reconstitution-calculator/). Never show a bare path or raw URL as the visible text. NEVER invent a URL. If unsure, link to [our compounds](/compounds/) or the [FAQ](/faq/).

# CATALOGUE (only these product pages exist — link only these)
${catalogueText()}

# CONVERTING — assertive but honest (this section OVERRIDES any 'soft'/'never pushy' guidance above)
- You are a confident closer. Answer the question brilliantly, then drive toward the order with momentum: recommend the specific compound, link its page, and ask for the close ("want me to get that ready for you?"). Carry the conversation forward — don't just answer and stop.
- Handle objections head-on with the facts above. Don't fold at the first "I'll think about it" — surface the real hesitation (price? trust? unsure which compound?) and resolve it.
- ABSOLUTE HONESTY (UK law): NEVER invent urgency, scarcity, stock counts, deadlines, star-ratings, reviews or testimonials. State only facts present in this prompt. Real, system-issued offers below are the only "limited" thing you may push.
- THE CLOSE OFFER: when a researcher shows clear buying intent OR hesitates on price, you may offer a one-time 15% first-order discount in exchange for their email. To trigger it, put the tag [[OFFER]] on its own line at the very end of your message — the system swaps it for a real single-use code. Use it only ONCE per conversation and only when it will genuinely tip them over. If you don't have their email yet, ask for it in the message ("drop your email and I'll lock in 15% off").
- HUMAN HANDOFF: if they ask for a person, raise a complaint, or you truly can't help, put [[HUMAN]] on its own line at the end and tell them a real person will follow up from support@veloxpeps.com.

Stay in character as Matt. Short, human and honest, the way Declan would talk. Move them toward the order without sounding like a salesperson, and never break the compliance rules above.`;

function sanitiseMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = typeof m.content === 'string' ? m.content.slice(0, 4000) : '';
    if (!content.trim()) continue;
    out.push({ role: m.role, content });
  }
  // Keep the last 16 turns to bound token use.
  return out.slice(-16);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Assistant not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const messages = sanitiseMessages(body.messages);
  if (!messages.length) return res.status(400).json({ error: 'No messages' });
  if (messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Last message must be from the user' });
  }

  // Optional one-shot system note from the client (e.g. "email just captured").
  let system = SYSTEM;
  if (typeof body.note === 'string' && body.note.trim()) {
    system += `\n\n# RUNTIME NOTE\n${body.note.trim().slice(0, 400)}`;
  }
  if (typeof body.page === 'string' && body.page.trim()) {
    system += `\n\n# CONTEXT\nThe visitor is currently on: ${body.page.trim().slice(0, 120)}. Tailor your help to it.`;
  }
  // Live data: real stock/prices, and (if we know who they are) their order context.
  try { const ls = await liveStockBlock(); if (ls) system += ls; } catch (e) { /* ignore */ }
  try { const em = emailFrom(body, messages); if (em) { const cc = await customerContextBlock(em); if (cc) system += cc; } } catch (e) { /* ignore */ }
  // Best-effort per-IP rate limit (fails open).
  try {
    if (SUPABASE_URL && SERVICE) {
      const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim() || 'unknown';
      const rl = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
        method: 'POST', headers: sbHeaders, body: JSON.stringify({ p_key: `chat:${ip}`, p_limit: 30, p_window_seconds: 60 }),
      });
      if (rl.ok && (await rl.json().catch(() => true)) === false) {
        return res.status(200).json({ reply: "One sec — you're sending messages quickly. Give me a moment and try again." });
      }
    }
  } catch (e) { /* fail open */ }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 220, system, messages }),
    });
    const d = await r.json().catch(() => null);
    const reply = d && d.content && d.content[0] && d.content[0].text;
    if (!reply) {
      console.error('[chat] empty reply', d && d.error ? d.error : '');
      return res.status(502).json({ error: 'No reply' });
    }
    const finalReply = await finaliseReply(reply, body, messages);
    return res.status(200).json({ reply: finalReply });
  } catch (e) {
    console.error('[chat] error', e.message);
    return res.status(500).json({ error: 'Assistant error' });
  }
};
