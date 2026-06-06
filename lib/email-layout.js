/**
 * lib/email-layout.js — the ONE shared Velox email shell.
 *
 * Every marketing/notification flow (welcome, abandoned, back-in-stock, reorder,
 * review, campaigns, interest) renders through renderEmail() so they all share
 * the same dark house style AND the same dark-mode handling. Any new flow should
 * use this too — do not hand-roll a new <html> shell.
 *
 * Dark-mode safety: the <head> declares color-scheme: dark and every surface uses
 * an explicit dark colour, so iOS Mail / Gmail dark mode renders it dark instead
 * of inverting it to light.
 *
 * renderEmail({ kicker, heading, bodyHtml, cta, footnote, unsubscribeUrl, preheader })
 *   kicker         — small pill text above the heading (e.g. "Back in stock")
 *   heading        — the H1
 *   bodyHtml       — main content (raw HTML; use emailParagraph/emailCodeBox/emailItemList)
 *   cta            — { href, label } optional primary button
 *   footnote       — optional small print shown above the legal footer
 *   unsubscribeUrl — per-recipient unsubscribe link (required for marketing)
 *   preheader      — optional hidden inbox-preview text
 */

const LOGO = 'https://veloxpeps.com/assets/images/veloxpeps2.png';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const C = {
  body:  'margin:0;padding:0;background:#030407;font-family:Arial,Helvetica,sans-serif',
  wrap:  'background:#030407',
  td:    'padding:32px 16px',
  card:  'max-width:600px;width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden',
  bar:   'background:#01D3A0;height:4px;font-size:0;line-height:0',
  text:  '#9CA3AF',
};

// ── Body content helpers (use inside bodyHtml) ───────────────────────────────
function emailParagraph(html) {
  return `<p style="margin:0 0 16px;font-size:15px;color:#9CA3AF;line-height:1.7">${html}</p>`;
}
function emailButton(href, label) {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px"><tr>
    <td align="center" bgcolor="#01D3A0" style="background:#01D3A0;border-radius:4px">
      <a href="${esc(href)}" style="display:inline-block;padding:15px 38px;font-size:15px;font-weight:700;color:#030407;text-decoration:none;letter-spacing:.06em;font-family:Arial,Helvetica,sans-serif">${esc(label)}</a>
    </td></tr></table>`;
}
function emailCodeBox(code, caption) {
  return `<div style="background:#030407;border:1px solid rgba(1,211,160,.35);border-radius:10px;padding:18px 20px;text-align:center;margin:6px 0 16px">
    <div style="font-size:11px;color:#6B7280;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">Your code</div>
    <div style="font-family:'Courier New',monospace;font-size:26px;font-weight:700;color:#01D3A0;letter-spacing:.08em">${esc(code)}</div>
    ${caption ? `<div style="font-size:12px;color:#888;margin-top:10px;line-height:1.6">${caption}</div>` : ''}
  </div>`;
}
function emailItemList(label, rowsHtml) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#030407;border:1px solid #1a1a1a;border-radius:6px;overflow:hidden;margin:0 0 18px">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="font-size:10px;font-weight:700;color:#01D3A0;letter-spacing:.12em;text-transform:uppercase;font-family:monospace">${esc(label)}</span></td></tr>
    <tr><td style="padding:10px 18px"><table width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}</table></td></tr>
  </table>`;
}

// ── The shell ────────────────────────────────────────────────────────────────
function renderEmail(o) {
  const cta = o.cta && o.cta.href
    ? `<tr><td align="center" style="padding:4px 40px 20px">${emailButton(o.cta.href, o.cta.label)}</td></tr>` : '';
  const footnote = o.footnote
    ? `<tr><td style="padding:0 40px 18px"><p style="margin:0;font-size:13px;color:#888;line-height:1.7">${o.footnote}</p></td></tr>` : '';
  const preheader = o.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#030407">${esc(o.preheader)}</div>` : '';
  const unsub = o.unsubscribeUrl
    ? `<a href="${esc(o.unsubscribeUrl)}" style="color:#555;text-decoration:underline">Unsubscribe</a> &nbsp;&middot;&nbsp; ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(o.heading || 'Velox Peptides')}</title><style>:root{color-scheme:dark;supported-color-schemes:dark}</style></head>
<body style="${C.body}">${preheader}
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${C.wrap}">
<tr><td align="center" style="${C.td}">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="${C.card}">

  <tr><td style="${C.bar}">&nbsp;</td></tr>

  <tr><td align="center" style="padding:32px 40px 18px">
    <img src="${LOGO}" alt="Velox Peptides" width="160" style="max-width:160px;height:auto;display:block;border:0">
  </td></tr>

  ${o.kicker ? `<tr><td align="center" style="padding:0 40px 12px">
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="background:rgba(1,211,160,.1);border:1px solid rgba(1,211,160,.25);border-radius:20px;padding:5px 16px">
        <p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0">${esc(o.kicker)}</p>
      </td></tr></table>
  </td></tr>` : ''}

  ${o.heading ? `<tr><td align="center" style="padding:0 40px 8px">
    <h1 style="margin:0;font-size:25px;font-weight:700;color:#ffffff">${esc(o.heading)}</h1>
  </td></tr>` : ''}

  <tr><td style="padding:14px 40px 4px">${o.bodyHtml || ''}</td></tr>

  ${cta}
  ${footnote}

  <tr><td style="padding:0 40px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #1a1a1a;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>

  <tr><td align="center" style="padding:18px 40px 8px">
    <p style="margin:0;font-size:12px;color:#666;line-height:1.7">
      For research use only. Not for human or veterinary consumption.<br>
      Velox Peptides is a trading name of CRP Labs Ltd (NI738125).
    </p>
  </td></tr>

  <tr><td align="center" style="padding:0 40px 30px">
    <p style="margin:0;font-size:11px;color:#555;line-height:1.6">
      ${unsub}<a href="https://veloxpeps.com" style="color:#555;text-decoration:underline">veloxpeps.com</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

module.exports = { renderEmail, emailParagraph, emailButton, emailCodeBox, emailItemList, esc };
