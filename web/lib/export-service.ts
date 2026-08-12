// lib/export-service.ts
// Builds the "Export All My Data" ZIP archive — five CSVs, no PDFs, no
// other formats. Every query below is scoped to a single org_id resolved
// server-side from the authenticated caller (never client-supplied), so a
// Business Pro team member can never pull another org's data this way —
// see api/export/all/route.ts for how org_id gets resolved.

import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import { toCsv } from '@/components/shared/PageTools'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// transactions.csv — combined money-out (receipts) and money-in
// (client_payments) history in one file, distinguished by `direction`,
// matching CLAUDE.md's MONEY OUT / MONEY IN framing rather than shipping
// two separately-named files for what the ticket calls one dataset.
async function buildTransactionsCsv(admin: ReturnType<typeof getAdmin>, orgId: string): Promise<string> {
  const [{ data: receipts }, { data: payments }] = await Promise.all([
    admin.from('receipts').select('date, vendor_name, category, amount, currency, tax_amount, uploaded_via, notes').eq('org_id', orgId),
    admin.from('client_payments').select('payment_date, amount, currency, payment_type, payment_reference, notes, clients(name)').eq('org_id', orgId),
  ])

  const rows = [
    ...(receipts ?? []).map(r => ({
      direction: 'expense',
      date: r.date,
      counterparty: r.vendor_name ?? '',
      category: r.category ?? '',
      amount: r.amount,
      tax_amount: r.tax_amount ?? 0,
      currency: r.currency,
      channel: r.uploaded_via ?? '',
      reference: '',
      notes: r.notes ?? '',
    })),
    ...(payments ?? []).map((p: any) => ({
      direction: 'income',
      date: p.payment_date,
      counterparty: p.clients?.name ?? '',
      category: p.payment_type ?? '',
      amount: p.amount,
      tax_amount: 0,
      currency: p.currency,
      channel: '',
      reference: p.payment_reference ?? '',
      notes: p.notes ?? '',
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1))

  return toCsv(rows)
}

async function buildClientsCsv(admin: ReturnType<typeof getAdmin>, orgId: string): Promise<string> {
  const { data } = await admin
    .from('clients')
    .select('name, phone, email, company, status, source, is_paying, birthday_month, birthday_day, birthday_year, total_earned, outstanding_balance, created_at')
    .eq('org_id', orgId)

  return toCsv((data ?? []).map(c => ({
    name: c.name,
    phone: c.phone ?? '',
    email: c.email ?? '',
    company: c.company ?? '',
    status: c.status,
    source: c.source ?? '',
    is_paying: c.is_paying,
    birthday: c.birthday_month && c.birthday_day ? `${c.birthday_month}/${c.birthday_day}${c.birthday_year ? `/${c.birthday_year}` : ''}` : '',
    total_earned: c.total_earned,
    outstanding_balance: c.outstanding_balance,
    client_since: c.created_at,
  })))
}

async function buildInvoicesCsv(admin: ReturnType<typeof getAdmin>, orgId: string): Promise<string> {
  const { data } = await admin
    .from('invoices')
    .select('invoice_number, client_name, subtotal, tax_amount, total_amount, currency, status, issue_date, due_date, paid_at')
    .eq('org_id', orgId)

  return toCsv((data ?? []).map(i => ({
    invoice_number: i.invoice_number ?? '',
    client: i.client_name ?? '',
    subtotal: i.subtotal,
    tax_amount: i.tax_amount ?? 0,
    total_amount: i.total_amount,
    currency: i.currency,
    status: i.status,
    issue_date: i.issue_date,
    due_date: i.due_date ?? '',
    paid_at: i.paid_at ?? '',
  })))
}

// Includes both active and archived reminders per the ticket — the only
// reminders export that ever needs both states in one file.
async function buildRemindersCsv(admin: ReturnType<typeof getAdmin>, orgId: string): Promise<string> {
  const { data } = await admin
    .from('reminders')
    .select('title, due_date, recurrence, category, status, archived_at, created_at')
    .eq('org_id', orgId)

  return toCsv((data ?? []).map(r => ({
    title: r.title,
    due_date: r.due_date,
    recurrence: r.recurrence,
    category: r.category,
    status: r.status,
    archived: r.archived_at ? 'yes' : 'no',
    created_at: r.created_at,
  })))
}

// Deliberately NEVER includes password/auth internals — only what's
// visibly editable in Settings, plus plan/creation date.
async function buildAccountInfoCsv(admin: ReturnType<typeof getAdmin>, orgId: string): Promise<string> {
  const { data: org } = await admin
    .from('organizations')
    .select('name, type, plan, currency, created_at')
    .eq('id', orgId)
    .single()

  const { data: owner } = await admin
    .from('org_members')
    .select('profiles(full_name, phone)')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .maybeSingle()

  const ownerProfile = (owner as any)?.profiles

  return toCsv([{
    business_name: org?.name ?? '',
    account_type: org?.type ?? '',
    plan: org?.plan ?? '',
    currency: org?.currency ?? '',
    owner_name: ownerProfile?.full_name ?? '',
    owner_phone: ownerProfile?.phone ?? '',
    account_created_at: org?.created_at ?? '',
  }])
}

export async function generateFullExportZip(orgId: string): Promise<Buffer> {
  const admin = getAdmin()
  const zip = new JSZip()

  const [transactions, clients, invoices, reminders, accountInfo] = await Promise.all([
    buildTransactionsCsv(admin, orgId),
    buildClientsCsv(admin, orgId),
    buildInvoicesCsv(admin, orgId),
    buildRemindersCsv(admin, orgId),
    buildAccountInfoCsv(admin, orgId),
  ])

  // Empty datasets still get a real (header-only, or literally empty) CSV
  // file in the archive — toCsv() returning '' for zero rows is fine here,
  // the file is still present, never silently dropped from the zip.
  zip.file('transactions.csv', transactions)
  zip.file('clients.csv', clients)
  zip.file('invoices.csv', invoices)
  zip.file('reminders.csv', reminders)
  zip.file('account_info.csv', accountInfo)

  return zip.generateAsync({ type: 'nodebuffer' })
}
