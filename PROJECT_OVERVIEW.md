# Coverwise CRM — Project Overview & Build Log

A custom CRM for **Coverwise** (gocoverwise.com), a final-expense life-insurance
**telesales** agency. This document is the map of the system: how it's built,
how to deploy it, every database migration in order, and what each feature does.
If you ever need to rebuild context or hand this to a developer, start here.

_Last updated: 2026-10-13_

---

## 1. Where everything lives (your backups)

The system exists in three independent places — any one of them is a backup of its part:

- **Code** → your GitHub repository (the source of truth for the app).
- **Running app** → Render (one web service: Node/Express API that also serves the built React app). Live at **crm.gocoverwise.com**.
- **Data** → Supabase (Postgres database + Auth + Storage). Your leads, calls, policies, users, and all records live here.

Nothing important lives only in the Claude chat. The chat is where we designed and built it; the artifacts above are the system.

---

## 2. Stack

- **Frontend:** React (Vite build), React Router v6, Recharts for charts. Single-page app.
- **Backend:** Node/Express (ESM). Serves the `/api/*` routes and the built React app from one Render web service.
- **Database/Auth:** Supabase — Postgres with Row-Level Security (RLS), Supabase Auth (email/password), Storage.
- **Telephony:** Twilio Voice SDK (browser softphone), TwiML app for outbound, per-number webhooks for inbound, call recording.
- **Email:** Google Workspace SMTP (via nodemailer) for app email; Supabase custom SMTP for password-reset emails.
- **Brand:** navy `#000077`, light blue `#98DCF5`, Inter font.

### Deploy flow (no terminal required)
1. Replace your local repo folder's contents with the latest code.
2. Commit + push in **GitHub Desktop**.
3. Render auto-deploys the pushed commit (build command: `npm install && npm run build`; start: `npm start`).
4. If a drop includes a migration, run its SQL in the **Supabase SQL editor** — **before** deploying when the migration adds columns the new code reads.

Keep **Auto-Deploy = Yes** and the **Branch** matching what GitHub Desktop pushes (usually `main`) in Render → Settings → Build & Deploy.

---

