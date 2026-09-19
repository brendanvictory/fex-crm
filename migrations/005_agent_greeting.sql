-- Phase 3 — per-agent recorded voicemail greeting. Run once in Supabase SQL editor.
alter table users add column if not exists voicemail_greeting_url text;
