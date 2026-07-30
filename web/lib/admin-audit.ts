// lib/admin-audit.ts
// Reusable helper for writing to admin_audit_log.
// Always call this from every admin action handler — never duplicate inline.
//
// Also fans out a matching admin notification (see lib/notifications.ts)
// for every single write — per the notification bell feature's requirement
// that admin notifications reuse the audit log as their source rather than
// being a separate parallel system. describeAdminAction() below gives
// known actions a readable title/body; anything unmapped still gets a
// generic one automatically, so a new admin action type added later works
// here with zero extra code, not just once someone remembers to map it.

import { createClient } from '@supabase/supabase-js'
import { notifyAdmins } from './notifications'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface AuditEntry {
  adminId: string
  action: string
  targetTable?: string
  targetId?: string
  details?: Record<string, unknown>
}

function describeAdminAction(entry: AuditEntry): { title: string; body: string } {
  const d = entry.details ?? {}
  switch (entry.action) {
    case 'change_plan':
      return { title: 'Plan changed', body: `${d.org_name ?? 'An organization'}'s plan was changed from ${d.old_plan} to ${d.new_plan}.` }
    case 'create_plan':
      return { title: 'New plan created', body: `A new plan "${(d.new_plan as any)?.label ?? entry.targetId}" was added to the pricing catalogue.` }
    case 'update_plan':
      return { title: 'Plan updated', body: `${d.plan_label ?? entry.targetId} pricing/features were edited.` }
    case 'retire_plan':
      return { title: 'Plan retired', body: `${d.plan_label ?? entry.targetId} was retired — hidden from new signups.` }
    case 'unretire_plan':
      return { title: 'Plan un-retired', body: `${d.plan_label ?? entry.targetId} is visible to new signups again.` }
    case 'update_billing_discounts':
      return { title: 'Billing discounts updated', body: 'Quarterly/yearly discount percentages were changed.' }
    case 'migrate_existing_subscribers':
      return { title: 'Subscribers repriced', body: `${d.migrated_count ?? 0} existing subscriber(s) on ${d.plan_label ?? entry.targetId} were migrated to the current price.` }
    case 'suspend_org':
      return { title: 'Organization suspended', body: `${d.org_name ?? 'An organization'} was suspended.` }
    case 'reactivate_org':
      return { title: 'Organization reactivated', body: `${d.org_name ?? 'An organization'} was reactivated.` }
    case 'permanently_erase_org':
      return { title: 'Organization erased', body: `${d.org_name ?? 'An organization'} was permanently erased.` }
    case 'permanently_erase_user':
      return { title: 'User erased', body: `${d.full_name ?? d.phone ?? 'A user'} was permanently erased.` }
    case 'edit_user_fields':
      return { title: 'User profile edited', body: `Fields changed: ${Object.keys(d).join(', ') || 'unknown'}.` }
    case 'send_broadcast':
      return { title: 'Broadcast sent', body: `Sent to ${d.recipient_count ?? '?'} recipient(s) via ${d.channel ?? 'unknown channel'}.` }
    case 'grant_admin_role':
      return { title: 'Admin access granted', body: `Granted ${d.role ?? 'admin'} role to ${d.phone ?? 'a user'}.` }
    case 'revoke_admin_role':
      return { title: 'Admin access revoked', body: `Revoked ${d.revoked_role ?? 'admin'} role.` }
    case 'change_admin_role':
      return { title: 'Admin role changed', body: `Changed from ${d.old_role} to ${d.new_role}.` }
    case 'impersonate_start':
      return { title: 'Impersonation started', body: `An admin started an impersonation session (reason: ${d.reason ?? 'not given'}).` }
    case 'impersonate_end':
      return { title: 'Impersonation ended', body: 'An admin ended an impersonation session.' }
    case 'impersonation_write_enabled':
      return { title: 'Impersonation write access enabled', body: 'Write access was enabled during an active impersonation session.' }
    default:
      return {
        title: entry.action.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()),
        body: entry.targetTable ? `Affected ${entry.targetTable}${entry.targetId ? ` (${entry.targetId})` : ''}.` : 'An admin action was performed.',
      }
  }
}

export async function logAdminAction(entry: AuditEntry): Promise<void> {
  const admin = getAdmin()
  const { error } = await admin.from('admin_audit_log').insert({
    admin_id: entry.adminId,
    action: entry.action,
    target_table: entry.targetTable ?? null,
    target_id: entry.targetId ?? null,
    details: entry.details ?? null,
  })
  if (error) {
    console.error('logAdminAction failed:', error.message)
  }

  const { title, body } = describeAdminAction(entry)
  await notifyAdmins({
    category: 'admin',
    title,
    body,
    link: '/admin/audit-log',
  })
}
