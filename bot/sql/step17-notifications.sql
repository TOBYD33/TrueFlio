-- Live Notification Bell — data model.
-- One shared table for both the user dashboard and the Super Admin panel;
-- recipient_type distinguishes which bell a row belongs to. recipient_id is
-- always a profiles.id (regular users and platform admins are both rows in
-- profiles — admin-ness is profiles.admin_role, not a separate identity).

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null, -- 'user' | 'admin'
  recipient_id uuid not null references profiles(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  category text not null default 'system',
  -- category: 'reminder' | 'invoice' | 'client' | 'billing' | 'system' | 'project' | 'admin'
  title text not null,
  body text not null,
  link text, -- where clicking the notification should navigate to
  is_read boolean not null default false,
  created_at timestamptz default now()
);

create index on notifications (recipient_type, recipient_id, created_at desc);
create index on notifications (recipient_type, recipient_id, is_read);

alter table notifications enable row level security;

-- Regular users see/update only their own notification rows.
create policy "Users see own notifications"
  on notifications for select using (
    recipient_type = 'user' and recipient_id = auth.uid()
  );
create policy "Users update own notifications"
  on notifications for update using (
    recipient_type = 'user' and recipient_id = auth.uid()
  );

-- Platform admins see/update only their own admin-stream rows, and only if
-- they actually hold an admin role — mirrors the gate every /admin/* route
-- already enforces via requireAdmin().
create policy "Admins see own notifications"
  on notifications for select using (
    recipient_type = 'admin' and recipient_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and admin_role is not null)
  );
create policy "Admins update own notifications"
  on notifications for update using (
    recipient_type = 'admin' and recipient_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and admin_role is not null)
  );

-- All writes happen server-side (service role, bot or web API routes) —
-- deliberately no insert policy for anon/authenticated, same reasoning as
-- admin_audit_log: a client should never be able to fabricate its own
-- notifications or someone else's.

-- Desktop (OS-level) push preference — same simple per-feature boolean
-- pattern already used for daily_brief_enabled / reengagement_enabled on
-- this table, rather than introducing a new preferences table structure
-- for a single toggle. In-app dropdown + sound are NOT gated by this column
-- — only the OS-level Notification API push is.
alter table profiles add column if not exists desktop_notifications_enabled boolean not null default true;

-- NOTE ON REALTIME: this project's existing live features (dashboard's
-- receipts subscription, WhatsApp chat) already subscribe to
-- postgres_changes with no extra publication setup, meaning the project's
-- supabase_realtime publication is already FOR ALL TABLES — notifications
-- should work the same way with no further action. If it doesn't fire in
-- practice, check Database -> Replication in the Supabase dashboard and
-- ensure "notifications" is enabled there.
