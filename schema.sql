-- ============================================================================
-- Final Expense Telesales CRM — Phase 0 Database Schema (Supabase / Postgres)
-- ============================================================================
-- Run this in the Supabase SQL editor on a fresh project.
-- It creates every core table from the build plan plus Row-Level Security (RLS)
-- that enforces the hierarchy:
--   super_admin  -> sees everything, all orgs
--   admin        -> sees everything in their own org (all managers + agents)
--   manager      -> sees their own agents' leads (+ their own, + the unassigned queue)
--   agent        -> sees only their own leads (+ the unassigned queue)
--
-- Notes:
--  * The lead-ingest API and background jobs should use the Supabase SERVICE ROLE
--    key, which bypasses RLS. RLS below governs what human users see in the app.
--  * Managers are isolated from each other; partners (admins) see all their managers.
--  * Raw bank/card numbers must NOT be stored here in plaintext — see payment_methods.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";        -- case-insensitive email/text

-- ---------------------------------------------------------------------------
-- Enums (fixed sets). Editable sets — statuses, dispositions — are TABLES below.
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('super_admin', 'admin', 'manager', 'agent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type call_direction as enum ('inbound', 'outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type policy_status as enum
    ('pending', 'issued', 'in_force', 'lapsed', 'nsf', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_type as enum
    ('bank_draft_eft', 'direct_express', 'credit_card', 'debit_card');
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- CORE ORG + USER TABLES
-- ===========================================================================

-- Tenants / partner books. A partner (admin) org may have a parent (super-admin
-- level) but in practice each partner is a top-level org.
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  parent_org_id uuid references organizations(id) on delete set null,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- App users. id === auth.users.id (Supabase Auth). This is the profile row.
create table if not exists users (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  role        user_role not null default 'agent',
  manager_id  uuid references users(id) on delete set null,  -- agent -> their manager
  full_name   text,
  email       citext,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_users_org on users(org_id);
create index if not exists idx_users_manager on users(manager_id);

-- States an agent is licensed to sell in.
create table if not exists agent_licenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  state       char(2) not null,
  license_no  text,
  expires_at  date,
  created_at  timestamptz not null default now(),
  unique (user_id, state)
);
create index if not exists idx_licenses_user on agent_licenses(user_id);

-- Carriers an agent is appointed with.
create table if not exists agent_appointments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  carrier     text not null,
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  unique (user_id, carrier)
);
create index if not exists idx_appointments_user on agent_appointments(user_id);

-- ===========================================================================
-- CONFIG / LOOKUP TABLES (editable in-app by admins)
-- ===========================================================================

-- Editable pipeline stages: new, in call queue, contacted/followup, quoted,
-- sold, signed, etc. sort_order controls display; is_active hides retired ones.
create table if not exists lead_statuses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  is_default  boolean not null default false,   -- status new leads land in
  created_at  timestamptz not null default now()
);

