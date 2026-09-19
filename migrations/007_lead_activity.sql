-- Phase 3 — mark leads as "worked" so the Leads tab shows active leads only,
-- not the raw imported dial pool. Run once in Supabase (safe to re-run).

alter table leads add column if not exists worked boolean not null default false;
alter table leads add column if not exists last_activity_at timestamptz;
create index if not exists idx_leads_worked on leads(org_id, worked, last_activity_at desc);

-- Backfill: any lead that already has a call, a callback, or has moved past the
-- default status counts as worked.
update leads l set worked = true, last_activity_at = coalesce(l.updated_at, l.created_at)
where worked = false and (
  exists (select 1 from calls c where c.lead_id = l.id)
  or exists (select 1 from callbacks cb where cb.lead_id = l.id)
  or (l.status_id is not null and l.status_id <> (select id from lead_statuses where is_default = true limit 1))
);
