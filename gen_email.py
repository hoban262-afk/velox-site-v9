import base64, os

logo_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         'output', 'assets', 'images', 'veloxpeps2.png')
with open(logo_path, 'rb') as f:
    logo_b64 = base64.b64encode(f.read()).decode()

logo_data_uri = 'data:image/png;base64,' + logo_b64

# ── helpers ────────────────────────────────────────────────────────────────

CUSTOMER_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order Confirmed &mdash; ${d.order_number}</title>
</head>
<body style="margin:0;padding:0;background-color:#030407;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#030407;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;background-color:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;">

        <!-- 4px teal accent bar -->
        <tr><td style="background-color:#01D3A0;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Logo -->
        <tr>
          <td align="center" style="padding:32px 40px 24px;">
            <img src="LOGO_PLACEHOLDER" alt="Velox Peptides"
                 width="160" style="max-width:160px;height:auto;display:block;border:0;">
          </td>
        </tr>

        <!-- Heading -->
        <tr>
          <td align="center" style="padding:0 40px 8px;">
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">
              Order Confirmed
            </h1>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 40px 28px;">
            <p style="margin:0;font-size:15px;color:#888888;line-height:1.6;">
              Thank you for your order, ${d.customer_name}.<br>
              We&rsquo;ll dispatch within 48 hours of payment.
            </p>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid #1a1a1a;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- Order summary card -->
        <tr>
          <td style="padding:24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:#030407;border:1px solid #1a1a1a;border-radius:6px;overflow:hidden;">
              <tr>
                <td style="padding:12px 20px;border-bottom:1px solid #1a1a1a;">
                  <span style="font-size:10px;font-weight:700;color:#01D3A0;letter-spacing:0.12em;
                               text-transform:uppercase;font-family:monospace;">
                    YOUR ORDER &mdash; ${d.order_number}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${itemsHtml}
                    <tr>
                      <td colspan="2" style="border-top:1px solid #1a1a1a;padding-top:14px;
                                             font-size:0;line-height:0;">&nbsp;</td>
                    </tr>
                    <tr>
                      <td style="font-size:15px;font-weight:700;color:#ffffff;padding-top:4px;">Total</td>
                      <td align="right" style="font-size:18px;font-weight:700;color:#ffffff;
                                               padding-top:4px;">&pound;${d.order_total}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Compliance box -->
        <tr>
          <td style="padding:0 40px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:#1a0f00;border:1px solid #ff9900;border-radius:6px;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:12px;color:#ff9900;line-height:1.6;font-weight:600;">
                    &#9888;&nbsp; This order is for in vitro research use only.
                    Not for human or veterinary consumption.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- What's next -->
        <tr>
          <td style="padding:0 40px 28px;">
            <p style="margin:0 0 16px;font-size:10px;font-weight:700;color:#01D3A0;
                      letter-spacing:0.12em;text-transform:uppercase;font-family:monospace;">
              WHAT HAPPENS NEXT
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="32" valign="top" style="padding-top:1px;">
                  <span style="display:inline-block;width:22px;height:22px;background-color:#01D3A0;
                               color:#000000;font-size:10px;font-weight:700;text-align:center;
                               line-height:22px;border-radius:50%;">1</span>
                </td>
                <td style="padding-bottom:14px;">
                  <p style="margin:0;font-size:14px;color:#ffffff;font-weight:600;">Order received</p>
                  <p style="margin:3px 0 0;font-size:12px;color:#888888;line-height:1.5;">
                    We&rsquo;ve received your order and it&rsquo;s being prepared.
                  </p>
                </td>
              </tr>
              <tr>
                <td width="32" valign="top" style="padding-top:1px;">
                  <span style="display:inline-block;width:22px;height:22px;background-color:#01D3A0;
                               color:#000000;font-size:10px;font-weight:700;text-align:center;
                               line-height:22px;border-radius:50%;">2</span>
                </td>
                <td style="padding-bottom:14px;">
                  <p style="margin:0;font-size:14px;color:#ffffff;font-weight:600;">
                    Dispatched within 48 hrs
                  </p>
                  <p style="margin:3px 0 0;font-size:12px;color:#888888;line-height:1.5;">
                    Sent via Royal Mail Tracked 48 once payment clears.
                  </p>
                </td>
              </tr>
              <tr>
                <td width="32" valign="top" style="padding-top:1px;">
                  <span style="display:inline-block;width:22px;height:22px;background-color:#01D3A0;
                               color:#000000;font-size:10px;font-weight:700;text-align:center;
                               line-height:22px;border-radius:50%;">3</span>
                </td>
                <td>
                  <p style="margin:0;font-size:14px;color:#ffffff;font-weight:600;">
                    Tracking sent when available
                  </p>
                  <p style="margin:3px 0 0;font-size:12px;color:#888888;line-height:1.5;">
                    You&rsquo;ll receive your Royal Mail tracking number by email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid #1a1a1a;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:20px 40px 32px;">
            <p style="margin:0 0 6px;font-size:13px;">
              <a href="https://veloxpeps.com"
                 style="color:#01D3A0;text-decoration:none;font-weight:600;">veloxpeps.com</a>
            </p>
            <p style="margin:0;font-size:11px;color:#888888;line-height:1.5;">
              For research use only. Not for human consumption.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>"""

ADMIN_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Order ${d.order_number}</title></head>
<body style="margin:0;padding:0;background-color:#030407;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#030407;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;background-color:#0d0d0d;
                    border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:#01D3A0;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:28px 40px 16px;">
            <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#ffffff;">
              New Order &mdash; ${d.order_number}
            </h1>
            <p style="margin:0;font-size:10px;color:#01D3A0;font-family:monospace;
                      letter-spacing:0.1em;text-transform:uppercase;">Admin Notification</p>
          </td>
        </tr>
        <!-- Customer block -->
        <tr>
          <td style="padding:0 40px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:#030407;border:1px solid #1a1a1a;border-radius:6px;overflow:hidden;">
              <tr>
                <td style="padding:10px 18px;border-bottom:1px solid #1a1a1a;">
                  <span style="font-size:10px;font-weight:700;color:#01D3A0;letter-spacing:0.12em;
                               text-transform:uppercase;font-family:monospace;">Customer</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0 0 6px;font-size:13px;color:#ffffff;">
                    <strong style="color:#888888;">Name:</strong>&nbsp; ${d.customer_name}
                  </p>
                  <p style="margin:0;font-size:13px;color:#ffffff;">
                    <strong style="color:#888888;">Email:</strong>&nbsp; ${d.customer_email}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Items block -->
        <tr>
          <td style="padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:#030407;border:1px solid #1a1a1a;border-radius:6px;overflow:hidden;">
              <tr>
                <td style="padding:10px 18px;border-bottom:1px solid #1a1a1a;">
                  <span style="font-size:10px;font-weight:700;color:#01D3A0;letter-spacing:0.12em;
                               text-transform:uppercase;font-family:monospace;">Order Items</span>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 18px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${itemsHtml}
                    <tr>
                      <td colspan="2" style="border-top:1px solid #1a1a1a;padding-top:14px;
                                             font-size:0;line-height:0;">&nbsp;</td>
                    </tr>
                    <tr>
                      <td style="font-size:15px;font-weight:700;color:#ffffff;padding-top:4px;">Total</td>
                      <td align="right" style="font-size:18px;font-weight:700;color:#ffffff;
                                               padding-top:4px;">&pound;${d.order_total}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""

# ── Embed logo data URI ─────────────────────────────────────────────────────
CUSTOMER_HTML = CUSTOMER_HTML.replace('LOGO_PLACEHOLDER', logo_data_uri)

# ── Build JS file ───────────────────────────────────────────────────────────
# Escape backticks and ${} that are literal HTML (not JS template expressions)
# The HTML templates use ${d.xxx} and ${itemsHtml} as real JS template slots —
# those must stay. Everything else is plain HTML with no $ signs, so no escaping needed.

js_lines = [
    "const { Resend } = require('resend');",
    "",
    "function buildCustomerHtml(d, itemsHtml) {",
    "  return `" + CUSTOMER_HTML.replace('\\', '\\\\').replace('`', '\\`') + "`;",
    "}",
    "",
    "function buildAdminHtml(d, itemsHtml) {",
    "  return `" + ADMIN_HTML.replace('\\', '\\\\').replace('`', '\\`') + "`;",
    "}",
    "",
    "module.exports = async function handler(req, res) {",
    "  if (req.method !== 'POST') return res.status(405).end();",
    "",
    "  const resend = new Resend(process.env.RESEND_API_KEY);",
    "  const d = req.body;",
    "",
    "  // Build two-column item rows (name left, price right)",
    "  const itemsHtml = (d.order_items || '')",
    "    .split('\\n')",
    "    .filter(l => l.trim())",
    "    .map(l => {",
    "      const match = l.match(/^(.+?)\\s+[\\xA3](\\S+)$/);",
    "      if (match) {",
    "        return `<tr>` +",
    "          `<td style=\"font-size:13px;color:#ffffff;padding:5px 0;\">${match[1].trim()}</td>` +",
    "          `<td align=\"right\" style=\"font-size:13px;color:#888888;padding:5px 0;white-space:nowrap;\">&pound;${match[2]}</td>` +",
    "          `</tr>`;",
    "      }",
    "      return `<tr><td colspan=\"2\" style=\"font-size:13px;color:#ffffff;padding:5px 0;\">${l}</td></tr>`;",
    "    })",
    "    .join('');",
    "",
    "  try {",
    "    // Admin notification",
    "    await resend.emails.send({",
    "      from: 'Velox Peptides <orders@veloxpeps.com>',",
    "      to: 'veloxpeps@gmail.com',",
    "      subject: `New Order ${d.order_number} — £${d.order_total}`,",
    "      html: buildAdminHtml(d, itemsHtml)",
    "    });",
    "",
    "    // Customer confirmation",
    "    await resend.emails.send({",
    "      from: 'Velox Peptides <orders@veloxpeps.com>',",
    "      to: d.customer_email,",
    "      subject: `Order Confirmed — ${d.order_number}`,",
    "      html: buildCustomerHtml(d, itemsHtml)",
    "    });",
    "",
    "    res.status(200).json({ ok: true });",
    "  } catch (e) {",
    "    res.status(500).json({ error: e.message });",
    "  }",
    "};",
    "",
]

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'api', 'send-order.js')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(js_lines))

size_kb = os.path.getsize(out_path) / 1024
print(f'Written: {out_path}')
print(f'File size: {size_kb:.1f} KB')
print('Done.')
