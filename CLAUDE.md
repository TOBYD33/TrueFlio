# TrueFlow — Master Project Brief
> Brand name is TrueFlow. Domain is gettrueflow.com.
> Never write TrueFlio, trueflio, or Truelio anywhere.
> This file is read automatically by Claude Code on every session.
> Do not delete it. Keep it updated as the project evolves.
> Last updated: June 2025

> 🔔 OPEN REMINDER, BEFORE MVP/PUBLIC LAUNCH: the Permanently Erase
> admin action currently deletes immediately with no cooling-off
> period, intentionally simplified during Ambassador testing. This
> MUST be turned back into a 24-hour delayed, cancellable erasure
> before real users' data is on the line. Search "cooling-off" in
> this file for the full context.

---

## What Is TrueFlow

TrueFlow is an AI-powered conversational financial assistant AND client project manager
for individuals, families, small business owners, and freelancers.

It serves two directions of money simultaneously:
- MONEY OUT → track your own expenses, budgets, reminders, and financial planning
- MONEY IN  → track client payments, manage project folders, and delivery deadlines

TrueFlow combines: receipt scanning, expense tracking, budget management, reminders,
financial planning, client CRM, invoice generation, and project delivery tracking —
all in one product delivered across three channels sharing one Supabase backend.

Company legal name: **True Financial Portfolio Ltd**
Brand name: **TrueFlow**
Pronounced: **True-Flow** (like the two words "True Flow" said together)
Tagline (primary): *"Your true financial flow."
Tagline (personal): *"The AI that remembers so you don't have to."
Tagline (universal): *"Your money. Your clients. Your life. One AI."*
Domain: gettrueflow.com
App URL: app.gettrueflow.com
Email: hello@gettrueflow.com

---

## Current Build Status

| Phase | What | Status |
|-------|------|--------|
| Phase 1 | WhatsApp Bot (Conversational AI) | ✅ LIVE |
| Phase 2 | Web App (Expense Tracking + Client CRM) | 🔨 BUILD NOW |
| Phase 3 | Mobile App (React Native + Expo) | ⏳ AFTER PHASE 2 |

Phase 1 is live and running. Build Phase 2 next. Phase 3 last.
Phase 2 and the old Phase 3 (Client CRM) are now ONE unified web app.

---

## The Product Trinity — Three Channels, One Backend

```
WhatsApp Bot (✅ LIVE)
→ Conversational AI assistant
→ Scan receipts by photo, chat about finances
→ Set budgets and reminders via natural language
→ Forward client payment receipts to create client folders
→ Weekly summaries, monthly PDF reports, budget alerts

Web App (🔨 BUILD NOW — app.gettrueflow.com)
→ Full dashboard for MONEY OUT (expenses) + MONEY IN (clients)
→ View all WhatsApp bot data displayed visually
→ Receipt photos + AI transcripts from bot shown side by side
→ Client CRM — folders, projects, income, invoices
→ Subscription payments via Paystack
→ Accountant read-only portal
→ Team management, profile, business settings

Mobile App (⏳ PHASE 3 — after web app)
→ React Native + Expo
→ Camera scanner, push notifications
→ Same dashboard as web, optimised for mobile
→ iOS + Android
```

All three channels share one Supabase database, one auth system, one subscription.
Scan on WhatsApp → appears in web app in under 2 seconds via Supabase Realtime.

---

## Tech Stack

### Shared Backend (all three channels)
- **Database + Auth + Storage + Realtime**: Supabase (PostgreSQL)
- **AI — Receipt Scanning**: Anthropic Claude Vision API
- **AI — Conversations**: Anthropic Claude Messages API
- **Model for chat**: claude-haiku-4-5-20251001 (fast, cheap)
- **Model for receipt scanning**: claude-opus-4-6 (accurate vision)
- **Payments**: Paystack (Nigeria) · Stripe (international — future)
- **PDF Generation**: html-pdf or Puppeteer via Supabase Edge Function

### Phase 1 — WhatsApp Bot (✅ LIVE)
- Node.js + TypeScript + Express.js
- Twilio WhatsApp Business API
- Hosted on Railway.app
- Scheduled jobs: node-cron

### Phase 2 — Web App (🔨 BUILD NOW)
- Framework: Next.js 14 App Router + TypeScript
- Styling: Tailwind CSS + shadcn/ui components
- Charts: Recharts
- Tables: TanStack Table
- File upload: react-dropzone
- PDF export: @react-pdf/renderer or html-pdf
- Excel export: xlsx (SheetJS)
- Hosting: Vercel
- URL: app.gettrueflow.com

### Phase 3 — Mobile App (⏳ LATER)
- React Native + Expo + TypeScript
- Expo Router (file-based navigation)
- Victory Native (charts)
- Expo Camera + ImagePicker
- Expo Notifications (push)
- expo-secure-store (auth persistence)

---

## Environment Variables

### Web App (.env.local in /web folder)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Paystack
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=
PAYSTACK_SECRET_KEY=
PAYSTACK_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://app.gettrueflow.com
NEXT_PUBLIC_SITE_URL=https://gettrueflow.com
```

### WhatsApp Bot (.env in /bot folder)
```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
PAYSTACK_WEBHOOK_SECRET=
WEBAPP_URL=https://app.gettrueflow.com
PRICING_PAGE_URL=https://gettrueflow.com/pricing
```

---

## Complete Database Schema

Run this entire block in Supabase SQL Editor to create all tables.

```sql
-- ── PROFILES ──────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text unique,
  avatar_url text,
  expo_push_token text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update updated_at on any change
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- ── ORGANIZATIONS ─────────────────────────────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text default 'sme',
  -- type: 'sme' | 'family' | 'individual' | 'freelancer' | 'agency'
  owner_id uuid references profiles(id),
  plan text default 'free',
  -- plan: 'free' | 'individual' | 'family' | 'sme_starter' | 'sme_pro'
  --       'freelancer' | 'agency' | 'studio' | 'enterprise'
  receipt_limit int default 10,
  client_limit int default 0,
  -- client_limit: 0=none, 10=freelancer, 50=agency, -1=unlimited
  currency text default 'NGN',
  logo_url text,
  paystack_customer_id text,
  paystack_subscription_id text,
  paystack_subscription_status text default 'inactive',
  -- status: 'inactive' | 'active' | 'cancelled' | 'non-renewing'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger organizations_updated_at
  before update on organizations
  for each row execute function update_updated_at();

-- ── ORG MEMBERS ───────────────────────────────────────────────────────
create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'staff',
  -- role: 'owner' | 'admin' | 'staff' | 'accountant'
  whatsapp_number text,
  whatsapp_active boolean default true,
  invited_by uuid references profiles(id),
  invited_at timestamptz default now(),
  joined_at timestamptz,
  unique(org_id, user_id)
);

-- ── RECEIPTS (MONEY OUT — your own expenses) ──────────────────────────
create table receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  uploaded_by uuid references profiles(id),
  uploaded_via text default 'web',
  -- uploaded_via: 'whatsapp' | 'web' | 'mobile'
  vendor_name text,
  amount numeric(12,2),
  currency text default 'NGN',
  tax_amount numeric(12,2),
  date date default current_date,
  category text default 'Other',
  -- categories: 'Food & Drink' | 'Transport' | 'Utilities'
  --             'Office Supplies' | 'Marketing' | 'Rent' | 'Salaries' | 'Other'
  notes text,
  image_url text,           -- Supabase Storage URL of receipt photo
  ai_transcript text,       -- full raw text Claude read from the receipt
  ai_confidence text,       -- 'high' | 'medium' | 'low'
  is_verified boolean default false,
  client_id uuid references clients(id) on delete set null,
  -- optional: link this expense to a client project
  project_id uuid references projects(id) on delete set null,
  created_at timestamptz default now()
);

create index on receipts (org_id, date desc);
create index on receipts (org_id, category);

-- ── BUDGETS ───────────────────────────────────────────────────────────
create table budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null,
  period text default 'monthly',
  month int,
  year int,
  created_at timestamptz default now(),
  unique(org_id, category, month, year)
);

-- ── REMINDERS ─────────────────────────────────────────────────────────
create table reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  due_date date not null,
  recurrence text default 'once',
  -- recurrence: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  category text default 'custom',
  -- category: 'tax' | 'salary' | 'supplier' | 'bill'
  --           'compliance' | 'project_deadline' | 'custom'
  status text default 'active',
  -- status: 'active' | 'fired' | 'dismissed'
  fired_at timestamptz,
  created_at timestamptz default now()
);

create index on reminders (org_id, due_date, status);

-- ── WHATSAPP CONVERSATIONS ────────────────────────────────────────────
create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  role text not null,     -- 'user' | 'assistant'
  content text not null,
  created_at timestamptz default now()
);

create index on whatsapp_conversations (phone_number, created_at desc);

-- ── WHATSAPP SESSIONS ─────────────────────────────────────────────────
create table whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,
  org_id uuid references organizations(id),
  user_id uuid references profiles(id),
  is_new boolean default true,
  last_active_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ── BILLS ─────────────────────────────────────────────────────────────
create table bills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  amount numeric(12,2),
  due_date date,
  recurrence text default 'once',
  status text default 'upcoming',
  -- status: 'upcoming' | 'paid' | 'overdue'
  created_at timestamptz default now()
);

-- ── CLIENTS (MONEY IN — people who pay YOU) ───────────────────────────
create table clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  total_earned numeric(12,2) default 0,
  outstanding_balance numeric(12,2) default 0,
  status text default 'active',
  -- status: 'active' | 'inactive' | 'archived'
  created_via text default 'web',
  -- created_via: 'web' | 'whatsapp' | 'mobile'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on clients (org_id, status);

create trigger clients_updated_at
  before update on clients
  for each row execute function update_updated_at();

-- ── PROJECTS ──────────────────────────────────────────────────────────
create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  description text,
  total_fee numeric(12,2),
  amount_received numeric(12,2) default 0,
  balance_due numeric(12,2) generated always as (total_fee - amount_received) stored,
  currency text default 'NGN',
  start_date date default current_date,
  deadline date,
  status text default 'in_progress',
  -- status: 'in_progress' | 'delivered' | 'completed' | 'cancelled' | 'on_hold'
  delivered_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on projects (org_id, status);
create index on projects (client_id);

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

-- ── CLIENT PAYMENTS (MONEY IN — individual payments from clients) ─────
create table client_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  amount numeric(12,2) not null,
  currency text default 'NGN',
  payment_type text default 'part_payment',
  -- type: 'deposit' | 'part_payment' | 'full_payment' | 'retainer'
  payment_date date default current_date,
  payment_reference text,
  receipt_image_url text,   -- the photo the client forwarded
  ai_transcript text,       -- what Claude read from the receipt
  notes text,
  created_at timestamptz default now()
);

create index on client_payments (org_id, client_id);

-- ── INVOICES ──────────────────────────────────────────────────────────
create table invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  invoice_number text,      -- e.g. INV-2025-001
  client_name text,
  client_email text,
  line_items jsonb,
  -- [{description, quantity, unit_price, total}]
  subtotal numeric(12,2),
  tax_rate numeric(5,2) default 0,
  tax_amount numeric(12,2),
  total_amount numeric(12,2),
  currency text default 'NGN',
  status text default 'draft',
  -- status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  issue_date date default current_date,
  due_date date,
  paid_at timestamptz,
  pdf_url text,             -- Supabase Storage URL of generated PDF
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger invoices_updated_at
  before update on invoices
  for each row execute function update_updated_at();

-- ── ACCOUNTANT SHARE LINKS ────────────────────────────────────────────
create table share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  token text unique default gen_random_uuid()::text,
  permission text default 'read',
  -- permission: 'read' | 'export'
  expires_at timestamptz default (now() + interval '30 days'),
  created_at timestamptz default now()
);

-- ── SUBSCRIPTION EVENTS (Paystack webhook log) ────────────────────────
create table subscription_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  event_type text,
  payload jsonb,
  processed boolean default false,
  created_at timestamptz default now()
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table receipts enable row level security;
alter table budgets enable row level security;
alter table reminders enable row level security;
alter table bills enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table client_payments enable row level security;
alter table invoices enable row level security;
alter table share_links enable row level security;

-- Profiles
create policy "Users see own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users update own profile"
  on profiles for update using (auth.uid() = id);

