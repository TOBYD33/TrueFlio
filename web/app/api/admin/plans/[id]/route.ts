// api/admin/plans/[id]/route.ts
// Super Admin plan editor — update a single plan's price/features/name, or
// retire/un-retire it. Super Admin only, matching Broadcast/Permanently
// Erase/Revenue.
//
// PATCH accepts a partial set of plan_definitions columns (snake_case,
// matching the DB directly since this is an internal admin API). Only the
// fields actually present in the body are changed; every change is diffed
// old→new and written to admin_audit_log before returning.
//
// PRICING SAFETY (Requirement 3): a monthly_ngn change here takes effect
// immediately for NEW checkouts (Flutterwave initialize/verify-redirect
// read plan_definitions live) but never touches existing subscribers —
// their organizations.subscribed_price_ngn was locked in once at
// activation and is only ever changed via the separate, typed-confirmation
// migrate-subscribers action. Retiring a plan (is_retired: true) only
// hides it from new-signup surfaces; it does not suspend, downgrade, or
// otherwise affect any organization already on it.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'

const EDITABLE_FIELDS = [
  'label', 'display_label', 'tagline', 'monthly_ngn', 'scan_limit', 'client_limit',
  'automated_reminder', 'staff_limit', 'tax_analysis', 'invoice_branding',
  'support_priority', 'self_serve', 'most_popular', 'is_retired', 'sort_order',
] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json() as Record<string, unknown>

  const admin = getAdminClient()
  const { data: current, error: fetchErr } = await admin.from('plan_definitions').select('*').eq('id', id).maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: `Plan "${id}" not found` }, { status: 404 })

  const update: Record<string, unknown> = {}
  const diff: Record<string, { old: unknown; new: unknown }> = {}

  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue
    const newVal = body[field]
    const oldVal = (current as Record<string, unknown>)[field]
    if (newVal === oldVal) continue
    update[field] = newVal
    diff[field] = { old: oldVal, new: newVal }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: true, changed: false })
  }

  const { error } = await admin.from('plan_definitions').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Distinguish a pure retire/un-retire toggle from a general edit in the
  // audit trail, since those are conceptually different admin actions.
  const onlyRetireToggled = Object.keys(diff).length === 1 && 'is_retired' in diff
  const action = onlyRetireToggled ? (diff.is_retired.new ? 'retire_plan' : 'unretire_plan') : 'update_plan'

  await logAdminAction({
    adminId: auth.userId,
    action,
    targetTable: 'plan_definitions',
    targetId: id,
    details: { plan_label: current.label, changes: diff },
  })

  return NextResponse.json({ success: true, changed: true, changes: diff })
}
