-- Phase — Inbound Drop 2: pre-underwriting qualification + product-tier links.
-- Run once in Supabase (safe to re-run). Server-managed; no client RLS policies.

set search_path = public;

-- One row per time an agent qualifies a lead (keeps history). answers is the
-- structured pre-underwriting questionnaire; tier is the recommended product.
create table if not exists lead_qualifications (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  lead_id         uuid not null references leads(id) on delete cascade,
  inbound_call_id uuid references inbound_calls(id) on delete set null,
  agent_id        uuid references users(id) on delete set null,
  answers         jsonb not null default '{}'::jsonb,
  tier            text,          -- level | graded | modified | guaranteed
  created_at      timestamptz not null default now()
);
create index if not exists idx_qual_lead on lead_qualifications(lead_id);
create index if not exists idx_qual_org on lead_qualifications(org_id);

-- Editable links behind each product-tier button on the qualification screen.
create table if not exists tier_links (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  tier       text not null,      -- level | graded | modified | guaranteed
  label      text not null,
  url        text,
  sort       int not null default 0,
  unique (org_id, tier)
);

alter table lead_qualifications enable row level security;
alter table tier_links          enable row level security;

-- Seed the four tiers (blank URLs — fill them in Settings) for the org.
do $$
declare org uuid;
begin
  select id into org from organizations order by created_at limit 1;
  if org is null then return; end if;
  insert into tier_links (org_id, tier, label, sort) values
    (org, 'level', 'Level / Preferred', 0),
    (org, 'graded', 'Graded', 1),
    (org, 'modified', 'Modified', 2),
    (org, 'guaranteed', 'Guaranteed Issue', 3)
  on conflict (org_id, tier) do nothing;
end $$;
