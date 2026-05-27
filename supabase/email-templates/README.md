# Supabase Auth emails — setup

Password reset, signup confirmation, and email-change emails are sent by
**Supabase Auth** (not our code). Out of the box they use Supabase's default
sender + generic branding + a ~3–4/hour rate limit. Do the 3 steps below to make
them production-ready: branded, from veloxpeps.com, and unthrottled.

Dashboard: https://supabase.com/dashboard/project/stkjdtyhaxejxqmbzyua

---

## 1. Send Auth emails through Resend (custom SMTP)

Removes the rate limit and sends from your domain.

**a. Get a Resend SMTP password** (your existing Resend account):
- Resend → API Keys → use your existing key, OR create one for SMTP.
- Resend SMTP settings are: host `smtp.resend.com`, port `465`, username `resend`,
  password = your **Resend API key**.

**b. In Supabase** → **Authentication → Emails → SMTP Settings** → enable
**Custom SMTP** and enter:

| Field | Value |
|-------|-------|
| Sender email | `orders@veloxpeps.com` (or `noreply@veloxpeps.com`) |
| Sender name | `Velox Peptides` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | *(your Resend API key)* |

(The sending domain must be verified in Resend — `veloxpeps.com` already is, since order emails work.)

---

## 2. URL configuration (so reset/confirm links return to the site)

**Authentication → URL Configuration:**
- **Site URL:** `https://veloxpeps.com`
- **Redirect URLs:** add `https://veloxpeps.com/**`

Without this, the reset-password link in `/account/` won't land back on the account page.

---

## 3. Paste the branded templates

**Authentication → Email Templates.** For each, set the subject and paste the
matching HTML file from this folder:

| Template in Supabase | File | Subject |
|----------------------|------|---------|
| Confirm signup | `confirm-signup.html` | `Confirm your Velox Peptides account` |
| Reset Password | `reset-password.html` | `Reset your Velox Peptides password` |
| Change Email Address | `change-email.html` | `Confirm your new email — Velox Peptides` |

Each template uses Supabase's `{{ .ConfirmationURL }}` variable for the action link.

---

## Note on "Confirm email"
If **Authentication → Providers → Email → "Confirm email"** is ON, new signups must
click the confirmation link before they can log in (the `/account/` register flow
already handles this — it shows "check your email to confirm"). If you'd rather
let people log in immediately, turn it off — but on is the safer default.
