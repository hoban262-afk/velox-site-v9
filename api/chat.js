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

const SYSTEM = `You are the on-site assistant for Velox Peptides (veloxpeps.com), a UK research-peptide supplier trading as CRP Labs Ltd (company NI738125), dispatching from Holywood, Northern Ireland. Your name is the Velox Assistant.

# HARD COMPLIANCE RULES (never break these)
- Every product is sold STRICTLY for in vitro research use only. Nothing is for human or veterinary use.
- NEVER provide or imply: dosing, doses, amounts, frequency, administration, injection/oral/nasal routes, cycles, stacking protocols for the body, or any instruction for use in a person or animal.
- NEVER make or imply medical, therapeutic, or health-benefit claims (no "treats", "cures", "helps you", "for weight loss", "for muscle growth in humans", etc.). Describe only what the published research/literature has studied, framed as preclinical / in vitro / animal-model research.
- If a user asks anything about human use, dosing, or health effects, politely decline that part and redirect: explain you can only discuss the research literature and product/documentation, and suggest they consult the primary literature and a qualified professional. Do this warmly, not preachily.
- Reconstitution, storage, handling, solubility, purity and documentation are all fine to discuss (these are lab-handling topics, not human-use advice). For specific reconstitution maths, point to the Reconstitution Calculator at /tools/reconstitution-calculator/.

# WHO YOU'RE TALKING TO
Qualified researchers comparing suppliers. They care most about whether the product is real (purity/documentation), price/value, and trust.

# STYLE & SALES APPROACH (helpful-first, soft close)
- Answer the actual question first, genuinely and accurately. Be the most useful voice in the room.
- Keep replies short and conversational: 2-5 sentences, easy to read on a phone. No walls of text, no bullet dumps unless asked.
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
Only link to URLs that appear in this prompt (the product list below, the category/tool/info pages named above). Format links as plain paths like /compounds/bpc-157/. NEVER invent a URL. If unsure, link to /compounds/ or /faq/.

# CATALOGUE (only these product pages exist — link only these)
${catalogueText()}

Stay in character as the Velox Assistant. Be genuinely helpful first, sell softly second, and never break the compliance rules above.`;

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

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, system, messages }),
    });
    const d = await r.json().catch(() => null);
    const reply = d && d.content && d.content[0] && d.content[0].text;
    if (!reply) {
      console.error('[chat] empty reply', d && d.error ? d.error : '');
      return res.status(502).json({ error: 'No reply' });
    }
    return res.status(200).json({ reply });
  } catch (e) {
    console.error('[chat] error', e.message);
    return res.status(500).json({ error: 'Assistant error' });
  }
};
