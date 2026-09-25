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

// Persist the full conversation, keyed by widget session id (sid), so the
// chat-transcripts cron worker can email each one to support. Best-effort: this
// must never break or slow the reply, so any failure is swallowed. We upsert the
// whole thread on every turn (merge-duplicates on sid) — the latest write wins,
// which keeps the row complete even though the chat backend is stateless.
// NOTE: a merge-duplicates upsert overwrites every column in the payload, so we
// re-send started_at=now() only via the DB default on first insert; on update we
// omit it to preserve the original. emailed_at/digest_at are never touched here,
// so re-sending a transcript after it was emailed naturally clears nothing.
async function saveTranscript(body, messages, finalReply) {
  if (!SUPABASE_URL || !SERVICE) return;
  const sid = body && typeof body.sid === 'string' ? body.sid.slice(0, 64) : '';
  if (!sid) return;
  try {
    const thread = [...messages, { role: 'assistant', content: String(finalReply || '') }]
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
    if (!thread.length) return;
    const row = {
      sid,
      email: emailFrom(body, messages),
      page: (body && typeof body.page === 'string' ? body.page : '').slice(0, 200) || null,
      transcript: thread,
      msg_count: thread.length,
      last_at: new Date().toISOString(),
      // Reset the email flags so an ongoing conversation that already got flushed
      // gets re-flushed once it has new turns (the digest still de-dupes on its own).
      emailed_at: null,
    };
    await fetch(`${SUPABASE_URL}/rest/v1/chat_transcripts?on_conflict=sid`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (e) { /* best-effort: never break the reply */ }
}

// Live stock + per-variant prices, injected per request. Exposes the EXACT
// single AND 10-pack price for every in-stock variant so Matt never has to do
// price maths. (The old version only exposed the cheapest "from £X", which is
// the single vial — so when asked a 10-pack price he quoted the single price.)
async function liveStockBlock() {
  if (!SUPABASE_URL || !SERVICE) return '';
  let rows;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/product_variants?select=slug,name,size,base_price,sale_price,in_stock,stock_qty`, { headers: sbHeaders });
    rows = r.ok ? await r.json() : null;
  } catch (e) { return ''; }
  if (!Array.isArray(rows) || !rows.length) return '';

  const isPack = (v) => /10-?pack/i.test(`${v.size || ''} ${v.name || ''}`);
  // Oversell policy (owner directive): every catalogued variant is treated as
  // orderable, so the assistant never tells a customer something is out of stock.
  const inStock = () => true;
  const money = (n) => `£${Number(n).toFixed(2)}`;
  const priceOf = (v) => (v.sale_price != null ? Number(v.sale_price) : Number(v.base_price));

  const groups = {};
  rows.forEach((v) => { if (v.slug) (groups[v.slug] || (groups[v.slug] = [])).push(v); });

  const lines = [];
  Object.keys(groups).sort().forEach((slug) => {
    const vs = groups[slug];
    const base = vs.find((v) => !isPack(v)) || vs[0];
    const name = String(base.name || slug).replace(/\s*[—–-]\s*10-?pack.*$/i, '').trim();
    const singles = [], packs = [], oos = [];
    vs.forEach((v) => {
      const p = priceOf(v);
      if (!Number.isFinite(p)) return;
      const onSale = v.sale_price != null && Number(v.sale_price) < Number(v.base_price);
      if (!inStock(v)) { oos.push(isPack(v) ? '10-pack' : (v.size || 'single')); return; }
      if (isPack(v)) packs.push(`10-pack (10 vials) ${money(p)}${onSale ? ` (was ${money(v.base_price)})` : ''}`);
      else singles.push(`${v.size || 'vial'} ${money(p)}${onSale ? ` (was ${money(v.base_price)})` : ''}`);
    });
    if (!singles.length && !packs.length) return;   // whole product out of stock
    const link = VALID_PRODUCT_SLUGS.has(slug) ? ` [/compounds/${slug}/]` : '';
    let line = `- ${name}${link}: ${singles.concat(packs).join('; ')}`;
    if (oos.length) line += ` (out of stock: ${oos.join(', ')})`;
    lines.push(line);
  });
  if (!lines.length) return '';

  return '\n\n# LIVE STOCK & PRICES — AUTHORITATIVE (quote ONLY these exact figures; never calculate, multiply or estimate a price)\n'
    + 'Real prices right now. A 10-pack has its OWN listed price, it is NOT the single-vial price or any multiple of it. When asked a price, read the exact figure from this list. Never recommend anything not in stock. If something is not listed, do not guess, point them to the product page.\n'
    + lines.join('\n');
}

// Map the raw order status to a plain, customer-friendly stage description.
const ORDER_STAGE = {
  pending:    'Awaiting payment. We have the order but payment has not cleared yet.',
  paid:       'Paid and being prepared. It dispatches within 24 hours of cleared payment, Monday to Friday (excluding UK public holidays).',
  dispatched: 'Dispatched and on its way (Royal Mail Tracked 24 in the UK, Royal Mail International Tracked for overseas orders).',
  cancelled:  'Cancelled.',
  refunded:   'Refunded.',
};

// Beyond this many days since dispatch a parcel can no longer be "on its way":
// the longest quoted delivery window is international at 7-14 working days, and our
// own "not arrived, investigate with Royal Mail" escalation is 21 working days
// (~30 calendar days). Past that, an order is delivered-long-ago or a support case,
// never live transit. Presenting an old order as "on its way" (a June order surfaced
// as freshly dispatched in September) misleads customers, so we flip the wording.
const DISPATCH_TRANSIT_MAX_DAYS = 30;

// Whole days between a timestamp and now (null if missing/unparseable).
function daysSince(ts) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

// Human date like "1 June 2026" (null if missing/unparseable).
function fmtDate(ts) {
  if (!ts) return null;
  const t = new Date(ts);
  return Number.isFinite(t.getTime())
    ? t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
}

// Returning-customer + order context. Pulls the most recent order by email and
// turns the raw status into a friendly STAGE. No external tracking API: the exact
// live status is reached via the Royal Mail link the model shares when dispatched.
async function customerContextBlock(email) {
  if (!SUPABASE_URL || !SERVICE || !email) return '';
  let rows;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?customer_email=ilike.${encodeURIComponent(email)}&select=notes,status,tracking_number,carrier,items,created_at,dispatched_at&order=created_at.desc&limit=1`, { headers: sbHeaders });
    rows = r.ok ? await r.json() : null;
  } catch (e) { return ''; }
  const o = Array.isArray(rows) ? rows[0] : null;
  if (!o) {
    return `\n\n# CUSTOMER CONTEXT\nNo order is on file under ${email}. If they are asking about an order, gently ask them to confirm the exact email used at checkout (and their order reference if they have it). Never guess or invent a status. If it still cannot be found, point them to support@veloxpeps.com with their order reference.`;
  }
  const ref = o.notes || 'their order';
  const itemList = Array.isArray(o.items) ? o.items.filter((i) => i && (i.name || i.slug)) : [];
  const items = itemList.map((i) => i.name || i.slug).join(', ');
  const reorderable = itemList.filter((i) => i.slug).map((i) => `${i.name || i.slug} (${i.slug})`).join(', ');
  const dispAge = o.status === 'dispatched' ? daysSince(o.dispatched_at || o.created_at) : null;
  const isOldDispatch = dispAge !== null && dispAge > DISPATCH_TRANSIT_MAX_DAYS;
  const dispWhen = fmtDate(o.dispatched_at || o.created_at);
  const stage = isOldDispatch
    ? `Dispatched${dispWhen ? ` on ${dispWhen}` : ''}, long since delivered. This is an old, completed order, NOT one currently in transit.`
    : (ORDER_STAGE[o.status] || `Status: ${o.status}.`);
  let line = `\n\n# CUSTOMER CONTEXT, their order (use naturally, never read it out verbatim, never invent a status)\nReturning customer (${email}). Most recent order ${ref}. STAGE: ${stage}`;
  if (items) line += ` Items: ${items}.`;
  if (reorderable) line += ` If they want to reorder, offer it warmly and add items with the [[ADD:slug]] tag using these slugs: ${reorderable}.`;
  if (o.status === 'dispatched') {
    if (isOldDispatch) {
      // Old dispatch: delivered long ago, NOT live transit. Never imply it is on its
      // way and never push the live tracking link as if the parcel is still moving.
      line += ` This order was dispatched${dispWhen ? ` on ${dispWhen}` : ' some time ago'} (about ${dispAge} days ago) and will have arrived long ago, it is NOT currently in transit. Do NOT say it is "on its way" or share a live tracking link as if the parcel is moving. Do NOT bring this old order up unprompted, especially if they are asking about a different or new order. Only if they specifically say this past order never arrived, ask them to email support@veloxpeps.com with the order reference so we can look into it.`;
    } else if (o.tracking_number) {
      const tn = String(o.tracking_number).replace(/\s+/g, '');
      line += ` Tracking number ${o.tracking_number}. Share this Royal Mail link so they can see the exact live status themselves: https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(tn)}`;
      line += ' If they ask where it is: Tracked 24 normally arrives 1 to 2 working days after dispatch. If it has been more than 10 working days since dispatch, ask them to email support@veloxpeps.com with the order reference and tracking number so we can investigate with Royal Mail.';
    } else {
      line += ' No tracking number is on file yet. Tell them it is emailed at dispatch, and to contact support@veloxpeps.com if it has not arrived.';
      line += ' If they ask where it is: Tracked 24 normally arrives 1 to 2 working days after dispatch. If it has been more than 10 working days since dispatch, ask them to email support@veloxpeps.com with the order reference and tracking number so we can investigate with Royal Mail.';
    }
  }
  line += ' Answer order questions from this only. You may greet them as a returning customer and, where it fits, suggest restocking what they bought.';
  return line;
}

