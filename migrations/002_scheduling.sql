-- Phase 2 — scheduling additions to the callbacks table.
-- Run this once in the Supabase SQL editor (safe to re-run).

alter table callbacks add column if not exists kind text not null default 'callback';        -- 'callback' | 'appointment'
alter table callbacks add column if not exists title text;
alter table callbacks add column if not exists duration_minutes int not null default 30;
alter table callbacks add column if not exists reminder_minutes int not null default 30;
alter table callbacks add column if not exists google_event_id text;   -- set when synced to Google (next drop)
alter table callbacks add column if not exists google_calendar text;   -- which calendar it landed on

create index if not exists idx_callbacks_org_time on callbacks(org_id, scheduled_at);
create index if not exists idx_callbacks_lead on callbacks(lead_id);
