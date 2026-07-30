// api/invoices/[id]/notify-status/route.ts
// Fires an org-wide notification for the invoice's CURRENT status, read
// fresh from the DB (never trusts a client-supplied title/body) — called
// as a fire-and-forget follow-up right after invoices/[id]/page.tsx's
// direct client-side status update succeeds, since the update itself is a
// plain Supabase call, not an API route, and multi-recipient notification
// fan-out needs the service role key.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyOrgMembers } from '@/lib/notifications'
import { formatCurrency } from '@/lib/utils'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = getAdmin()

  const { data: invoice } = await admin
    .from('invoices')
    .select('org_id, invoice_number, client_name, total_amount, currency, status')
    .eq('id', id)
    .maybeSingle()

  if (!invoice || !['paid', 'overdue'].includes(invoice.status)) {
    return NextResponse.json({ success: true, skipped: true })
  }

  const amount = formatCurrency(Number(invoice.total_amount), invoice.currency)
  const label = invoice.invoice_number ?? 'Invoice'

  await notifyOrgMembers({
    orgId: invoice.org_id,
    category: 'invoice',
    title: invoice.status === 'paid' ? `${label} paid` : `${label} overdue`,
    body: invoice.status === 'paid'
      ? `${amount} from ${invoice.client_name ?? 'client'} has been marked as paid.`
      : `${amount} owed by ${invoice.client_name ?? 'client'} is now overdue.`,
    link: `/invoices/${id}`,
  })

  return NextResponse.json({ success: true })
}