// Inject the visitor's current basket so Matt can help them close the sale.
function cartBlock(cart) {
  if (!Array.isArray(cart) || !cart.length) return '';
  const lines = cart.slice(0, 12).map((it) => {
    const name = String((it && it.name) || (it && it.slug) || 'item').slice(0, 60);
    const size = it && it.size ? ` ${String(it.size).slice(0, 24)}` : '';
    const qty = Number(it && it.qty) > 0 ? Number(it.qty) : 1;
    return `- ${qty} x ${name}${size}`;
  });
  return '\n\n# CURRENT BASKET (the visitor has these in their cart right now)\n'
    + lines.join('\n')
    + '\nIf it fits the conversation, help them finish: answer any last question, then nudge them to checkout with a link to [your cart](/cart/). Never invent items or prices not shown here or in the LIVE STOCK block. Do not pressure.';
}

// Inject the live Deal of the Day so Matt can flag it (the discounted price is
// already reflected in the LIVE STOCK block via sale_price).
async function dealBlock() {
  if (!SUPABASE_URL || !SERVICE) return '';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/deal_of_day?active=eq.true&select=slug,size,discount_pct,headline,ends_at&order=updated_at.desc&limit=1`, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    const d = Array.isArray(rows) ? rows[0] : null;
    if (!d) return '';
    if (d.ends_at && new Date(d.ends_at) < new Date()) return '';
    const pct = Math.round(Number(d.discount_pct) || 0);
    const ends = d.ends_at ? new Date(d.ends_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : null;
    return `\n\n# ACTIVE DEAL (mention naturally only if it fits, the discounted price is already in the LIVE STOCK block)\n${d.headline || 'Deal'}: ${d.slug} ${d.size}, ${pct}% off${ends ? `, ends ${ends}` : ''}. Flag it if relevant, do not oversell.`;
  } catch (e) { return ''; }
}

