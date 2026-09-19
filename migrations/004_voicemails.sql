-- Phase 3 — voicemail inbox. Run once in the Supabase SQL editor (safe to re-run).

create table if not exists voicemails (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  lead_id       uuid references leads(id) on delete set null,
  agent_id      uuid references users(id) on delete set null,  -- intended recipient (lead owner)
  call_id       uuid references calls(id) on delete set null,
  from_number   text,
  recording_url text,
  duration_seconds int,
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_voicemails_org on voicemails(org_id);
create index if not exists idx_voicemails_agent on voicemails(agent_id);
create index if not exists idx_voicemails_created on voicemails(created_at);

-- RLS on: the app reads/writes voicemails only through the server (service role),
-- which scopes them per user in code, so no client policies are defined.
alter table voicemails enable row level security;
