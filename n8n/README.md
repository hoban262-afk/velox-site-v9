# Velox × n8n — watch your agents run

This folder lets you **visualise the agents you already have**. Nothing about how Velox works
changes: the real engine stays on Vercel + Supabase. n8n just becomes a control room — it
triggers each agent on a schedule (or on a button press), then reads back what the agent
dropped into your `agent_actions` inbox, so you can literally watch a run light up node by node.

```
[ Schedule / "Run now" ] -> [ HTTP POST to veloxpeps.com/api/agents/... ] -> [ read agent_actions ] -> [ formatted view ]
```

---

## Part 1 — Get n8n running on Railway (your hands-on bit)

You'll do these steps yourself (teach-as-you-go). It takes ~10 minutes.

1. **Create the project**
   - Go to https://railway.app → log in with GitHub.
   - **New Project → Deploy a template →** search **"n8n"** → pick the official n8n template.
     (If it asks, choose the variant with **PostgreSQL** attached — n8n needs a database to
     store your workflows. The template wires it up for you.)

2. **Set the required environment variables** (Railway → your n8n service → **Variables**):

   | Variable | Value | Why |
   |---|---|---|
   | `N8N_HOST` | the Railway domain it gives you, e.g. `velox-n8n.up.railway.app` | so n8n knows its own URL |
   | `N8N_PROTOCOL` | `https` | Railway serves HTTPS |
   | `N8N_PORT` | `5678` | n8n's default port |
   | `WEBHOOK_URL` | `https://<your N8N_HOST>/` | needed if you ever use webhook triggers |
   | `N8N_ENCRYPTION_KEY` | a long random string (generate one, keep it safe) | encrypts your stored credentials |
   | `GENERIC_TIMEZONE` | `Europe/London` | so "07:00" means UK time |

   > The PostgreSQL `DATABASE_*` / `DB_*` variables are filled in automatically by the template —
   > leave them alone.

3. **Open n8n** — Railway shows a public URL for the service. Click it, create your owner login.
   You're in.

4. **Generate a public domain** if Railway didn't already: service → **Settings → Networking →
   Generate Domain**. Put that domain into `N8N_HOST` / `WEBHOOK_URL` above and redeploy.

---

## Part 2 — Add the two credentials (once)

These hold your secrets **inside n8n**, so they never live in the workflow files. I do **not**
have these values and never embed them — you paste them here once.

### A. "Velox CRON_SECRET" (Header Auth)
This is how n8n proves to your agents that it's allowed to trigger them.
- In n8n: **Credentials → New → Header Auth**.
- **Name:** `Velox CRON_SECRET`
- **Header Name:** `Authorization`
- **Header Value:** `Bearer YOUR_CRON_SECRET`  ← same `CRON_SECRET` you set in Vercel.
- Save.

### B. "Velox Supabase service-role" (Supabase API)
This lets the read-back node see what the agent produced.
- In n8n: **Credentials → New → Supabase API**.
- **Name:** `Velox Supabase service-role`
- **Host:** `https://stkjdtyhaxejxqmbzyua.supabase.co`
- **Service Role Secret:** your Supabase **service_role** key (Supabase → Project Settings →
  API → service_role). This is read-only inside n8n and stays encrypted.
- Save.

> Security note: the service-role key bypasses RLS, so it lives **only** here in n8n's encrypted
> store — never in the JSON, never in client code.

---

## Part 3 — Import a workflow

1. In n8n: **top-right menu (⋯) → Import from File** (or **Workflows → Import**).
2. Pick a file from `n8n/workflows/` — start with **`01-daily-briefing.json`**.
3. Open it. Each HTTP/Supabase node already points at the two credentials by name — if n8n
   shows "credential not found", just click the node and select the matching credential you made
   in Part 2.
4. Hit **"Run now (watch it)"** (the manual trigger). Watch the nodes turn green left-to-right:
   it calls the live agent, then pulls the rows that agent just created.
5. When you're happy, toggle the workflow **Active** (top-right). The schedule trigger now runs
   it automatically — the same times your Vercel crons use.

---

## Important: don't double-run

Right now Vercel's cron jobs already trigger these agents. If you also activate the n8n schedule,
the agent fires **twice**. Two safe ways to handle it:

- **Recommended while you're just watching:** keep n8n workflows **inactive** and only use the
  **"Run now"** button when you want to see one work. Vercel keeps doing the real scheduled runs.
- **When you want n8n to own the schedule:** disable that agent's cron in `vercel.json` (remove
  its entry), redeploy, *then* activate the n8n workflow. One trigger source at a time.

---

## The workflows

| File | Agent it drives | Natural schedule |
|---|---|---|
| `01-daily-briefing.json` | `/api/agents/daily-briefing` | every day 07:00 |
| `02-reorder-check.json` | `/api/agents/reorder-check` | every day 09:00 |
| `03-weekly-finance.json` | `/api/agents/weekly-finance` | Mondays 09:00 |
| `04-health-monitor.json` | `/api/agents/health-monitor` | every 15 min |
| `05-anomaly-watch.json` | `/api/agents/anomaly-watch` | every day 10:00 |
| `06-compliance-audit.json` | `/api/agents/compliance-audit` | Sundays 07:00 |
| `07-content-draft.json` | `/api/agents/content-draft` | 1st of month 08:00 |
| `08-backup-run.json` | `/api/agents/backup-run` | Mondays 05:00 |
| `09-support-autoreply.json` | `/api/agents/support-autoreply` | every 10 min |
| `10-run-approved.json` | `/api/agents/run-approved` | every 10 min |

All ten follow the exact same shape, so once you understand `01` you understand all of them.