// Pull the plain text out of an Anthropic content array.
function textOf(content) {
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
}

// ── Tools the model can call for reliable, live answers ────────────────────
const TOOLS = [
  {
    name: 'lookup_order',
    description: "Look up a customer's order to tell them its current stage and tracking. Use whenever they ask about an order, delivery, dispatch or 'where's my order'. You MUST have their email first, so ask for it if you don't have it. Pass their order reference too if they gave one (it pins a specific order). Never invent a status or tracking number, always use this tool.",
    input_schema: { type: 'object', properties: {
      email: { type: 'string', description: 'the email used at checkout' },
      reference: { type: 'string', description: 'optional order reference if they provided one' },
    }, required: ['email'] },
  },
  {
    name: 'notify_when_back_in_stock',
    description: "Register the customer for a back-in-stock email alert for a product that is currently out of stock. Use only when they ask to be told when something is back. Needs their email and the product slug from the catalogue (for example 'bpc-157').",
    input_schema: { type: 'object', properties: {
      email: { type: 'string' },
      product_slug: { type: 'string', description: "catalogue slug, e.g. 'retatrutide'" },
    }, required: ['email', 'product_slug'] },
  },
];

async function toolLookupOrder(input) {
  const email = String((input && input.email) || '').trim();
  if (!email || !EMAIL_RE.test(email)) return { error: 'need_email', message: 'Ask the customer for the exact email they ordered with.' };
  const reference = String((input && input.reference) || '').trim();
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?customer_email=ilike.${encodeURIComponent(email)}&select=notes,status,tracking_number,items,created_at,dispatched_at&order=created_at.desc&limit=8`, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    if (!Array.isArray(rows) || !rows.length) return { found: false, message: 'No order found under that email. Ask them to double check the email used at checkout, or contact support@veloxpeps.com with their order reference.' };
    let o = rows[0];
    if (reference) {
      const ref = reference.toLowerCase();
      const match = rows.find((x) => String(x.notes || '').toLowerCase().includes(ref));
      if (match) o = match;
    }
    const items = Array.isArray(o.items) ? o.items.map((i) => i && i.name).filter(Boolean).join(', ') : '';
    const dispAge = o.status === 'dispatched' ? daysSince(o.dispatched_at || o.created_at) : null;
    const isOldDispatch = dispAge !== null && dispAge > DISPATCH_TRANSIT_MAX_DAYS;
    const when = fmtDate(o.dispatched_at || o.created_at);
    const stage = isOldDispatch
      ? `Dispatched${when ? ` on ${when}` : ''} (about ${dispAge} days ago), long since delivered. This is an old, completed order, NOT currently in transit, do not imply it is on its way.`
      : (ORDER_STAGE[o.status] || `Status: ${o.status}`);
    const out = { found: true, reference: o.notes || null, status: o.status, stage, items };
    if (o.status === 'dispatched') {
      out.dispatched_on = when;
      out.days_since_dispatch = dispAge;
      out.historical = isOldDispatch;
    }
    // Only surface a live tracking link for genuinely recent dispatches, never for an
    // old order that has long since been delivered.
    if (o.status === 'dispatched' && o.tracking_number && !isOldDispatch) {
      const tn = String(o.tracking_number).replace(/\s+/g, '');
      out.tracking_number = o.tracking_number;
      out.tracking_url = `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(tn)}`;
    }
    return out;
  } catch (e) { return { error: 'lookup_failed', message: 'Could not reach the order system. Ask them to try again shortly or email support@veloxpeps.com.' }; }
}

async function toolRestock(input) {
  const email = String((input && input.email) || '').trim().toLowerCase();
  const slug = String((input && input.product_slug) || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'need_email' };
  if (!/^[a-z0-9-]+$/.test(slug)) return { error: 'bad_slug' };
  try {
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/interest_registrations?on_conflict=product_slug,email`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ product_slug: slug, email, source: 'chat' }),
    });
    if (ins.ok || ins.status === 409) return { ok: true, message: `Registered ${email} for a back-in-stock alert on ${slug}.` };
    return { error: 'save_failed' };
  } catch (e) { return { error: 'save_failed' }; }
}

