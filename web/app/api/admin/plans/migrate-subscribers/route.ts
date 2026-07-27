// api/admin/plans/migrate-subscribers/route.ts
// Requirement 3's "separate deliberate action": moves EXISTING subscribers
// on a plan onto that plan's current live price. This is the only thing
// that ever overwrites organizations.subscribed_price_ngn after activation
// — every other path (checkout, webhook, verify-redirect) sets it once and
// never again. Never runs implicitly as a side effect of a price edit.
//
// GET  ?planId=X  → preview: how many orgs are on this plan with a locked
//      price that differs from what they'd pay at the current live price
//      for their billing cycle. Admin must see this count before confirming.
// POST { planId, confirmation } → requires the typed string "MIGRATE",
//      exactly like Permanently Erase requires "Delete" and Broadcast
//      requires "Send" for >50 recipients. Updates every affected org's
//      subscribed_price_ngn to the new figure; does not touch plan,
//      receipt_limit, client_limit, or subscribed_at.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { fetchPlanDefinition, fetchBillingDiscounts, priceForCycleDb } from '@/lib/plans-db'
import type { BillingCycle } from '@/lib/plans'

interface AffectedOrg {
  id: string
  name: string
  cycle: BillingCycle
  currentPrice: number
  newPrice: number
}

async function resolveAffected(planId: string): Promise<{ planLabel: string; affected: AffectedOrg[] } | null> {
  const admin = getAdminClient()
  const [planDef, discounts] = await Promise.all([fetchPlanDefinition(planId), fetchBillingDiscounts()])
  if (!planDef) return null

  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name, subscribed_price_ngn, subscribed_cycle')
    .eq('plan', planId)
    .not('subscribed_price_ngn', 'is', null)

  const affected: AffectedOrg[] = []
  for (const org of orgs ?? []) {
    const cycle: BillingCycle = org.subscribed_cycle === 'quarterly' || org.subscribed_cycle === 'yearly' ? org.subscribed_cycle : 'monthly'
    const newPrice = priceForCycleDb(planDef.monthlyNgn, cycle, discounts)
    const currentPrice = Number(org.subscribed_price_ngn)
    if (newPrice !== currentPrice) {
      affected.push({ id: org.id, name: org.name, cycle, currentPrice, newPrice })
    }
  }

  return { planLabel: planDef.label, affected }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const planId = req.nextUrl.searchParams.get('planId')
  if (!planId) return NextResponse.json({ error: 'Missing planId' }, { status: 400 })

  const result = await resolveAffected(planId)
  if (!result) return NextResponse.json({ error: `Plan "${planId}" not found` }, { status: 404 })

  return NextResponse.json({
    planLabel: result.planLabel,
    count: result.affected.length,
    orgs: result.affected.slice(0, 20).map(o => ({ id: o.id, name: o.name, cycle: o.cycle, currentPrice: o.currentPrice, newPrice: o.newPrice })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { planId, confirmation } = await req.json() as { planId: string; confirmation?: string }
  if (!planId) return NextResponse.json({ error: 'Missing planId' }, { status: 400 })

  const result = await resolveAffected(planId)
  if (!result) return NextResponse.json({ error: `Plan "${planId}" not found` }, { status: 404 })

  if (result.affected.length === 0) {
    return NextResponse.json({ success: true, migrated: 0 })
  }

  if (confirmation !== 'MIGRATE') {
    return NextResponse.json(
      { error: `This will reprice ${result.affected.length} existing subscriber(s). Type "MIGRATE" to confirm.`, requiresConfirmation: true, count: result.affected.length },
      { status: 400 }
    )
  }

  const admin = getAdminClient()
  let migrated = 0
  const errors: string[] = []
  for (const org of result.affected) {
    const { error } = await admin.from('organizations').update({ subscribed_price_ngn: org.newPrice }).eq('id', org.id)
    if (error) errors.push(`${org.name}: ${error.message}`)
    else migrated++
  }

  await logAdminAction({
    adminId: auth.userId,
    action: 'migrate_existing_subscribers',
    targetTable: 'organizations',
    targetId: planId,
    details: {
      plan_label: result.planLabel,
      typed_confirmation: confirmation,
      migrated_count: migrated,
      orgs: result.affected.map(o => ({ id: o.id, name: o.name, old_price: o.currentPrice, new_price: o.newPrice, cycle: o.cycle })),
      errors: errors.length ? errors : undefined,
    },
  })

  return NextResponse.json({ success: true, migrated, errors: errors.length ? errors : undefined })
}