-- Organizations
create policy "Org members see their org"
  on organizations for select using (
    id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org owners update their org"
  on organizations for update using (owner_id = auth.uid());

-- Receipts
create policy "Org members see receipts"
  on receipts for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org members insert receipts"
  on receipts for insert with check (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org members update their own receipts"
  on receipts for update using (uploaded_by = auth.uid());
create policy "Org admins delete receipts"
  on receipts for delete using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Clients
create policy "Org members see clients"
  on clients for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org admins manage clients"
  on clients for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Projects
create policy "Org members see projects"
  on projects for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org admins manage projects"
  on projects for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Client payments
create policy "Org members see client payments"
  on client_payments for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org admins manage client payments"
  on client_payments for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Invoices
create policy "Org members see invoices"
  on invoices for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org admins manage invoices"
  on invoices for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );
```

---

## Pricing Plans

### Subscription Tiers
| Plan | NGN/month | USD/month | Receipts | Clients | Staff |
|------|-----------|-----------|----------|---------|-------|
| Free | ₦0 | $0 | 10 | 0 | 1 |
| Individual | ₦2,500 | $4.99 | Unlimited | 0 | 1 |
| Family | ₦5,000 | $9.99 | Unlimited | 0 | 6 |
| SME Starter | ₦7,500 | $19 | Unlimited | 10 | 5 |
| SME Pro | ₦15,000 | $39 | Unlimited | 50 | 15 |
| Freelancer | ₦5,000 | $9.99 | Unlimited | 10 | 1 |
| Agency | ₦12,000 | $24.99 | Unlimited | 50 | 3 |
| Studio | ₦25,000 | $49.99 | Unlimited | Unlimited | 10 |
| Enterprise | Custom | Custom | Unlimited | Unlimited | Unlimited |

### Plan Feature Gates
- Client CRM (clients, projects, income): SME Starter+ or Freelancer+
- Invoice generation: SME Pro+ or Agency+
- Accountant share link: SME Starter+
- Team management: Family+ (for family), SME Starter+ (for business)
- Advanced analytics: SME Pro+
- White-label invoices: Studio+

---

## Phase 2 Web App — Complete Specification

### Overview
app.gettrueflow.com is ONE unified web app combining:
- Expense Tracking (MONEY OUT) — data flows in from WhatsApp bot in real time
- Client CRM (MONEY IN) — client folders, projects, income, invoices

### Folder Structure
```
/web
  /app
    layout.tsx                    ← Root layout
    page.tsx                      ← Redirect → /dashboard
    /(auth)                       ← Public routes — no login needed
      /login/page.tsx
      /signup/page.tsx
      /reset-password/page.tsx
      /callback/page.tsx          ← Supabase magic link handler
    /(protected)                  ← Requires login — middleware guards
      layout.tsx                  ← Sidebar + topnav
      /dashboard/page.tsx
      /receipts/page.tsx
      /receipts/[id]/page.tsx
      /reports/page.tsx
      /budgets/page.tsx
      /reminders/page.tsx
      /clients/page.tsx
      /clients/[id]/page.tsx
      /projects/page.tsx
      /projects/[id]/page.tsx
      /income/page.tsx
      /invoices/page.tsx
      /invoices/new/page.tsx
      /invoices/[id]/page.tsx
      /team/page.tsx
      /settings/profile/page.tsx
      /settings/business/page.tsx
      /settings/subscription/page.tsx
      /settings/accountant/page.tsx
      /settings/notifications/page.tsx
    /accountant/[token]/page.tsx  ← Read-only portal — no login needed
    /pricing/page.tsx             ← Public pricing page
    /api
      /scan/route.ts              ← Upload image → Claude Vision → return JSON
      /receipts/route.ts          ← Save receipt
      /export/pdf/route.ts        ← Generate PDF report
      /export/excel/route.ts      ← Generate Excel
      /invoices/pdf/route.ts      ← Generate invoice PDF
      /share-link/route.ts        ← Generate accountant token
      /paystack/webhook/route.ts  ← Handle Paystack events
      /paystack/initialize/route.ts ← Start Paystack checkout
  /components
    /ui                           ← shadcn/ui components
    Sidebar.tsx
    TopNav.tsx
    StatCard.tsx
    ReceiptTable.tsx
    ReceiptImageViewer.tsx        ← Shows photo + AI transcript side by side
    CategoryChart.tsx
    SpendTrendChart.tsx
    BudgetProgressBar.tsx
    ChannelBadge.tsx              ← 'via WhatsApp' | 'via Web' | 'via App'
    ClientCard.tsx
    ProjectCard.tsx
    ProjectStatusBadge.tsx
    InvoiceStatusBadge.tsx
    PlanGate.tsx                  ← Hides content for lower plan users
    UpgradePrompt.tsx             ← CTA shown when feature is plan-gated
    FileDropzone.tsx              ← Drag-and-drop receipt upload
    EmptyState.tsx
  /lib
    supabase-browser.ts
    supabase-server.ts
    paystack.ts
    utils.ts
    plan-limits.ts                ← Helper: canUseCRM(plan), canInviteStaff(plan) etc
  /types
    index.ts
  middleware.ts
```

### Page-by-Page Specification

#### /dashboard
- Welcome: "Good morning, {name}" + today's date
- 4 stat cards: Total Spent this month, Receipts scanned, Outstanding client balance, Tax tracked
- Spending by category — horizontal bar chart (Recharts)
- Income vs Expense chart — last 6 months (Recharts BarChart)
- Recent receipts feed — last 5 with ChannelBadge
- Active projects widget — shows projects with approaching deadlines
- Upcoming reminders — next 3 due
- Supabase Realtime subscription — new receipts from WhatsApp appear instantly

#### /receipts
- TanStack Table — sortable, filterable, paginated (20 per page)
- Columns: Date · Vendor · Category · Amount · Uploaded by · Channel · Actions
- Filters: date range · category · channel (WhatsApp/Web/App) · staff member
- Search: vendor name
- Bulk select → export selected as PDF or Excel
- FileDropzone at top → drag receipt image → calls /api/scan → confirmation modal → save
- Click row → /receipts/[id]

#### /receipts/[id]
- ReceiptImageViewer: receipt photo on left, AI transcript on right
- All fields editable inline: vendor, amount, date, category, tax, notes
- "Attach to client" button → select client + project from dropdown
- Channel badge showing where it came from
- Delete button (with confirmation)
- Created by + timestamp

#### /reports
- Date range picker: This Month / Last Month / Last 3 Months / Last 6 Months / Custom
- Summary row: Total · Count · Average · Tax
- Category donut chart (Recharts PieChart)
- Month-over-month comparison (Recharts BarChart)
- Per-staff breakdown table (plan gate: SME Starter+)
- VAT/Tax summary table
- Export PDF button → /api/export/pdf
- Export Excel button → /api/export/excel

#### /budgets
- Budget list with BudgetProgressBar per category
- Colours: green < 70% · amber 70–89% · red 90%+
- Add Budget button → modal: pick category, enter amount, select period
- Edit amount inline
- Delete budget (with confirmation)
- "Set via WhatsApp" tip shown for mobile users

#### /reminders
- List all reminders sorted by due date
- Overdue reminders shown at top in red
- Each row: title · due date · category tag · recurrence badge · status
- Add Reminder → form: title, date picker, recurrence, category, optional client/project link
- Edit / Dismiss / Delete per row

#### /clients
- Client card grid (or list toggle)
- Each card: name · outstanding balance · active projects count · last activity
- Search by name
- Filter by status (active / inactive / archived)
- "New Client" button → modal: name, phone, email, notes
- Click card → /clients/[id]

#### /clients/[id] — Client Folder
- Client header: name · phone · email · total earned · outstanding balance
- Edit client details inline
- Tabs:
  - Projects — all projects with status, fee, received, balance, deadline
  - Payments — all client_payments with receipt images
  - Invoices — all invoices for this client
  - Notes — free text notes about the client
- "New Project" button → modal
- "Record Payment" button → modal: amount, type, date, attach receipt image
- "Generate Invoice" button → pre-fills from project data

#### /projects
- Table of all projects across all clients
- Columns: Client · Project · Total Fee · Received · Balance · Deadline · Status · Actions
- Filter by status, client, deadline range
- Sort by deadline (soonest first default)
- Click row → /projects/[id]
- "New Project" button

#### /projects/[id]
- Project detail: name · description · client · dates · status
- Financial summary: total fee · received · balance due · progress bar
- Payment history table
- Attached receipts (expenses linked to this project)
- Reminders for this project (auto-created: 7d · 3d · day-of · overdue · unpaid)
- Update status: In Progress → Delivered → Completed
- Edit all fields

#### /income
- All client_payments across all clients
- Total income this month stat card
- Total outstanding balance stat card
- Table: Client · Project · Amount · Type · Date · Receipt
- Click receipt thumbnail → full image viewer
- Filter by client, date, payment type

#### /invoices
- Invoice list table
- Columns: Number · Client · Amount · Status · Due Date · Actions
- Status badges: Draft (gray) · Sent (blue) · Paid (green) · Overdue (red)
- "New Invoice" button → /invoices/new
- Bulk actions: send, export PDF

#### /invoices/new
- Select client (dropdown)
- Select project (auto-fills amounts)
- Add line items (add/remove rows): description · quantity · unit price · total
- Tax rate field (auto-calculates)
- Totals auto-update
- Notes / payment terms field
- Preview button → shows PDF preview
- Save as Draft / Send Now buttons

#### /invoices/[id]
- Invoice preview (PDF-like layout)
- Edit button (if draft)
- Mark as Paid button
- Send via Email button
- Download PDF button
- Share link (payment link for client)

#### /team
- Member list: avatar · name · role badge · WhatsApp number · status
- Invite button → modal: enter email or phone · select role
- Roles: Owner · Admin · Staff · Accountant
- WhatsApp toggle per staff member
- Remove member (with confirmation)
- Pending invites section

#### /settings/profile
- Full name field (editable)
- Phone number field
- Email (shown, not editable — use Supabase Auth to change)
- Avatar upload → uploads to Supabase Storage
- Change password → sends Supabase password reset email
- Save button

#### /settings/business
- Business/company name (editable)
- Business type (dropdown)
- Currency (dropdown: NGN, USD, GBP, etc)
- Logo upload → uploads to Supabase Storage
- Business address (optional)
- Save button

#### /settings/subscription
- Current plan card with features list
- Usage stats: receipts this month · clients · staff members
- Plan comparison table: all 9 plans side by side
- Upgrade button → initialises Paystack checkout
- Cancel subscription button (with confirmation)
- Billing history table (from subscription_events)

#### /settings/accountant
- Current share link display (if active)
- Generate New Link button
- Copy Link button
- Set expiry date option
- Permission toggle: Read only vs Read + Export
- Revoke Link button
- "Your accountant visits: /accountant/[token]" instruction

#### /accountant/[token]
- Validates token against share_links table
- No login required
- If expired → "This link has expired. Ask your accountant to generate a new one."
- If valid → read-only view:
  - Organisation name + logo in header
  - Date range filter
  - Spending summary cards
  - Receipt table (view only — no edit/delete)
  - Reports with charts
  - Export PDF / Excel buttons
  - "Powered by TrueFlow" footer

#### /pricing
- Public page — no login needed
- All plans with feature comparison
- "Get started free" and "Upgrade" buttons
- FAQ section

### How WhatsApp Bot Data Flows Into the Web App

1. Receipt scanned via WhatsApp bot
   → Saved to `receipts` table with `uploaded_via = 'whatsapp'` and `image_url`
   → Web app reads it via Supabase Realtime subscription
   → Appears in /receipts with ChannelBadge "via WhatsApp"
   → /receipts/[id] shows the receipt image + AI transcript side by side
   → User can click "Attach to client" to link it to a client folder

2. Client payment receipt forwarded via WhatsApp
   → Bot creates `client_payments` record with `receipt_image_url`
   → Appears in /income and in the relevant /clients/[id] folder automatically

3. Budget set via WhatsApp
   → Saved to `budgets` table
   → Shows in /budgets with progress bars immediately

4. Reminder set via WhatsApp
   → Saved to `reminders` table
   → Shows in /reminders with edit/dismiss options

5. New client created via WhatsApp
   → Saved to `clients` table with `created_via = 'whatsapp'`
   → Folder appears in /clients automatically

### Paystack Subscription Flow

1. User clicks "Upgrade" in /settings/subscription
2. POST /api/paystack/initialize → creates Paystack transaction
3. Redirect to Paystack checkout page
4. User pays
5. Paystack sends webhook to /api/paystack/webhook
6. Webhook handler:
   - Verifies Paystack signature using PAYSTACK_WEBHOOK_SECRET
   - Parses event type: 'subscription.create' | 'subscription.disable' | 'charge.success'
   - Updates `organizations.plan` and `organizations.paystack_subscription_status`
   - Logs to `subscription_events` table
7. User redirected back to /settings/subscription
8. Page shows new plan — features unlock immediately

### Module Build Order for Claude Code

Build in this exact order — each module depends on the previous:

1. Auth (login, signup, reset-password, callback, middleware)
2. Settings/profile + settings/business (user can update name, business name, avatar)
3. Dashboard (pulls real data from Supabase — receipts, budgets, reminders)
4. Receipts page + receipt detail (with image viewer + AI transcript)
5. Reports page + PDF/Excel export
6. Budgets page + Reminders page
7. Clients pages (/clients, /clients/[id])
8. Projects pages (/projects, /projects/[id])
9. Income page
10. Invoices (list, new, detail, PDF generation)
11. Team management page
12. Paystack subscription flow + /settings/subscription
13. Accountant share link + /accountant/[token] portal
14. /pricing public page

---

## Key Business Rules

1. Free tier: capped at 10 receipts/month. Enforce in both bot AND web upload.
2. Client CRM requires SME Starter, Freelancer, or higher plan.
3. Staff scan via WhatsApp without a web account — linked by phone number only.
4. Accountant share links: read-only, expire in 30 days, stored in share_links table.
5. Receipt images: Supabase Storage path `/receipts/{org_id}/{uuid}.jpg`
6. Client payment images: `/client-receipts/{org_id}/{client_id}/{uuid}.jpg`
7. Invoice PDFs: `/invoices/{org_id}/{invoice_id}.pdf`
8. Organisation logos: `/logos/{org_id}/logo.{ext}`
9. User avatars: `/avatars/{user_id}/avatar.{ext}`
10. Weekly summaries: every Sunday 8am WAT (bot sends via WhatsApp).
11. Monthly reports: 1st of month 9am WAT (bot sends via WhatsApp).
12. Budget alerts fire at 80% and 100% — bot sends WhatsApp + web shows banner.
13. Project reminders: 7 days before, 3 days before, day of, overdue, unpaid balance.
14. Conversation history: keep last 50 messages per phone number in whatsapp_conversations.
15. `uploaded_via` always set: 'whatsapp' | 'web' | 'mobile' — never null.
16. `clients` = people who pay YOU. `org_members` = YOUR staff. Never confuse these.
17. `receipts` = YOUR expenses going out. `client_payments` = money coming IN from clients.
18. `balance_due` on projects is a generated column — never update it directly.
19. Paystack webhook must verify signature before processing — never skip this.
20. Always use RLS — never query with service_role_key from client-side code.
21. All amounts stored as numeric(12,2) — display with .toLocaleString() + currency symbol.
22. Dates always stored as ISO 8601. Display as "14 June 2025" not "06/14/25".

---

## Client Management — Bot Commands

| User sends | Bot does |
|------------|---------|
| CLIENTS | Lists all active clients with outstanding balances |
| CLIENT [name] | Shows full folder — projects, payments, balance |
| PROJECTS | Lists all active projects with deadlines |
| OVERDUE | Shows projects past their deadline |
| UNPAID | Shows all clients with outstanding balances |
| BALANCE | Total outstanding across all clients |
| NEW CLIENT | Starts guided client creation flow |
| PAID [client] | Records balance as fully received |
| DELIVERED [project] | Marks project as delivered |
| INVOICE [client] | Generates invoice PDF |

---

## Automatic Project Reminders

When a project is created (via bot or web), these reminders auto-create:
1. 7 days before deadline: "⚠️ [Project] for [Client] due in 7 days"
2. 3 days before deadline: "🔴 [Project] for [Client] due in 3 days"
3. On deadline day: "📅 [Project] for [Client] delivery due TODAY"
4. If delivered but balance unpaid after 3 days: "💰 ₦X balance from [Client] not received"
5. If overdue: "❗ [Project] for [Client] is [N] days overdue"

---

## Target Users

**Expense Tracking (MONEY OUT):**
Nigerian SME owners, market traders, boutiques, logistics, food businesses,
freelancers with staff. Currently tracking on WhatsApp, paper, or Excel.

**Client CRM (MONEY IN):**
Freelancers (designers, developers, writers, consultants),
agencies (marketing, creative, PR, digital),
service businesses (lawyers, accountants, photographers, event planners).

**International (Phase 3 mobile app+):**
Ghana, Kenya, UK, South Africa, Pakistan, Brazil.
Same product, same infrastructure — different Paystack/Stripe config.

---

## Reminder Categories

| Category | Examples |
|----------|---------|
| tax | VAT filing, PAYE, company income tax, withholding tax |
| salary | Monthly salary, pension, leave allowances |
| supplier | Invoice due dates, credit terms, reorder stock |
| bill | Rent, electricity, generator fuel, internet, water |
| compliance | CAC annual returns, NAFDAC renewals, business permits |
| operations | Petty cash replenishment, generator maintenance |
| project_deadline | Client project delivery date |
| custom | Anything the user specifies |

---

## Brand Identity

### Name & Pronunciation
- Written: **TrueFlow**
- Pronounced: **True-Flow** (exactly like "True Flow" said together)
- Phonetic: /truː.fləʊ/
- Never write: Truelio, TrueFlio, TRUEFLOW, true flow (two words), TrueFlow® (trademark conflict)

### Dual Meaning
| Layer | Meaning |
|-------|---------|
| Written | True + Flow → "Your True Financial Flow" |
| Spoken | True + Flow → "Your True Financial Flow" |

### Taglines
- Primary: *"Your true financial flow."*
- Personal (individual and family): *"The AI that remembers so you don't have to."*
- Universal: *"Your money. Your clients. Your life. One AI."*
- Action: *"Scan. Track. Plan."*
- Trust: *"The truth about your money."*

### Positioning — The Sweet Center

TrueFlow is NOT positioned as "a financial app for SMEs only."
TrueFlow is positioned as a PERSONAL AI ASSISTANT that happens to
be extraordinarily good at money, clients, reminders, and deadlines.

The sweet center between Memorae (personal reminders) and a business
CRM is this: TrueFlow remembers everything important so you never
have to. Whether "important" means your VAT deadline, your mother's
birthday, your client's outstanding balance, or your transport budget.

Target feeling: "I will never lose track of anything important again."

The three audiences speak to the same product through different lenses:
  Individual: "Remind me about Mama's birthday. Track my spending."
  Family: "Shared budget. Everyone's expenses in one place."
  Business: "Clients, projects, income, staff, all organized."

Never lead copy with "for small businesses" as the first phrase.
Lead with the personal, universal feeling. The business capability
is discovered, not announced. This is how Memorae works and why
their product feels approachable to people who would never describe
themselves as "a business owner needing financial software."

### Social Media Voice and Captions

The approved tone for all social media content:

OPTION 1 — The conversation starter (best for Instagram first post)
"What if you never had to remember another deadline, payment,
or bill again? TrueFlow's AI tracks your money, reminds you
what matters, and manages your clients. All by chatting on
WhatsApp. For you. For your family. For your business."

OPTION 2 — The relatable list (best for TikTok, most shareable)
"Most people: track expenses in a notebook, chase client
payments on WhatsApp, forget deadlines until it's too late.
TrueFlow people: one AI handles all of it. Automatically."

OPTION 3 — Meet Tello (best for introducing the AI persona)
"Meet Tello. Your personal AI that remembers your money, your
clients, and your reminders so you don't have to. Birthday
coming up? Tello knows. Client owes you money? Tello knows.
VAT due next week? Tello knows."

OPTION 4 — Ultra short punchy (best for X / stories)
"Your personal AI assistant. Tracks your money. Reminds you
what matters. Manages your clients. Simple. Smart. On WhatsApp."

Approved hashtags:
Primary: #TrueFlow #Tello #AIAssistant #Nigeria
Secondary: #PersonalFinance #SmallBusiness #AfricanFintech
Avoid leading with: #SME #B2B #Fintech (too corporate for first impression)

### Logo — Current Status

**TEMPORARY LOGO IN USE**: gradient orb, off-center radial glow,
Electric Violet core blending into Mint Verify edge, asymmetric
composition (glow shifted up-left of center for a more dynamic,
less static feel). Transparent background, 1024x1024px PNG.
File: trueflow_logo_concept3_offcenter.png

This is a placeholder logo for early Founders Edition launch,
social media profiles, and WhatsApp Business Profile photo. It is
NOT the final brand mark. Use this exact file everywhere a logo is
needed right now: Instagram, TikTok, X profile photos, WhatsApp
Business Profile, favicon, app icon placeholder, Tello's avatar in
the chat bubble.

The final logo concept below (interlocking TF letterform) remains
the long-term design direction to revisit and properly vectorize
once the brand is ready for a permanent identity.

### Logo — Final Concept (Not Yet Built, Future Direction)
- Mark: Geometric interlocking TF letterform inside a rounded square
- T shape: vertical stem + crossbar (white on violet)
- F shape: offset below T, sharing the crossbar as its top bar (white, slightly transparent)
- Teal bubble: bottom-right of the mark, contains a checkmark — means "verified / true"
- Wordmark: "True" in serif white · "Flow" in Electric Violet · "TRUE FLOW" in small caps below
- The wave (flow line) replaces the word "Flow" in the logotype — it IS the word

### Brand Colours
| Name | Hex | Usage |
|------|-----|-------|
| Electric Violet | `#6C63FF` | Primary — buttons, CTAs, "Flow" wordmark, icon bg |
| Mint Verify | `#00D4AA` | Logo checkmark, success states, verified receipts |
| Rich Black | `#0A0A0F` | Dark backgrounds, primary text on light |
| Cloud White | `#F5F5F7` | Light backgrounds, cards |
| Alert Red | `#FF6B6B` | Errors, overdue, failed payments |
| Warn Amber | `#FFB545` | Budget warnings, approaching deadlines |
| WhatsApp Green | `#25D366` | Always use this exact hex for WhatsApp channel badges |

### Channel Badges (always use these exact styles)
- `via WhatsApp` → bg: rgba(37,211,102,0.1), text: #25D366
- `via Web` → bg: rgba(108,99,255,0.1), text: #6C63FF
- `via App` → bg: rgba(255,181,69,0.1), text: #FFB545

### Typography
| Role | Font | Weight |
|------|------|--------|
| Display / Logo | Georgia, Playfair Display, serif | 700 |
| UI Headings | Space Grotesk, system-ui | 600–700 |
| Body / UI | Inter, DM Sans, system-ui | 400–500 |
| Labels | Syne, system-ui | 600–700 |
| Numbers / Data | JetBrains Mono, monospace | 400–500 |

### Brand Voice
- Warm and direct — smart friend who is also an accountant
- Honest — if spending is a problem, say so clearly but kindly
- Concise — never more words than needed
- Nigerian-aware — supports Pidgin English in the bot
- Amounts: always ₦1,500 not ₦1500 · Dates: "14 June 2025" not "06/14/25"

---

## Claude Code Instructions

When I ask you to build something:
1. Always read this CLAUDE.md first
2. Read the relevant /docs/ spec file for detail
3. TypeScript everywhere — no plain JavaScript
4. async/await only — no callbacks or .then() chains
5. Always destructure Supabase: `const { data, error } = await supabase...`
6. Always check error: `if (error) throw new Error(error.message)`
7. Never hardcode API keys — use environment variables only
8. Never use supabase service_role_key in client-side/browser code
9. Add a JSDoc comment at the top of every file describing what it does
10. Keep functions small and single-purpose
11. Log errors with context: `console.error('functionName failed:', err)`
12. Chat model: claude-haiku-4-5-20251001
13. Vision/scanning model: claude-opus-4-6
14. `clients` = people who pay YOU. `org_members` = YOUR staff.
15. `receipts` = YOUR expenses out. `client_payments` = money IN from clients.
16. `balance_due` is a generated column on projects — never update it directly
17. Always verify Paystack webhook signature before processing
18. Use TrueFlow brand colours from this file for any UI components built
19. When in doubt about a feature, ask before building the wrong thing

---

## Smart Transfer Recognition — Core Feature Spec

### What It Is

Smart Transfer Recognition is TrueFlow's signature income-tracking feature.
When a client sends a payment proof (transfer screenshot) to an SME owner via
WhatsApp or Instagram, the owner forwards it to the TrueFlow WhatsApp bot.
The AI reads the screenshot, extracts all payment data, matches the sender to
an existing client or creates a new one, and logs the income automatically.

This is built specifically for Nigerian and African SMEs where:
- Clients always send payment proof via WhatsApp or Instagram after paying
- SME owners receive these screenshots but do nothing with them
- No record is kept, no tracking happens, money is lost in chat history
- TrueFlow turns every forwarded screenshot into a tracked income record

### Feature Name
- Technical name: Smart Transfer Recognition
- User-facing name: Smart Transfer Recognition
- WhatsApp bot trigger message: "📥 Payment proof received"
- Marketing line: "Forward it. We'll figure it out."

### Supported Screenshot Types
TrueFlow reads payment screenshots from ALL Nigerian banks and payment apps:

| Bank / App | What Claude reads |
|-----------|-----------------|
| GTBank | Amount, sender name, account, date, reference |
| Access Bank | Amount, sender, narration, date, transaction ID |
| Zenith Bank | Amount, from account, date, session ID |
| UBA | Amount, originator, date, reference |
| First Bank | Amount, sender, date, transaction ref |
| Opay | Amount, sender name, phone, date |
| Palmpay | Amount, sender name, date, transaction ref |
| Moniepoint | Amount, sender, date, reference |
| Kuda | Amount, sender, date, reference |
| Any bank | Claude reads whatever text is visible |

### Detection Logic — Income vs Expense
When an image arrives at the bot, Claude determines direction of money:

INCOMING (client paying owner) — signals:
- "Credit alert", "You have received", "Transfer credit"
- "We have credited your account", "Inflow", "CR"
- "Payment received", "Successful transfer to you"

OUTGOING (owner paying someone) — signals:
- "Debit alert", "Payment made", "You have paid"
- "POS purchase", "Transfer debit", "DR"
- "Receipt for purchase"

If ambiguous → always ask: "Is this money you received from a client,
or an expense you paid?" Never assume direction.

### Full Bot Conversation Flow

```
Owner forwards payment screenshot
            ↓
Claude Vision reads image → extracts:
{
  "detection": "incoming_payment",
  "amount": 150000,
  "currency": "NGN",
  "sender_name": "MARCUS ADEBAYO",
  "bank": "GTBank",
  "reference": "FT25067382910",
  "date": "2025-06-14",
  "narration": "Payment for website",
  "confidence": "high"
}
            ↓
Bot checks clients table for sender_name match
            ↓
    MATCH FOUND              NO MATCH
         ↓                       ↓
"✅ Payment received!      "📥 Payment received!
 ₦150,000 from             ₦150,000 from
 Marcus Adebayo            MARCUS ADEBAYO
 (GTBank)                  on 14 June 2025.

 Is this for an            I don't have a client
 existing project?         with this name.

 Reply YES — log it        Reply 1 — Create new
 to his account            client folder
 Reply NO — skip           Reply 2 — Match to
 Reply PROJECT — pick      existing client
 a specific project"       Reply 3 — Skip"
         ↓                       ↓
  Owner: YES              Owner: 1
         ↓                       ↓
"Which project?           "What is the client's
 1. Website design         full name or business
    Balance: ₦300,000      name?"
 2. Logo & branding
    Balance: ₦50,000"     Owner: "Marcus Adebayo
         ↓                 Ventures"
  Owner: 1                       ↓
         ↓                "✅ New client created:
"✅ Logged!               Marcus Adebayo Ventures

 Marcus Adebayo           What is this ₦150,000
 Website design           payment for?
 ₦150,000 received        Reply or type project
 Balance remaining:       name."
 ₦150,000

 Invoice updated.
 Web dashboard
 updated."
```

### What Happens in Supabase

On every successful Smart Transfer Recognition:

1. Insert into `client_payments`:
   - amount, currency, payment_date
   - sender_name (from screenshot)
   - bank (detected from screenshot)
   - payment_reference (from screenshot)
   - receipt_image_url (stored in Supabase Storage)
   - ai_transcript (full text Claude read)
   - payment_type: 'transfer'
   - client_id (matched or newly created)
   - project_id (if owner linked it)

2. Update `clients`:
   - total_earned += amount
   - outstanding_balance -= amount (if linked to project)
   - updated_at = now()

3. Update `projects` (if linked):
   - amount_received += amount
   - balance_due auto-updates (generated column)
   - If amount_received >= total_fee → suggest marking as completed

4. Update `invoices` (if linked):
   - If payment covers full remaining balance → status = 'paid', paid_at = now()
   - If partial → status stays 'sent', notes updated

5. Store image:
   - Path: `/client-receipts/{org_id}/{client_id}/{timestamp}.jpg`
   - Public URL saved to client_payments.receipt_image_url

6. Supabase Realtime fires:
   - Web app dashboard updates instantly
   - Mobile app updates instantly
   - Income widget shows new payment
   - Client folder shows updated balance

### Nigerian Bank Screenshot Storage Path
`/client-receipts/{org_id}/{client_id}/{YYYY-MM-DD}-{reference}.jpg`

### New Files Needed in Bot
- `transfer-detector.ts` — detects if image is incoming payment vs expense
- `bank-reader.ts` — bank-specific extraction logic for Nigerian banks
- Update `receipt-scanner.ts` — add incoming payment branch
- Update `message-handler.ts` — route to transfer-detector first

### Claude Vision Prompt for Transfer Screenshots

```typescript
const TRANSFER_PROMPT = `
You are reading a Nigerian bank transfer screenshot or payment proof.
Extract all visible information and return ONLY valid JSON:
{
  "detection": "incoming_payment" | "outgoing_payment" | "unknown",
  "amount": number,
  "currency": "NGN" (or detected currency),
  "sender_name": "string or null",
  "recipient_name": "string or null",
  "bank": "detected bank name or null",
  "payment_reference": "string or null",
  "transaction_id": "string or null",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "narration": "string or null",
  "account_number": "last 4 digits only or null",
  "confidence": "high | medium | low"
}

Nigerian banks to recognise: GTBank, Access Bank, Zenith Bank, UBA,
First Bank, Opay, Palmpay, Moniepoint, Kuda, Stanbic, Sterling,
Wema, FCMB, Polaris, Union Bank, Providus, Jaiz.

If the screenshot is not a payment proof, set detection to "unknown".
`
```

### UI Labels Across All Channels

| Context | Label |
|---------|-------|
| WhatsApp bot reply | "📥 Payment proof received" |
| Web app section | Income → Payments Received |
| Web app column | "Transfer In" channel badge |
| Client folder tab | "Payment History" |
| Dashboard widget | "Recent Transfers In" |
| Mobile home screen | "Income" quick stat |
| Receipt detail | "Proof of Payment" image |
| Feature name in settings | "Smart Transfer Recognition" |
| Onboarding tooltip | "Forward any payment proof to this number" |

### Transfer In Channel Badge
- Label: `Transfer In`
- Background: rgba(0,212,170,0.1)
- Text colour: #00D4AA (Mint Verify)
- Different from expense receipts which use channel badges (WhatsApp/Web/App)

### Marketing Copy for This Feature

Headline: "Forward it. We'll figure it out."
Sub: "When clients send you payment proof on WhatsApp, forward it to TrueFlow.
     We read the screenshot, find the client, and update your books automatically.
     Works with every Nigerian bank."

Feature card title: "Smart Transfer Recognition"
Feature card desc: "Forward any client payment screenshot to TrueFlow on WhatsApp.
                   We read the amount, match the client, and log the income instantly
                   — visible on your web app and mobile in seconds."

### Business Rules for Smart Transfer Recognition

1. Always store the original screenshot image — never discard it
2. Never auto-create a client without owner confirmation
3. Never auto-link to a project without owner confirmation
4. If confidence is "low" → show extracted data and ask owner to confirm each field
5. If sender_name matches multiple clients → show list and ask owner to pick
6. Partial name matches (e.g. "MARCUS" matches "Marcus Adebayo") → show suggestion
7. After logging → always show updated project balance and outstanding amount
8. If payment exceeds project balance → ask owner: "This payment of ₦X exceeds the
   remaining balance of ₦Y. Is this for a different project or a new engagement?"
9. Store bank name in payment record — useful for future bank-specific parsing improvements
10. Instagram screenshots: owner saves image from Instagram and forwards to WhatsApp bot
    — same flow, same detection. No special handling needed.

---

## Seamless Onboarding Flow — Core UX Spec

### Philosophy
The first conversation IS the onboarding. There is no signup screen, no form,
and no app to download before getting value. The user's first message creates
their account. Their second message (a receipt photo) delivers the product's
core value. Everything else happens later and is optional.

Phone number is the account ID. No password, no email required to use the
WhatsApp bot. Web and mobile login use OTP sent to the same WhatsApp number.

### Step-by-Step Flow

1. **Discovery** — user sees a wa.me link on the landing page, Instagram bio,
   or shared by a friend. No signup form anywhere yet.

2. **First contact** — tapping the link opens WhatsApp with a pre-filled
   message. User just taps send.
   ```
   wa.me/234XXXXXXXXX?text=Hi%2C%20I%20want%20to%20start%20with%20TrueFlow
   ```

3. **Auto-registration** — the moment the message arrives, the bot checks
   `whatsapp_sessions` for that phone number. If not found, creates in the
   background (user never sees this happen):
   - `profiles` row (phone number only)
   - `organizations` row (plan = 'free', name = 'Unnamed' temporarily)
   - `org_members` row (role = 'owner')
   - `whatsapp_sessions` row (is_new = true)

4. **Two-question micro-onboarding** — conversational, not a form:
   - Q1: "What should I call your business?" → updates `organizations.name`
   - Q2: "Is this for your business, family, or personal?" → updates
     `organizations.type` ('sme' | 'family' | 'individual')

5. **Immediate first win** — bot asks for a receipt photo right there in the
   same conversation. First scan happens inside onboarding, not after it.

6. **Soft upgrade prompt** — after first successful scan, bot sends a one-time
   link to the web dashboard using the same phone number. No password creation.

7. **Ongoing use** — WhatsApp itself is the authentication layer. No further
   "login" ever required on WhatsApp. Web/mobile use OTP tied to the same number.

### Exact Conversation Script

```
User: Hi, I want to start with TrueFlow

Bot: 👋 Welcome to TrueFlow!

     I'm your AI assistant for tracking money,
     in and out. Before we start, what should
     I call your business? (Or just your name
     if this is personal.)

User: Marcus Ventures

Bot: Got it, Marcus Ventures ✅

     Quick one, is this for:
     1️⃣ My business
     2️⃣ My family
     3️⃣ Just me, personal

User: 1

Bot: Perfect. Last thing, send me a photo of
     any receipt, or a payment screenshot a
     client sent you. I'll show you exactly
     what I can do.

[User sends a receipt photo]

Bot: ✅ Got it!

     🏪 Shoprite Lekki
     💰 ₦24,500
     📂 Food & Supplies
     📅 14 June 2025

     That's it. Every receipt from now on
     works the same way.

     Want to see this on a full dashboard too?
     👉 app.gettrueflow.com/login?phone=234XXX
     (Tap, no password needed)
```

### Web/Mobile Passwordless Login Flow

```
User taps link from WhatsApp
  → app.gettrueflow.com/login?phone=2348012345678
  → Web app checks if a profile exists for this phone number
  → YES: sends a 6-digit OTP to that same WhatsApp number via the bot
  → "Your TrueFlow code: 482917"
  → User enters the 6 digits on the web page
  → Logged in, full dashboard, same data already built up on WhatsApp
```

No email. No password. The OTP arrives on WhatsApp, the same app the user
is already inside. This matches existing Nigerian fintech behaviour (Opay,
Palmpay) instead of fighting it.

### Staff Onboarding Flow

```
Owner on web app: Team → Invite Staff → enters Ibrahim's phone number
  ↓ Immediately on Ibrahim's WhatsApp ↓

Bot: 👋 Hi Ibrahim! Marcus Ventures has added
     you to their TrueFlow team.

     Send me photos of receipts and I'll log
     them straight to the business account.

     Reply START to begin.

Ibrahim: START

Bot: ✅ You're in. Go ahead and send your
     first receipt whenever you're ready.
```

Staff never download anything, never create a password, never see a signup
form. Productive in two messages.

### Business Rules for Onboarding

1. Never show a traditional signup form anywhere in the WhatsApp flow
2. The bot creates the `organizations` row with a placeholder name immediately
   on first contact, then updates it once the user answers Q1
3. Micro-onboarding is exactly 2 questions, never more, before asking for
   the first receipt
4. The first receipt scan happens DURING onboarding, not after it, this is
   the "aha moment" and must not be delayed
5. Web/mobile login always uses OTP via WhatsApp, never email/password as
   the primary method (email/password can exist as a fallback only)
6. OTP codes expire in 10 minutes and are single use
7. Staff added via web/mobile trigger an immediate WhatsApp welcome message,
   never a generic invite link requiring app download
8. `whatsapp_sessions.is_new` flips to false only after the first receipt
   scan is completed, not after the welcome message alone
9. If a user messages the bot before completing the 2-question flow, the bot
   gently returns to the unanswered question rather than processing other
   commands
10. Time to first value target: under 60 seconds from first message to first
    successful receipt scan confirmation

### New Files Needed for Onboarding

Add to `/bot/src`:
- `onboarding-service.ts` — tracks onboarding state, asks the right next
  question, marks completion
- Update `user-service.ts` — `getOrCreateUser()` must create the placeholder
  organization on first contact, not wait for the name
- Update `message-handler.ts` — check onboarding state before routing to
  normal AI assistant flow

Add to `/web/app/auth`:
- `/login/page.tsx` — phone number input, triggers OTP send
- `/login/verify/page.tsx` — 6-digit OTP input, verifies and creates session
- `/api/auth/send-otp/route.ts` — generates OTP, sends via WhatsApp bot API call
- `/api/auth/verify-otp/route.ts` — validates OTP, creates Supabase session

### New Supabase Table for OTP

```sql
create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  code text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used boolean default false,
  created_at timestamptz default now()
);

create index on otp_codes (phone_number, code, used);
```

---

## Architecture Clarification — One Number, Many Private Accounts

### The Core Concept

TrueFlow does NOT give each user their own WhatsApp bot or dedicated number.
There is exactly ONE TrueFlow WhatsApp Business number that every user, on
every plan, messages. Personalization happens entirely through phone number
lookup on the backend, never through separate infrastructure per user.

This is intentional and is NOT a limitation to work around later, it is the
correct architecture. One number means one Twilio webhook, one bill, one
thing to maintain. It also means zero setup burden on the user, no separate
number to save, no per-user configuration step, ever.

### How "Personal" Identity Actually Works

Every incoming WhatsApp message carries the sender's phone number
automatically (provided by Twilio/Meta on every webhook payload). This
phone number is the ONLY identifier needed. The bot's first action on
every single incoming message, with no exceptions, is:

```
1. Extract sender's phone number from the webhook payload
2. Look up that phone number in whatsapp_sessions
3. Found  → load the matching profile + organization, respond
            with THIS person's data only
4. Not found → trigger onboarding flow (see Seamless Onboarding
              Flow section above), create the chain on first contact
```

This lookup happens on every message, not just the first one. There is no
"login" step on WhatsApp ever, because the phone number itself functions
as a permanent, unforgeable username for as long as that conversation
channel exists.

### Why Users Experience This as "My Own Bot"

Two different users, Marcus and Jennifer, can message the exact same
TrueFlow number within minutes of each other and never see one another's
data, because every reply is generated AFTER the phone-number lookup pulls
only that sender's organization, receipts, budgets, and conversation
history. The shared infrastructure is invisible to them. What they
experience is a private assistant that already knows their business name,
their spending history, and their open projects, because functionally,
for everything that matters to them, it is private.

```
Marcus (phone A) → "How much did I spend this month?"
  → bot looks up phone A → loads Marcus's org_id
  → replies using ONLY Marcus's receipts

Jennifer (phone B) → "How much did I spend this month?"
  → bot looks up phone B → loads Jennifer's org_id
  → replies using ONLY Jennifer's receipts

Same number. Same bot process. Completely separate data, always.
```

### Staff Members Use the Same Number Too

Staff are never given their own bot or asked to message a different
number. They message the exact same shared TrueFlow number. The
difference is in what the lookup finds:

```
Owner invites Ibrahim by phone number from the web app
  → creates an org_members row linking Ibrahim's phone
    number to the OWNER's organization, role = 'staff'

Ibrahim messages the shared TrueFlow number
  → bot looks up Ibrahim's phone number
  → finds an org_members row pointing to Marcus Ventures
  → Ibrahim's receipts are filed under Marcus Ventures,
    NOT under a new personal organization for Ibrahim
```

A phone number can belong to at most one organization as 'owner', but can
be linked to multiple organizations as 'staff' if someone genuinely works
for more than one business, this should be handled gracefully, see
Business Rules below.

### Business Rules for Phone Number Identity

1. Phone number is the single source of truth for WhatsApp identity, never
   ask a user to "register" or "set up" anything beyond their first message
2. Every bot response handler must resolve the sender's organization via
   phone number lookup BEFORE generating any reply, no exceptions
3. Never cache or assume identity across messages without re-checking,
   always look up fresh, a number could theoretically be reassigned by a
   telecom provider over a long time horizon
4. If a phone number is linked to more than one organization (staff at
   multiple businesses), and the bot cannot determine which one a message
   is for, ask explicitly: "Are you logging this for Marcus Ventures or
   for Jennifer Designs?" rather than guessing
5. Web and mobile login (the OTP flow documented above) uses this same
   phone number as the identity bridge, this is WHY OTP-via-WhatsApp works,
   the number is already the verified account key on both sides
6. Never expose one user's data to another user's session under any
   circumstance, even staff and owner sharing an organization must respect
   role-based RLS policies already defined in the schema
7. At very high message volume, a single shared WhatsApp Business number
   has real throughput limits that are a property of the underlying
   WhatsApp Business Platform itself, not specific to Twilio, revisit
   scaling strategy (see BSP migration note) well before this becomes
   a bottleneck, not after

### What This Means for Claude Code

When building or modifying any WhatsApp bot handler, always assume:
- The incoming webhook payload's phone number is the ONLY trustworthy
  identity signal
- `getOrCreateUser(phoneNumber)` (already specced above) must be called
  at the start of every message handling path, including this lookup is
  not optional or skippable for "simple" commands
- Never design a feature that requires a user to have or remember a
  separate TrueFlow-specific identifier, username, or PIN, for WhatsApp
  specifically, the phone number IS the identifier, permanently

---

## Closing the Gap — CRM-via-WhatsApp Completion Path

### Why This Section Exists

CLAUDE.md and docs/whatsapp-bot.md already fully specify the CRM capability,
clients, projects, Smart Transfer Recognition. What is documented and what
is actually wired into the running bot are two different things at this
stage of the build. This section is the exact, ordered sequence to close
that gap. This is NOT a redesign. Every piece referenced below already has
a home in the existing schema and file structure. This is a completion
checklist, not a new architecture.

### How to Tell If a Step Is Already Done

Before running any step below, check the actual file or table first. Do
not rebuild something that already exists correctly. Each step states
exactly what to check and what "done" looks like.

---

### Step 1 — Confirm the CRM Tables Exist in Supabase

**Check**: Run this in Supabase SQL Editor:
```sql
select table_name from information_schema.tables
where table_name in ('clients', 'projects', 'client_payments');
```

**Done looks like**: All three table names returned.

**If missing**: Run the full `clients`, `projects`, `client_payments` table
definitions from the "Complete Database Schema" section above, including
the RLS policies. Do not skip the RLS policies, skipping them means any
authenticated user could read any organization's client data.

---

### Step 2 — Confirm the Two Supabase RPC Functions Exist

**Check**:
```sql
select routine_name from information_schema.routines
where routine_name in ('increment_client_earned', 'increment_project_received');
```

**Done looks like**: Both function names returned.

**If missing**: Run the two `create or replace function` blocks already
documented in docs/whatsapp-bot.md under "Supabase RPC Functions Needed."

---

### Step 3 — Build the Missing Service Files in /bot/src

Check each file individually. Do not assume all-or-nothing, build only
what is actually missing.

| File | Spec location | What "exists" means |
|------|---------------|---------------------|
| `client-service.ts` | Referenced in file list, needs full implementation | Exports `getOrCreateClient`, `findClientByName`, `updateClientBalance` |
| `project-service.ts` | Referenced in file list, needs full implementation | Exports `createProject`, `getProjectsByClient`, `updateProjectReceived` |
| `client-payment-service.ts` | Referenced in file list, needs full implementation | Exports `recordClientPayment`, links to `clients` and `projects` |
| `transfer-detector.ts` | Fully specced in docs/whatsapp-bot.md | Exports `detectImageType` |
| `bank-reader.ts` | Fully specced in docs/whatsapp-bot.md | Exports `readBankTransfer` |
| `smart-transfer-service.ts` | Fully specced in docs/whatsapp-bot.md | Exports `findClientMatch`, `logClientPayment` |

**client-service.ts implementation** (this is the piece not yet written
out in full anywhere, write it now):
```typescript
// client-service.ts
// Creates, finds, and updates clients (people who pay the org owner).
// Distinct from org_members, which are the org owner's own staff.

import { supabase } from './supabase'

export async function getOrCreateClient(params: {
  orgId: string
  name: string
  phone?: string
  email?: string
  createdVia?: 'whatsapp' | 'web' | 'mobile'
}) {
  const { orgId, name, phone, email, createdVia } = params

  const existing = await findClientByName(orgId, name)
  if (existing) return existing

  const { data, error } = await supabase
    .from('clients')
    .insert({
      org_id: orgId,
      name,
      phone: phone || null,
      email: email || null,
      created_via: createdVia || 'whatsapp'
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function findClientByName(orgId: string, name: string) {
  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('org_id', orgId)
    .ilike('name', name)
    .eq('status', 'active')
    .maybeSingle()

  return data
}

export async function updateClientBalance(clientId: string, deltaEarned: number, deltaOutstanding: number) {
  const { error } = await supabase.rpc('increment_client_earned', {
    p_client_id: clientId,
    p_amount: deltaEarned
  })
  if (error) throw new Error(error.message)
}

export async function getClientsByOrg(orgId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('outstanding_balance', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}
```

**project-service.ts implementation** (write this now, same status as above):
```typescript
// project-service.ts
// Creates and tracks projects belonging to a client.
// balance_due is a generated column, never set it directly.

import { supabase } from './supabase'

export async function createProject(params: {
  orgId: string
  clientId: string
  name: string
  totalFee: number
  deadline?: string
  currency?: string
}) {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      org_id: params.orgId,
      client_id: params.clientId,
      name: params.name,
      total_fee: params.totalFee,
      currency: params.currency || 'NGN',
      deadline: params.deadline || null,
      status: 'in_progress'
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Auto-create the 5 deadline reminders if a deadline was set
  if (params.deadline) {
    await createProjectReminders(data.id, params.orgId, params.name, params.deadline)
  }

  return data
}

export async function getProjectsByClient(clientId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('client_id', clientId)
    .order('deadline', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

export async function updateProjectReceived(projectId: string, amount: number) {
  const { error } = await supabase.rpc('increment_project_received', {
    p_project_id: projectId,
    p_amount: amount
  })
  if (error) throw new Error(error.message)
}

async function createProjectReminders(projectId: string, orgId: string, projectName: string, deadline: string) {
  const deadlineDate = new Date(deadline)
  const sevenBefore = new Date(deadlineDate); sevenBefore.setDate(sevenBefore.getDate() - 7)
  const threeBefore = new Date(deadlineDate); threeBefore.setDate(threeBefore.getDate() - 3)

  await supabase.from('reminders').insert([
    { org_id: orgId, project_id: projectId, title: `${projectName} due in 7 days`, due_date: sevenBefore.toISOString().split('T')[0], category: 'project_deadline' },
    { org_id: orgId, project_id: projectId, title: `${projectName} due in 3 days`, due_date: threeBefore.toISOString().split('T')[0], category: 'project_deadline' },
    { org_id: orgId, project_id: projectId, title: `${projectName} delivery due TODAY`, due_date: deadline, category: 'project_deadline' }
  ])
}
```

**Done looks like**: All six files exist in `/bot/src`, each exports the
functions listed in the table above, `npm run build` (or `tsc --noEmit`)
completes with no type errors referencing these files.

---

### Step 4 — Wire message-handler.ts to Actually Route to the CRM Flow

**Check**: Open `/bot/src/message-handler.ts`. Search for `detectImageType`.

**Done looks like**: It is imported and called BEFORE any call to
`scanReceiptImage`. The current known-broken state, confirmed by the
bot's own reply ("I don't yet support tracking client payments"), is
that this check is either missing entirely or every image falls through
to the expense-only branch regardless of what it actually contains.

**The corrected flow** (already written in full in docs/whatsapp-bot.md
under "Updated message-handler.ts Flow for Smart Transfer Recognition",
apply it exactly as specced there):
```
hasImage && mediaUrl
  → download image
  → detectImageType() FIRST, always, no exceptions
  → type === 'incoming_payment'  → Smart Transfer Recognition branch
  → type === 'expense_receipt'   → existing receipt-scanner.ts branch
  → type === 'unknown'           → ask the owner which it is, never guess
```

---

### Step 5 — Expand ai-assistant.ts's System Prompt

**Check**: Open `/bot/src/ai-assistant.ts`, read the `SYSTEM_PROMPT` constant.

**Done looks like**: The prompt describes ALL current capabilities, not
just expense tracking. If it contains language limiting the AI to
expenses only, or omits any mention of clients, projects, or Smart
Transfer Recognition, that is the literal cause of the bot replying
"I don't yet support that," the AI is accurately describing its own
incomplete instructions, not a separate bug.

**Add to the system prompt**, alongside the existing budget and reminder
ACTION tags already documented:
```
ACTION:CREATE_CLIENT:{name}
ACTION:CREATE_PROJECT:{clientName}:{projectName}:{totalFee}:{deadline}
ACTION:LOG_PAYMENT:{clientName}:{amount}:{projectName}
```

And add this capability description to the prompt body:
```
You also help track client relationships and project income. When the
user mentions a new client, a project with a fee, or forwards a payment
screenshot, you can create client records, track project balances, and
log payments. Always confirm before creating a new client or project,
never assume, ask first if anything is ambiguous.
```

---

### Step 6 — Update action-executor.ts to Handle the New Actions

**Check**: Open `/bot/src/action-executor.ts`. Confirm the `switch`
statement includes cases for `CREATE_CLIENT`, `CREATE_PROJECT`, and
`LOG_PAYMENT`, calling the service files built in Step 3.

```typescript
case 'CREATE_CLIENT': {
  const [, name] = action.split(':').slice(1)
  await getOrCreateClient({ orgId: user.org_id, name, createdVia: 'whatsapp' })
  break
}
case 'CREATE_PROJECT': {
  const [, clientName, projectName, fee, deadline] = action.split(':')
  const client = await findClientByName(user.org_id, clientName)
  if (client) {
    await createProject({
      orgId: user.org_id,
      clientId: client.id,
      name: projectName,
      totalFee: parseFloat(fee),
      deadline: deadline || undefined
    })
  }
  break
}
case 'LOG_PAYMENT': {
  const [, clientName, amount, projectName] = action.split(':')
  const client = await findClientByName(user.org_id, clientName)
  if (client) {
    const projects = await getProjectsByClient(client.id)
    const project = projects.find(p => p.name === projectName)
    await updateProjectReceived(project?.id, parseFloat(amount))
    await updateClientBalance(client.id, parseFloat(amount), 0)
  }
  break
}
```

---

### Step 7 — End-to-End Verification, the Exact Test Sequence

Run these four messages against the live bot, in this exact order, on a
single test phone number. Each one verifies a different layer of the
stack actually connecting.

```
Test 1, plain language client + project creation
Send: "New client Marcus Adebayo, website project, 
       fee 450000, due July 30"
Expect: bot confirms client created, project created, 
        reminders scheduled
Verifies: ai-assistant.ts → action-executor.ts → 
          client-service.ts + project-service.ts

Test 2, forward a real Nigerian bank transfer screenshot
Send: [GTBank or Opay payment confirmation image]
Expect: bot identifies it as incoming, attempts to 
        match "Marcus Adebayo" or asks to confirm
Verifies: transfer-detector.ts → bank-reader.ts → 
          smart-transfer-service.ts

Test 3, confirm the payment logs correctly
Reply: "YES, website project"
Expect: bot confirms amount logged, shows updated 
        balance remaining
Verifies: action-executor.ts LOG_PAYMENT → Supabase 
          RPC functions actually update the row

Test 4, query the result back
Send: "What's outstanding from Marcus?"
Expect: bot replies with the correct remaining balance, 
        matching what Test 3 should have produced
Verifies: the full loop, write path and read path 
          both hitting the same data correctly
```

**This sequence is the actual definition of "done."** Documentation being
complete is not the finish line, all four of these messages working
correctly, in order, on a real phone number, is.

---

### What NOT to Do During This Completion Pass

Do not rewrite `ai-assistant.ts`'s conversational tone, persona, or
formatting rules, those are correct and unrelated to this gap. Do not
add new database tables, none are needed, `clients`, `projects`, and
`client_payments` already cover this completely. Do not skip Step 7,
a feature that compiles but has not been run through the four-message
test sequence on a real number is not confirmed working, it is only
confirmed written.

---

## Backend Admin Panel — Super Admin Spec

### Why This Exists

Beyond a certain scale, managing TrueFlow purely through raw SQL in the
Supabase dashboard becomes genuinely risky, one wrong WHERE clause in
production can delete the wrong organization's data with no record of
what happened or who did it. This section specifies a protected admin
section inside the existing /web app, NOT a separate product, reusing
the same Next.js project, same Supabase backend, same auth, gated by a
platform-wide super admin role that no regular user can ever reach.

This is for the founder (and later, possibly a small support team) to
manage the system: see how many users exist, suspend accounts, override
plans manually, and have an auditable record of every admin action taken.

### Core Principle — Suspend, Never Delete

The admin panel must NEVER implement a hard delete of user or
organization data in this version. A misclick on "delete" should never
be catastrophic and unrecoverable. The pattern used everywhere in this
panel is soft suspension: set a status flag, hide from normal views,
keep the underlying data intact and recoverable. This mirrors the
existing `clients.status = 'archived'` pattern already in the schema,
applied at the organization level too.

### Database Changes

```sql
-- Add platform-wide super admin flag, separate from org-level roles
-- (owner/admin/staff/accountant on org_members apply to a single
-- organization, this is platform-wide and unrelated)
alter table profiles add column if not exists is_super_admin boolean default false;

-- Add suspension status to organizations
alter table organizations add column if not exists status text default 'active';
-- status: 'active' | 'suspended'

-- Full audit trail of every admin action taken
create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references profiles(id),
  action text not null,
  -- action examples: 'suspend_org' | 'reactivate_org' | 'change_plan'
  target_table text,
  target_id uuid,
  details jsonb,
  -- details example: {"old_plan": "free", "new_plan": "sme_pro"}
  created_at timestamptz default now()
);

alter table admin_audit_log enable row level security;

create policy "Only super admins read audit log"
  on admin_audit_log for select using (
    exists (select 1 from profiles where id = auth.uid() and is_super_admin = true)
  );

create policy "Only super admins write audit log"
  on admin_audit_log for insert with check (
    exists (select 1 from profiles where id = auth.uid() and is_super_admin = true)
  );
```

Setting the first super admin is a one-time manual operation, never
exposed in any UI:
```sql
update profiles set is_super_admin = true where phone = 'YOUR_PHONE_NUMBER';
```

### Protected Route Structure

```
/web/app/admin/
  layout.tsx          ← server-side check: is_super_admin = true or 
                         redirect to /dashboard, never trust client-side 
                         checks alone for this gate
  /users
    page.tsx           ← searchable table of all users/organizations
    /[id]
      page.tsx         ← detail view + Suspend/Reactivate/Change Plan
  /stats
    page.tsx           ← total users, paying users by plan, signups 
                         this week, messages sent today
  /audit-log
    page.tsx           ← searchable list of admin_audit_log, newest first
```

### Page Specifications

**/admin/users**
- Searchable table, search by phone number or organization name
- Columns: name, phone, organization, plan, status, signup date, last active
- Click a row to open `/admin/users/[id]`

**/admin/users/[id]**
- Full profile and organization detail
- Receipt count, client count, current plan
- Action buttons:
  - Suspend / Reactivate (toggles `organizations.status`)
  - Change Plan (manual override, see below)
  - View Audit History (filtered `admin_audit_log` for this org)

**/admin/stats**
- Total users, paying users broken down by plan
- New signups this week
- Messages sent today (if bot-side logging is available)

**/admin/audit-log**
- Every `admin_audit_log` row, newest first, searchable

### Suspension Behavior on the WhatsApp Bot

When `organizations.status = 'suspended'`, the bot must not process
messages normally. `message-handler.ts` needs an early check, before
any AI call or receipt scanning:
```typescript
if (user.organizations.status === 'suspended') {
  return buildTwiML(buildReply(
    'Your account is currently paused. Contact support@gettrueflow.com for help.'
  ))
}
```

### Audit Logging — Required on Every Admin Action

Every admin action (suspend, reactivate, plan change) must write to
`admin_audit_log` before or immediately after completing. Build one
reusable helper, never duplicate this logic across pages:

```typescript
// /web/lib/admin-audit.ts
import { supabase } from './supabase-server'

export async function logAdminAction(params: {
  adminId: string
  action: string
  targetTable?: string
  targetId?: string
  details?: Record<string, any>
}) {
  const { error } = await supabase.from('admin_audit_log').insert({
    admin_id: params.adminId,
    action: params.action,
    target_table: params.targetTable,
    target_id: params.targetId,
    details: params.details || {}
  })
  if (error) throw new Error(error.message)
}
```

Every suspend, reactivate, and plan change handler must call this
function. A plan change must log both the old and new plan value in
`details`, e.g. `{ old_plan: 'free', new_plan: 'sme_pro' }`.

### Build Order

1. Database changes (is_super_admin, organizations.status, admin_audit_log)
2. Manually set the first super admin via one-time SQL, never via UI
3. `/admin` layout.tsx with server-side role check
4. `logAdminAction()` helper in `/web/lib/admin-audit.ts`
5. `/admin/users` list page
6. `/admin/users/[id]` detail page with Suspend/Reactivate wired to
   audit logging from the start, not added later
7. Update `message-handler.ts` with the suspension check
8. `/admin/stats`
9. `/admin/audit-log`
10. Change Plan override control, last, once suspend/reactivate and
    audit logging are confirmed working end to end

### Business Rules

1. Never implement hard delete of users, organizations, receipts, clients,
   or payments anywhere in the admin panel
2. Every admin action without exception writes to `admin_audit_log`
3. `is_super_admin` is platform-wide and unrelated to `org_members.role`,
   never conflate the two, a super admin may not even belong to any
   organization themselves
4. The first super admin is always set manually via direct SQL, never
   through any application UI, this prevents a privilege-escalation bug
   from ever creating an unauthorized admin
5. Suspended organizations get a clear, polite message on WhatsApp, never
   silence or a generic error, the user should always know their account
   is paused and how to get help
6. Visual design priority for `/admin/*` pages is lower than customer-facing
   pages (dashboard, receipts, clients), functional clarity matters more
   than polish here

---

## Platform Compliance — WhatsApp Business API General-Purpose AI Ban

### What Changed and Why It Matters to TrueFlow Specifically

Effective January 15, 2026, Meta amended the WhatsApp Business Solution
Terms to prohibit general-purpose AI chatbots on the WhatsApp Business API.
This is a real, confirmed platform policy, not a rumor, reported directly
from Meta's own terms language and corroborated by multiple independent
sources. New API accounts were already subject to this rule starting
October 15, 2025.

The banned category: AI Providers offering large language models,
generative AI platforms, or general-purpose AI assistants where that
technology is the PRIMARY functionality being distributed through
WhatsApp, as determined by Meta in its sole discretion. The clearest
real-world examples are ChatGPT-on-WhatsApp and Perplexity's WhatsApp bot,
both of which let users ask about literally anything, the weather, code,
general knowledge, with WhatsApp acting purely as a distribution channel
for someone else's general AI product. Both shut down their WhatsApp
integrations ahead of the January 15 enforcement date.

The explicitly permitted category: structured, task-specific business
automation, a travel company managing bookings, a retailer sending order
updates, a restaurant confirming reservations, support bots, order bots,
booking bots. Meta's own stated reasoning, the WhatsApp Business API
exists to help businesses provide customer support and send relevant
updates, not to distribute general AI assistants, and open-ended chatbot
traffic generated high message volume without producing revenue through
the platform Meta itself controls.

### Where TrueFlow Sits, Honestly

TrueFlow's bot is not a general-purpose AI distribution play. Every
function it performs, receipt scanning, expense logging, client and
project tracking, budgets, reminders, is a structured task tied to a
specific business function, financial record-keeping for one organization's
own data. This is much closer to "a retailer sending order updates" than
to "ask me anything."

The real risk is not the product concept, it is implementation looseness.
Several independent compliance sources warn specifically that if a bot
"used to employ AI in the background to understand any user input," it
must be revamped to stay compliant, and that Meta evaluates this through
actual conversation logs and usage patterns, not declared intent alone.
Because `ai-assistant.ts` is built on Claude, a general-purpose LLM, and
historically allowed fully open natural-language input with no hard
topic boundary, this is a real gap, not a hypothetical one, and it has
already been closed in the SYSTEM_PROMPT (see docs/whatsapp-bot.md).

### What Was Changed in Response

`docs/whatsapp-bot.md`'s `SYSTEM_PROMPT` now opens with an explicit,
non-negotiable scope boundary stated before any personality or tone
guidance, and includes a fixed, predictable out-of-scope response pattern
the AI must use for any request outside receipt tracking, expense
management, client/project tracking, budgets, and reminders. This directly
implements the "standardized out-of-scope response" pattern that compliance
guidance recommends as best practice.

This also resolves a real internal contradiction the original prompt had:
"never say I cannot" was written as a blanket rule, but a true blanket
version of that rule actively works against the compliance requirement to
clearly decline out-of-scope requests. The corrected prompt scopes "never
say I cannot" to apply only within TrueFlow's actual financial functions,
where the AI should always find a helpful path forward, while requiring a
clear, polite, consistent redirect for anything genuinely outside scope.

### Business Rules — Platform Compliance

1. The AI must never attempt to partially answer an out-of-scope question
   before redirecting, partial engagement is itself a compliance risk, not
   just a UX inconsistency
2. The out-of-scope redirect must be consistent in structure every time,
   acknowledge the request briefly, state the boundary, offer one relevant
   in-scope suggestion, never vary this into a general apology or a lengthy
   policy explanation
3. Never expose the compliance reasoning to the end user in the bot's own
   reply, the redirect should read as natural product design, not as a
   visible legal disclaimer
4. Periodically review actual conversation logs in `whatsapp_conversations`
   for drift, specifically watching for users successfully getting the bot
   to engage with off-topic requests despite the scope boundary, this is
   the literal compliance check Meta itself is reported to perform
5. Any future feature that would let the AI engage in more open-ended
   conversation (general financial education content, casual chat) must be
   evaluated against this policy BEFORE being built, not after, since
   account suspension risk applies even to well-intentioned scope creep
6. This constraint applies only to the WhatsApp channel specifically. The
   web app's "TrueFlow Chat" concept (see relevant section above) and the
   mobile app are not subject to Meta's WhatsApp Business API terms and
   may reasonably support broader, more open-ended assistant behavior if
   that is ever desired, the restriction is channel-specific, not a
   product-wide limitation

### What This Does Not Affect

This policy does not restrict AI used in the background for structured
tasks like Smart Transfer Recognition's receipt reading, intent
classification for routing a message to the right service file, or
generating a budget alert message, all of these are task-specific AI
use within a defined business function, not general-purpose conversational
distribution, and are unaffected by this policy.

---

## TrueFlow Chat — Channel-Specific Scope Strategy

### The Core Decision

WhatsApp must stay narrow because Meta's WhatsApp Business API terms
require it (see "Platform Compliance" section above). That restriction
applies to WhatsApp specifically, not to TrueFlow's product philosophy
generally. Rather than treating this purely as a limitation to work
around, TrueFlow uses it as the basis for a deliberate two-tier assistant
strategy: a fast, transactional WhatsApp bot for in-the-moment tasks, and
a deeper, more reasoning-capable TrueFlow Chat inside the web app for
exploratory financial conversations. Full implementation spec lives in
docs/web-app.md under "TrueFlow Chat — Web-Native AI Assistant."

### The Split, At a Glance

| | WhatsApp Bot | TrueFlow Chat (web) |
|---|---|---|
| Governed by | Meta's WhatsApp Business API terms | No external platform restriction |
| Scope | Narrow: log, check, set, done | Wider: reasoning, trends, explanation, plus everything the bot does |
| Typical use moment | Standing at a market stall, 20 seconds | Sitting at a desk, reviewing the business |
| Still bounded by | TrueFlow's own scope (no general knowledge questions, no unrelated topics) | Same boundary, just drawn wider around financial reasoning |

### Why This Is a Real Product Decision, Not Just a Compliance Patch

The two channels are not "WhatsApp does less because it's worse," they
match the physical and mental context someone is actually in when they
reach for each one. A market trader forwarding a payment screenshot
between customers needs speed, not a conversation. The same person
reviewing their month-end numbers at home benefits from an assistant that
can reason, "why did spending spike in March," not just retrieve a number.

### The One Thing to Get Right As This Grows

If TrueFlow Chat becomes meaningfully more capable over time, the
WhatsApp bot's out-of-scope redirect must function as a bridge to it, not
a wall. The bot's redirect message links directly to `/chat` rather than
simply declining, so a user who hits the WhatsApp boundary is handed
somewhere useful, not left frustrated. See the exact redirect copy in
docs/web-app.md.

### Business Rules

1. TrueFlow Chat's system prompt is intentionally wider than the
   WhatsApp bot's, but it is NOT unbounded, it still does not answer
   general knowledge questions or topics unrelated to the user's own
   finances, see TRUEFLOW_CHAT_PROMPT in docs/web-app.md for the exact
   boundary language
2. Both prompts share the same ACTION tag system and call the same
   underlying service files (`client-service.ts`, `project-service.ts`,
   `budget-service.ts`, `reminder-service.ts`), never fork this logic
   between channels
3. Conversation history for TrueFlow Chat is stored separately
   (`web_chat_conversations`, keyed by `user_id`) from WhatsApp's
   `whatsapp_conversations` (keyed by `phone_number`), since a user may
   not have linked the same identity across both yet, do not assume
   they are the same conversation thread
4. Any future widening of TrueFlow Chat's scope must be evaluated on its
   own terms, more capability on web does not imply the WhatsApp bot's
   compliance boundary can also loosen, the two are governed by
   different constraints entirely

---

## Feature — Inventory Tracking

### Why Inventory Belongs in TrueFlow

TrueFlow currently covers two of the three things an SME needs to know
about their money: what they spend (receipts/expenses) and what clients
owe them (client payments/projects). The third is stock, how many units
of a product exist, what they cost to hold, and when they need restocking.
Without inventory, any SME that sells physical goods rather than pure
services cannot use TrueFlow as their single financial tool. This is a
genuine fourth pillar, not a nice-to-have, and it connects to the existing
receipt scanner naturally since a purchase of stock should create both a
receipt (expense out) and an inventory restock movement (units in).

Inventory is gated to SME Starter plan and above. Individual and Family
plans do not need it.

### New Database Tables

```sql
-- Inventory items, what the business stocks and sells
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  sku text,                        -- optional stock keeping unit code
  description text,
  quantity_on_hand numeric(12,2) default 0,
  unit_cost numeric(12,2),         -- what you paid per unit
  unit_price numeric(12,2),        -- what you sell it for
  currency text default 'NGN',
  low_stock_threshold numeric(12,2) default 5,
  -- when quantity_on_hand falls below this, trigger a reminder
  category text,                   -- optional grouping e.g. 'Electronics', 'Food'
  image_url text,
  status text default 'active',    -- 'active' | 'archived'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on inventory_items (org_id, status);
create trigger inventory_items_updated_at
  before update on inventory_items
  for each row execute function update_updated_at();

-- Every quantity change is logged here for full audit trail
create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  item_id uuid references inventory_items(id) on delete cascade,
  change_type text not null,
  -- 'restock' (units added) | 'sale' (units sold) | 'adjustment' (manual correction)
  quantity_change numeric(12,2) not null,
  -- positive for restock, negative for sale/adjustment
  quantity_after numeric(12,2) not null,
  -- snapshot of quantity_on_hand after this movement
  unit_cost_at_time numeric(12,2),
  -- cost per unit at the time of this movement
  reference_type text,
  -- 'receipt' | 'client_payment' | 'manual'
  reference_id uuid,
  -- optional: links to the receipt or client_payment that caused this
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index on inventory_movements (org_id, item_id, created_at desc);

-- RLS
alter table inventory_items enable row level security;
alter table inventory_movements enable row level security;

create policy "Org members see inventory"
  on inventory_items for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org admins manage inventory"
  on inventory_items for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );
create policy "Org members see movements"
  on inventory_movements for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
create policy "Org admins manage movements"
  on inventory_movements for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );
```

### Supabase RPC Function for Stock Updates

```sql
-- Atomically updates quantity_on_hand and logs the movement
create or replace function update_inventory_stock(
  p_item_id uuid,
  p_quantity_change numeric,
  p_change_type text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_notes text default null,
  p_created_by uuid default null
) returns void as $$
declare
  v_new_qty numeric;
  v_unit_cost numeric;
begin
  select quantity_on_hand, unit_cost
  into v_new_qty, v_unit_cost
  from inventory_items where id = p_item_id for update;

  v_new_qty := v_new_qty + p_quantity_change;

  if v_new_qty < 0 then
    raise exception 'Stock cannot go below zero';
  end if;

  update inventory_items
  set quantity_on_hand = v_new_qty, updated_at = now()
  where id = p_item_id;

  insert into inventory_movements (
    org_id, item_id, change_type, quantity_change, quantity_after,
    unit_cost_at_time, reference_type, reference_id, notes, created_by
  )
  select
    org_id, p_item_id, p_change_type, p_quantity_change, v_new_qty,
    v_unit_cost, p_reference_type, p_reference_id, p_notes, p_created_by
  from inventory_items where id = p_item_id;
end;
$$ language plpgsql security definer;
```

### New Service Files Needed

- `/bot/src/inventory-service.ts` — addItem, updateStock, getItems,
  getLowStockItems, called by action-executor when AI detects inventory
  intent
- `/web/lib/inventory-service.ts` — same logic for the web app API routes

### Bot Commands for Inventory

| User says | Bot does |
|-----------|---------|
| "Add 50 units of Ankara fabric at 2000 each" | Confirms item name and quantity, creates item if new, restocks if existing |
| "I sold 12 yards of Ankara today" | Confirms, decrements stock, asks if linked to a client sale |
| "What's my stock level?" | Lists all active items with quantities, flags low stock in red |
| "My [item] is running low" | Checks current level, suggests restocking, offers to set a reminder |
| "Remove 5 units of [item], damaged" | Asks for confirmation, logs as adjustment with note "damaged" |

### AI Detection Rules for Inventory Intent

The bot must distinguish inventory language from expense language since
both involve quantities and money:

Inventory signals (affects stock count):
- "I sold X units of", "we restocked", "received delivery of X"
- "how many do I have left", "stock level", "running low on"
- "sold out of", "add X to inventory"

Expense signals (affects budget, no stock change):
- "I bought", "I paid for", "I spent on"
- These create a receipt row, NOT an inventory movement

When ambiguous, always ask: "Was this a stock purchase to resell,
or a business expense for your own use?" Never guess.

### Business Rules for Inventory

1. Stock cannot go below zero, the RPC function enforces this at the
   database level, not just in application code
2. Every stock change, including AI-initiated ones, must confirm with the
   owner before writing, never silently adjust quantities
3. A sale that decrements stock should optionally link to a client_payment
   record if the sale was to a known client
4. A restock purchase should optionally link to a receipt record since it
   is also an expense
5. Low stock check runs after every sale movement, if quantity_on_hand
   falls below low_stock_threshold, create a reminder automatically
   using the existing reminder-service.ts
6. Inventory is plan-gated: SME Starter and above only

---

## Feature — Guided Client Setup (Conversational Onboarding for a New Client)

### What This Is

When a user expresses intent to create a new client, the AI should
recognize this and guide them through all related setup in one
conversational flow, confirming each step explicitly, rather than making
the owner navigate five separate pages or remember to do five separate
things. The goal is reducing the number of steps for things the user
clearly wants, NOT generating financial documents without being asked.

### The Correct Sequence (Explicit Confirmation at Every Step)

```
User: "New client Marcus Adebayo, website project, 450k, due July 30"
        ↓
Step 1 — Create the client
Bot: "Creating Marcus Adebayo as a new client. What's his phone
     number or email? (Reply SKIP to add later)"
User: "+2348012345678"
Bot: "✅ Marcus Adebayo added."
        ↓
Step 2 — Create the project
Bot: "Creating Website Project for Marcus, ₦450,000, due July 30.
     Is this the full project fee, or a deposit?"
User: "Full fee"
Bot: "✅ Project created. I've set reminders for 7 days before, 3
     days before, and on the delivery date."
        ↓
Step 3 — Outstanding balance
Bot: "Has Marcus paid anything yet, or is the full ₦450,000 still
     outstanding?"
User: "He paid a 150k deposit"
Bot: "✅ ₦150,000 recorded as deposit. Balance remaining: ₦300,000"
        ↓
Step 4 — Optional invoice
Bot: "Want me to generate an invoice for Marcus showing the full
     ₦450,000 with ₦150,000 received and ₦300,000 balance due?
     Reply YES or NO."
User: "YES"
Bot: "✅ Invoice created. Open your dashboard to review and send it.
     app.gettrueflow.com/invoices"
        ↓
Step 5 — End of flow, no more auto-generation
Bot: "Marcus Adebayo is set up. Here's the summary:
     • Client folder created
     • Website Project — ₦450,000 — due July 30
     • ₦150,000 received, ₦300,000 outstanding
     • 3 deadline reminders set
     • Invoice ready to send
     Reply CLIENTS to see all your clients."
```

### What Must NOT Be Auto-Created Without Asking

The following must NEVER be auto-generated at client creation time
without explicit confirmation per step in the conversation above:

- Budget (a budget is set for the owner's own categories, not per-client,
  and should only be created when the owner explicitly asks for one)
- Financial report (reports are generated on demand, not at creation time)
- Receipt (only created when money has actually changed hands and the
  owner confirms it)

The AI should only suggest these at the relevant moment in the
conversation, never create them silently. This directly implements our
existing business rules about confirming before creating financial records.

### New Action Tags for action-executor.ts

```typescript
ACTION:START_CLIENT_SETUP:{name}
// triggers the guided flow above

ACTION:GENERATE_INVOICE:{clientId}:{projectId}
// explicit owner request only, never auto-triggered

ACTION:UPDATE_INVENTORY:{itemName}:{quantityChange}:{changeType}
// restock | sale | adjustment — always with confirmation first
```

### Build Order for Both Features

1. Add inventory_items and inventory_movements tables to Supabase
2. Add update_inventory_stock RPC function
3. Build inventory-service.ts (bot and web versions)
4. Add ACTION:UPDATE_INVENTORY to action-executor.ts
5. Update ai-assistant.ts system prompt to recognize inventory language
   and guided client setup intent
6. Build the guided client setup conversational flow in
   onboarding-service.ts or a new client-setup-service.ts
7. Add ACTION:GENERATE_INVOICE and wire to existing invoice creation
8. Web app: /inventory page (see web-app.md)
9. Test the full guided client setup flow end-to-end with a real number

---

## Tello — The TrueFlow AI Assistant Persona

### What Tello Is

Tello is the official name and persona of TrueFlow's AI assistant inside
the web app and mobile app. Tello is NOT a separate product or a new AI
model, it is TrueFlow Chat with a name, a pulsating entry animation, and
a context-aware welcome that fires automatically on login. The same
/api/chat route, same TRUEFLOW_CHAT_PROMPT, same action tags, same
Supabase data access, Tello is the face of all of that.

Tello does NOT apply to the WhatsApp bot channel. WhatsApp users see
the contact name "TrueFlow" since that is the business identity on the
platform. The Tello persona lives only on web and mobile where there is
an in-app UI to present it properly.

### Tello's Personality

Name: Tello
Voice: Warm, direct, knowledgeable, the way a smart friend who happens
       to be an accountant would talk to you
Tone: Never corporate, never robotic, never overwhelming
Length: Short on first contact, deeper on follow-up questions
Language: Supports English and Nigerian Pidgin English, matching the user
Colours: Appears in Electric Violet #6C63FF with Mint Verify #00D4AA
         accents in the chat UI

Update TRUEFLOW_CHAT_PROMPT in docs/web-app.md to add at the very start:
"Your name is Tello. You are TrueFlow's AI assistant."

### The Entry Animation — Two Scenarios

SCENARIO A, RETURNING USER (profile exists, has logged in before,
has at least one receipt, budget, client, or reminder in the system):

1. Chat bubble sits bottom-right of the dashboard, Electric Violet
2. On login, bubble pulses exactly twice with a soft CSS breathing
   animation using the brand violet, then stops completely
3. After a 1 second pause, the bubble opens itself automatically
4. A welcome message appears word by word, as if Tello is typing
5. The message is generated by a /api/tello/welcome API call that
   runs in the background during the login redirect, so it is ready
   to display the instant the bubble opens, no loading state visible

Returning user welcome message format:
"Welcome back, [first name or business name]! 👋

[One or two of the most urgent data points from the list below,
whichever are most immediately relevant to THIS user TODAY.]

Want me to pull up your full summary, or is there something
specific on your mind?"

Data points Tello should choose from, in priority order:
- Unreviewed receipts this week (if 3 or more)
- Outstanding client balance (if any client has balance > 0)
- Upcoming reminder in next 3 days
- Budget category at or above 80% of limit
- Project deadline within 7 days
- Low stock item (if inventory enabled)
If none of these apply, use a positive summary:
"Everything looks on track this week. What can I help you with?"

SCENARIO B, FIRST TIME USER (first login, no receipts, no data yet):

1. Same pulse animation
2. Same auto-open
3. Intro message appears word by word:

"Hi there! I'm Tello, your TrueFlow AI assistant. 👋

I'm here to help you track your money, manage your clients,
and stay on top of your finances, all just by chatting with me.

Here's what we can do together:

📷 Scan receipts — upload any receipt photo and I'll read it
💰 Track client payments — forward payment proof and I'll log it
📊 Set budgets — tell me how much to allocate per category
⏰ Set reminders — I'll nudge you before bills and deadlines
🗂️ Manage clients — create folders, track projects and income

Want to start with something specific, or should I walk you
through it step by step?"

### Animation Rules — What Not to Do

1. The login ENTRANCE pulse (the more noticeable scale + glow burst,
   `.tello-bubble-pulsing`) fires exactly TWICE then stops, never a
   continuous loop, and never repeats again within the same session.
   Separately, and update per the "Floating Tello Chat Icon — AI Logo +
   Pulsating Animation" ticket: the CLOSED bubble now also has its own
   distinct, always-on, deliberately subtle "breathing" animation
   (`.tello-bubble-breathing`, ~2.8s cycle, transform + box-shadow only)
   that runs continuously whenever Tello is closed and not actively doing
   the login entrance pulse — for every plan tier, no gating. The two
   never run at the same time; the entrance pulse takes priority when it
   fires. Do not read rule 1 as forbidding this idle breathing loop, it
   only ever applied to the entrance pulse.
2. Auto-open happens ONCE per login session only, never on every
   page navigation within the same session
3. The dismiss button (X) is always visible and always works
   immediately, never hidden behind the animation
4. Once a user closes Tello, it stays closed until they click
   the bubble to re-open it, Tello never re-opens itself
5. On mobile web, the bubble is smaller and the auto-open only
   activates on screens wider than 640px to avoid covering content
   on small phones, on narrow screens the bubble pulses but does
   not auto-open

### The Welcome API Call

Route: POST /api/tello/welcome
Called: During the login redirect, before the dashboard renders
Returns: A pre-generated welcome string ready to stream word by word
Stored: In session state (not Supabase) so it is available instantly
        when the animation triggers

This pre-generation approach is critical. If the welcome message
requires an API call at the moment the animation triggers, there will
be a visible loading delay that breaks the "typing in real time" feeling.
Generate it during the redirect, store it in the session, play it back
word by word with a 30-40ms per word interval for a natural reading pace.

### Tello's Visual Identity in the Chat Bubble

- Circle avatar, Electric Violet background, white sparkle (Sparkles)
  icon — updated from the original white "T" lettermark to match the
  same AI/sparkle mark already used next to "True Assistant" in the
  sidebar and on the Home welcome banner, for visual consistency across
  every AI entry point in the product. No face, no mascot character —
  clean and scalable either way.
- Same rounded style as the existing channel badges
- On hover: pauses whatever animation is running and scales up (1.08x)
- Login entrance pulse: scale 1.0 → 1.12 → 1.0, twice, 600ms each,
  ease-in-out, using the Electric Violet color with a soft outer glow
  in rgba(108,99,255,0.3)
- Idle breathing (closed bubble, all other times, every plan tier):
  scale 1.0 → 1.045 → 1.0, continuous, ~2.8s ease-in-out loop, transform
  + box-shadow only — deliberately subtle, never the more noticeable
  entrance-pulse motion

### Tello in the Mobile App (Phase 3)

The same Tello persona and welcome logic applies to the mobile app.
On mobile the bubble lives at the bottom-right of the Home tab. The
pulse animation plays on app open (if more than 4 hours since last
open, not on every background-to-foreground switch). The returning
user and first time user scripts are identical to web.

### Business Rules for Tello

1. Tello refers to itself as "Tello" not "I" in the opening message,
   the name introduction happens exactly once per first-time login
2. On all subsequent sessions Tello uses "I" naturally in conversation,
   the name introduction is never repeated
3. The personalised data in the returning user welcome must come from
   real Supabase data pulled at login time, never placeholder text
4. If the /api/tello/welcome call fails for any reason, the bubble
   still opens but with a simple fallback: "Welcome back! What can I
   help you with today?" rather than an error state
5. Tello's scope in chat is identical to TRUEFLOW_CHAT_PROMPT,
   giving it a name does not change what it is allowed to help with
6. The WhatsApp bot never refers to itself as Tello, it remains
   TrueFlow in all WhatsApp contexts

---

## Two-Layer Permission System — Full Spec

### The Core Distinction That Must Never Be Confused

TrueFlow has two completely separate permission systems. They serve
different people, live in different parts of the product, and must
never overlap.

```
LAYER 1 — Platform Admin (TrueFlow internal team only)
Who:     You and your internal TrueFlow team
Where:   /admin routes, completely invisible to regular users
Roles:   Super Admin, Support Admin, Finance Admin, Read Only Admin
Purpose: Managing the TrueFlow SaaS platform itself

LAYER 2 — Organization Roles (your paying customers and their teams)
Who:     SME owners, their staff, family members, accountants
Where:   The regular dashboard, WhatsApp bot, mobile app
Roles:   Owner, Admin, Staff, Family Member, Viewer, Accountant
Purpose: Managing their own TrueFlow financial workspace
```

A TrueFlow Support Admin must NEVER automatically have access to a
customer's financial workspace. An SME owner on the Pro plan must
NEVER have access to /admin. These are completely separate identity
and permission contexts.

---

## Layer 1 — Platform Admin Roles

### The Four Platform Admin Roles

```
SUPER ADMIN
Can do everything including:
  - Promote or demote any other admin role
  - Impersonate any user (with full audit logging)
  - Suspend or reactivate any organization
  - Access all revenue and billing data
  - Manage the admin team itself
  - Delete data (soft delete only, never hard delete)
Set via: Direct SQL only, NEVER via any application UI
One rule: Super Admin status can never be granted through the
          app interface, only through database access

SUPPORT ADMIN
Can:
  - View any user profile and organization
  - Impersonate users (read-only session, see below)
  - View audit logs
  - Suspend and reactivate accounts
  - Override plan manually (for refunds, failed webhooks)
Cannot:
  - Access revenue or Paystack billing data
  - Promote or demote other admins
  - Permanently delete anything
  - Write to a user's workspace during impersonation

FINANCE ADMIN
Can:
  - View all subscription and revenue data
  - See Paystack webhook logs and billing history
  - View aggregate usage statistics
  - Export financial reports
Cannot:
  - View individual user financial or conversation data
  - Impersonate users
  - Modify user accounts or organizations
  - Manage other admin roles

READ ONLY ADMIN
Can:
  - View everything visible in /admin
  - Export admin reports
Cannot:
  - Change anything at all
  - Impersonate users
  - Access billing data
```

### Database Changes for Layer 1

```sql
-- Replace boolean is_super_admin with a proper role column
-- Run this migration carefully, it changes existing behavior

alter table profiles add column if not exists
  admin_role text default null;
-- null     = regular user, no admin access
-- 'super'  = Super Admin
-- 'support'= Support Admin
-- 'finance'= Finance Admin
-- 'readonly'= Read Only Admin

-- Keep is_super_admin for backward compatibility during migration
-- then drop it once admin_role is confirmed working:
-- alter table profiles drop column is_super_admin;

-- Table tracking active impersonation sessions
create table impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references profiles(id),
  target_user_id uuid references profiles(id),
  target_org_id uuid references organizations(id),
  started_at timestamptz default now(),
  ended_at timestamptz,
  is_active boolean default true,
  is_write_enabled boolean default false,
  -- only true for Super Admin, always false for Support Admin
  notes text
  -- reason for impersonation, required field
);

alter table impersonation_sessions enable row level security;
create policy "Only admins access impersonation sessions"
  on impersonation_sessions for all using (
    exists (
      select 1 from profiles
      where id = auth.uid() and admin_role is not null
    )
  );
```

### Impersonation — Rules That Cannot Be Compromised

1. Every impersonation session MUST be logged to both
   admin_audit_log AND impersonation_sessions BEFORE the session
   starts, not after. If the logging insert fails, the impersonation
   must not begin.
2. A persistent banner must show on every single page during an
   impersonation session: "👁 Viewing as [user name] · Your actions
   here are logged · [Exit impersonation]". This banner cannot be
   dismissed or hidden.
3. Support Admin impersonation is always read-only. All create,
   update, and delete operations are blocked at the API level during
   their session, not just hidden in the UI.
4. Super Admin impersonation defaults to read-only but can be
   elevated to write access with an additional confirmation dialog
   that states explicitly what will be changed.
5. Impersonation sessions auto-expire after 30 minutes of inactivity.
6. Nested impersonation is never allowed. An admin who is already
   impersonating a user cannot impersonate another user from within
   that session.
7. The impersonated user is never notified in real time, but their
   data remains in audit logs permanently. This is consistent with
   standard SaaS support practices.

### /admin/team Page — Managing Platform Admins

```
Route: /admin/team
Access: Super Admin only

Shows:
  - List of all profiles where admin_role is not null
  - Each row: name, email, role, last active, actions
  - Actions per row: Change Role (not to Super), Revoke Access
  - "Invite Admin" button: enter email, select role
    (Support Admin, Finance Admin, Read Only Admin only —
     Super Admin never appears in this dropdown)
  - Pending invites section
```

---

## Layer 2 — Organization Roles (Customer Workspaces)

### The Six Organization Roles

```
OWNER
The account creator and subscription holder.
One per organization, always.
Can do everything in their workspace.
Cannot be removed or demoted by anyone except themselves.
Plan determines what features exist, not what owner can do.

ADMIN (SME Starter+ only)
A trusted manager, co-founder, or senior team member.
Can do everything Owner can EXCEPT:
  - Cancel or change the subscription
  - Delete the organization
  - Demote the Owner
  - Access billing settings
Typical use: business partner, general manager

STAFF (SME Starter+ only)
An employee who scans receipts and logs expenses.
Default permissions:
  - Scan and submit receipts via WhatsApp and web
  - View their own submitted receipts only
  - View shared budgets
Cannot by default (Owner can grant individually):
  - See client folders or income data
  - See other staff members' submissions
  - Export reports
  - View the full financial summary dashboard
Typical use: driver, shop assistant, field sales rep

FAMILY MEMBER (Family plan only)
A spouse, parent, child, or household member.
Can:
  - Scan and submit their own receipts
  - View the shared family spending summary
  - Set their own reminders
  - See all family transactions (shared household finances)
Cannot:
  - Change subscription or billing
  - Invite other family members (only Owner can)
  - Delete receipts submitted by other family members
Typical use: spouse tracking joint household expenses

VIEWER (Any paid plan)
A silent observer with no write access.
Can:
  - View dashboard summary
  - View receipts (read only)
Cannot:
  - Submit anything
  - See client or income data unless explicitly granted
  - Export anything
Typical use: silent business partner, investor, parent

ACCOUNTANT (SME Starter+ only)
External professional, read-only web portal access only.
Access via share link token, not a full account login.
Can:
  - View all receipts, reports, Tax Hub data
  - Export PDF and Excel reports
  - Optionally view client folders (Owner toggle)
Cannot:
  - Add, edit, or delete any data
  - Use the WhatsApp bot
  - Access reminders or personal notes
Typical use: external bookkeeper, tax consultant
```

### Three Permission Toggles Per Staff Member

On top of role defaults, Owner can flip three toggles per team
member to handle the most common real-world exceptions without
needing a full custom role:

```
1. WhatsApp access toggle
   Can this person message the TrueFlow bot?
   Default: ON for Staff, ON for Admin, OFF for Viewer

2. Client visibility toggle
   Can this person see client folders and income data?
   Default: OFF for Staff, ON for Admin

3. Export access toggle
   Can this person download reports and exports?
   Default: OFF for Staff, ON for Admin
```

These three toggles cover the real-world scenario: "I want Ibrahim
to scan receipts but NOT see what clients are paying us." Owner sets
client visibility to OFF for Ibrahim specifically, without changing
his Staff role.

### Updated org_members Schema

```sql
-- New valid values for org_members.role:
-- 'owner' | 'admin' | 'staff' | 'family_member' | 'viewer'
-- accountant access is handled by share_links table, not org_members

-- Add the three permission toggles and family member support
alter table org_members
  add column if not exists can_see_clients boolean default false,
  add column if not exists can_see_income boolean default false,
  add column if not exists can_export boolean default false,
  add column if not exists whatsapp_active boolean default true,
  add column if not exists invited_email text,
  add column if not exists invite_token text unique,
  add column if not exists invite_expires_at timestamptz;

-- Set correct defaults per role on existing rows
update org_members set
  can_see_clients = case when role in ('owner','admin') then true else false end,
  can_see_income  = case when role in ('owner','admin') then true else false end,
  can_export      = case when role in ('owner','admin') then true else false end,
  whatsapp_active = case when role = 'viewer' then false else true end;

-- Helper function for permission checks (use in RLS and API routes)
create or replace function has_org_permission(
  p_org_id uuid,
  p_permission text
) returns boolean as $$
declare
  v_member org_members%rowtype;
begin
  select * into v_member
  from org_members
  where org_id = p_org_id and user_id = auth.uid();

  if not found then return false; end if;

  case p_permission
    when 'read'         then return true;
    when 'write'        then return v_member.role in ('owner','admin','staff','family_member');
    when 'admin'        then return v_member.role in ('owner','admin');
    when 'clients'      then return v_member.can_see_clients or v_member.role in ('owner','admin');
    when 'income'       then return v_member.can_see_income or v_member.role in ('owner','admin');
    when 'export'       then return v_member.can_export or v_member.role in ('owner','admin');
    when 'billing'      then return v_member.role = 'owner';
    when 'whatsapp'     then return v_member.whatsapp_active;
    else return false;
  end case;
end;
$$ language plpgsql security definer;
```

### Bot Identity Resolution — Updated Three-Way Check

The WhatsApp bot currently checks org_members for identity. With the
new roles, the check must also gate what each role can do:

```typescript
// In message-handler.ts, after getOrCreateUser():

// Check if user is suspended
if (user.organizations.status === 'suspended') {
  return buildReply('Your account is currently paused. Contact support@gettrueflow.com')
}

// Check WhatsApp access toggle
if (!user.org_member.whatsapp_active) {
  return buildReply('You don't currently have WhatsApp access for this account. Ask your account owner to enable it.')
}

// Gate commands by role
const isOwnerOrAdmin = ['owner','admin'].includes(user.org_member.role)
const canSeeClients  = user.org_member.can_see_clients || isOwnerOrAdmin
const canSeeIncome   = user.org_member.can_see_income  || isOwnerOrAdmin

// Pass these as context to getAIResponse() so the AI
// knows what this specific user is allowed to ask about
```

### /settings/team Page — Owner's Access Control Centre

```
Route: /settings/team
Access: Owner and Admin roles only

Layout:
┌─────────────────────────────────────────────┐
│  Your Team                      [+ Invite]  │
├─────────────────────────────────────────────┤
│  YOU                                        │
│  👤 Marcus Adebayo · Owner                 │
│     Full access · Cannot be changed         │
├─────────────────────────────────────────────┤
│  STAFF  (3 of 5 slots used)                │
│                                             │
│  👤 Ibrahim Musa · Staff                   │
│     WhatsApp ✅ · Clients ❌ · Export ❌   │
│     [Edit permissions] [Remove]             │
│                                             │
│  👤 Amaka Obi · Admin                      │
│     WhatsApp ✅ · Clients ✅ · Export ✅   │
│     [Edit permissions] [Remove]             │
├─────────────────────────────────────────────┤
│  ACCOUNTANT                                 │
│  🔗 Share link active                      │
│     Read only · Expires Jul 30 2026        │
│     [Revoke] [Renew] [Copy link]           │
├─────────────────────────────────────────────┤
│  PENDING INVITES                            │
│  📧 tunde@gmail.com · Staff               │
│     Invited 3 days ago · [Resend] [Cancel] │
└─────────────────────────────────────────────┘

Slot counter shows plan limit:
  SME Starter: 5 staff slots
  SME Pro: 15 staff slots
  Family: 6 family member slots

When slot limit reached, [+ Invite] shows upgrade prompt
instead of invite modal.
```

### Invite Flow — How Staff and Family Members Join

```
Owner on web app:
Team page → [+ Invite] → enters phone number OR email →
selects role → optionally adjusts the three toggles →
clicks Send Invite

If phone number entered:
  → WhatsApp message sent immediately:
    "👋 [Owner name] has invited you to join their
     TrueFlow workspace as [role].
     Tap here to accept: [link]
     Or just reply START to begin."

If email entered:
  → Email sent: "[Owner name] invited you to TrueFlow"
    with a one-click accept link
    (token stored in org_members.invite_token,
     expires in 7 days via invite_expires_at)

When invite is accepted:
  → Creates profiles row if new user
  → Creates or updates org_members row with role and toggles
  → Sends confirmation to both owner and new member
  → New member can start using WhatsApp bot immediately
```

### Plan Slot Limits Enforcement

```typescript
// In /api/team/invite route, check before creating invite:
const slotLimits: Record<string, number> = {
  free: 0,
  individual: 0,
  family: 6,
  sme_starter: 5,
  sme_pro: 15,
  freelancer: 1,
  agency: 3,
  studio: 10,
  enterprise: 999
}

const currentCount = await supabase
  .from('org_members')
  .select('id', { count: 'exact', head: true })
  .eq('org_id', orgId)
  .neq('role', 'owner')

if ((currentCount.count || 0) >= slotLimits[org.plan]) {
  return { error: 'Team slot limit reached', upgradeRequired: true }
}
```

### Business Rules — Two-Layer Permission System

1. Layer 1 (platform admin) and Layer 2 (org roles) are completely
   separate. A platform admin has no automatic access to customer
   workspaces. An org owner has no access to /admin routes.
2. Super Admin status is set ONLY via direct SQL, never via any
   application UI, this rule is permanent and non-negotiable.
3. Every impersonation session is logged before it begins, not after.
   If the log insert fails, the session must not start.
4. The impersonation banner cannot be dismissed. It must show on
   every page during an active impersonation session.
5. Support Admin impersonation is read-only at the API level, not
   just the UI level. Supabase RLS policies enforce this.
6. Family member role is only available on Family plan. If an org
   downgrades from Family to Individual, family_member roles become
   viewer roles automatically, not deleted.
7. The three permission toggles (WhatsApp, clients, export) override
   role defaults but cannot exceed role capabilities. A Viewer cannot
   be given write access via toggles, only roles provide write access.
8. When a staff member is removed from an org, their org_members row
   is soft-deleted (set a removed_at column), never hard-deleted, for
   audit trail purposes.
9. Pending invites expire after 7 days. Expired invites show in the
   team page with a [Resend] option.
10. Slot limit checks happen at invite time and at the Paystack
    webhook level on downgrade. If a plan downgrade would exceed the
    new slot limit, the owner is warned and must remove members first.

---

## Andrea Aid Integration — Platform-Level Cause Partnership

### What Andrea Is

Andrea (andreaaid.com) is a verified medical fundraising platform that
connects Nigerian hospitals with donors to fund life-saving medical
treatments for patients who cannot afford care. It operates with 100%
verified hospital partners, transparent donation tracking, and
real-time case updates. It is empowered by HRASA and has an active
presence on Instagram, Facebook, TikTok, and LinkedIn @andreaaidint.

Andrea and TrueFlow share the same founder. This is not a sponsorship
arrangement, it is a structural cause-link built into TrueFlow's
business model from the ground up.

### The Cause-Link Model

2% of every TrueFlow subscription payment is routed to Andrea every
month to fund verified patient cases at partnered Nigerian hospitals.

This is not an optional donation. It is a structural commitment built
into TrueFlow's subscription pricing. The 2% comes FROM TrueFlow's
revenue, not added ON TOP of the user's subscription price. A user
paying ₦7,500 for SME Starter pays exactly ₦7,500. TrueFlow routes
₦150 of that to Andrea internally. The user is never charged extra.

```
Plan         Monthly fee   Andrea contribution
Free         ₦0            ₦0
Individual   ₦2,500        ₦50
Family       ₦5,000        ₦100
SME Starter  ₦7,500        ₦150
SME Pro      ₦15,000       ₦300
Freelancer   ₦5,000        ₦100
Agency       ₦12,000       ₦240
Studio       ₦25,000       ₦500
```

### What Users See in the Dashboard

A dedicated Andrea Aid widget on the dashboard showing:
- "Your Andrea contribution this month: ₦[amount]"
- "Total contributed since you joined: ₦[lifetime amount]"
- "Helping fund verified medical treatments across Nigeria"
- A link to andreaaid.com/cases so users can see active patient cases

This widget is not a sidebar note. It sits alongside the main
financial summary cards as a first-class dashboard element.

### Subscription Confirmation Message

Every successful Paystack payment triggers a WhatsApp confirmation
that includes:

"✅ Payment confirmed!

Your [Plan] plan is active.
₦[amount] from this payment goes to Andrea, funding
life-saving medical treatments for Nigerians in need.

Total contributed to Andrea: ₦[lifetime]
See patient cases: andreaaid.com/cases"

### Community Contribution Counter

A running total of all TrueFlow user contributions to Andrea is
displayed on both the dashboard and the landing page. This number
updates monthly after each billing cycle. It is a real number
pulled from Supabase, never an estimate or a placeholder.

New Supabase column needed:
- andrea_contributions table:
  org_id, amount, period_month, period_year, paid_at, created_at

New dashboard query:
  Total contributed by this org (sum of andrea_contributions.amount
  where org_id = current org)

New landing page counter:
  Total contributed by all TrueFlow users (sum of all
  andrea_contributions.amount, publicly visible)

### /andrea-aid Page on gettrueflow.com

A dedicated public page at gettrueflow.com/andrea-aid explaining:
- What Andrea is and what it does
- How the 2% contribution works
- How much the TrueFlow community has contributed in total
- A link to browse active patient cases on andreaaid.com
- Andrea's social media handles @andreaaidint

### Business Rules for Andrea Aid Integration

1. The 2% is calculated on subscription revenue only, not on
   transaction values tracked through TrueFlow (since TrueFlow
   tracks but does not process those transactions)
2. Contributions are calculated and transferred monthly, not per
   transaction, to keep bookkeeping clean
3. Free plan users see a ₦0 contribution but still see the Andrea
   widget and the community total, so they understand the cause
   and are motivated to upgrade partly for this reason
4. The community total counter on the landing page is updated within
   48 hours of each monthly billing cycle completing
5. If a user cancels their subscription, their lifetime contribution
   total remains visible in their account as a permanent record of
   their impact
6. Andrea Aid integration must be mentioned in the Founders Edition
   benefits section, Founders get first visibility into the
   community contribution total before it is public

### Why This Matters for TrueFlow's Brand

Andrea gives TrueFlow a brand story that no competitor can copy.
Xara cannot become Andrea's partner. Bumpa cannot replicate this
relationship. TrueFlow users are not just managing their finances,
they are funding medical care for Nigerians in need every month they
use the platform. That is a reason to choose TrueFlow that goes
beyond any feature comparison, and a reason to stay that is rooted
in identity and values, not switching costs.

The alignment is genuine. TrueFlow serves Nigerian SMEs, freelancers,
and families managing tight budgets. These are the same communities
where a sudden hospital bill can wipe out years of savings. When a
TrueFlow user knows their subscription helps someone else avoid that
exact situation, the product becomes part of something larger than
expense tracking.

---
---
---

# ════════════════════════════════════════════════════════
# SECTION DIVIDER — TWO PROJECTS IN ONE FILE
# ════════════════════════════════════════════════════════
#
# EVERYTHING ABOVE THIS LINE:
#   → TrueFlow Web App + WhatsApp Bot (the product)
#   → Applies to: /bot, /web, /mobile folders
#   → Tech stack: Next.js, Supabase, Twilio, Node.js
#   → URL: app.gettrueflow.com
#
# EVERYTHING BELOW THIS LINE:
#   → TrueFlow Marketing Website (the landing page)
#   → Applies to: gettrueflow-landing.html only
#   → Tech stack: pure HTML, CSS, vanilla JavaScript
#   → URL: gettrueflow.com
#
# Claude Code: when working on the web app or bot,
# read the section ABOVE this divider.
# When working on the landing page, read BELOW.
# Both sections share the same brand identity,
# pricing, and Andrea Aid partnership details.
#
# ════════════════════════════════════════════════════════

---
---
---

# TrueFlow Marketing Website — CLAUDE.md
> This file is read automatically by Claude Code on every session.
> Do not delete it. Keep it updated as the project evolves.
> Last updated: July 2026

---

## What This Project Is

This is the TrueFlow public marketing website, a single-page landing
site that lives at gettrueflow.com. It is a separate project from the
web app (app.gettrueflow.com) and the WhatsApp bot. Its only job is to
explain the product, capture Founders Edition waitlist emails, and
convert visitors into signups.

This is NOT the web app dashboard. Do not add login flows, Supabase
calls, or product functionality here. Everything here is pure HTML,
CSS, and vanilla JavaScript in a single self-contained file.

---

## Company and Brand

Legal company:   True Financial Flow Ltd
Brand name:      TrueFlow
Pronounced:      True-Flow (like "True Flow" said together)
App Store name:  GetTrueFlow
Domain:          gettrueflow.com
Web app:         app.gettrueflow.com
Email:           gettrueflow@gmail.com
Social handles:  @gettrueflow on Instagram, X, TikTok
Tagline:         "Your true financial flow."

Never write: TrueFlow, Truelio, TrueFlow® (trademark conflict),
             trueflow, TRUEFLOW
Always write: TrueFlow (capital T, capital F, one word)

---

## What TrueFlow Actually Does

TrueFlow is an AI-powered financial assistant for African small
businesses, freelancers, and families. It tracks money in and money
out through three channels sharing one backend:

1. WhatsApp Bot — conversational AI, scan receipts by photo, forward
   client payment screenshots, set budgets and reminders by chat
2. Web App (app.gettrueflow.com) — full dashboard, client CRM,
   invoicing, Tax Hub, team management, Tello AI chat
3. Mobile App — on-the-go companion (coming after web app)

Two directions of money:
- MONEY OUT: receipts, expenses, budgets, bills, reminders
- MONEY IN: client payments, projects, invoices, income tracking

---

## Current Feature Status — CRITICAL FOR COPY ACCURACY

Use this to determine what to say is LIVE vs COMING SOON.
Never claim a coming soon feature is already working.

LIVE NOW (can say "available now", "start today"):
- Tello AI Chat on web app (app.gettrueflow.com/chat)
- Web dashboard: receipts, budgets, reminders, reports
- Client CRM: client folders, projects, income tracking
- Invoicing: generate and send PDF invoices
- Tax Hub: Track and Estimate (5 countries)
- Team management: staff, family member, accountant access
- Founders Edition waitlist at gettrueflow.com

COMING SOON (say "coming soon via WhatsApp", never "available"):
- WhatsApp receipt scanning via bot
- Smart Transfer Recognition (forward payment screenshots)
- WhatsApp budget and reminder commands
- WhatsApp client creation via conversation
- Mobile app (iOS and Android, listed as GetTrueFlow)

---

## Design Reference

Visual style reference: https://usexara.ai/
Take from Xara: full-width alternating feature sections with phone
mockups, dark background, bold two-line headlines, minimal nav,
single CTA repeated throughout, ALL CAPS eyebrow labels per section.
Do better than Xara: more sections, more features covered, a proper
features grid, Founders Edition framing, Tello AI highlighted as
available now, five-country Tax Hub, team access section.

---

## Brand Colours

| Name | Hex | Usage |
|------|-----|-------|
| Electric Violet | #6C63FF | Primary, CTAs, buttons, eyebrow labels |
| Mint Verify | #00D4AA | Tello, income, success, "Flow" in hero |
| Rich Black | #0A0A0F | Page background, dark surfaces |
| Cloud White | #F5F5F7 | Body text, card backgrounds |
| Alert Red | #FF6B6B | Urgency only |
| Warn Amber | #FFB545 | Budget warnings, coming soon badges |
| WhatsApp Green | #25D366 | WhatsApp channel badges only |

---

## Typography

Google Fonts (import both):
- Space Grotesk: headings, nav, buttons, eyebrow labels, numbers
- Inter: body copy, descriptions, form fields, footer

Font sizes:
- Hero headline: 72-96px, Space Grotesk 700
- Section headlines: 48-64px, Space Grotesk 700
- Eyebrow labels: 11px, Space Grotesk 600, letter-spacing 3px, uppercase
- Body copy: 16-18px, Inter 400, line-height 1.7
- Buttons: 14px, Space Grotesk 600

---

## Page Structure (Build in This Exact Order)

1.  Navigation
2.  Hero
3.  Trust badges row
4.  Feature section A: Receipt Capture
5.  Feature section B: Smart Transfer Recognition
6.  Feature section C: Client CRM
7.  Feature section D: Budgets and Reminders
8.  Feature section E: Tax Hub
9.  Feature section F: Tello AI Assistant
10. Everyday use cases (2x2 grid)
11. How it works (3 steps)
12. Team and family access
13. Pricing (3 cards, waitlist mode)
14. FAQ (7 questions)
15. Bottom CTA (Founders Edition email capture)
16. Footer

---

## Feature Section Specs

All six follow the Xara alternating layout pattern.
Each section: eyebrow | headline | body | CTA | mockup opposite side.

A. RECEIPT CAPTURE (content left, mockup right)
   Headline: "Scan any receipt. Instantly."
   Body: "Photo, screenshot, or WhatsApp forward. Tello reads the
   vendor, amount, date and category in seconds. No typing. No manual
   entry. Works for businesses, families and individuals."
   Status badge on mockup: COMING SOON VIA WHATSAPP (amber)

B. SMART TRANSFER RECOGNITION (mockup left, content right)
   Headline: "Forward it. We'll figure it out."
   Body: "When a client sends you payment proof on WhatsApp, forward
   it to TrueFlow. Our AI reads the bank transfer, identifies the
   client, and logs the income automatically. Works with GTBank,
   Access, Zenith, UBA, Opay, Palmpay, Moniepoint, Kuda and every
   major Nigerian bank."
   Status badge on mockup: COMING SOON VIA WHATSAPP (amber)

C. CLIENT CRM (content left, mockup right)
   Headline: "Every client. Every project. In one place."
   Body: "Create client folders, track project fees and deadlines,
   log incoming payments, and generate invoices. See your outstanding
   balance across all clients at a glance."
   Status badge on mockup: AVAILABLE NOW (teal)
   Mockup: web dashboard, not a phone

D. BUDGETS AND REMINDERS (mockup left, content right)
   Headline: "Know before you overspend."
   Body: "Set budgets per category and get alerts before you hit the
   limit. Remind yourself about VAT deadlines, salary days, supplier
   payments and project deliveries. Set it once and TrueFlow handles
   the rest."
   Status badge on mockup: COMING SOON VIA WHATSAPP (amber)

E. TAX HUB (content left, mockup right)
   Headline: "Track your tax. Estimate your liability."
   Body: "TrueFlow tracks VAT and tax from every transaction. The Tax
   Hub shows your estimated liability across Nigeria, Kenya, Ghana,
   USA, and the UK. Always an estimate, always paired with your
   accountant share link."
   Status badge on mockup: AVAILABLE NOW (teal)
   Mockup: web dashboard Tax Hub page

F. TELLO AI ASSISTANT (mockup left, content right)
   Headline: "Meet Tello. Available right now."
   Body: "Tello is TrueFlow's built-in AI assistant, live on the web
   app today. Ask about your spending, create a client, set a
   reminder, or get a budget breakdown. Tello knows your finances and
   answers in seconds. No WhatsApp needed to get started."
   Status badge on mockup: AVAILABLE NOW (teal)
   Mockup: web browser with Tello chat bubble open

---

## Pricing Plans

Three cards only. All buttons say "Join Founders Edition".
Note below cards: "Nigerian Naira pricing also available:
₦7,500/mo Starter, ₦15,000/mo Pro."

Free: $0 forever
- 10 receipts per month
- 1 user
- Tello AI Chat
- Basic dashboard

SME Starter: $19 per month [MOST POPULAR]
- Unlimited receipts
- 5 staff members
- 10 clients
- Inventory tracking
- Accountant share link

SME Pro: $39 per month
- Unlimited everything
- 15 staff members
- 50 clients
- Invoice generation
- Advanced analytics
- Tax Hub

---

## FAQ Questions and Answers

Q1. What is TrueFlow?
A: TrueFlow is an AI-powered financial assistant for African small
businesses, freelancers, and families. It tracks your expenses,
manages your client income, generates invoices, and helps you stay
on top of budgets and tax, all through a web dashboard and soon via
WhatsApp.

Q2. How does TrueFlow work?
A: You start by signing up at gettrueflow.com. From the web app you
can immediately start tracking expenses, managing clients, and
chatting with Tello, our AI assistant. WhatsApp scanning and Smart
Transfer Recognition are coming soon.

Q3. Is my financial data secure?
A: Yes. All data is encrypted in transit and at rest. TrueFlow uses
Supabase's enterprise-grade PostgreSQL database with row-level
security, meaning each user can only ever access their own data.

Q4. Do I need to download an app to start?
A: No. TrueFlow works in your browser at app.gettrueflow.com from
day one. A mobile app for iOS and Android (listed as GetTrueFlow) is
coming soon.

Q5. Can my staff or family members use it too?
A: Yes. You can invite staff to submit receipts and expenses, add
family members to a shared household budget, or share a read-only
link with your accountant. Each person gets exactly the access level
you choose.

Q6. What Nigerian banks does Smart Transfer Recognition support?
A: GTBank, Access Bank, Zenith Bank, UBA, First Bank, Opay,
Palmpay, Moniepoint, Kuda, and Stanbic IBTC. This feature is
coming soon via WhatsApp.

Q7. What is the Founders Edition?
A: Founders Edition is our early access programme for the first
users who help shape TrueFlow. Founders get lifetime discounted
pricing, a permanent Founding Member badge, a direct WhatsApp line
to the team, and first access to every new feature before public
release.

---

## Coming Soon Badge Style

Amber (coming soon via WhatsApp):
  background: rgba(255,181,69,0.15)
  border: 1px solid rgba(255,181,69,0.3)
  color: #FFB545
  font: 10px Space Grotesk 600 uppercase letter-spacing 1.5px
  text: "Coming soon via WhatsApp"
  position: bottom-left of mockup, overlaid

Teal (available now):
  background: rgba(0,212,170,0.15)
  border: 1px solid rgba(0,212,170,0.3)
  color: #00D4AA
  text: "Available now"

---

## Technical Rules

1. Single self-contained HTML file named gettrueflow-landing.html
2. All CSS and JavaScript inline, no external files
3. Only external resource: Google Fonts import link
4. No Supabase, no API calls, no authentication of any kind
5. Phone mockups: pure CSS and HTML, no image files
6. Dashboard mockups: CSS representations, not screenshots
7. All animations: CSS only, Intersection Observer for scroll fades
8. Mobile: alternating sections stack vertically under 768px
9. Email form uses joinWaitlist(emailId, successId, formId) pattern
10. Nav becomes solid #0A0A0F on scroll via scroll event listener

---

## Copy Rules

- No dashes in user-facing copy
- Tone: warm, direct, honest, like a smart friend
- Nigerian context: Nigerian names, Naira amounts, Nigerian banks
- Never overclaim: coming soon features always say "coming soon"
- "Flow" in the hero headline is always in Mint #00D4AA
- "Founders Edition" always capitalised, always both words
- Footer: "True Financial Flow Ltd" not "TrueFlow Ltd"
- All plan buttons: "Join Founders Edition" not "Get started"

---

## Claude Code Instructions

1. Always read this CLAUDE.md before touching any file
2. Deliverable: gettrueflow-landing.html (single file)
3. Check coming soon badges appear on sections A, B, D only
4. Check available now badges appear on sections C, E, F only
5. Verify all CTA buttons say "Join Founders Edition"
6. Confirm footer says "True Financial Flow Ltd"
7. Confirm no TrueFlow or trueflow anywhere in the file
8. Test the email form joinWaitlist function works on submit

---

## Andrea Aid — Cause Partnership Section

### What Andrea Is

Andrea (andreaaid.com) is a verified medical fundraising platform
connecting Nigerian hospitals with donors to fund life-saving medical
treatments for patients who cannot afford care. 100% verified
hospitals. Transparent donations. Real-time updates.

Tagline: "Connecting verified hospitals with caring donors to provide
life-saving medical treatments."

Empowered by: HRASA
Social: @andreaaidint on Instagram, Facebook, TikTok, LinkedIn
Live platform: andreaaid.com/cases (browse active patient cases)

### The 2% Commitment

2% of every TrueFlow subscription goes to Andrea every month.
This comes from TrueFlow's own revenue. The user is NEVER charged
extra. A user paying ₦7,500 pays exactly ₦7,500. TrueFlow routes
₦150 internally to Andrea.

Never describe this as an "extra charge" or "added fee".
Always describe it as "2% of your subscription goes to Andrea"
or "we give 2% to Andrea from every subscription."

### Where Andrea Appears on the Landing Page

Andrea appears in THREE places on the landing page:

PLACE 1: Hero section, small badge below the main CTA
  "Every subscription funds life-saving medical care via Andrea"
  In small teal text with a heart icon, directly below the
  "Join Founders Edition" button.

PLACE 2: Dedicated full-width section (position: after pricing,
before FAQ)
  This is the main Andrea section. See copy below.

PLACE 3: Footer, one line with Andrea logo link
  "2% of every subscription funds Andrea medical cases"
  with a link to andreaaid.com

### Andrea Section Full Copy and Layout

Section label: ANDREA AID PARTNERSHIP
Headline: "Every subscription helps save a life."

Body copy:
"2% of every TrueFlow subscription goes directly to Andrea,
a verified medical fundraising platform connecting Nigerian
hospitals with the funding needed to treat patients who
cannot afford care.

When you manage your finances on TrueFlow, you are also
helping a mother afford her surgery, a child receive the
treatment they need, or a family avoid losing everything
to a hospital bill.

One platform. Two missions. Your finances and someone else's
life, connected."

Community counter (live number from Supabase, updated monthly):
"TrueFlow users have contributed ₦[X] to Andrea"
Displayed as a large number in Mint Verify #00D4AA

Three bullet points with teal checkmarks:
  100% verified Nigerian hospitals
  Transparent, real-time donation tracking
  Every naira goes directly to patient care

Two buttons side by side:
  Primary: "Browse patient cases" → andreaaid.com/cases
  Secondary: "Learn about Andrea" → andreaaid.com

Andrea logo or name shown clearly in this section.

### What This Section Should NOT Do

Do not make specific claims about amounts raised by Andrea
(their site shows 0 as a placeholder, do not cite that)
Do not claim Andrea is "Nigeria's largest" or any superlative
Do not show a fake counter, the counter must be real or show
"Growing every month" as a placeholder until real data exists
Do not describe this as a donation the USER makes, it is a
commitment TrueFlow makes from its own revenue

### Founders Edition Connection

The Andrea partnership is one of the four Founders Edition benefits.
In the Founders Edition section, add:

"First visibility into the TrueFlow community Andrea contribution
 total before it becomes public"

as the fifth benefit bullet after the existing four.

### Andrea Section Visual Style

Background: slightly lighter than the page background, use #111118
to create a subtle section break without a harsh dividing line
Andrea's brand colour is teal #0d9488, which is close to TrueFlow's
Mint Verify #00D4AA. Use #00D4AA for consistency with TrueFlow's
palette, not Andrea's exact hex.
The section should feel warm and human, not corporate, use slightly
larger line height (1.9) for the body copy in this section
The community counter number should be the largest text element in
the section, even larger than the headline, since it is the most
tangible proof of impact

### /andrea-aid Page

Build a simple public page at gettrueflow.com/andrea-aid (a separate
section within the single HTML file, hidden by default, shown when
the URL hash is #andrea-aid, or as a separate linked page if the
build goes multi-page):

Content:
  TrueFlow + Andrea logos side by side
  "The TrueFlow x Andrea Partnership"
  Full explanation of the 2% model
  Community contribution total counter
  How the money is used (Andrea's verified hospital model)
  Link to browse active cases at andreaaid.com/cases
  Andrea social handles @andreaaidint

### Claude Code Instructions for Andrea Section

1. The Andrea section sits AFTER the pricing section and BEFORE
   the FAQ section in the page order
2. The community counter shows a real number if available from
   Supabase, or a placeholder "Growing every month" if not
3. The "Browse patient cases" button links to andreaaid.com/cases
4. The "Learn about Andrea" button links to andreaaid.com
5. The Andrea section uses the same alternating content and
   visual layout pattern as the feature sections, with the Andrea
   visual or counter on one side and the copy on the other
6. Never show ₦0 as the community counter, use the placeholder
   text instead if real data is not yet available
7. The small badge in the hero section sits directly below the
   main CTA button, not beside it

---

## Brand Positioning — The Sweet Center

### The Line That Defines Everything

"If your work, family, and personal data are in 15 places,
you only need to check 14 to forget something."

This is TrueFlow's anchor line. It names a universal pain without
being preachy, implies the solution without stating it, and has a
dry wit that makes people want to share it. Every piece of copy,
every caption, every landing page headline should be tested against
this feeling. If it does not connect to this truth, rewrite it.

### The Problem This Line Names

People are not disorganised. They are over-distributed. Receipts
in a bag. Client balances in their head. VAT deadlines in a voice
note. Budgets in a WhatsApp chat. Staff expenses in a notebook.
Payment proof in Instagram DMs. The information exists. It just
lives in 15 different places and one of them always gets forgotten.

TrueFlow is the one place that ends the search.

### The Three Taglines — When to Use Each

Primary (formal, brand-level, App Store, logo):
  "Your true financial flow."

Personal (individuals and families, social media, onboarding):
  "The AI that remembers so you don't have to."

Universal (widest audience, landing page hero, TikTok):
  "Your money. Your clients. Your life. One AI."

Anchor line (most shareable, captions, hero options):
  "If your work, family, and personal data are in 15 places,
  you only need to check 14 to forget something."

### Target Audience — Wider Than "SME"

Never position TrueFlow as "a financial app for small businesses"
as the first or only description. The sweet center is broader:

  Individual:  "Remind me about Mama's birthday. Track my spending."
  Family:      "Shared budget. Everyone's expenses in one place."
  Freelancer:  "Chase client payments without the awkward calls."
  Business:    "Clients, projects, income, staff, all organised."

All four audiences experience the same underlying problem: their
important information lives in too many places. TrueFlow solves
this for all of them through the same product.

### Hero Headline Options — In Priority Order

Option A (the anchor line — most powerful):
  "Your work, family, and personal data
   are in 15 places.

   TrueFlow is the one that remembers
   all of them."

Option B (the bold version):
  "You only need to check 14 places
   to forget something.

   We built the 15th. The last one
   you will ever need."

Option C (the simple universal version):
  "Everything important.
   One conversation.
   One AI."

Option D (existing, still valid for formal contexts):
  "Your true
   financial
   flow."

### Brand Voice Guide

Honest without being harsh.
Specific without being cold.
Witty without trying too hard.
Nigerian without being exclusive.

Sounds like: A smart friend who already knows your situation
and is not judging you for having receipts in a bag and
client balances in your head.

Does NOT sound like: A bank. A government form. A startup
trying to sound professional. A fintech explaining what
blockchain is.

Voice test for every line of copy:
Would a Lagos market trader forward this to a friend on
WhatsApp and say "this is me"?
If yes: approved.
If no: rewrite it.

### Approved Social Media Caption Bank

CAPTION 1 — The Anchor Line (best for Instagram first post)
"If your work, family, and personal data are in 15 places,
you only need to check 14 to forget something.

TrueFlow puts it all in one place.
Your money. Your clients. Your reminders.
All by chatting with Tello on WhatsApp.

Free to start. Link in bio.
#TrueFlow #Tello #Nigeria #AIAssistant"

CAPTION 2 — The Nigerian Version (most relatable)
"Your receipts are in a bag.
Your client balance is in your head.
Your VAT deadline is in a voice note.
Your budget is in a WhatsApp chat.
Your staff expenses are in a notebook.

You only need to check 4 of those to forget the 5th.

TrueFlow remembers all of it for you.
#TrueFlow #Nigeria #SmallBusiness"

CAPTION 3 — Meet Tello (for AI persona introduction)
"If your work, family, and personal data are in 15 places,
you only need to check 14 to forget something.

Meet Tello. The AI that holds all of it.
One conversation. Every answer.
#TrueFlow #Tello #AIAssistant #Nigeria"

CAPTION 4 — Ultra short (best for X and stories)
"15 places for your data.
14 checks to forget something.
1 TrueFlow to end it.
#TrueFlow #Nigeria"

CAPTION 5 — TikTok POV story format
"POV: You are looking for that receipt your accountant asked for.
First you check WhatsApp. Then your bag. Then a screenshot folder.
Then a notes app. Then you give up.

TrueFlow scans it the moment you get it.
Your accountant gets the report. You get your time back.
#TrueFlow #Nigeria #SmallBusiness #Fintech"

CAPTION 6 — The contrast format (most shareable)
"Most people:
Track expenses in a notebook
Chase client payments on WhatsApp
Forget deadlines until it's too late
Lose receipts in a bag

TrueFlow people:
One AI handles all of it. Automatically.

Free to start. Link in bio.
#TrueFlow #Nigeria"

### Copy Rules — What Never to Write

Never write: "AI financial assistant for African small businesses"
as the opening line. This narrows the audience before they decide
if they are interested.

Never lead with: #SME #B2B #Fintech as the first hashtags.
These signal corporate software, not a personal assistant.

Never write copy that sounds like a bank or a compliance document.
Every sentence should pass the Lagos market trader test above.

Always write: the feeling first, the features second.
The feeling is "I will never lose track of anything important again."
The features are receipts, clients, budgets, reminders, Tax Hub.
Lead with the feeling. Let the features be discovered.

---

## Cross-Channel Identity Merge — Phone and Email Linking

### Why This Exists

A user may discover TrueFlow through WhatsApp first, or through the web
app first (via Gmail sign-up). Right now these create two completely
unrelated accounts with no way to recognize they belong to the same
person. This section specifies how to let a user voluntarily link their
phone-based WhatsApp identity and their email-based web identity into
one account, without adding friction to the 95%+ of users who only ever
use one channel, and without opening an account-takeover vector.

### The Two Rules This Design Must Never Break

1. The Seamless Onboarding Flow (see above) must stay exactly as fast
   as it is today. Nothing in this spec adds a required question to
   first-contact onboarding. Any request to link accounts is optional
   and appears only after the existing aha moment, never before it.
2. No account merge may ever happen from an unverified claim. A person
   typing an email address, or a phone number, into a chat window is
   not proof they own it. Every merge requires a verification code sent
   TO the channel being claimed, entered back on the channel making the
   claim, before any data is combined.

### Flow 1 — WhatsApp User Optionally Links a Web Account

This appends to the END of the existing Seamless Onboarding Flow,
after the first receipt scan aha moment, never before it.

```
[existing onboarding completes as already specced]
        ↓
Bot sends ONE additional, clearly optional message:
"Already using TrueFlow on the web? Reply with your
 email to link your accounts, or just keep chatting
 to get started here."
        ↓
User ignores this / keeps chatting normally
  → nothing happens, this is the expected outcome
  → for most users
        ↓
User replies with an email address
        ↓
Bot checks: does a profiles row exist with this email?
        ↓
NOT FOUND → "I couldn't find an account with that
             email, no problem, you can always link
             one later from Settings on the web app."
             (do not create anything, do not merge
             anything)
        ↓
FOUND → bot generates a 6-digit code, sends it to
        THAT EMAIL ADDRESS (via Resend or existing
        email service), NOT to WhatsApp
        ↓
Bot replies: "I found an account with that email.
             I've sent a code there to confirm it's
             really you. What's the code?"
        ↓
User checks their email, replies with the code
        ↓
Code correct → merge proceeds (see Merge Logic below)
Code incorrect (3 attempts) → "That didn't match,
  you can try again later from Settings on the web
  app." Do not lock the account, just stop the flow.
```

### Flow 2 — Web User Optionally Links a WhatsApp Number

Symmetric to Flow 1, initiated from the web app, likely from
`/settings/profile` or a dashboard prompt shown once after signup.

```
Web user, signed up via Gmail, sees an optional card:
"Also use TrueFlow on WhatsApp? Link your number to
 sync everything in one place."
        ↓
User enters their phone number
        ↓
System checks: does an org_members or profiles row
exist with this phone number?
        ↓
NOT FOUND → "No WhatsApp account found with that
             number yet. Message us on WhatsApp to
             get started there, then come back to
             link it." (do not create anything)
        ↓
FOUND → system sends a 6-digit code to that phone
        number VIA THE WHATSAPP BOT, not SMS
        ↓
Web UI shows: "We've sent a code to that number on
              WhatsApp, enter it below to confirm."
        ↓
User checks WhatsApp, enters the code on the web form
        ↓
Code correct → merge proceeds (see Merge Logic below)
Code incorrect (3 attempts) → clear the field, allow
  retry, no lockout
```

### Merge Logic — What Actually Happens on a Successful Merge

```sql
-- Both records must resolve to a single profiles.id going forward.
-- The general pattern:

1. Identify which profile is "primary" (the one with more history,
   or simply the one that existed first, created_at earlier wins)

2. Update the secondary profile's associated org_members rows to
   point to the primary profile's user_id instead

3. Copy the missing identity field onto the primary profile:
   - if primary had phone but no email, add the verified email
   - if primary had email but no phone, add the verified phone

4. Mark the secondary profile as merged, do not hard delete it:
   alter table profiles add column if not exists merged_into_id uuid
   references profiles(id);
   update profiles set merged_into_id = <primary_id>, status = 'merged'
   where id = <secondary_id>;

5. Any future login attempt (OTP via phone, or Gmail via email) on
   the secondary identity should resolve through merged_into_id to
   the primary account transparently, the user never notices two
   accounts ever existed.

6. Send a confirmation on BOTH channels:
   WhatsApp: "✅ Your accounts are linked! You can now log in on
             web with this number's OTP or your email."
   Email: "Your TrueFlow accounts have been linked. You can now
          access your data from WhatsApp or the web with either
          method."
```

### Business Rules

1. Never ask for email during first-contact onboarding, the merge
   offer only appears after the existing aha moment completes
2. Never merge accounts based on an unverified claim, a verification
   code sent to the actual channel being claimed is mandatory every
   time, no exceptions
3. Failed verification attempts never lock or suspend an account,
   they simply end that merge attempt, the user can try again later
4. A merged (secondary) profile is soft-marked via `merged_into_id`,
   never hard-deleted, for audit and data-integrity purposes
5. The optional merge prompt only fires once per new WhatsApp
   onboarding, if the user skips it, do not repeat the offer on
   every subsequent message, it can be resurfaced later from
   Settings on the web app instead
6. This entire flow is additive to the existing OTP-via-WhatsApp
   login system already specced above, it does not replace or
   change how OTP login itself works

### New Database Fields Needed

```sql
alter table profiles add column if not exists merged_into_id uuid
  references profiles(id);
alter table profiles add column if not exists status text default 'active';
-- status: 'active' | 'merged'

create table if not exists identity_merge_codes (
  id uuid primary key default gen_random_uuid(),
  target_profile_id uuid references profiles(id),
  code text not null,
  channel text not null, -- 'email' | 'whatsapp'
  requested_by_profile_id uuid references profiles(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);
```

---

## Super Admin Panel — Expanded Capabilities Spec

### Why This Section Exists

This extends the existing "Backend Admin Panel" and "Two-Layer
Permission System" sections above with a complete, opinionated set
of Super Admin capabilities, styled with the same visual theme
already approved on /dashboard-concept. Read both earlier sections
first, this section assumes that foundation (admin_role on profiles,
admin_audit_log, impersonation_sessions, /admin route group) already
exists and builds on top of it, it does not replace it.

### The Complete Capability List

```
Already specced/built earlier, confirm working before extending:
  Impersonation (with mandatory banner and audit log)
  Role assignment: Super / Support / Finance / Readonly
  Suspend / Reactivate organizations
  admin_audit_log covering every admin action

New in this section:
  Edit user profile fields directly
  Two-tier deletion: Suspend (soft, reversible, default) and
    Permanently Erase (hard, requires typed confirmation, rare)
  Activity monitoring feed across all users
  Leaderboard: most active users, most active admins
  Revenue reporting: weekly / monthly / quarterly / yearly
  Broadcast/announcement tool to all users or a filtered segment
  Visual theme matching /dashboard-concept exactly
```

### Deliberately NOT Building Right Now

Dynamic, admin-defined custom roles beyond the existing fixed set
(Super/Support/Finance/Readonly) are out of scope. The fixed role
set is easier to reason about and audit at TrueFlow's current scale.
Revisit only if a specific, real need for a role outside these four
emerges later.

### Two-Tier Deletion — The Critical Business Rule

TrueFlow's entire data model deliberately avoids hard deletes
everywhere (clients get archived, org_members get removed_at, merged
profiles get merged_into_id). User deletion follows the exact same
philosophy, with two genuinely different actions, never one combined
"Delete" button.

**Tier 1, Suspend, already built:**
One click, immediately reversible, sets `organizations.status =
'suspended'`, blocks WhatsApp bot access with a polite message, does
not touch any data. This remains the default action for almost every
real situation, abuse, non-payment, a support dispute pending
investigation.

**Tier 2, Permanently Erase, new, rare, deliberately heavy:**
Only for genuine data-erasure requests (NDPR/GDPR right to erasure)
or confirmed fraudulent accounts. This must never be a single click.

> ⚠️ TEMPORARY, TESTING-PHASE SIMPLIFICATION, READ BEFORE MVP LAUNCH
> The cooling-off period described in the original design (a 24 hour
> delay before actual erasure, with a cancellable "Pending Erasures"
> queue) is INTENTIONALLY DISABLED right now, during active Ambassador
> testing, so test accounts can be deleted and recreated immediately
> without waiting a day between test runs.
>
> Erasure currently executes IMMEDIATELY after the typed "Delete"
> confirmation, there is no pending_erasures queue step active, no
> cancellation window, no scheduled job delay. The pending_erasures
> table and scheduled job described below should still be BUILT so the
> pattern exists in the codebase, but the erasure logic should call the
> hard-delete step directly and immediately after confirmation, skipping
> the wait, rather than actually queuing and waiting.
>
> REMINDER FOR LATER: before TrueFlow moves from testing into a real
> MVP or public launch with real paying users, this section must be
> revisited and the 24 hour cooling-off period must be turned back on,
> since the risk of an irreversible accidental deletion becomes far
> more serious once real user data, not test data, is on the line.
> Whoever picks this up later, search this file for "cooling-off" to
> find this note again.

```
Permanently Erase flow, CURRENT TESTING-PHASE VERSION:

1. Admin clicks "Permanently Erase" on a user's detail page
2. A modal opens explaining exactly what will be destroyed:
   receipts, client records, project history, payment history,
   this action cannot be undone, note this explicitly
3. Admin must TYPE the exact word "Delete" into a confirmation
   input field, matching case-sensitively, before the action
   button becomes clickable at all
4. On confirming, the hard delete runs IMMEDIATELY, across all
   related tables (receipts, clients, projects, client_payments,
   reminders, budgets, org_members, profiles), in a single
   transaction, no waiting period
5. Log the full action to admin_audit_log at the moment of
   deletion, including who requested it, when, and the exact
   typed confirmation string, this record is the one thing that
   survives the erasure itself

FUTURE MVP VERSION, once reinstated:
Same as above through step 3, then instead of immediate deletion,
insert into pending_erasures with scheduled_for = now + 24 hours,
show it on a cancellable "Pending Erasures" list, and only run the
actual hard delete via a scheduled job once that time passes.
```

```sql
create table pending_erasures (
  id uuid primary key default gen_random_uuid(),
  target_org_id uuid references organizations(id),
  requested_by_admin_id uuid references profiles(id),
  requested_at timestamptz default now(),
  scheduled_for timestamptz not null, -- requested_at + 24 hours
  status text default 'pending', -- 'pending' | 'cancelled' | 'completed'
  cancelled_by_admin_id uuid references profiles(id),
  cancelled_at timestamptz
);
```

### Edit User Profile Fields

On a user's detail page, Super Admin and Support Admin (per existing
role permissions) can directly edit: full_name, phone, email,
organization name, plan. Every edit writes to admin_audit_log with
old and new values in the details field, exactly matching the
pattern already established for plan changes in the earlier admin
panel spec.

### Activity Monitoring Feed

A new `/admin/activity` page showing a real-time-ish feed (refresh
every 30-60 seconds, no need for websockets at this scale) of recent
platform activity: new signups, receipts scanned, payments received,
subscription changes, pulled from existing tables (receipts,
client_payments, organizations) filtered to recent timestamps, not a
new logging table, reuse what already exists.

### Leaderboard

A new `/admin/leaderboard` page, two panels:
```
Most Active Users (by org)
  ranked by receipt count + login frequency over 
  the last 30 days, shows org name, plan, activity 
  score

Most Active Admins
  ranked by admin_audit_log entry count over the 
  last 30 days, shows admin name, role, action count
```

### Revenue Reporting

A new `/admin/revenue` page, using the same chart and card visual
language as /dashboard-concept (light mode base, Electric Violet and
Mint Verify accents, card-based layout).

```
Top row stat cards: This Week, This Month, This 
  Quarter, This Year, each showing total revenue 
  and percent change vs the prior equivalent period

Main chart: revenue over time, switchable between 
  weekly/monthly/quarterly/yearly views, same line 
  chart style as the Income vs Expenses card on 
  the user dashboard

Plan distribution: how many orgs on each plan tier, 
  contributing how much revenue each, donut or bar 
  chart

Andrea Aid running total: pull directly from the 
  existing andrea_contributions table, shown 
  alongside revenue since it is calculated from 
  the same subscription data
```

Data source: `organizations.plan`, Paystack webhook payment history
(wherever that is currently logged), and `andrea_contributions`,
already existing tables, no new payment tracking table needed.

### Broadcast / Announcement Tool

A new `/admin/broadcast` page, Super Admin only (not Support or
Finance, this is a powerful, platform-wide action).

```
Compose a message
Select audience:
  All users
  Filtered by plan (e.g. only Free plan users)
  Filtered by activity (e.g. inactive 30+ days)
  Filtered by country (using default_tax_country 
    or org's registered country)
Select channel:
  WhatsApp (via existing bot sending infrastructure)
  Email (via existing email service)
  Both

Preview before sending, showing exact recipient 
  count based on the selected filter

Send confirmation, typed "Send" required for any 
  broadcast to more than 50 recipients, same 
  friction-on-purpose pattern as Permanently Erase, 
  since a mistaken broadcast to every user is a 
  real reputational risk

Log every broadcast sent to a new table:
```

```sql
create table admin_broadcasts (
  id uuid primary key default gen_random_uuid(),
  sent_by_admin_id uuid references profiles(id),
  message text not null,
  audience_filter jsonb, -- the filter criteria used
  channel text not null, -- 'whatsapp' | 'email' | 'both'
  recipient_count int not null,
  sent_at timestamptz default now()
);
```

Never build this to send instantly on every keystroke or allow
accidental double-sends, the send button should disable immediately
after click and show a sending progress state.

### Visual Theme Requirement

Every new admin page in this spec (`/admin/activity`,
`/admin/leaderboard`, `/admin/revenue`, `/admin/broadcast`, and the
updated user detail page with Edit and Permanently Erase) must use
the exact same visual design system already approved and built on
`/dashboard-concept`: light mode base, collapsible icon-rail sidebar,
Electric Violet primary actions, Mint Verify success states, card-
based layout with rounded corners and soft shadows, the same
light/dark toggle behavior. Do not introduce a separate visual style
for the admin panel, it should feel like the same product, not a
bolted-on separate tool.

### Business Rules

1. Suspend remains the default, one-click, reversible action for
   almost every real situation, Permanently Erase is reserved for
   genuine erasure requests or confirmed fraud
2. Permanently Erase always requires the typed word "Delete",
   case-sensitive, before the action button activates
3. Permanently Erase always has a mandatory cooling-off period
   before executing, and is always cancellable during that window
4. Every edit, suspend, erase, broadcast, and role change writes to
   admin_audit_log without exception
5. Broadcast is Super Admin only, never available to Support or
   Finance roles
6. Broadcasts over 50 recipients require typed confirmation before
   sending, exactly like Permanently Erase
7. All new admin pages reuse existing data tables wherever possible,
   do not create parallel logging systems for data that already
   exists in receipts, client_payments, or admin_audit_log
8. Every new admin page matches the /dashboard-concept visual system
   exactly, no separate admin-only visual language

---

## Refined First-Contact Onboarding Flow (Finalized)

### Why This Replaces the Earlier Version

This is the current, final version of the Seamless Onboarding Flow
first specced earlier in this document. It supersedes that version
with three refinements developed later: a fallback path for users
without a receipt handy, an optional email-add step after the aha
moment (reusing the Cross-Channel Identity Merge logic), and business
card scanning for lead capture on business accounts. The original
Seamless Onboarding Flow section above still describes the correct
underlying architecture (phone-number identity, two-question setup),
this section is the up-to-date conversational script that should
actually ship.

### The Full Script

```
User opens the wa.me link, sends "Hi"
        ↓
Bot silently captures the phone number
        ↓
"Hey! I'm Tello, from TrueFlow 👋
 What should I call you?"
        ↓
User replies with their name
        ↓
"Nice to meet you, [Name]! Quick one, is
 this for your business, your family, or
 just you?"
        ↓
User answers
        ↓
"Here's what we can do together:
 📷 Scan receipts, just send a photo
 💰 Track client payments
 📊 Set budgets by category, like a
    Budget for Family Trip
 ⏰ Reminders for bills, deadlines,
    even birthdays
 🗂️ Manage clients and projects
 🪪 Scan a business card to save a new
    lead automatically
 [the 🪪 line above ONLY appears if the
 user answered "business" in the previous
 step, never shown for family or personal
 accounts]

 Let's try it. Got a receipt handy?
 Send a photo.

 No receipt nearby? Tell me something to
 remind you about instead, like 'remind
 me to pay rent Friday.'"
        ↓
User sends ONE of: a receipt photo, a
reminder request, OR (business accounts
only) a business card photo
        ↓
IF receipt photo:
  → Bot extracts and confirms the data
  → "Got it! [Vendor], ₦[amount], logged
     under [category] ✅"

IF reminder request:
  → Bot parses and confirms the reminder
  → "Got it! I'll remind you: '[reminder
     text]' on [date] ✅"

IF business card photo (business accounts
only, see "Business Card Scanning" section
below for full spec):
  → Bot extracts name, company, role,
    phone, email
  → "Got it! Saved [Name] from [Company]
     as a new lead 🪪
     Want me to set a follow-up reminder?
     Just say when, like 'remind me in
     3 days.'"

[AHA MOMENT COMPLETE either way, target
under 60 seconds total from first "Hi"]
        ↓
"Want to see all this on the web too? Tap
 below, no password needed, this link logs
 you straight in:
 app.gettrueflow.com/login?token=xyz123
 (Expires in 15 minutes for your security.)

 Everything we just did here is already
 waiting for you there."
        ↓
"One more thing, want to add your email?
 It helps if you ever want your invoices
 or monthly summaries sent there. Totally
 optional, just reply with it or skip."
        ↓
User replies with email OR skips
        ↓
IF email given and does NOT match an
existing profile:
  → save directly to profiles.email,
    no verification needed, this is a
    brand new person adding their own
    contact info, not claiming an
    existing account
  → "Got it, saved to your profile ✅"

IF email given and DOES match an existing
profile:
  → do not save directly, this could be
    a genuine returning user's existing
    web account, or someone typing an
    email that is not actually theirs
  → trigger the exact verification-code
    merge flow already specced in
    "Cross-Channel Identity Merge" above,
    Flow 1
  → "I found an account with that email,
     sending a code there to confirm
     it's you"
```

### Business Rules for This Flow

1. The 🪪 business card capability line and the ability to scan a
   business card at all only apply to accounts where the user
   answered "business" to the account-type question, never shown
   or offered to family or personal accounts
2. The receipt-or-reminder fallback choice must always be presented
   together in the same message, never sequentially, so a user
   without a receipt handy never feels stuck waiting to be asked
3. The web login offer and the optional email offer are two
   separate messages, never combined into one, so each is easy to
   read and respond to independently
4. The magic link token expires in 15 minutes; after expiry, direct
   the user to app.gettrueflow.com/login where they can use the
   standard OTP-via-WhatsApp login instead, the magic link is a
   first-session convenience, OTP is the permanent, repeatable
   login method
5. Never ask for email before the aha moment completes, this rule
   from the original onboarding spec still applies without exception

---

## Business Card Scanning — Lead Capture

### Why This Exists

Extends the existing image classification system (already
distinguishing expense receipts from incoming payment screenshots
in Smart Transfer Recognition) with a third category, business
cards, for capturing potential clients or leads met in person, at
networking events, meetings, or anywhere else a business owner
collects contact information.

### The Lead vs Client Distinction

A business card scan does NOT create a fully active client record
identical to a paying client. It creates the same underlying
`clients` table row, but tagged as a lead, so it never clutters
views meant for real, active business relationships.

```sql
-- New columns on the existing clients table
alter table clients add column if not exists
  source text default 'manual';
  -- 'manual' | 'business_card' | 'smart_transfer'
alter table clients add column if not exists
  status text default 'active';
  -- 'lead' | 'active' | 'archived'
  -- NOTE: if clients.status already has other values in
  -- use elsewhere in the codebase, extend that existing
  -- enum/check constraint rather than creating a
  -- conflicting one
```

A business card scan inserts a `clients` row with `status = 'lead'`,
`source = 'business_card'`. The moment that lead actually pays
something or a real project starts, the SAME row's status updates to
`'active'`, no new record, no data migration, no duplicate client.

### Where Leads Appear in the UI

Leads appear in the existing `/clients` list (the badge approach,
not a separate page), shown with a small "Lead" badge distinguishing
them from active clients. Dashboard views that aggregate real
business activity, "Top Clients by Outstanding Balance," any revenue
or balance totals, must filter to `status = 'active'` only, so leads
never inflate or pollute those numbers.

### Image Classification Update

Extend the existing `detectImageType()` function (already built for
Smart Transfer Recognition) to recognize a third category:

```typescript
// detectImageType() return type becomes:
type ImageType = 'expense_receipt' | 'incoming_payment' |
                  'business_card' | 'unknown'

// Business card detection signals: presence of a personal
// name, a job title, a company name, and contact details
// (phone/email) in a compact card-like layout, distinct from
// the itemized line-item structure of a receipt or the bank
// transfer confirmation structure of a payment screenshot
```

### Data Extracted From a Business Card

```
name          — the person's full name
company       — organization/business name
role          — job title, if present
phone         — extracted phone number, if present
email         — extracted email, if present
```

### The Bot Reply and Follow-Up Offer

```
"Got it! Saved [Name] from [Company] as a new lead 🪪

Want me to set a follow-up reminder? Just say when,
like 'remind me in 3 days.'"
```

If the user responds with a follow-up time, create a standard
reminder row (reusing `reminder-service.ts`) linked to this new
client's id, so the reminder shows contextually on that client's
record, not just as a generic standalone reminder.

### Business Rules

1. Business card scanning is only offered and only functions for
   accounts where the organization type is business, never surfaced
   for family or personal accounts
2. A business card scan never creates a duplicate if the same
   person's name and company already exist as a lead or active
   client, ask for confirmation instead: "Looks like [Name] from
   [Company] might already be saved, update their info or is this
   someone new?"
3. RESOLVED: Leads do NOT count toward plan-based client limits.
   Only clients with status = 'active' count against a plan's client
   cap (e.g. SME Starter's 10-client limit). Leads are unlimited on
   every plan, regardless of tier. Rationale: the client limit gates
   ongoing managed business relationships (project tracking, income,
   invoicing), not contact capture. Penalizing business card scanning
   with the same limit as active clients would discourage the exact
   networking behavior this feature is meant to encourage. The limit
   correctly applies at the moment a lead converts to active, status
   flips from 'lead' to 'active', that update must check the plan's
   client limit at that moment, exactly as any other new active
   client creation already does, but the lead itself, however many
   are scanned, never counts before that point.
4. A lead converting to an active client is always a status update
   on the existing row, never a new client record. This status
   update must run through the same plan-limit check every other
   active-client creation already runs through, since this is the
   moment the lead actually starts counting.

---

## Home Page — Landing Page Above the Dashboard

### Why This Exists, Separate From Dashboard

Dashboard stays data-dense, charts, stats, activity feed, the "here's
what's happening with your money" view. Home is a softer, faster
entry point, the "here's what you probably want to do right now"
view. This is a new page, /home, positioned as the first thing a
user lands on after login, with Dashboard remaining a distinct,
separate nav item for the deeper data view. Reference design
inspiration: a teal-gradient greeting banner with time-aware copy,
and a filterable grid of shortcut cards, adapted here to TrueFlow's
actual brand colors and actual features.

### The Greeting Banner

```
Gradient background: Electric Violet #6C63FF fading to a
  deep violet/near-black, same gradient language already
  used on the "Meet Tello" promo card on the dashboard
Icon: Tello's sparkle mark (not a generic icon), small
  rounded square, top-left of the banner
Top row: real current date, real current local time,
  and a greeting badge (see Time-of-Day Logic below)
Main line: "Welcome back, [First Name]" pulling the
  real logged-in user's actual first name
Subtitle: "Everything you need, right where you left it."
```

### Time-of-Day Logic

Exactly three greeting states, computed from the user's own local
browser time, never the server's time, so a user in Lagos and a
user in Houston each see their own correct greeting:

```
5:00am – 11:59am   → "Good morning"
12:00pm – 4:59pm   → "Good afternoon"
5:00pm – 4:59am    → "Good evening"
```

Note: "Good evening" deliberately covers the full late-night stretch
through 5:00am rather than introducing a fourth "Good night" state,
keeping this simple and avoiding an awkward greeting showing at 2am.

```typescript
function getGreeting(): string {
  const hour = new Date().getHours() // local browser time
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening' // covers 17:00–4:59
}
```

Date and time displayed in the banner must also update live if the
page stays open across a boundary (e.g. open at 11:58am, still open
at 12:01pm), re-check on an interval (once per minute is sufficient)
rather than computing once on page load and never again.

### Shortcuts Section

Filter pills matching TrueFlow's actual feature areas, fewer and
more focused than a generic ERP's categories:

```
All | Money | Clients | Team | Tello
```

Shortcut cards per category, using the existing card visual style
from /dashboard-concept (white background in light mode, rounded
corners, soft shadow, icon top-left in a small colored square):

```
MONEY
  📷 Log a receipt — Scan or upload an expense
  📊 View reports — See your spending breakdown

CLIENTS
  👤 Add a client — Save a new client or lead
  📄 Create an invoice — Bill a client

TEAM
  (label reads "Family" instead of "Team" if the
  organization type is family, not business, pull
  this from the organization's existing type field)
  👥 Invite a team member — Add staff access

TELLO
  💬 Ask Tello — Jump straight into chat
  ⏰ Set a reminder — Never forget a deadline
```

A fifth card, Tax Hub, sits outside the four filter categories or
under a relevant one (Money makes sense), showing a small red
notification badge with a live count of pending tax items (upcoming
filing deadlines, unreviewed estimates), matching the reference's
notification-badge pattern exactly, pulling the real count from the
existing Tax Hub data, never a hardcoded number.

### Layout and Navigation

/home becomes the default landing route after login, replacing
whatever currently loads first. Dashboard remains accessible as its
own separate sidebar item, unchanged, still showing the full
data-dense view already built. Both pages share the same header,
sidebar, and light/dark mode system already established.

### Business Rules

1. Greeting and time must be computed from the user's own local
   browser time, never hardcoded or server-time-based
2. The greeting must re-check at least once per minute while the
   page is open, not only once on load
3. The user's real first name must be pulled from their actual
   profile, never a placeholder
4. The Team/Family label and the shortcut cards shown must adapt
   based on the organization's actual type, not be identical for
   every account type
5. Any notification badge shown on a shortcut card (like Tax Hub)
   must reflect a real, live count from the underlying data, never
   a static or example number
6. This page must use the exact same visual design system already
   approved on /dashboard-concept, no separate visual language