async function runTool(name, input) {
  if (name === 'lookup_order') return toolLookupOrder(input || {});
  if (name === 'notify_when_back_in_stock') return toolRestock(input || {});
  return { error: 'unknown_tool' };
}

// Resolve an [[ADD:slug]] / [[ADD:slug:size]] tag into a real add-to-cart action
// with a SERVER-VERIFIED price (so the model can never set the price).
async function resolveAddAction(slug, sizeWanted) {
  if (!VALID_PRODUCT_SLUGS.has(slug) || !SUPABASE_URL || !SERVICE) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/product_variants?slug=eq.${encodeURIComponent(slug)}&select=name,size,base_price,sale_price,in_stock,stock_qty`, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    const inStock = (Array.isArray(rows) ? rows : []).filter((v) => v.in_stock !== false && (v.stock_qty == null || Number(v.stock_qty) > 0));
    if (!inStock.length) return null;
    const isPack = (v) => /10-?pack/i.test(`${v.size || ''} ${v.name || ''}`);
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
    let pick = sizeWanted ? inStock.find((v) => norm(v.size) === norm(sizeWanted)) : null;
    if (!pick) pick = inStock.find((v) => !isPack(v)) || inStock[0];   // default to a single vial
    const price = pick.sale_price != null ? Number(pick.sale_price) : Number(pick.base_price);
    if (!Number.isFinite(price)) return null;
    const name = String(pick.name || slug).replace(/\s*[—–-]\s*10-?pack.*$/i, '').trim();
    return { type: 'add_to_cart', slug, name, url: `/compounds/${slug}/`, size: pick.size || 'default', price };
  } catch (e) { return null; }
}

// Resolve the model's [[OFFER]] / [[HUMAN]] / [[ADD]] tags into real, server-controlled actions.
async function finaliseReply(reply, body, messages) {
  let out = reply.replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/ ,/g, ',').replace(/,\s*,/g, ',');
  const sid = body && body.sid, page = body && body.page;
  // ── Discount offer (reliable) ───────────────────────────────────────────
  // Attach the code whenever we have an email AND an offer is in play — either
  // the model tagged [[OFFER]] this turn, or the discount was already raised and
  // the customer has now shared their email. No longer depends on the model
  // re-emitting the tag, so "here's my email" always yields a visible code.
  const offerTagged = out.includes('[[OFFER]]');
  out = out.replace(/\[\[OFFER\]\]/g, '').trim();
  const offerEmail = emailFrom(body, messages);
  const alreadyIssued = offerAlreadyIssued(messages) || /VELOX-[A-Z0-9]{6}/.test(out);
  const offerInPlay = messages.some((m) => m.role === 'assistant' && /(15%|discount|lock in|off your first|first[- ]order)/i.test(m.content || ''));
  if (!alreadyIssued && offerEmail && (offerTagged || offerInPlay)) {
    const code = await mintChatCode(offerEmail);
    if (code) {
      out += `\n\nHere's your code: ${code} (${CHAT_DISCOUNT_PCT}% off your first order, valid ${CODE_TTL_HOURS}h, one use). It auto-applies at checkout.`;
      logEvent(sid, 'chat_offer_issued', page, { email: offerEmail, pct: CHAT_DISCOUNT_PCT });
    }
  } else if (!alreadyIssued && !offerEmail && offerTagged && !/email/i.test(out)) {
    out += `\n\nShare your email and I'll lock in ${CHAT_DISCOUNT_PCT}% off (valid ${CODE_TTL_HOURS}h).`;
  }
  if (out.includes('[[HUMAN]]')) {
    out = out.replace(/\[\[HUMAN\]\]/g, '').trim();
    const lastQ = ((messages[messages.length - 1] && messages[messages.length - 1].content) || '').slice(0, 300);
    const who = emailFrom(body, messages);
    const transcript = messages.slice(-10).map((m) => `${m.role === 'user' ? 'Customer' : 'Matt'}: ${String(m.content || '').slice(0, 400)}`).join('\n');
    try {
      await proposeAction({
        agent: 'chat-assistant', type: 'briefing',
        title: `Live chat needs you${who ? ` — ${who}` : ''}`,
        summary: `${who ? who + ' — ' : ''}${lastQ}`,
        payload: {
          page, sid, email: who || null,
          question: lastQ,
          reply_to: who ? `mailto:${who}?subject=${encodeURIComponent('Your Velox Peptides enquiry')}` : null,
          transcript,
          last: messages.slice(-6),
        },
        dedupeKey: `chat:${sid || Date.now()}`, notify: true,
      });
    } catch (e) { /* ignore */ }
    // Learn-from-chats: log a gap so we can see what Matt couldn't resolve.
    logEvent(sid, 'chat_gap', page, { reason: 'human_handoff', email: who || null, q: lastQ });
  }

  // ── Add-to-cart actions ([[ADD:slug]] or [[ADD:slug:size]]) ───────────────
  const actions = [];
  const addRe = /\[\[ADD:([a-z0-9-]+)(?::([^\]]+))?\]\]/gi;
  const seen = new Set();
  let am;
  while ((am = addRe.exec(out)) && actions.length < 3) {
    const key = am[1].toLowerCase() + '|' + (am[2] || '').trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const a = await resolveAddAction(am[1].toLowerCase(), (am[2] || '').trim());
    if (a) { actions.push(a); logEvent(sid, 'chat_add_to_cart', page, { slug: a.slug, size: a.size }); }
  }
  out = out.replace(/\[\[ADD:[^\]]*\]\]/gi, '').trim();

  return { reply: out, actions };
}

