-- Web Push — new delivery channel plugging into the EXISTING notification
-- system (bot/sql/step17-notifications.sql), not a parallel one. A push
-- subscription is per-browser/device (a user can install on a phone AND a
-- laptop and get both), so this is its own table keyed by recipient, not
-- a single column on profiles.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null, -- 'user' | 'admin' — mirrors notifications.recipient_type
  recipient_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

create index on push_subscriptions (recipient_type, recipient_id);

alter table push_subscriptions enable row level security;

-- A user can see/manage their own subscriptions (e.g. a future "manage
-- devices" settings list); writes in practice go through the service-role
-- subscribe/unsubscribe API routes, but self-service delete is safe to
-- allow directly since a subscription only ever grants push TO that
-- person, never any read/write of their data.
create policy "Users manage their own push subscriptions"
  on push_subscriptions for all using (
    recipient_type = 'user' and recipient_id = auth.uid()
  );
create policy "Admins manage their own push subscriptions"
  on push_subscriptions for all using (
    recipient_type = 'admin' and recipient_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and admin_role is not null)
  );

-- Same simple per-feature boolean pattern as desktop_notifications_enabled
-- / daily_brief_enabled / reengagement_enabled — this project has no
-- unified preferences table, see lib/notifications.ts's header comment.
alter table profiles add column if not exists push_notifications_enabled boolean not null default true;
