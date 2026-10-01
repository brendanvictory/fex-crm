-- Mark which call dispositions count as "contact made" (reached a live person).
-- Used by the fresh-unclaimed dialer: an unclaimed lead is claimed by the agent
-- only once they log a contact disposition — no-answers/voicemails stay in the pool.
-- Run once in Supabase (safe to re-run).

set search_path = public;

alter table call_dispositions add column if not exists is_contact boolean not null default false;

-- Sensible defaults for the seeded dispositions (edit any time in Settings).
update call_dispositions set is_contact = true
  where is_contact = false and name in ('Callback Scheduled', 'Not Interested');
