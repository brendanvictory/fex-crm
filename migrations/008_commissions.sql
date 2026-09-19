-- Phase — commissions by carrier. Run once in Supabase (safe to re-run).

-- Carriers, with the agency's total street comp % (of annual premium).
create table if not exists carriers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  agency_pct numeric(6,2) not null default 0,   -- total % the agency is contracted at
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_carriers_org on carriers(org_id);

-- Each person's comp level (% of annual premium) for a carrier.
-- Agent rows = the agent's cut; manager rows = their override on downline sales.
create table if not exists commission_rates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  carrier_id uuid not null references carriers(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  pct        numeric(6,2) not null default 0,
  unique (carrier_id, user_id)
);
create index if not exists idx_comm_rates_org on commission_rates(org_id);

-- Extend policies (already exists) for the sale record used by commissions.
alter table policies add column if not exists carrier_id uuid references carriers(id) on delete set null;
alter table policies add column if not exists annual_premium numeric(12,2);
alter table policies add column if not exists sold_at timestamptz;

-- commissions table already exists; add a "kind" and allow a house row (no user).
alter table commissions add column if not exists kind text;   -- 'agent' | 'manager' | 'house'
alter table commissions alter column role drop not null;
alter table commissions alter column user_id drop not null;

alter table carriers enable row level security;
alter table commission_rates enable row level security;
-- Managed through the server (service role), scoped in code — no client policies.
