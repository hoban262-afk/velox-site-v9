/**
 * lib/llm.js — tiny Anthropic helper for the marketing agents.
 * Mirrors the call already used by api/admin/insights-run.js.
 * Requires ANTHROPIC_API_KEY (already set — the weekly insights digest uses it).
 */
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MARKETING_MODEL || 'claude-haiku-4-5-20251001';

function configured() { return !!ANTHROPIC_KEY; }

async function askClaude(system, user, maxTokens = 1200) {
  if (!ANTHROPIC_KEY) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    const d = await r.json().catch(() => null);
    return (d && d.content && d.content[0] && d.content[0].text) || null;
  } catch (e) { console.error('[llm] askClaude', e.message); return null; }
}

// Pull the first {...} JSON object out of a model reply (handles ```json fences).
function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

module.exports = { askClaude, extractJson, configured };
