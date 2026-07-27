// api/plans/route.ts
// Public read endpoint — the marketing pricing page, the in-app "All
// Plans" page, and Flutterwave checkout all read plan/discount data from
// here (or the equivalent server-side fetchers in lib/plans-db.ts) instead
// of a hardcoded config, so an admin edit in /admin/plans takes effect
// immediately with no deploy. No auth required — pricing is public
// information, same as the marketing site itself.

import { NextResponse } from 'next/server'
import { fetchVisiblePlanDefinitions, fetchBillingDiscounts } from '@/lib/plans-db'

export async function GET() {
  try {
    const [plans, discounts] = await Promise.all([
      fetchVisiblePlanDefinitions(),
      fetchBillingDiscounts(),
    ])
    return NextResponse.json({ plans, discounts })
  } catch (err) {
    console.error('api/plans GET failed:', err)
    return NextResponse.json({ error: 'Could not load plans' }, { status: 500 })
  }
}