-- Editable per-call outcomes: no answer, busy, voicemail, callback, not
-- interested, DNC, wrong number, etc. maps_to_status_id optionally advances
-- the lead's pipeline status when this disposition is logged.
create table if not exists call_dispositions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  maps_to_status_id uuid references lead_statuses(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Where leads come from, with per-source assignment rules and cost tracking.
-- assignment_rule is JSON, e.g. {"strategy":"round_robin","state_license":true}.
create table if not exists lead_sources (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references organizations(id) on delete cascade,
  name          text not null,
  api_key       text unique,                    -- token used to POST leads in
  assignment_rule jsonb not null default '{"strategy":"round_robin","state_license":true}'::jsonb,
  cost_per_lead numeric(10,2),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_sources_org on lead_sources(org_id);

-- ===========================================================================
-- LEADS
-- ===========================================================================
create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  source_id     uuid references lead_sources(id) on delete set null,
  status_id     uuid references lead_statuses(id) on delete set null,
  owner_id      uuid references users(id) on delete set null,  -- assigned agent

  -- Contact
  first_name    text,
  last_name     text,
  phone         text,
  email         citext,
  address1      text,
  address2      text,
  city          text,
  state         char(2),
  zip           text,
  timezone      text,                            -- derived from state/zip for calling windows

  -- Final-expense specific
  dob           date,
  age           int,
  gender        text,                            -- 'Male' / 'Female' (fextoolkit expects these)
  beneficiary_name         text,
  beneficiary_relationship text,
  tobacco       boolean,
  coverage_amount numeric(12,2),

  -- Compliance
  dnc           boolean not null default false,  -- hard-blocks dialer + SMS
  consent_ref   text,                            -- proof-of-consent reference (TCPA trail)
  consent_at    timestamptz,

  -- Dedupe: normalized phone/email; enforce uniqueness per org.
  dedupe_key    text,

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_leads_org on leads(org_id);
create index if not exists idx_leads_owner on leads(owner_id);
create index if not exists idx_leads_source on leads(source_id);
create index if not exists idx_leads_status on leads(status_id);
create index if not exists idx_leads_state on leads(state);
create index if not exists idx_leads_created on leads(created_at);
create unique index if not exists uq_leads_dedupe on leads(org_id, dedupe_key)
  where dedupe_key is not null;

-- ===========================================================================
-- CALLS / CALLBACKS / SMS
-- ===========================================================================
create table if not exists calls (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references leads(id) on delete set null,  -- inbound may not match a lead yet
  agent_id      uuid references users(id) on delete set null,
  org_id        uuid not null references organizations(id) on delete cascade,
  twilio_sid    text,
  direction     call_direction not null,
  disposition_id uuid references call_dispositions(id) on delete set null,
  from_number   text,
  to_number     text,
  recording_url text,
  duration_seconds int,
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_calls_lead on calls(lead_id);
create index if not exists idx_calls_agent on calls(agent_id);
create index if not exists idx_calls_org on calls(org_id);
create index if not exists idx_calls_started on calls(started_at);

create table if not exists callbacks (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  agent_id      uuid references users(id) on delete set null,
  org_id        uuid not null references organizations(id) on delete cascade,
  scheduled_at  timestamptz not null,
  remind_at     timestamptz,
  completed     boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_callbacks_agent on callbacks(agent_id);
create index if not exists idx_callbacks_scheduled on callbacks(scheduled_at);

create table if not exists sms_campaigns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  trigger       text,                            -- e.g. status change, manual, drip step
  template      text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists sms_messages (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references leads(id) on delete set null,
  campaign_id   uuid references sms_campaigns(id) on delete set null,
  org_id        uuid not null references organizations(id) on delete cascade,
  direction     call_direction not null default 'outbound',
  body          text,
  twilio_sid    text,
  opt_out       boolean not null default false,  -- set when lead replies STOP
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_sms_lead on sms_messages(lead_id);

-- ===========================================================================
-- QUOTING / UNDERWRITING (fextoolkit)
-- ===========================================================================
create table if not exists underwriting_sessions (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references leads(id) on delete cascade,
  fex_session_id text,                           -- fextoolkit traversal session_id
  underwriting_items jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_uw_lead on underwriting_sessions(lead_id);

create table if not exists quotes (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references leads(id) on delete cascade,
  org_id          uuid not null references organizations(id) on delete cascade,
  request_payload jsonb,                          -- exact payload sent to /quoter/
  results         jsonb,                          -- full quotes[] snapshot
  selected_company text,
  eapp_link       text,                           -- carrier e-app URL for the chosen quote
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_quotes_lead on quotes(lead_id);

-- ===========================================================================
-- SALE / POLICY / PAYMENT / COMMISSIONS
-- ===========================================================================
create table if not exists policies (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references leads(id) on delete cascade,
  org_id          uuid not null references organizations(id) on delete cascade,
  agent_id        uuid references users(id) on delete set null,
  carrier         text,
  product         text,
  policy_number   text,
  face_amount     numeric(12,2),
  monthly_premium numeric(10,2),
  draft_day       int,                            -- day of month the draft hits
  status          policy_status not null default 'pending',
  issue_date      date,
  effective_date  date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_policies_lead on policies(lead_id);
create index if not exists idx_policies_agent on policies(agent_id);

-- Payment method for the draft. DO NOT store full account/card numbers here.
-- Store only a tokenized reference (Supabase Vault or a payment processor) and
-- the last 4 for display. token_ref points at the secured value.
create table if not exists payment_methods (
  id            uuid primary key default gen_random_uuid(),
  policy_id     uuid not null references policies(id) on delete cascade,
  type          payment_type not null default 'bank_draft_eft',
  token_ref     text,                             -- reference to a vaulted secret
  last4         char(4),
  bank_name     text,
  draft_day     int,
  created_at    timestamptz not null default now()
);
create index if not exists idx_payments_policy on payment_methods(policy_id);

-- Commission per person per policy. One row for the agent, plus override rows
-- up the hierarchy (manager). chargeback flips true if the policy lapses early.
create table if not exists commissions (
  id            uuid primary key default gen_random_uuid(),
  policy_id     uuid not null references policies(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  role          user_role not null,              -- whose cut this is (agent/manager)
  rate          numeric(6,4),                    -- e.g. 0.1000 = 10%
  amount        numeric(12,2),
  chargeback    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_commissions_policy on commissions(policy_id);
create index if not exists idx_commissions_user on commissions(user_id);

-- ===========================================================================
-- ACTIVITY LOG (timeline + compliance/audit record)
-- ===========================================================================
create table if not exists activity_log (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references organizations(id) on delete cascade,
  entity_type   text not null,                   -- 'lead', 'policy', 'call', ...
  entity_id     uuid,
  actor_id      uuid references users(id) on delete set null,
  action        text not null,                   -- 'created', 'status_changed', ...
  detail        jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_activity_entity on activity_log(entity_type, entity_id);
create index if not exists idx_activity_org on activity_log(org_id);

-- ===========================================================================
-- HELPER FUNCTIONS (SECURITY DEFINER — bypass RLS to avoid recursion)
-- ===========================================================================
create or replace function public.app_user_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.app_user_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.users where id = auth.uid()
$$;

-- Can the current user see this lead? Encapsulates the hierarchy rules.
create or replace function public.can_see_lead(_lead_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leads l
    where l.id = _lead_id and (
      public.app_user_role() = 'super_admin'
      or (public.app_user_role() = 'admin'
          and l.org_id = public.app_user_org())
      or (public.app_user_role() = 'manager'
          and l.org_id = public.app_user_org()
          and (l.owner_id = auth.uid()
               or l.owner_id is null                              -- shared queue
               or l.owner_id in (select id from public.users
                                 where manager_id = auth.uid())))
      or (public.app_user_role() = 'agent'
          and l.org_id = public.app_user_org()
          and (l.owner_id = auth.uid() or l.owner_id is null))     -- own + queue
    )
  )
$$;

-- Can the current user manage (edit/assign) this lead? Agents can edit their own.
create or replace function public.can_manage_lead(_lead_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leads l
    where l.id = _lead_id and (
      public.app_user_role() in ('super_admin','admin')
      or (public.app_user_role() = 'manager'
          and l.org_id = public.app_user_org()
          and (l.owner_id = auth.uid()
               or l.owner_id is null
               or l.owner_id in (select id from public.users
                                 where manager_id = auth.uid())))
      or (public.app_user_role() = 'agent'
          and l.org_id = public.app_user_org()
          and l.owner_id = auth.uid())
    )
  )
$$;

-- ===========================================================================
-- ENABLE ROW-LEVEL SECURITY
-- ===========================================================================
alter table organizations       enable row level security;
alter table users               enable row level security;
alter table agent_licenses      enable row level security;
alter table agent_appointments  enable row level security;
alter table lead_statuses       enable row level security;
alter table call_dispositions   enable row level security;
alter table lead_sources        enable row level security;
alter table leads               enable row level security;
alter table calls               enable row level security;
alter table callbacks           enable row level security;
alter table sms_campaigns       enable row level security;
alter table sms_messages        enable row level security;
alter table underwriting_sessions enable row level security;
alter table quotes              enable row level security;
alter table policies            enable row level security;
alter table payment_methods     enable row level security;
alter table commissions         enable row level security;
alter table activity_log        enable row level security;

-- ---------------------------------------------------------------------------
-- POLICIES
-- (SELECT rules shown per table. Writes from the app are scoped; the ingest API
--  and jobs use the service role and bypass all of this.)
-- ---------------------------------------------------------------------------

-- Organizations: super_admin sees all; everyone else sees their own org.
create policy org_select on organizations for select using (
  public.app_user_role() = 'super_admin' or id = public.app_user_org()
);

-- Users: you can always see yourself; super_admin sees all; admin sees their
-- org; manager sees their own agents.
create policy users_select on users for select using (
  id = auth.uid()
  or public.app_user_role() = 'super_admin'
  or (public.app_user_role() = 'admin'  and org_id = public.app_user_org())
  or (public.app_user_role() = 'manager' and manager_id = auth.uid())
);
create policy users_update_self on users for update using (id = auth.uid());
create policy users_admin_write on users for all using (
  public.app_user_role() in ('super_admin','admin')
  and (org_id = public.app_user_org() or public.app_user_role() = 'super_admin')
);

-- Licenses / appointments: visible if you can see the user they belong to.
create policy licenses_select on agent_licenses for select using (
  user_id = auth.uid()
  or public.app_user_role() in ('super_admin','admin')
  or exists (select 1 from users u where u.id = agent_licenses.user_id
             and u.manager_id = auth.uid())
);
create policy appointments_select on agent_appointments for select using (
  user_id = auth.uid()
  or public.app_user_role() in ('super_admin','admin')
  or exists (select 1 from users u where u.id = agent_appointments.user_id
             and u.manager_id = auth.uid())
);

-- Config tables: any authenticated user in the app can read; admins manage.
create policy statuses_select on lead_statuses for select using (auth.uid() is not null);
create policy statuses_write on lead_statuses for all using (
  public.app_user_role() in ('super_admin','admin'));
create policy dispositions_select on call_dispositions for select using (auth.uid() is not null);
create policy dispositions_write on call_dispositions for all using (
  public.app_user_role() in ('super_admin','admin'));

-- Lead sources: org-scoped.
create policy sources_select on lead_sources for select using (
  public.app_user_role() = 'super_admin' or org_id = public.app_user_org());
create policy sources_write on lead_sources for all using (
  public.app_user_role() in ('super_admin','admin') and org_id = public.app_user_org());

-- Leads: the core hierarchy rules.
create policy leads_select on leads for select using (public.can_see_lead(id));
create policy leads_update on leads for update using (public.can_manage_lead(id));
create policy leads_insert on leads for insert with check (
  org_id = public.app_user_org() or public.app_user_role() = 'super_admin');

-- Calls / callbacks / sms: visible if you can see the related lead, or (for
-- inbound calls not yet matched to a lead) if it's in your org.
create policy calls_select on calls for select using (
  (lead_id is not null and public.can_see_lead(lead_id))
  or (lead_id is null and org_id = public.app_user_org())
  or public.app_user_role() = 'super_admin');
create policy calls_insert on calls for insert with check (
  org_id = public.app_user_org() or public.app_user_role() = 'super_admin');

create policy callbacks_select on callbacks for select using (public.can_see_lead(lead_id));
create policy callbacks_write on callbacks for all using (public.can_manage_lead(lead_id));

create policy sms_campaigns_select on sms_campaigns for select using (
  public.app_user_role() = 'super_admin' or org_id = public.app_user_org());
create policy sms_campaigns_write on sms_campaigns for all using (
  public.app_user_role() in ('super_admin','admin') and org_id = public.app_user_org());
create policy sms_messages_select on sms_messages for select using (
  (lead_id is not null and public.can_see_lead(lead_id))
  or org_id = public.app_user_org()
  or public.app_user_role() = 'super_admin');

-- Quotes / underwriting: follow lead visibility.
create policy quotes_select on quotes for select using (public.can_see_lead(lead_id));
create policy quotes_write on quotes for all using (public.can_manage_lead(lead_id));
create policy uw_select on underwriting_sessions for select using (public.can_see_lead(lead_id));
create policy uw_write on underwriting_sessions for all using (public.can_manage_lead(lead_id));

-- Policies: follow lead visibility.
create policy policies_select on policies for select using (public.can_see_lead(lead_id));
create policy policies_write on policies for all using (public.can_manage_lead(lead_id));

-- Payment methods: sensitive. Only super_admin/admin can read; agents cannot.
-- (Agents create the sale but should not be able to export banking PII.)
create policy payments_select on payment_methods for select using (
  public.app_user_role() in ('super_admin','admin'));
create policy payments_insert on payment_methods for insert with check (
  exists (select 1 from policies p where p.id = policy_id
          and public.can_manage_lead(p.lead_id)));

-- Commissions: you see your own; managers see their agents'; admins see the org.
create policy commissions_select on commissions for select using (
  user_id = auth.uid()
  or public.app_user_role() in ('super_admin','admin')
  or exists (select 1 from users u where u.id = commissions.user_id
             and u.manager_id = auth.uid()));
create policy commissions_write on commissions for all using (
  public.app_user_role() in ('super_admin','admin'));

-- Activity log: org-scoped read; inserts from the app are allowed in-org.
create policy activity_select on activity_log for select using (
  public.app_user_role() = 'super_admin' or org_id = public.app_user_org());
create policy activity_insert on activity_log for insert with check (
  org_id = public.app_user_org() or public.app_user_role() = 'super_admin');

-- ===========================================================================
-- SEED: default editable pipeline statuses (from the spec). Edit freely later.
-- ===========================================================================
insert into lead_statuses (name, sort_order, is_default) values
  ('New Lead',            10, true),
  ('In Call Queue',       20, false),
  ('Contacted / Followup',30, false),
  ('Quoted',              40, false),
  ('Sold',                50, false),
  ('Signed',              60, false),
  ('In Force',            70, false)
on conflict do nothing;

insert into call_dispositions (name) values
  ('No Answer'), ('Busy'), ('Voicemail'), ('Callback Scheduled'),
  ('Not Interested'), ('Wrong Number'), ('Do Not Call'), ('Disconnected')
on conflict do nothing;

-- ============================================================================
-- End of Phase 0 schema.
-- ============================================================================
