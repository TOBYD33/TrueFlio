// api/admin/billing-discounts/route.ts
// Super Admin editor for the global quarterly/yearly discount percentages
// (billing_discounts singleton row). Same activation-time rule as plan
// prices: a change here affects what NEW checkouts charge immediately, but
// never recomputes any existing subscriber's locked-in
// organizations.subscribed_price_ngn.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { fetchBillingDiscounts } from '@/lib/plans-db'

export async function GET() {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const discounts = await fetchBillingDiscounts()
  return NextResponse.json({ discounts })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { quarterlyDiscountPct, yearlyDiscountPct } = await req.json() as {
    quarterlyDiscountPct?: number
    yearlyDiscountPct?: number
  }

  const admin = getAdminClient()
  const { data: current, error: fetchErr } = await admin
    .from('billing_discounts')
    .select('quarterly_discount_pct, yearly_discount_pct')
    .eq('id', 'global')
    .single()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  const update: Record<string, number> = {}
  if (quarterlyDiscountPct !== undefined) {
    if (quarterlyDiscountPct < 0 || quarterlyDiscountPct > 100) {
      return NextResponse.json({ error: 'quarterlyDiscountPct must be between 0 and 100' }, { status: 400 })
    }
    update.quarterly_discount_pct = quarterlyDiscountPct
  }
  if (yearlyDiscountPct !== undefined) {
    if (yearlyDiscountPct < 0 || yearlyDiscountPct > 100) {
      return NextResponse.json({ error: 'yearlyDiscountPct must be between 0 and 100' }, { status: 400 })
    }
    update.yearly_discount_pct = yearlyDiscountPct
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: true, changed: false })
  }

  const { error } = await admin.from('billing_discounts').update(update).eq('id', 'global')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: auth.userId,
    action: 'update_billing_discounts',
    targetTable: 'billing_discounts',
    targetId: 'global',
    details: { old: current, new: update },
  })

  return NextResponse.json({ success: true, changed: true })
}
