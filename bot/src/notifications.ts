// notifications.ts
// Bot-side mirror of web/lib/notifications.ts's server-side helpers for the
// shared `notifications` table (see bot/sql/step17-notifications.sql).
// Bot and web are separate deployments with no shared package (same
// precedent as plan-gates.ts / lib/plans.ts), so this is intentionally
// duplicated — keep both behaviourally identical.

import { supabase } from './supabase'

export type NotificationCategory =
  | 'reminder' | 'invoice' | 'client' | 'billing' | 'system' | 'project' | 'admin'

// Fans out to every active (non-removed) member of the org — the whole
// team sees org-relevant events, not just whoever triggered the action.
export async function notifyOrgMembers(params: {
  orgId: string
  category: NotificationCategory
  title: string
  body: string
  link?: string | null
}): Promise<void> {
  const { data: members, error: memberErr } = await supabase
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

  const { error } = await supabase.from('notifications').insert(rows)
  if (error) console.error('notifyOrgMembers: insert failed:', error.message)
}

// Fans out to every platform admin — used for new-signup / new-subscriber
// events that originate on the bot side (WhatsApp onboarding creates a new
// org directly, with no web API route in the loop to hook instead).
export async function notifyAdmins(params: {
  category: NotificationCategory
  title: string
  body: string
  link?: string | null
}): Promise<void> {
  const { data: admins, error: adminErr } = await supabase
    .from('profiles')
    .select('id')
    .not('admin_role', 'is', null)

  if (adminErr) {
    console.error('notifyAdmins: failed to load admins:', adminErr.message)
    return
  }
  if (!admins || admins.length === 0) return

  const rows = admins.map((a: any) => ({
    recipient_type: 'admin' as const,
    recipient_id: a.id,
    org_id: null,
    category: params.category,
    title: params.title,
    body: params.body,
    link: params.link ?? null,
  }))

  const { error } = await supabase.from('notifications').insert(rows)
  if (error) console.error('notifyAdmins: insert failed:', error.message)
}
