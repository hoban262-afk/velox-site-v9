# Velox Peptides — Features

Companion to `ACCOUNTS.md` (accounts + loyalty). This documents the newsletter
popup + welcome-code system. Stack: Vercel static + serverless functions +
Supabase + Resend. MHRA-compliant copy throughout (research-use only, no
therapeutic claims).

---

## Newsletter popup + 20%-off welcome codes

### Flow
1. A first-time visitor sees a popup **10s after landing** (once per session).
2. They enter their email → `POST /api/newsletter/signup`.
3. The server issues a **unique one-time code** `VELOX-XXXXXX`, stores it
   (30-day expiry), and emails it via Resend. The popup confirms (code hint only).
4. At checkout, entering a `VELOX-` code is **validated server-side**
   (`/api/newsletter/validate`) — exists, not expired, not used, email matches —
   and applies **20% off** the subtotal.
5. The code is **marked used only when the order is completed** (status → paid),
   via the order status trigger on `orders.welcome_code`. Cancelling/refunding
   restores it.

### Why server-side?
The existing promo codes (`VELOX10`, etc.) are a **client-side** list in
`output/assets/js/discount-codes.js`. One-time-per-email codes can't be enforced
in the browser, so welcome codes live in Supabase and are validated by a
serverless function. Both systems coexist in the checkout discount box.

### Popup behaviour (`output/assets/js/newsletter-popup.js`, self-contained)
- Suppressed on `/checkout`, `/account`, `/admin`; if `?code=` is in the URL;
  if `sessionStorage.velox_popup_seen`; or if `localStorage.velox_subscribed`.
- States: default, loading (spinner), success (code hint), already-subscribed, error.
- Dismiss via ×, click-outside, or ESC — sets the session flag so it won't re-fire.
- Loaded site-wide (script tag injected into all pages except checkout/account/admin).

### Endpoints (`/api/newsletter/`)
| Endpoint | Purpose |
|---|---|
| `POST /signup` | Issue/return code, store, email. IP rate-limited (20 new signups/IP/hour). Idempotent per email (returns existing code, no re-send). |
| `POST /validate` | Checkout validation → `{ valid, type:'percentage', value:20 }`. |
| `GET /unsubscribe?token=…` | HMAC-token unsubscribe (token signed with the service-role key). |

### Storage — `newsletter_codes` (Supabase)
`id, email (unique), code (unique), issued_at, expires_at (issue + 30d),
used_at, order_id, unsubscribed_at, ip`. RLS: no anon/authenticated access — all
operations go through service-role functions. Signups are also added to the
existing `subscribers` table (`source = 'popup'`).
`orders.welcome_code` records which code an order used (drives mark-used on completion).

### Welcome email (Resend)
From `Velox Peptides <orders@veloxpeps.com>`, subject *"Your 20% off code is
inside — Velox Peptides"*. Dark-brand HTML, monospace teal code block, "Shop now"
CTA, 30-day expiry notice, MHRA footer + unsubscribe link. No image dependencies.

### Env vars
**No new env vars.** Reuses `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY` (see `.env.example`). The unsubscribe token HMAC is keyed off
the service-role key.

### Follow-ups
- Optional admin "Newsletter" tab to browse issued codes (signups already appear
  under the admin **Subscribers** tab).
- Fena path: welcome-code validation is wired to the bank-transfer checkout (the
  active method), like loyalty redemption.
