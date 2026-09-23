-- Rebuttals — a short, editable set of objection/response pairs shown next to
-- the script on the Power Dialer. Managed on the Scripts admin page.
-- Run once in Supabase (safe to re-run). Seeds a starter set if none exist.

create table if not exists rebuttals (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  title      text not null,               -- the objection
  body       text not null default '',    -- the response (supports {{field}} merge)
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_rebuttals_org on rebuttals(org_id);

alter table rebuttals enable row level security;
-- Read/write via the server (service role), scoped in code — no client policies.

do $$
declare org uuid;
begin
  select id into org from organizations order by created_at limit 1;
  if org is null then return; end if;
  if exists (select 1 from rebuttals where org_id = org) then return; end if;

  insert into rebuttals (org_id, title, body, sort_order) values
    (org, 'I need to think about it.',
     'Totally understand — most people do. What specifically is giving you pause: the coverage amount, the monthly price, or the company? Let''s look at just that piece.', 0),
    (org, 'I can''t afford it.',
     'I hear you, budgets are tight — that''s exactly why we start with a number you pick. If we got the monthly to something comfortable, would you want the protection in place? Let''s find that number.', 1),
    (org, 'I need to talk to my spouse / kids.',
     'Makes sense — this protects them, so they should know. Nothing is locked in forever. Let''s get you approved so today''s rate is protected, and you can walk them through it.', 2),
    (org, 'Just send me something in the mail.',
     'I can do that, but the rate depends on a couple of health questions I can only confirm on the phone. Let me lock in your real number now so what you see is accurate.', 3),
    (org, 'Is this a scam?',
     'Fair question — you should be careful. We''re Coverwise, licensed in your state, and this call is recorded for your protection. The policy comes directly from an A-rated carrier, and you''ll get everything in writing before anything is final.', 4),
    (org, 'I already have coverage.',
     'That''s great that you''ve planned ahead. A lot of folks find their older policy hasn''t kept up with today''s funeral costs, which run [amount]. Can I ask what you have in place, so I can make sure there''s no gap?', 5),
    (org, 'Now''s not a good time.',
     'No problem — I''ll be quick. Give me two minutes; if it''s not a fit, no hard feelings. Real fast: is the coverage for just you, or you and a spouse?', 6);

  raise notice 'Seeded starter rebuttals for org %', org;
end $$;
