-- Phase 3 — power dialer: named dial lists, scripts, and lead locking.
-- Run once in the Supabase SQL editor (safe to re-run).

create table if not exists lead_lists (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_lists_org on lead_lists(org_id);

alter table leads add column if not exists list_id uuid references lead_lists(id) on delete set null;
alter table leads add column if not exists locked_by uuid references users(id) on delete set null;
alter table leads add column if not exists locked_at timestamptz;
alter table leads add column if not exists last_dialed_at timestamptz;
create index if not exists idx_leads_list on leads(list_id);
create index if not exists idx_leads_dial on leads(org_id, list_id, last_dialed_at);

create table if not exists scripts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  body       text not null default '',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_scripts_org on scripts(org_id);

alter table lead_lists enable row level security;
alter table scripts enable row level security;
-- Read/write for the app go through the server (service role), scoped in code,
-- so no client policies are needed (RLS on = deny by default to anon/user keys).
