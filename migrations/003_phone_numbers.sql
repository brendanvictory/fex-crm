-- Phase 3 — Twilio phone numbers (DIDs) for local-presence caller ID.
-- Run once in the Supabase SQL editor (safe to re-run).

create table if not exists phone_numbers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  number     text not null,               -- E.164, e.g. +15165551234
  state      char(2),                     -- state this DID presents in (null = default)
  label      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_phone_numbers_org on phone_numbers(org_id);

alter table phone_numbers enable row level security;

create policy phone_numbers_select on phone_numbers for select using (
  public.app_user_role() = 'super_admin' or org_id = public.app_user_org());
create policy phone_numbers_write on phone_numbers for all using (
  public.app_user_role() in ('super_admin','admin') and org_id = public.app_user_org());
