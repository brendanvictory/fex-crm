-- Phase — Knowledge base + onboarding. Run once in Supabase (safe to re-run).
-- All rows are org-scoped and managed through the server (service role); the API
-- enforces role/audience visibility in code, so no client RLS policies are added.

-- Article categories (buckets shown in the Help sidebar).
create table if not exists kb_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  slug       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);
create index if not exists idx_kb_cats_org on kb_categories(org_id);

-- Articles. body is Markdown. audience gates who can read it:
--   'all'     — everyone
--   'agent'   — agents and up
--   'manager' — managers and admins only
create table if not exists kb_articles (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  category_id  uuid references kb_categories(id) on delete set null,
  title        text not null,
  slug         text not null,
  body         text not null default '',
  audience     text not null default 'all',   -- 'all' | 'agent' | 'manager'
  sort_order   int  not null default 0,
  is_published boolean not null default true,
  updated_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, slug)
);
create index if not exists idx_kb_articles_org on kb_articles(org_id);
create index if not exists idx_kb_articles_cat on kb_articles(category_id);

-- Onboarding steps a new hire works through. link is optional: an app route
-- (e.g. /settings) or a KB article slug (kb:compliance-basics).
create table if not exists onboarding_tasks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  title       text not null,
  description text not null default '',
  audience    text not null default 'all',   -- 'all' | 'agent' | 'manager'
  link        text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_onb_tasks_org on onboarding_tasks(org_id);

-- Per-user completion of an onboarding task.
create table if not exists onboarding_progress (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  task_id      uuid not null references onboarding_tasks(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (user_id, task_id)
);
create index if not exists idx_onb_prog_user on onboarding_progress(user_id);
create index if not exists idx_onb_prog_org  on onboarding_progress(org_id);

alter table kb_categories       enable row level security;
alter table kb_articles         enable row level security;
alter table onboarding_tasks    enable row level security;
alter table onboarding_progress enable row level security;
-- No client policies: all access is via the server (service role), scoped in code.
