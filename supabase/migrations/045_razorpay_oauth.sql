-- 045_razorpay_oauth.sql
-- Razorpay OAuth (Partner Connect) — per-restaurant payment gateway.
-- Adds:
--   1. site_payment_integrations — encrypted token store per (site, provider)
--   2. oauth_states               — short-lived CSRF nonces for the OAuth flow
--   3. orders.razorpay_*          — link a local order to its Razorpay order/payment
--
-- Tokens are encrypted at rest with pgcrypto's pgp_sym_encrypt using the
-- PAYMENTS_ENC_KEY env var (passed through from the API layer; we never store
-- it in the DB). All writes happen via the service role; reads are tenant-
-- scoped via RLS on the firebase uid claim.

create extension if not exists pgcrypto;

------------------------------------------------------------------------------
-- 1. site_payment_integrations
------------------------------------------------------------------------------
create table if not exists public.site_payment_integrations (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites(id) on delete cascade,
  provider        text not null check (provider in ('razorpay')),
  account_id      text not null,
  access_token    text not null,            -- pgp_sym_encrypt → bytea cast to text (armored)
  refresh_token   text not null,
  public_token    text not null,            -- safe to store in cleartext
  token_type      text not null default 'Bearer',
  scope           text not null,
  mode            text not null check (mode in ('test','live')),
  expires_at      timestamptz not null,
  status          text not null default 'active'
                  check (status in ('active','revoked','expired')),
  connected_by    text not null,            -- firebase uid
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (site_id, provider)
);

create index if not exists site_payment_integrations_account_id_idx
  on public.site_payment_integrations (account_id);

create index if not exists site_payment_integrations_expires_at_idx
  on public.site_payment_integrations (expires_at)
  where status = 'active';

alter table public.site_payment_integrations enable row level security;

-- Reads: only the owning site's admin (matches our sites.user_id = firebase uid
-- pattern, mirroring the policies on site_subscriptions).
drop policy if exists site_payment_integrations_read_own
  on public.site_payment_integrations;
create policy site_payment_integrations_read_own
  on public.site_payment_integrations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.sites s
      where s.id = site_payment_integrations.site_id
        and s.user_id = auth.jwt() ->> 'sub'
    )
  );

-- All writes are service-role only (the role bypasses RLS entirely).
-- Explicitly deny anon writes for defence in depth.
drop policy if exists site_payment_integrations_no_anon_write
  on public.site_payment_integrations;
create policy site_payment_integrations_no_anon_write
  on public.site_payment_integrations
  for all
  to anon
  using (false)
  with check (false);

------------------------------------------------------------------------------
-- 2. oauth_states — short-lived CSRF nonces
------------------------------------------------------------------------------
create table if not exists public.oauth_states (
  state         text primary key,
  site_id       uuid not null references public.sites(id) on delete cascade,
  user_id       text not null,
  provider      text not null check (provider in ('razorpay')),
  redirect_uri  text not null,
  created_at    timestamptz not null default now()
);

create index if not exists oauth_states_created_at_idx
  on public.oauth_states (created_at);

alter table public.oauth_states enable row level security;
-- Service role only — no public read/write.

------------------------------------------------------------------------------
-- 3. orders — link local orders to Razorpay
------------------------------------------------------------------------------
alter table public.orders
  add column if not exists razorpay_order_id   text,
  add column if not exists razorpay_payment_id text,
  add column if not exists payment_status      text;

-- Unique on captured payment id prevents replay; partial index keeps the
-- column nullable for non-online orders.
create unique index if not exists orders_razorpay_payment_id_uniq
  on public.orders (razorpay_payment_id)
  where razorpay_payment_id is not null;

create index if not exists orders_razorpay_order_id_idx
  on public.orders (razorpay_order_id)
  where razorpay_order_id is not null;

------------------------------------------------------------------------------
-- 4. updated_at trigger for site_payment_integrations
------------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists site_payment_integrations_updated_at
  on public.site_payment_integrations;
create trigger site_payment_integrations_updated_at
  before update on public.site_payment_integrations
  for each row execute function public.tg_set_updated_at();
