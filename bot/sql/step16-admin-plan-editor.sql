-- Admin-editable plan/pricing/feature-flag source of truth. Replaces the
-- hardcoded PLAN_CONFIG object as the value both the marketing pricing
-- page and the in-app "All Plans" page actually read for display, and
-- what new Flutterwave checkouts charge — WITHOUT touching what any
-- already-paying subscriber is billed (see subscribed_price_ngn below).

create table if not exists plan_definitions (
  id text primary key, -- 'free' | 'individual' | 'business' | 'business_pro' | 'enterprise' | future custom ids
  label text not null,
  display_label text not null,
  tagline text not null,
  monthly_ngn numeric not null, -- -1 = "Custom" (Enterprise)
  scan_limit integer not null default -1, -- -1 = unlimited
  client_limit integer not null default -1, -- -1 = unlimited, 0 = none
  automated_reminder boolean not null default true,
  staff_limit integer not null default -1, -- -1 = unlimited, 0 = cannot invite any team member
  tax_analysis text not null default 'basic', -- 'inactive' | 'basic' | 'advanced'
  invoice_branding boolean not null default false,
  support_priority boolean not null default false,
  self_serve boolean not null default true,
  most_popular boolean not null default false,
  is_retired boolean not null default false, -- hidden from new signups; existing subscribers unaffected
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger plan_definitions_updated_at
  before update on plan_definitions
  for each row execute function update_updated_at();

-- Seed with the exact current values from web/lib/plans.ts's static
-- PLAN_CONFIG, so nothing changes for anyone the moment this ships.
insert into plan_definitions
  (id, label, display_label, tagline, monthly_ngn, scan_limit, client_limit, automated_reminder, staff_limit, tax_analysis, invoice_branding, support_priority, self_serve, most_popular, sort_order)
values
  ('free', 'Free', 'Free', '14-day trial, no card required', 0, 10, 5, false, 0, 'inactive', false, false, false, false, 0),
  ('individual', 'Individual', 'Individual', 'Track your own money, effortlessly', 2500, -1, 0, true, 0, 'basic', false, false, true, false, 1),
  ('business', 'Business', 'Business (Starter)', 'For solo-run businesses ready to look professional', 5000, -1, -1, true, 0, 'basic', true, false, true, true, 2),
  ('business_pro', 'Business Pro', 'Business (Pro)', 'Add your team and go deeper on tax reporting', 10000, -1, -1, true, -1, 'advanced', true, true, true, false, 3),
  ('enterprise', 'Enterprise', 'Enterprise', 'Everything unlimited, built around your organisation', -1, -1, -1, true, -1, 'advanced', true, true, false, false, 4)
on conflict (id) do nothing;

-- Global billing-cycle discounts (singleton row) — was
-- QUARTERLY_DISCOUNT_PCT / YEARLY_DISCOUNT_PCT constants in lib/plans.ts.
create table if not exists billing_discounts (
  id text primary key default 'global',
  quarterly_discount_pct integer not null default 10,
  yearly_discount_pct integer not null default 20,
  updated_at timestamptz default now()
);

create trigger billing_discounts_updated_at
  before update on billing_discounts
  for each row execute function update_updated_at();

insert into billing_discounts (id, quarterly_discount_pct, yearly_discount_pct)
values ('global', 10, 20)
on conflict (id) do nothing;

-- ── Existing-subscriber price lock ────────────────────────────────────────
-- THE critical safety mechanism for Requirement 3: this is set ONCE, at
-- the moment a subscription actually activates (Flutterwave webhook /
-- verify-redirect), and never recomputed from plan_definitions afterward.
-- Settings -> Subscription's "Current plan" price MUST display this
-- column, never a live join against plan_definitions.monthly_ngn — that
-- join is only for the "All Plans" comparison grid below it, where
-- showing the current/new price for OTHER tiers is correct.
alter table organizations add column if not exists subscribed_price_ngn numeric;
alter table organizations add column if not exists subscribed_cycle text; -- 'monthly' | 'quarterly' | 'yearly'
alter table organizations add column if not exists subscribed_at timestamptz;

-- RLS — pricing pages are public (marketing page has no auth) and the
-- in-app subscription page reads this pre-auth-equivalent too, so plan
-- definitions and discounts are readable by anyone. Only the service-role
-- admin API routes ever write to these tables.
alter table plan_definitions enable row level security;
create policy "Anyone can read plan definitions"
  on plan_definitions for select using (true);

alter table billing_discounts enable row level security;
create policy "Anyone can read billing discounts"
  on billing_discounts for select using (true);
