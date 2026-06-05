-- ============================================================
-- Velox Peptides — Automation Foundation (Phase 0)
-- Shared spine for the agent/automation system:
--   • approval inbox (agent_actions)
--   • products + inventory
--   • order shipping / fulfilment / Xero-sync fields
--   • secure integration-token store (Xero OAuth)
-- Admin policies match the hardened public.is_admin() model (002).
-- ============================================================

-- ── Orders: shipping address, fulfilment + Xero sync fields ──
alter table public.orders add column if not exists ship_name      text;
alter table public.orders add column if not exists ship_line1     text;
alter table public.orders add column if not exists ship_line2     text;
alter table public.orders add column if not exists ship_city      text;
alter table public.orders add column if not exists ship_postcode  text;
alter table public.orders add column if not exists ship_country   text default 'GB';
alter table public.orders add column if not exists ship_phone     text;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists carrier        text;
alter table public.orders add column if not exists dispatched_at  timestamptz;
alter table public.orders add column if not exists xero_invoice_id text;
alter table public.orders add column if not exists xero_synced_at timestamptz;

-- ── Products / inventory ──
create table if not exists public.products (
  id            uuid default gen_random_uuid() primary key,
  created_at    timestamptz default now(),
  sku           text unique not null,
  name          text not null,
  slug          text,
  price         numeric(10,2),
  stock_qty     integer default 0,
  reorder_point integer default 5,
  reorder_qty   integer default 20,
  batch         text,
  expiry        date,
  coa_url       text,
  active        boolean default true
);

create table if not exists public.inventory_movements (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  product_id  uuid references public.products(id),
  delta       integer not null,            -- negative = sale, positive = restock
  reason      text,                        -- sale | restock | adjustment | return
  order_id    uuid references public.orders(id)
);

-- ── Agent action queue (the approval inbox) ──
create table if not exists public.agent_actions (
  id               uuid default gen_random_uuid() primary key,
  created_at       timestamptz default now(),
  agent            text not null,          -- which automation/agent created it
  type             text not null,          -- email_reply | content_draft | reorder | vat_summary | reconciliation | anomaly | shipping
  title            text not null,          -- one-line summary for the inbox list
  summary          text,                   -- short human-readable context
  payload          jsonb not null,         -- the proposed action (email body, draft, numbers...)
  status           text default 'pending', -- pending | approved | sent | dismissed | failed
  related_order_id uuid references public.orders(id),
  reviewed_at      timestamptz,
  reviewed_by      text,
  result           jsonb
);

create index if not exists agent_actions_status_idx on public.agent_actions (status, created_at desc);

-- ── Integration tokens (Xero OAuth refresh token, etc.) ──
-- Highly sensitive: service-role ONLY. Never exposed to anon or authenticated.
create table if not exists public.integration_tokens (
  id            uuid default gen_random_uuid() primary key,
  provider      text unique not null,      -- 'xero'
  access_token  text,
  refresh_token text,
  tenant_id     text,
  expires_at    timestamptz,
  updated_at    timestamptz default now()
);

-- ── Row Level Security ──
alter table public.products            enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.agent_actions       enable row level security;
alter table public.integration_tokens  enable row level security;

-- products: storefront can read active products; admin manages; service writes
create policy "products_read"    on public.products for select to anon, authenticated using (active = true);
create policy "products_admin"   on public.products for all    to authenticated using (public.is_admin());
create policy "products_service" on public.products for all    to service_role  using (true);

-- inventory movements: admin + service only
create policy "inv_admin"   on public.inventory_movements for all to authenticated using (public.is_admin());
create policy "inv_service" on public.inventory_movements for all to service_role  using (true);

-- agent actions: admin reviews; service (agents) writes. No anon access.
create policy "actions_admin"   on public.agent_actions for all to authenticated using (public.is_admin());
create policy "actions_service" on public.agent_actions for all to service_role  using (true);

-- integration tokens: service role only. RLS on + no anon/auth policy = denied.
-- Belt-and-braces: revoke table grants from client roles.
revoke all on public.integration_tokens from anon, authenticated;
create policy "tokens_service" on public.integration_tokens for all to service_role using (true);
