# Final Expense CRM

Telesales CRM for final expense insurance. Express API + React (Vite) front end,
backed by Supabase (Postgres + Auth + RLS), deployed on Render.

- `server/` — Express API. Serves the built React app and the `/api/*` routes.
- `client/` — React (Vite) single-page app with Supabase auth wired in.
- `schema.sql` — the database schema (run once in Supabase). *(kept alongside this repo)*

---

## 1. Put this code in a GitHub repo

1. Go to https://github.com/new
2. **Repository name:** `fex-crm` (or whatever you like). Set it **Private**.
   Do **not** check "Add a README" / .gitignore / license — this project already has them.
3. Click **Create repository**. GitHub shows a "push an existing repository" snippet — keep that tab open.
4. On your computer, unzip this project, open a terminal in the `fex-crm` folder, and run:

   ```bash
   git init
   git add .
   git commit -m "Phase 0: schema, API + React scaffold"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/fex-crm.git
   git push -u origin main
   ```

   (Replace the URL with the one GitHub showed you.) Refresh the GitHub page — your files are there.

---

## 2. Get your Supabase keys

In your Supabase project: **Project Settings → API**. You need three values:

- **Project URL** (e.g. `https://abcd1234.supabase.co`)
- **anon public** key
- **service_role** key  ← secret, server-only, never in the browser

Keep these handy for the next step.

---

## 3. Deploy on Render (Blueprint — the easy way)

This repo has a `render.yaml`, so Render can set the service up for you.

1. In Render: **New → Blueprint**.
2. Connect your GitHub and pick the `fex-crm` repo. Render reads `render.yaml` and proposes a web service.
3. Click **Apply**. It will ask for the environment variables (they were left blank on purpose). Fill in:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service_role key |
   | `SUPABASE_ANON_KEY` | your anon key |
   | `VITE_SUPABASE_URL` | your Project URL (same as above) |
   | `VITE_SUPABASE_ANON_KEY` | your anon key (same as above) |

4. Create the service. Render runs `npm install && npm run build`, then `npm start`.
   First build takes a few minutes. When it's live you'll get a URL like `https://fex-crm.onrender.com`.

**Not using the Blueprint?** Create a **Web Service** from the repo instead, set
**Build Command** to `npm install && npm run build`, **Start Command** to `npm start`,
and add the same five env vars.

---

## 4. Create your first login

Supabase Auth (who can log in) and the app's `users` table (their role/org) are
separate, so you create both once:

1. **Run the schema** if you haven't: Supabase → SQL Editor → paste `schema.sql` → Run.
2. **Add an auth user:** Supabase → Authentication → Users → **Add user** →
   enter your email + a password → create. Copy the new user's **UID**.
3. **Create an org and your profile row:** Supabase → SQL Editor → run
   (replace the UID and email):

   ```sql
   insert into organizations (name) values ('Your Agency') returning id;
   -- copy the returned org id, then:
   insert into users (id, org_id, role, full_name, email)
   values ('PASTE-AUTH-UID', 'PASTE-ORG-ID', 'super_admin', 'Your Name', 'you@example.com');
   ```

4. Open your Render URL, sign in with that email/password. You should land on the
   Dashboard showing your email and role `super_admin`. That means auth + RLS + the
   API are all working end to end.

---

## 5. Point your domain (optional, when ready)

In Render → your service → **Settings → Custom Domains**, add `crm.gocoverwise.com`.
Render gives you a DNS target; add that CNAME at your DNS host. Keep `gocoverwise.com`
(the marketing site) on HostGator.

---

## Running locally (optional)

```bash
# one time
cp server/.env.example server/.env   # fill in your keys
cp client/.env.example client/.env   # fill in URL + anon key
npm run install:all

# two terminals
npm run dev:server   # Express on :3000
npm run dev:client   # Vite on :5173 (proxies /api to :3000)
```

Open http://localhost:5173.
