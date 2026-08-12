-- Unified Data Export — "Export All My Data" job tracking + storage.
--
-- Generation happens synchronously within the API route today (realistic
-- data volumes for a single SME easily finish well inside a serverless
-- function's timeout), but the client-facing contract is already the
-- async one described in the ticket — fire the request, get notified via
-- the bell when it's ready — so this table exists from day one rather
-- than being retrofitted later if a real background job runner is ever
-- needed for larger accounts.

create table if not exists data_exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  requested_by uuid references profiles(id),
  status text not null default 'processing', -- 'processing' | 'ready' | 'failed'
  file_path text, -- storage path within the 'exports' bucket once generated
  expires_at timestamptz,
  error text,
  created_at timestamptz default now()
);

create index on data_exports (org_id, created_at desc);

alter table data_exports enable row level security;

-- Org members can see their own org's export history (e.g. a future
-- "recent exports" list) — all writes are server-side only (service role),
-- no insert/update policy needed, same pattern as admin_audit_log.
create policy "Org members see their own org's exports"
  on data_exports for select using (
    org_id in (select org_id from org_members where user_id = auth.uid() and removed_at is null)
  );

-- Private bucket — never public. Every download goes through a signed URL
-- generated server-side with a short expiry (see web/lib/export-service.ts),
-- so there's no bucket-level policy granting direct client access at all.
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;