## 3. Environment variables (set in Render)

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (build-time, inlined into the React app)
- `PUBLIC_BASE_URL` (e.g. https://crm.gocoverwise.com — used to build Twilio callback URLs and email links)
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, `TWILIO_CALLER_ID`
- System email (Google Workspace app password): `SMTP_HOST` (smtp.gmail.com), `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`

A template of these lives in `server/.env.example`.

---

## 4. Database setup & migrations (run in order, in Supabase SQL editor)

Start a fresh database with **`schema.sql`** (core tables: organizations, users, lead_sources, leads, calls, callbacks, policies, commissions, activity_log, config/lookup tables, the RLS hierarchy, and helper functions `app_user_role()`, `app_user_org()`, `can_see_lead()`, `can_manage_lead()`).

Then apply migrations in numeric order. Each is safe to re-run.

| File | What it adds |
|---|---|
| `002_scheduling.sql` | Scheduling / calendar + callback queue tables |
| `003_phone_numbers.sql` | Twilio numbers for local-presence caller ID |
| `004_voicemails.sql` | Voicemail inbox |
| `005_agent_greeting.sql` | Agent-recorded voicemail greetings |
| `006_dialer.sql` | Power dialer: named dial lists, scripts, lead locking |
| `007_lead_activity.sql` | Lead activity/timeline + worked-flag support |
| `008_commissions.sql` | Carriers, per-user commission rates, policies, commissions (agent/manager/house, chargebacks) |
| `009_knowledge_base.sql` | Knowledge base + onboarding tables |
| `010_kb_seed.sql` | Starter KB articles + onboarding checklist content |
| `011_partner_portal.sql` | Vendor login role, `users.source_id`, lead-post log, returns ledger |
| `012_default_posting_spec.sql` | Sets the lead-posting API spec as the default for every source |
| `013_rebuttals.sql` | Rebuttals table (shown on the dialer) + starter rebuttals |
| `014_call_origin.sql` | `calls.origin` tag (power_dialer / manual / lead) |
| `015_disposition_contact.sql` | `call_dispositions.is_contact` (claim-on-contact for fresh-lead dialing) |

**Also configured outside the repo:** Supabase Auth → custom SMTP (same Google Workspace credentials) so password-reset emails deliver from your domain. Twilio: a TwiML App (outbound) and each number's inbound webhook pointing at `https://crm.gocoverwise.com/api/voice/...`.

---

## 5. Feature inventory

### Leads
- **Ingest API** (`POST /api/ingest`, public, per-source API key) for real-time vendor lead posting; field aliasing, dedupe by phone then email, auto-assignment, timezone derivation. Rejects leads with no phone or email (logged).
- **Bulk CSV upload** with list naming + source attribution.
- **Lead record** as tabs: Info, Sales, Follow-ups/Notes, Activity. Managers/admins can "Return to vendor" (credit) from the Info tab.
- **Manage lists / revert upload**: delete all leads in a list (sold leads always protected).

### Dialer & calling
- **Softphone** (click-to-dial, keypad, manual dial, caller-ID picker, local-presence by state, mute, DTMF, recording + disclosure). Twilio token auto-refreshes (survives idle tabs).
- **Power Dialer**: pick a list, script auto-fills with lead data, rebuttals accordion beside the script, dispositions, lead locking. Disposition popup has **Call again** (redial same lead) and **Save & next call**. **View lead** opens an in-dialer modal (keeps the session). **Fresh unclaimed (newest-first)** mode + Queue launcher for real-time vendor leads; a lead is claimed to the agent only when they log a **contact** disposition.
- Compliance: DNC hard-block, 8am–9pm calling window in the lead's timezone.
- **Inbound** routing to the owning agent, voicemail capture, agent greetings.

### Pipeline & scheduling
- **My Queue** kanban (due callbacks, owned leads, unclaimed pool). Drag to change status / claim.
- **Schedule** / callbacks with reminders.

### Sales, policies, commissions
- Record a sale → creates policy + computes agent/manager/house commissions (% of annual premium). Chargebacks reverse commissions on lapse/NSF/cancel.
- **Policies** management, **Commissions** config (per carrier, per user), **Revenue** report.

### Reporting & insights
- **Reports**: leads by source/status/agent, contact rate, daily trend.
- **Agent Activity**: dials, connects, connect rate, talk time, avg call, active time, dials/hour, best-hours + day-of-week; filter by call origin (power dialer / manual / lead).
- **Revenue**: premium, house profit, agent comp, manager overrides, by source/agent/day.
- All three (plus the Partner view) support **Today / Yesterday / 7 / 30 / 90 day** ranges.

### Partner (vendor) portal
- Vendor logins see only their own source's stats — volume/acceptance, contact rate, dispositions, speed-to-contact, sales/close rate, rejected/duplicate posts (masked), returns/credits, posting health + API key + spec. Managed in Admin → Partners.

### Users, support, settings
- 4-tier hierarchy (super_admin / admin / manager / agent) via RLS. State licenses + carrier appointments per agent. Password reset (self-serve, admin, change-own).
- **Knowledge Base** + **Getting Started** onboarding checklist (role-aware, admin-editable).
- **Scripts & Rebuttals**, **Sources** (per-source API keys + posting spec), **Settings** (statuses, dispositions incl. "contact?" flag, phone numbers, system-email test, voicemail greeting).

---

## 6. Recovering / rebuilding

- **Lost the local folder?** Clone the GitHub repo — it's the full app.
- **Need a fresh environment?** New Supabase project → run `schema.sql` then migrations 002–015 in order → set the env vars above in a new Render web service pointed at the repo → reconfigure Twilio webhooks + Supabase custom SMTP.
- **Data export:** Supabase → Table editor / SQL (`copy ... to` or the dashboard export) backs up the actual records. Consider enabling Supabase's scheduled backups (Project Settings → Database) for automatic daily snapshots.

---

## 7. Parked / future

- Google service account (domain-wide delegation): two-way calendar sync + rep-as-themselves email logged to the lead timeline.
- Automations (rules engine): status-change triggers, auto follow-ups, drips, reminders.
- fextoolkit quoting (needs ITK base URL + API key).
- Optional: true dialer session tracking (login-to-logout seated time + utilization).
