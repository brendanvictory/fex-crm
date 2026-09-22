-- Phase — Partner (lead-source) portal. Run once in Supabase (safe to re-run).
-- Adds a 'vendor' login type, a per-post ingest log (for volume/acceptance stats),
-- and a returns/credits ledger. All partner reads go through the server
-- (service role), scoped to the vendor's own source — so no client RLS policies.

-- 1) New login type for lead vendors. (ADD VALUE is idempotent and must be
--    committed before it can be used — this migration only adds it.)
alter type user_role add value if not exists 'vendor';

-- 2) Tie a vendor login to the one source it can see.
alter table users add column if not exists source_id uuid references lead_sources(id) on delete set null;
create index if not exists idx_users_source on users(source_id);

-- 3) Optional posting spec text shown to the vendor in their portal.
alter table lead_sources add column if not exists posting_spec text;

-- 4) One row per inbound post attempt — powers volume, acceptance, rejection
--    reasons, speed-to-contact context, and posting health.
create table if not exists lead_posts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  source_id   uuid references lead_sources(id) on delete set null,
  status      text not null,                  -- 'accepted' | 'duplicate' | 'rejected'
  reason      text,                           -- rejection/duplicate reason
  posting_ref text,                           -- the vendor's own id from the payload
  phone_last4 char(4),                        -- masked identifier for the vendor
  state       char(2),
  lead_id     uuid references leads(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_lead_posts_source on lead_posts(source_id);
create index if not exists idx_lead_posts_created on lead_posts(created_at);
create index if not exists idx_lead_posts_status on lead_posts(status);

-- 5) Returns / credits ledger. Internal staff flag a lead returnable; the vendor
--    sees the running credit tally and history.
create table if not exists lead_returns (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  source_id   uuid references lead_sources(id) on delete set null,
  lead_id     uuid references leads(id) on delete set null,
  reason      text not null,
  status      text not null default 'approved', -- 'requested' | 'approved' | 'rejected'
  amount      numeric(10,2),                     -- credit amount (defaults to source cost_per_lead)
  note        text,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists idx_lead_returns_source on lead_returns(source_id);
create index if not exists idx_lead_returns_lead on lead_returns(lead_id);

alter table lead_posts   enable row level security;
alter table lead_returns enable row level security;
-- No client policies: partner reads are served by the API (service role), scoped
-- in code to the caller's source. Internal staff read via the same API.
