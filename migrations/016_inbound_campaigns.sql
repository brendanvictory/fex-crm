-- Phase — Inbound pay-per-call campaigns. Run once in Supabase (safe to re-run).
-- Ping/post + direct campaigns, per-call billing with buffer, caps, and the
-- inbound call log. Agent presence lives on the users table.
-- All access is via the server (service role); no client RLS policies.

set search_path = public;

-- Campaigns: a buy from a vendor (lead_source) for inbound calls.
create table if not exists campaigns (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  source_id      uuid references lead_sources(id) on delete set null, -- the vendor
  name           text not null,
  type           text not null default 'ping',      -- 'ping' | 'direct'
  cost_per_call  numeric(10,2) not null default 0,   -- paid per BILLABLE call
  buffer_seconds int not null default 90,            -- talk time to become billable
  daily_cap      numeric(12,2),                      -- max spend/day (null = none)
  monthly_cap    numeric(12,2),                      -- max spend/month (null = none)
  concurrency_cap int,                               -- max simultaneous live calls (null = none)
  dupe_window_hours int not null default 72,         -- reject same caller within N hours
  states         text[] not null default '{}',       -- allowed caller states ([] = any licensed)
  phone_number   text,                               -- the campaign's Twilio DID (E.164)
  ping_key       text unique,                        -- API key vendors use to ping
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists idx_campaigns_org on campaigns(org_id);
create index if not exists idx_campaigns_number on campaigns(phone_number);

-- Every inbound call attempt (pinged or direct), its routing outcome, and billing.
create table if not exists inbound_calls (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  campaign_id   uuid references campaigns(id) on delete set null,
  source_id     uuid references lead_sources(id) on delete set null,
  twilio_sid    text,
  from_number   text,
  caller_state  char(2),
  caller_zip    text,
  vendor_call_id text,
  status        text not null default 'pinged',
     -- pinged | rejected | accepted | ringing | answered | voicemail | abandoned | completed
  reject_reason text,          -- cap | state | no_agent | duplicate | inactive | bad_request
  agent_id      uuid references users(id) on delete set null,
  lead_id       uuid references leads(id) on delete set null,
  ping_at       timestamptz,
  started_at    timestamptz,   -- call arrived on our number
  answered_at   timestamptz,   -- an agent bridged
  ended_at      timestamptz,
  talk_seconds  int,
  billable      boolean not null default false,
  billable_at   timestamptz,
  cost          numeric(10,2) not null default 0,
  is_duplicate  boolean not null default false,
  recording_url text,
  disputed      boolean not null default false,
  dispute_reason text,
  dispute_status text,          -- open | credited | rejected
  created_at    timestamptz not null default now()
);
create index if not exists idx_inbound_campaign on inbound_calls(campaign_id);
create index if not exists idx_inbound_source on inbound_calls(source_id);
create index if not exists idx_inbound_created on inbound_calls(created_at);
create index if not exists idx_inbound_from on inbound_calls(from_number);
create index if not exists idx_inbound_status on inbound_calls(status);

-- Agent presence for inbound routing.
alter table users add column if not exists inbound_status text not null default 'away'; -- available|away|on_call|wrap
alter table users add column if not exists inbound_status_at timestamptz;
alter table users add column if not exists last_seen_at timestamptz;

alter table campaigns     enable row level security;
alter table inbound_calls enable row level security;
-- Managed via the server (service role), scoped in code — no client policies.
