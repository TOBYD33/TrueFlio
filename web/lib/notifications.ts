// lib/notifications.ts
// Server-side helpers for writing to the shared `notifications` table (see
// bot/sql/step17-notifications.sql). Never insert into this table from
// client code — RLS has no insert policy for anon/authenticated on
// purpose, exactly like admin_audit_log. Bot has its own mirror of these
// helpers (bot/src/notifications.ts) since bot/web share no package.

import { createClient } from '@supabase/supabase-js'

export type NotificationCategory =
  | 'reminder' | 'invoice' | 'client' | 'billing' | 'system' | 'project' | 'admin'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface NotifyOneParams {
  recipientId: string
  orgId?: string | null
  category: NotificationCategory
  title: string
  body: string
  link?: string | null
}

export async function notifyUser(params: NotifyOneParams): Promise<void> {
  const admin = getAdmin()
  const { error } = await admin.from('notifications').insert({
    recipient_type: 'user',
    recipient_id: params.recipientId,
    org_id: params.orgId ?? null,
    category: params.category,
    title: params.title,
    body: params.body,
    link: params.link ?? null,
  })
  if (error) console.error('notifyUser failed:', error.message)
}

// Fans out to every active (non-removed) member of the org — the whole
// team sees org-relevant events (invoice paid, new lead, reminder fired),
// not just whoever happened to trigger the underlying action.
export async function notifyOrgMembers(params: {
  orgId: string
  category: NotificationCategory
  title: string
  body: string
  link?: string | null
}): Promise<void> {
  const admin = getAdmin()
  const { data: members, error: memberErr } = await admin
    .from('org_members')
    .select('user_id')
    .eq('org_id', params.orgId)
    .is('removed_at', null)

  if (memberErr) {
    console.error('notifyOrgMembers: failed to load members:', memberErr.message)
    return
  }
  if (!members || members.length === 0) return

  const rows = members.map(m => ({
    recipient_type: 'user' as const,
    recipient_id: m.user_id,
    org_id: params.orgId,
    category: params.category,
    title: params.title,
    body: params.body,
    link: params.link ?? null,
  }))

  const { error } = await admin.from('notifications').insert(rows)
  if (error) console.error('notifyOrgMembers: insert failed:', error.message)
}

// Fans out to every platform admin (profiles.admin_role is not null) —
// used for the Super Admin panel's bell. Includes the acting admin
// themselves (e.g. they made a pricing change) — simpler than excluding
// self, and seeing your own action confirmed in the feed is expected ERP
// behaviour, not noise.
export async function notifyAdmins(params: {
  category: NotificationCategory
  title: string
  body: string
  link?: string | null
}): Promise<void> {
  const admin = getAdmin()
  const { data: admins, error: adminErr } = await admin
    .from('profiles')
    .select('id')
    .not('admin_role', 'is', null)

  if (adminErr) {
    console.error('notifyAdmins: failed to load admins:', adminErr.message)
    return
  }
  if (!admins || admins.length === 0) return

  const rows = admins.map(a => ({
    recipient_type: 'admin' as const,
    recipient_id: a.id,
    org_id: null,
    category: params.category,
    title: params.title,
    body: params.body,
    link: params.link ?? null,
  }))

  const { error } = await admin.from('notifications').insert(rows)
  if (error) console.error('notifyAdmins: insert failed:', error.message)
}
