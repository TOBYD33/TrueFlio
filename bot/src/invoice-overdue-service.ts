// invoice-overdue-service.ts
// Transitions a sent-but-unpaid invoice to 'overdue' the day after its due
// date passes, and notifies the org. NEW as of the notification bell
// feature — status='overdue' was previously only ever READ (the web app's
// invoice detail page and badge styling both already branch on it) but
// nothing in the codebase ever WROTE it, so there was no existing
// trigger point to reuse here, unlike reminders/invoices-paid.
//
// Runs once daily and only acts on invoices whose due_date is exactly
// yesterday, so each invoice only ever fires this transition once, without
// needing a separate "already notified" column.

import { supabase } from './supabase'
import { notifyOrgMembers } from './notifications'
import { dateStrInTimezone, addDaysToDateStr } from './timezone-util'

export async function checkOverdueInvoices(): Promise<void> {
  const yesterday = addDaysToDateStr(dateStrInTimezone('Africa/Lagos', new Date()), -1)

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, org_id, invoice_number, client_name, total_amount, currency, due_date, status')
    .eq('status', 'sent')
    .eq('due_date', yesterday)

  if (error) {
    console.error('checkOverdueInvoices query failed:', error)
    return
  }

  for (const invoice of invoices || []) {
    try {
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ status: 'overdue' })
        .eq('id', invoice.id)
        .eq('status', 'sent') // guard against a race with a manual mark-as-paid

      if (updateError) {
        console.error(`checkOverdueInvoices: update failed for invoice ${invoice.id}:`, updateError)
        continue
      }

      const label = invoice.invoice_number ?? 'Invoice'
      const currency = invoice.currency ?? 'NGN'
      const amount = new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(invoice.total_amount))

      await notifyOrgMembers({
        orgId: invoice.org_id,
        category: 'invoice',
        title: `${label} overdue`,
        body: `${amount} owed by ${invoice.client_name ?? 'client'} is now overdue.`,
        link: `/invoices/${invoice.id}`,
      })
    } catch (err) {
      console.error(`checkOverdueInvoices: failed for invoice ${invoice.id}:`, err)
    }
  }
}
