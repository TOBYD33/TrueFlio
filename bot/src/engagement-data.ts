// engagement-data.ts
// THE single shared contextual-data pull for both Inactivity Re-Engagement
// and Daily Brief. Mirrors web/app/(protected)/home/page.tsx's Tax Hub
// badge query exactly (reminders where category='tax' and status='active')
// — never recompute that count differently here. Reminders-due-today and
// overdue-invoices use the same real date-comparison pattern already
// established on web/app/(protected)/reminders/page.tsx (no stored
// "overdue" status is ever written for invoices anywhere in the codebase —
// it's a derived comparison against due_date, same as reminders).

import { supabase } from './supabase'
import { dateStrInTimezone } from './timezone-util'

export interface PendingSummary {
  taxPendingCount: number
  remindersDueTodayCount: number
  overdueInvoiceCount: number
  unpaidInvoiceCount: number
  hasAnyPending: boolean
}

export async function getPendingSummary(orgId: string, tz: string): Promise<PendingSummary> {
  const today = dateStrInTimezone(tz, new Date())

  const [{ count: taxCount }, { count: dueTodayCount }, { data: openInvoices }] = await Promise.all([
    // Exact mirror of the Home page's Tax Hub badge query.
    supabase.from('reminders').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId).eq('category', 'tax').eq('status', 'active'),
    supabase.from('reminders').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId).eq('status', 'active').eq('due_date', today),
    supabase.from('invoices').select('id, due_date, status')
      .eq('org_id', orgId).in('status', ['sent', 'overdue']),
  ])

  const invoices = openInvoices || []
  const overdueInvoiceCount = invoices.filter(i => i.due_date && i.due_date < today).length
  const unpaidInvoiceCount = invoices.length

  const taxPendingCount = taxCount ?? 0
  const remindersDueTodayCount = dueTodayCount ?? 0

  return {
    taxPendingCount,
    remindersDueTodayCount,
    overdueInvoiceCount,
    unpaidInvoiceCount,
    hasAnyPending: taxPendingCount > 0 || remindersDueTodayCount > 0 || unpaidInvoiceCount > 0,
  }
}
