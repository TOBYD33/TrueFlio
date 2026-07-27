// api/admin/plans/route.ts
// Super Admin plan/pricing editor — list + create. Same tier as
// Broadcast/Admin Team/Permanently Erase (requireAdmin(['super'])).
//
// GET  → every plan_definitions row, including retired ones (admin needs
//        to see retired plans to un-retire them; public surfaces use
//        fetchVisiblePlanDefinitions() instead, which excludes these).
// POST → create a brand new plan id. Does NOT touch any existing plan or
//        organization — pure insert, never repriced anything.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { fetchAllPlanDefinitions } from '@/lib/plans-db'

const REQUIRED_FIELDS = ['id', 'label', 'display_label', 'tagline', 'monthly_ngn'] as const

export async function GET() {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const plans = await fetchAllPlanDefinitions()
  return NextResponse.json({ plans })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json() as Record<string, unknown>

  for (const f of REQUIRED_FIELDS) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      return NextResponse.json({ error: `Missing required field: ${f}` }, { status: 400 })
    }
  }

  const id = String(body.id).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
  if (!id) return NextResponse.json({ error: 'Invalid plan id' }, { status: 400 })

  const admin = getAdminClient()

  const { data: existing } = await admin.from('plan_definitions').select('id').eq('id', id).maybeSingle()
  if (existing) return NextResponse.json({ error: `Plan id "${id}" already exists` }, { status: 400 })

  const { data: maxSort } = await admin
    .from('plan_definitions')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sortOrder = (maxSort?.sort_order ?? 0) + 1

  const row = {
    id,
    label: String(body.label),
    display_label: String(body.display_label),
    tagline: String(body.tagline),
    monthly_ngn: Number(body.monthly_ngn),
    scan_limit: Number(body.scan_limit ?? -1),
    client_limit: Number(body.client_limit ?? 0),
    automated_reminder: Boolean(body.automated_reminder ?? false),
    staff_limit: Number(body.staff_limit ?? 0),
    tax_analysis: (body.tax_analysis as string) ?? 'inactive',
    invoice_branding: Boolean(body.invoice_branding ?? false),
    support_priority: Boolean(body.support_priority ?? false),
    self_serve: Boolean(body.self_serve ?? true),
    most_popular: Boolean(body.most_popular ?? false),
    is_retired: false,
    sort_order: sortOrder,
  }

  const { error } = await admin.from('plan_definitions').insert(row)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: auth.userId,
    action: 'create_plan',
    targetTable: 'plan_definitions',
    targetId: id,
    details: { new_plan: row },
  })

  return NextResponse.json({ success: true, id })
}
