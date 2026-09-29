-- Tag each call with where it was placed from, so power-dialer activity can be
-- reported separately from manual dials and lead-page click-to-dial.
-- Run once in Supabase (safe to re-run).

set search_path = public;

alter table calls add column if not exists origin text;
-- Values: 'power_dialer' | 'manual' | 'lead' | 'inbound' (null = legacy/unknown)
create index if not exists idx_calls_origin on calls(origin);