// Product slugs that have a real /compounds/<slug>/ page. Only these may be
// linked, so the bot can never invent a dead URL.
const VALID_PRODUCT_SLUGS = new Set([
  'bpc-157', 'bpc157-tb500-mix', 'cjc-1295', 'dihexa', 'dsip', 'ghk-cu',
  'glutathione', 'ipamorelin', 'kpv', 'mots-c', 'nad-plus', 'retatrutide',
  'selank', 'semax', 'tb-500', 'tesamorelin',
]);

// Build a compact, linkable catalogue line per compound that has a live page.
// NOTE: no price here on purpose — the LIVE STOCK & PRICES block is the single
// source of pricing truth. The static peptide-data price drifts from the real
// variant prices (e.g. Selank was showing £34.99 here vs £32 live), which made
// the bot quote stale numbers. Names + blurbs + links only.
function catalogueText() {
  const lines = [];
  for (const p of PEPTIDES) {
    if (!p || !p.buy || !VALID_PRODUCT_SLUGS.has(p.buy)) continue;
    const blurb = (p.blurb || '').replace(/\s+/g, ' ').trim();
    lines.push(`- ${p.name}${p.aka ? ` (${p.aka})` : ''}: ${blurb} [/compounds/${p.buy}/]`);
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

# EXPLAIN IT SIMPLY (important)
- Whenever you explain something, what a compound is, how it works, a mechanism, or any science or technical term, pitch it so a 10 year old could follow it: short everyday words, a simple real-world analogy, and a quick plain-English meaning for any jargon the first time you use it.
- Keep it natural and warm, never babyish or patronising. You are making it clear, not talking down to them.
- This never overrides the compliance rules: still describe only what the research has studied, in research / in vitro framing, and never give human-use, dosing or health claims.

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
- Trust / "is it legit": everything is independently tested by Janoshik Analytical, HPLC for purity with mass-spec to confirm identity. That is the whole point of what we do. You can browse the test results in our CoA Library at /about/coa-library/.
- Price / "expensive": the price reflects the testing and purity. Value improves with the volume tiers, spend £75/£150/£200/£250 for 5/10/15/20% off, and 10-packs give 10/17.5/25/30% off (2/3/4/5 packs). Free UK shipping over £100, free worldwide shipping over £150. There's also Velox Pro (£6.99/mo) for 10% off everything plus free Tracked 24 on every order, /pro/.
- Hesitation / "I'll think about it": no pressure. Mention a real person answers support, and the handbook is there free whenever they want it.

# TESTING & CoA RULE (say this right, it matters)
- The ONE true line on testing: everything is Janoshik tested. Janoshik Analytical run HPLC for purity and mass-spec to confirm identity. Lead with this whenever trust, quality, purity or testing comes up.
- The CoA Library at /about/coa-library/ is a resource people can VIEW. Point them there to see results.
- NEVER say or imply a CoA is sent, posted, emailed, printed, included or shipped WITH an order or batch. We do not send CoAs out with orders. If asked "do you send a CoA with my order", say no, but everything is Janoshik tested and the results are viewable in the CoA Library.
- Never promise a "batch-specific" certificate to a customer. Just: it's Janoshik tested, results are in the CoA Library.

# KEY FACTS
- Everything is Janoshik tested (HPLC purity + mass-spec identity). Results viewable in the CoA Library at /about/coa-library/. (Do NOT claim CoAs are sent with orders.)
- UK dispatch, Royal Mail Tracked 24, free UK shipping over £100. Worldwide shipping to 60+ countries via Royal Mail International Tracked, priced in GBP by zone, free over £150.
- UK pays by Pay by Bank (secure bank transfer, ~30s, no card stored) or manual UK bank transfer. International orders pay by manual bank transfer in GBP (IBAN/BIC provided at checkout). Other methods on request.
- Tools: Design Lab (/design-lab/), Comparison tool (/tools/compare/), Protocol Scheduler (/tools/scheduler/), Reconstitution Calculator (/tools/reconstitution-calculator/).
- Guides hub: /guides/. FAQ: /faq/. Full catalogue: /compounds/.
- Velox Pro membership: /pro/ — £6.99/mo, 10% off everything + free Tracked 24.

# ORDER STATUS, "where is my order?"
- If a CUSTOMER CONTEXT block appears later in this prompt, answer from it. Give the plain stage in a sentence (awaiting payment, paid and being prepared, dispatched, or cancelled). If it is a RECENT dispatch, give the tracking number and share the Royal Mail tracking link so they can see the exact live status themselves.
- NEVER imply an old order is currently in transit. Only say an order is "dispatched and on its way", or share a live tracking link, when the context/lookup shows it is a recent dispatch. If it is flagged as an old, long-since-delivered order (historical), say so plainly, do not present it as moving, and do not share the live tracking link as if the parcel is still on its way.
- Do NOT volunteer a previous order's status unprompted, especially when the customer is asking about a different or new order. Only discuss a past order if they specifically ask about it. If they say an old order never arrived, point them to support@veloxpeps.com with the order reference.
- If there is NO customer context (you don't know who they are), ask for the email they ordered with, and their order reference if they have it. Then you can help. Never guess or invent a status, a tracking number, or a delivery date.
- If no order is found, ask them to double check the email used at checkout, and offer support@veloxpeps.com with their order reference.
- We do not have a live tracking feed inside this chat. For the exact parcel status, the customer taps the Royal Mail link. That is normal and fine.

# SHIPPING & DELIVERY (facts, quote these, never invent)
- We now ship WORLDWIDE to 60+ countries, all dispatched from the UK. Every price is in GBP (£), there is no euro or dollar pricing.
- Dispatch: within 24 hours of cleared payment, Monday to Friday, excluding UK public holidays. Weekend or holiday orders go the next working day.
- UK: Royal Mail Tracked 24, £3.80 flat, free over £100. Normally 1 to 2 working days after dispatch. The tracking number is emailed at dispatch.
- International: Royal Mail International Tracked, priced by zone, all in GBP. Europe £9.99 (3 to 6 working days). North America £12.99 (5 to 8 working days). Rest of world, including New Zealand, Latin America and Africa £13.99 (7 to 14 working days). Free international shipping over £150.
- International customers are responsible for their own local import rules. Velox is not liable for customs duties or border delays.
- We can't ship everywhere. A handful of regions are excluded because of strict customs enforcement and a high parcel-seizure risk: Southeast Asia, the Middle East and North Africa, South Asia, Taiwan and Australia. New Zealand is fine. If someone is in an excluded region, be honest that we can't ship there right now. The country dropdown at checkout only lists the countries we actually ship to, so if it's not there, we can't send it.
- Not arrived: UK, if it's been more than 10 working days since the dispatch email; international, more than 21 working days. Ask them to email support@veloxpeps.com with their order reference and tracking number and we will investigate with Royal Mail.

# RETURNS & REFUNDS (facts)
- Not yet dispatched: we can cancel and fully refund. They email support@veloxpeps.com with the order reference asap. Refunds go by UK bank transfer to the account that paid, within 3 working days of cancellation confirmation.
- Once dispatched, research compounds are non returnable, for handling, storage condition and chain of custody reasons (we cannot verify storage or safely restock).
- We refund or replace if: a vial arrived damaged or leaking (photograph the packaging and vial on arrival and email support), the wrong compound or size was sent, or the product fails its batch HPLC purity spec on reputable third party testing.
- Refunds are by UK bank transfer to the originating account. No cash refunds, no store credit.

# PAYMENT
- UK: Pay by Bank, open banking via Fena, they approve it in their own banking app in about 30 seconds, no card details are stored. Manual UK bank transfer is available as a fallback.
- International: manual bank transfer in GBP. We show the bank details (IBAN and BIC) at checkout and the order is reserved, then dispatched once the transfer clears. Everything is charged in GBP (£), there is no card or euro payment.
- Crypto payment is planned but not live yet. If asked, say it's coming soon but for now it's bank transfer.

# TOOLS YOU CAN USE (call them, never guess)
- lookup_order: for any "where's my order / order status / tracking" question. You must have their email first (ask for it if you don't). Pass their order reference too if they gave one. Tell them the stage in plain words, and if it is dispatched, share the Royal Mail tracking link the tool returns so they see the exact live status. Never invent a status, tracking number or date.
- notify_when_back_in_stock: when a customer wants to be told when an out-of-stock product is back, take their email and call this with the product slug, then warmly confirm they are on the list.

# WIDER KNOWLEDGE (facts)
- Velox Pro (/pro/): £6.99/month or £59.99/year. Gives 10% off every order, free UK Royal Mail Tracked 24 on every order, double loyalty points, and unlimited use of the AI Design Lab. Worth it for anyone ordering regularly.
- Volume discounts, automatic at checkout: spend £75/£150/£200/£250 for 5/10/15/20% off. 10-packs give 10/17.5/25/30% off (the 2/3/4/5 pack tiers).
- Loyalty: customers earn points on orders, viewable in their account at /account/. Pro members earn double.
- Design Lab (/design-lab/): a free AI tool that helps researchers design a research stack. Point unsure researchers here.
- Subscribe and save: handled via Velox Pro (/pro/) for the recurring discount. Point them there.
- FAQ (/faq/) and Guides (/guides/) cover most general questions, link them when relevant.

# SUPPORT PLAYS (pick the right one, stay brief and human)
- Order problems: if a parcel hasn't arrived or arrived damaged, get their order reference and email, and for damage ask them to photograph the packaging and the vial. Then use [[HUMAN]] so the team can sort it, and say they'll hear back from support@veloxpeps.com.
- Upset or complaint: if someone is clearly frustrated or complaining, don't get defensive or keep selling. Acknowledge it plainly and escalate quickly with [[HUMAN]].
- Choosing a compound: if they're unsure what they need, ask ONE clarifying question about their research area first, then recommend and link the best fit (the [comparison tool](/tools/compare/) or [Design Lab](/design-lab/) can help).
- Save them money (only when it genuinely helps): if their basket or planned spend is near a discount tier, or they say they order regularly, point out the real saving, the volume tier, a 10-pack, or [Velox Pro](/pro/). Real figures only.
- Wholesale or bulk: if they want a large quantity, custom synthesis, or a trade account, capture what they need (compound, quantity, timeframe) and use [[HUMAN]] so the team can quote them.

# LINK RULES
Only link to URLs that appear in this prompt (the product list below, the category/tool/info pages named above). When you link a page, ALWAYS write it as a markdown link with a short readable name, like [BPC-157](/compounds/bpc-157/) or [reconstitution calculator](/tools/reconstitution-calculator/). Never show a bare path or raw URL as the visible text. Never write a link as [/compounds/glutathione/] or a bare /path/ on its own. It MUST be [Readable Name](/path/). NEVER invent a URL. If unsure, link to [our compounds](/compounds/) or the [FAQ](/faq/).

# PRICING (strict — get this exactly right, wrong prices lose trust)
- Quote prices ONLY from the LIVE STOCK & PRICES block below (it's appended at the end of this prompt). Never quote a price from anywhere else, never quote from memory.
- NEVER calculate, multiply, estimate, round or "work out" a price. A 10-pack has its OWN listed price. It is NOT ten times the single, NOT the single price, NOT a guess. Read the exact figure off the list.
- If someone asks the price of a pack size that isn't listed, don't invent it, point them to the product page.
- If the live block isn't there for some reason, don't quote any number, send them to the product page or /compounds/.

# CATALOGUE (only these product pages exist — link only these; prices are in the LIVE STOCK block, NOT here)
${catalogueText()}

# CONVERTING — assertive but honest (this section OVERRIDES any 'soft'/'never pushy' guidance above)
- You are a confident closer. Answer the question brilliantly, then drive toward the order with momentum: recommend the specific compound, link its page, and ask for the close ("want me to get that ready for you?"). Carry the conversation forward — don't just answer and stop.
- Handle objections head-on with the facts above. Don't fold at the first "I'll think about it" — surface the real hesitation (price? trust? unsure which compound?) and resolve it.
- ABSOLUTE HONESTY (UK law): NEVER invent urgency, scarcity, stock counts, deadlines, star-ratings, reviews or testimonials. State only facts present in this prompt. Real, system-issued offers below are the only "limited" thing you may push.
- THE CLOSE OFFER: when a researcher shows clear buying intent OR hesitates on price, you may offer a one-time 15% first-order discount in exchange for their email. To trigger it, put the tag [[OFFER]] on its own line at the very end of your message — the system swaps it for a real single-use code. Use it only ONCE per conversation and only when it will genuinely tip them over. If you don't have their email yet, ask for it in the message ("drop your email and I'll lock in 15% off").
- ADD TO BASKET (you CAN do this, use it): you ARE able to add items straight to the visitor's basket. When they want to add, buy, or reorder something, do it: put [[ADD:slug]] on its own line at the very end (or [[ADD:slug:size]] for a specific size, e.g. [[ADD:retatrutide:10mg]]). The system turns the tag into a one-tap Add button with the correct live price. NEVER say you can't access their basket, and NEVER tell them to go add it themselves, you add it for them. Never quote or set a price inside the tag itself. Use catalogue slugs only, only when they actually want it, at most two per message. Still ask for the close in words too.
- HUMAN HANDOFF: if they ask for a person, raise a complaint, or you truly can't help, hand off to the team. First make sure you have their email so the team can reply, if you don't have it, ask for it in the same message. Then put [[HUMAN]] on its own line at the end, and tell them the team will email them back (at their email if you have it, otherwise via support@veloxpeps.com).

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

  // Lightweight feedback ping from the widget (👍/👎 on a reply). Logged, then done.
  if (body.feedback === 'up' || body.feedback === 'down') {
    logEvent(body.sid, 'chat_feedback', body.page, { value: body.feedback });
    return res.status(200).json({ ok: true });
  }

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
  // Live data: stock/prices, the visitor's basket, and (if known) their order context.
  try { const ls = await liveStockBlock(); if (ls) system += ls; } catch (e) { /* ignore */ }
  try { const cb = cartBlock(body.cart); if (cb) system += cb; } catch (e) { /* ignore */ }
  try { const db = await dealBlock(); if (db) system += db; } catch (e) { /* ignore */ }
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

  const callAnthropic = (convo, withTools) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ model: MODEL, max_tokens: 400, system, messages: convo }, withTools ? { tools: TOOLS } : {})),
  }).then((r) => r.json()).catch(() => null);

  try {
    const convo = messages.slice();   // [{role, content:string}] — user-first
    let reply = '';
    // Bounded tool-use loop: the model may call lookup_order / restock, we run
    // it, hand back the result, and let it compose the final reply.
    for (let round = 0; round < 4; round++) {
      const d = await callAnthropic(convo, true);
      if (!d || !Array.isArray(d.content)) { console.error('[chat] bad response', d && d.error ? d.error : ''); break; }
      if (d.stop_reason === 'tool_use') {
        convo.push({ role: 'assistant', content: d.content });
        const results = [];
        for (const block of d.content) {
          if (block && block.type === 'tool_use') {
            let result; try { result = await runTool(block.name, block.input || {}); } catch (e) { result = { error: 'tool_failed' }; }
            results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result).slice(0, 2000) });
          }
        }
        if (!results.length) { reply = textOf(d.content); break; }
        convo.push({ role: 'user', content: results });
        continue;
      }
      reply = textOf(d.content);
      break;
    }
    // Fallback: a plain no-tool attempt so a tool hiccup never kills the reply.
    if (!reply) {
      const d2 = await callAnthropic(messages, false);
      reply = textOf(d2 && d2.content);
    }
    if (!reply) { console.error('[chat] empty reply'); return res.status(502).json({ error: 'No reply' }); }
    const fin = await finaliseReply(reply, body, messages);
    await saveTranscript(body, messages, fin.reply);
    return res.status(200).json({ reply: fin.reply, actions: fin.actions });
  } catch (e) {
    console.error('[chat] error', e.message);
    return res.status(500).json({ error: 'Assistant error' });
  }
};
