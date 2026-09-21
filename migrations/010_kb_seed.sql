-- Starter knowledge-base content + onboarding steps for Coverwise.
-- Run ONCE after 009_knowledge_base.sql. Safe to re-run (ON CONFLICT DO NOTHING).
-- Content is drafted to be edited in-app (Help > Manage). Bracketed [notes] mark
-- spots to confirm with your real carriers / percentages / process.

do $$
declare
  org uuid;
  c_start uuid; c_scripts uuid; c_comp uuid; c_crm uuid; c_prod uuid; c_pay uuid; c_mgr uuid; c_faq uuid;
begin
  select id into org from organizations order by created_at limit 1;
  if org is null then raise notice 'No organization found — create your org first.'; return; end if;

  -- ---- Categories ----
  insert into kb_categories (org_id, name, slug, sort_order) values
    (org, 'Getting Started',      'getting-started',  0),
    (org, 'Scripts & Rebuttals',  'scripts-rebuttals',1),
    (org, 'Compliance',           'compliance',       2),
    (org, 'Using the CRM',        'using-the-crm',    3),
    (org, 'Products & Carriers',  'products-carriers',4),
    (org, 'Commissions & Pay',    'commissions-pay',  5),
    (org, 'For Managers',         'for-managers',     6),
    (org, 'FAQ',                  'faq',              7)
  on conflict (org_id, slug) do nothing;

  select id into c_start   from kb_categories where org_id=org and slug='getting-started';
  select id into c_scripts from kb_categories where org_id=org and slug='scripts-rebuttals';
  select id into c_comp    from kb_categories where org_id=org and slug='compliance';
  select id into c_crm     from kb_categories where org_id=org and slug='using-the-crm';
  select id into c_prod    from kb_categories where org_id=org and slug='products-carriers';
  select id into c_pay     from kb_categories where org_id=org and slug='commissions-pay';
  select id into c_mgr     from kb_categories where org_id=org and slug='for-managers';
  select id into c_faq     from kb_categories where org_id=org and slug='faq';

  -- ---- Articles ----
  insert into kb_articles (org_id, category_id, title, slug, audience, sort_order, body) values

  (org, c_start, 'Welcome to Coverwise', 'welcome', 'all', 0, $md$
# Welcome to Coverwise

Welcome to the team. Coverwise is a **final expense telesales agency** — we help families put affordable whole-life coverage in place, over the phone, so their loved ones aren't left with funeral and end-of-life costs.

## What you'll do here
Final expense is a simple, needs-based sale. You'll call people who **requested information** about coverage, understand their situation, quote a plan that fits their budget, and help them get approved on the call.

## How your day runs
1. Log in and open your **Getting Started** checklist until it's complete.
2. Work your **My Queue** — callbacks that are due, then fresh leads.
3. Use the **Power Dialer** to work a full list quickly.
4. Follow the script, handle objections, quote, and close.
5. Record every outcome with a **disposition** so the system knows what's next.

## The golden rules
- **Be compliant.** Stay inside calling hours, honor Do-Not-Call, and read the disclosures. See the Compliance section.
- **Log everything.** If it isn't in the CRM, it didn't happen.
- **Serve first.** We only win when the family gets the right coverage they can afford.

Work through the rest of your onboarding steps and you'll be taking calls in no time.
$md$),

  (org, c_start, 'Set up your account', 'set-up-your-account', 'all', 1, $md$
# Set up your account

A few one-time steps before you start dialing.

## 1. Change your password
Go to **Settings > My account** and set a password only you know. If you were emailed a temporary password, replace it now.

## 2. Check your profile
Confirm your name and phone number are correct under **Users** (or ask your manager). Your name is what shows on internal reports and caller routing.

## 3. Record your voicemail greeting
Go to **Settings > My voicemail greeting** and click **Record greeting**. Your softphone will connect — speak after the tone and press **#** when done. Callers who reach your voicemail will hear this, so keep it short and professional:

> "Hi, you've reached [Name] with Coverwise. Sorry I missed you — leave your name and number and I'll call you right back. Thank you."

## 4. Open the phone
Click **Open Phone** in the left menu to bring up your softphone. Allow microphone access if your browser asks. You're ready to take and make calls.
$md$),

  (org, c_scripts, 'Opening script', 'opening-script', 'agent', 0, $md$
# Opening script

Keep it warm, confident, and quick. The goal of the opening is simply to **earn the next 60 seconds**.

## Opener
> "Hi, may I speak with **[First Name]**? … Hi [First Name], this is **[Your Name]** with **Coverwise** on a recorded line. You recently requested some information about the **final expense** coverage that helps cover funeral costs so your family isn't stuck with the bill — do you remember filling that out?"

## Set the frame
> "Great — that's all this call is about. I just need to ask a few quick questions to see what you qualify for, and I'll give you the options and the price. Fair enough?"

## Discovery (fact-find)
- Who would we be protecting — a spouse, kids? Who'd handle the final arrangements?
- Do you currently have any coverage in place? How much?
- Any health conditions I should know about so I quote you the right plan? [Tobacco? Heart, diabetes, COPD?]
- What's a monthly amount that would be comfortable for your budget?

## Transition to quote
> "Based on what you told me, here's what I'd recommend…"

*[Confirm your exact recorded-line and company language with compliance before using. Edit this script to match how Coverwise actually opens.]*
$md$),

  (org, c_scripts, 'Common objections & rebuttals', 'rebuttals', 'agent', 1, $md$
# Common objections & rebuttals

Objections are normal — they usually mean *"I'm not sure yet."* Acknowledge, answer briefly, and move forward.

## "I need to think about it."
> "Totally understand — most people do. What specifically is giving you pause: is it the coverage amount, the monthly price, or the company? Let's look at just that piece."

## "I can't afford it."
> "I hear you, budgets are tight. That's exactly why we start with a number *you* pick. If we got the monthly down to something comfortable, would you want the protection in place? Let's find that number."

## "I need to talk to my spouse/kids."
> "Makes sense — this protects them, so they should know. Many people set it up today and it's fully reviewable; nothing is locked in forever. Let's get you approved so the price is protected, and you can walk them through it."

## "Send me something in the mail."
> "I can do that, but the rate depends on a couple of health questions I can only confirm on the phone. Let me lock in your real number now so what you see is accurate."

## "Is this a scam?"
> "Fair question — you should be careful. We're **Coverwise**, licensed in your state, and this call is recorded for your protection. The policy comes directly from **[carrier]**, an A-rated carrier. You'll get everything in writing before anything is final."

*[Add the rebuttals your top closers actually use.]*
$md$),

  (org, c_comp, 'Compliance basics (must read)', 'compliance-basics', 'all', 0, $md$
# Compliance basics (must read)

Compliance protects you, the customer, and the agency's license. **These are not optional.**

## Calling hours
Only call **8:00 AM – 9:00 PM in the lead's local time zone**. The dialer enforces this automatically and will skip leads outside the window — never try to work around it.

## Do Not Call (DNC)
If a lead is marked **Do Not Call**, the system blocks dialing and texting. If someone asks to be put on your do-not-call list, mark them **DNC** on the lead record immediately and do not contact them again.

## Recorded line & disclosure
Calls are recorded. When required, the system plays a recording disclosure at the start of the call. Always identify yourself, the company (**Coverwise**), and the purpose of the call.

## Honesty
- Never misstate coverage, price, waiting periods, or what a policy pays.
- Never impersonate Medicare, the government, or a customer's existing insurer.
- Answer health questions **truthfully** on the application — misrepresentation voids claims.

## Sensitive information
Collect only what the application requires. Do not store card numbers or full bank details in notes. Follow the intake process for payment info.

*[Replace bracketed items and add your state-specific and carrier-specific compliance rules. When in doubt, ask a manager before you dial.]*
$md$),

  (org, c_crm, 'Working leads & dispositions', 'using-leads', 'all', 0, $md$
# Working leads & dispositions

## The lead record
Open any lead to see everything in tabs:
- **Info** — contact, demographics, policy interest, status, owner, compliance.
- **Sales** — record a sale and see policies on this lead.
- **Follow-ups / Notes** — schedule callbacks/appointments and keep notes.
- **Activity** — the full history of what's happened on this lead.

## Statuses vs. dispositions
- A **status** is *where the lead stands* (New, Working, Sold, etc.).
- A **disposition** is *what happened on a call* (No Answer, Callback, Not Interested, Sale…). Dispositions can automatically advance the status.

## Always disposition your calls
After every call, pick a disposition. This keeps your pipeline clean and makes sure callbacks come back to you at the right time.

## Callbacks
Set a callback from the **Follow-ups** tab or right after a call. Due callbacks show up in **My Queue** so you never lose a warm lead.
$md$),

  (org, c_crm, 'My Queue & the Power Dialer', 'queue-and-dialer', 'all', 1, $md$
# My Queue & the Power Dialer

## My Queue
**My Queue** is your daily worklist as a kanban board: callbacks that are due first, then your owned leads, then available leads. Work it top to bottom.

## The Power Dialer
The **Power Dialer** works a whole list fast:
1. Pick an uploaded list to dial.
2. The dialer calls the next eligible lead (respecting calling hours and DNC).
3. The **script pops up with the lead's info filled in**.
4. Talk, then disposition — the dialer advances to the next lead.

If the dialer says a list is finished but you have leads, check the time: leads outside the **8 AM–9 PM local** window are skipped until it's legal to call them.

## Caller ID
Calls use a local-presence number that matches the lead's state when one is available, which improves pickup rates.
$md$),

  (org, c_prod, 'Final expense products — overview', 'products-overview', 'all', 0, $md$
# Final expense products — overview

Final expense is **whole life** insurance in smaller face amounts (typically **$5,000–$25,000**) designed to cover funeral and end-of-life costs. It's permanent, the premium doesn't increase, and it builds a little cash value.

## Three plan types by health
- **Level (day-one) benefit** — healthiest clients. Full coverage from day one.
- **Graded / modified** — some health issues. Reduced payout in the first 2–3 years.
- **Guaranteed issue** — no health questions. Waiting period (usually 2 years) before full payout; pays out for accidental death sooner.

Matching the client's health to the right plan is the whole game — it's why we ask the health questions.

## What clients care about
- Monthly price they can afford
- That it pays out quickly and reliably
- No medical exam

*[Add your carriers' specific products, face-amount ranges, and underwriting niches here.]*
$md$),

  (org, c_prod, 'Our carriers', 'our-carriers', 'agent', 1, $md$
# Our carriers

These are the carriers Coverwise is appointed with and who they're best for. Match the client to the carrier that will approve them at the best rate.

| Carrier | Best for | Notes |
|---|---|---|
| [Carrier A] | Level, standard health | [e.g. competitive 60–75 age band] |
| [Carrier B] | Diabetes / tobacco | [niche] |
| [Carrier C] | Guaranteed issue | [waiting period] |

*[Replace with your real carrier list. Keep underwriting niches here so agents place business where it gets approved. Your carrier appointments are tracked per agent under Users.]*
$md$),

  (org, c_pay, 'How you get paid', 'how-you-get-paid', 'all', 0, $md$
# How you get paid

Commissions are based on the **annual premium** of the policies you sell (annual premium = monthly premium × 12).

## The split
For each sale, the annual premium is divided into:
- **Your commission** — your contracted percentage.
- **Manager override** — a percentage to your upline manager (if you have one).
- **Agency** — the remainder.

Your exact percentages are set per carrier by your manager and shown in the **Commissions** area.

## Recording a sale
When you close, open the lead, go to the **Sales** tab, and **Record sale** (carrier, product, monthly premium, policy number, draft day, effective date). The system creates the policy and calculates commissions automatically.

## Chargebacks
If a policy **lapses, cancels, or the first payment fails (NSF)** early, the commission is charged back — reversed — because the agency didn't get paid either. This is why **persistency matters**: sell coverage people keep. Set the draft date near the client's payday and confirm the bank details are right.

*[Confirm your exact percentages, advance vs. as-earned pay, and chargeback window with your manager.]*
$md$),

  (org, c_mgr, 'Manager overview', 'manager-overview', 'manager', 0, $md$
# Manager overview

This section is visible to **managers and admins only**.

## Your tools
- **Users** — add agents, set their role and their manager (you), record state licenses and carrier appointments, and reset passwords.
- **Commissions** — set each agent's percentage per carrier, and your override.
- **Reports** — leads by source, status, agent, and contact rate; inbound call reporting.
- **Revenue** — premium, agency house profit, agent comp, and your overrides, filterable by source and agent, excluding chargebacks.
- **Getting Started > Manage steps** — edit the onboarding checklist new hires see.
- **Help > Manage** — write and edit knowledge-base articles.

## Watching a new agent
Use **Getting Started > Team onboarding progress** to see who has finished onboarding. Pair it with **Reports** (contact rate, dispositions) in their first weeks to catch coaching opportunities early.
$md$),

  (org, c_mgr, 'Onboarding a new agent', 'onboarding-a-new-agent', 'manager', 1, $md$
# Onboarding a new agent (manager checklist)

1. **Create their login** in **Users** — set role = *agent* and set yourself as their **manager**.
2. **Add their state licenses** and **carrier appointments** on their user record so leads route and place correctly.
3. **Set their commission percentages** per carrier under **Commissions**.
4. Have them complete **Getting Started** end to end (you can watch progress on the team panel).
5. Sit in on their first live calls; review call recordings and dispositions.
6. Confirm their **voicemail greeting** is recorded and their caller ID/numbers work.

*[Add your ramp expectations — e.g. dials/day, first-week goals, certification call.]*
$md$),

  (org, c_faq, 'FAQ', 'faq', 'all', 0, $md$
# Frequently asked questions

**How do I make a call?**
Open a lead and click **Call**, work **My Queue**, or use the **Power Dialer** for a full list. Click **Open Phone** to dial a number manually.

**Why won't the dialer call my leads?**
Most often it's outside **8 AM–9 PM in the lead's time zone**, or the lead is marked **Do Not Call**. Both are compliance blocks, not bugs.

**A customer asked to never be called again — what do I do?**
Open the lead, mark **Do Not Call** on the Info tab, and save. They'll be blocked from dialing and texting immediately.

**How do I set a callback?**
On the lead's **Follow-ups / Notes** tab, choose Callback, pick the time, and save. It appears in **My Queue** when due.

**How do I record a sale?**
Lead > **Sales** tab > **Record sale**. Commissions calculate automatically.

**Where do I see what I've earned?**
The **Commissions** area, and ask your manager about pay timing.

**I forgot my password.**
Use **Forgot password** on the login screen, or ask your manager to reset it.

**Who do I ask for help?**
Your manager first. Check this knowledge base for quick answers any time.
$md$)

  on conflict (org_id, slug) do nothing;

  -- ---- Onboarding steps ---- (only seed if none exist yet, so re-runs don't duplicate)
  if not exists (select 1 from onboarding_tasks where org_id = org) then
  insert into onboarding_tasks (org_id, title, description, audience, link, sort_order) values
    (org, 'Read: Welcome to Coverwise', 'Start here — what we do and how your day runs.', 'all', 'kb:welcome', 0),
    (org, 'Set up your account', 'Change your password, check your profile, record your voicemail greeting.', 'all', '/settings', 1),
    (org, 'Read: Compliance basics', 'Calling hours, DNC, disclosures. Required before you dial.', 'all', 'kb:compliance-basics', 2),
    (org, 'Learn the CRM: leads & dispositions', 'How lead records, statuses and dispositions work.', 'all', 'kb:using-leads', 3),
    (org, 'Learn My Queue & the Power Dialer', 'How to work your daily list and dial fast.', 'agent', 'kb:queue-and-dialer', 4),
    (org, 'Review the opening script', 'The opener, fact-find, and transition to quote.', 'agent', 'kb:opening-script', 5),
    (org, 'Study objections & rebuttals', 'Handle the common ones with confidence.', 'agent', 'kb:rebuttals', 6),
    (org, 'Review products & carriers', 'Plan types by health and who our carriers are best for.', 'all', 'kb:products-overview', 7),
    (org, 'Understand how you get paid', 'Commissions, recording a sale, and chargebacks.', 'all', 'kb:how-you-get-paid', 8),
    (org, 'Make your first test call', 'Open your queue and place a live call end to end.', 'agent', '/queue', 9),
    (org, 'Manager: read the Manager overview', 'Your tools for team, commissions and reporting.', 'manager', 'kb:manager-overview', 10),
    (org, 'Manager: add your agents', 'Create logins, licenses, appointments and commission rates.', 'manager', '/users', 11);
  end if;

  raise notice 'Coverwise KB + onboarding seed complete for org %', org;
end $$;
