// api/invoices/pdf/[id]/route.ts
// Generates a printable HTML invoice — opens in browser, Ctrl+P to save as PDF.
// Fetches invoice + org details from Supabase and builds a clean invoice layout.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Invoice } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { canUseInvoiceBrandingDb } from '@/lib/plans-db'

type LineItem = { description: string; quantity: number; unit_price: number; total: number }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data: member } = await supabase
      .from('org_members')
      .select('org_id, organizations(name, logo_url, currency, address, plan, bank_account_name, bank_account_number, bank_name)')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ error: 'No org found' }, { status: 404 })

    const org = member.organizations as unknown as {
      name: string; logo_url?: string | null; currency?: string; address?: string | null; plan?: string | null
      bank_account_name?: string | null; bank_account_number?: string | null; bank_name?: string | null
    } | null
    const hasBankDetails = !!(org?.bank_account_name && org?.bank_account_number && org?.bank_name)
    const orgName = org?.name ?? 'Your Business'
    // Custom invoice logo/branding is a Business Pro+ feature — lower tiers
    // still get a clean invoice, just without the uploaded logo rendered.
    const showLogo = !!org?.logo_url && await canUseInvoiceBrandingDb(org?.plan)

    // Fetch profile phone for invoice header contact line
    const { data: profileData } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()
    const orgPhone = profileData?.phone ?? null

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*, clients(name, email, address, phone)')
      .eq('id', id)
      .eq('org_id', member.org_id)
      .single()

    if (error || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const inv = invoice as unknown as Invoice & { clients?: { name: string; email?: string | null; address?: string | null; phone?: string | null } | null }
    const clientName = inv.clients?.name ?? inv.client_name ?? '—'
    const clientEmail = inv.clients?.email ?? inv.client_email ?? ''
    const lineItems: LineItem[] = Array.isArray(inv.line_items) ? inv.line_items : []

    const statusColors: Record<string, string> = {
      draft: '#6b7280',
      sent: '#2563eb',
      paid: '#059669',
      overdue: '#dc2626',
      cancelled: '#d97706',
    }
    const statusColor = statusColors[inv.status] ?? '#6b7280'

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice ${inv.invoice_number ?? ''} — ${orgName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 13px; background: #fff; padding: 48px; max-width: 800px; margin: 0 auto; }
  .print-bar { background: #6C63FF; color: #fff; padding: 10px 20px; margin: -48px -48px 40px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
  .print-bar button { background: #fff; color: #6C63FF; border: none; padding: 6px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .org-block { display: flex; align-items: flex-start; gap: 14px; }
  .org-logo { width: 80px; height: 80px; object-fit: contain; border-radius: 8px; flex-shrink: 0; }
  .org-name { font-size: 20px; font-weight: 700; color: #111827; line-height: 1.2; }
  .org-name-large { font-size: 22px; font-weight: 700; color: #111827; }
  .org-contact { font-size: 12px; color: #6b7280; margin-top: 5px; line-height: 1.7; }
  .invoice-badge { text-align: right; }
  .invoice-word { font-size: 32px; font-weight: 700; color: #6C63FF; letter-spacing: 2px; }
  .invoice-number { font-size: 13px; color: #6b7280; font-family: monospace; margin-top: 4px; }
  .status-tag { display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${statusColor}; background: ${statusColor}18; margin-top: 8px; }
  .meta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 40px; padding: 24px; background: #f9fafb; border-radius: 8px; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; font-weight: 600; margin-bottom: 6px; }
  .meta-value { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.5; }
  .meta-value small { font-weight: 400; color: #6b7280; font-size: 12px; display: block; }
  .dates { text-align: right; }
  .dates .date-row { display: flex; justify-content: flex-end; gap: 16px; margin-bottom: 4px; }
  .dates .date-label { font-size: 12px; color: #6b7280; }
  .dates .date-val { font-size: 12px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { border-bottom: 2px solid #111827; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; text-align: left; }
  thead th.right { text-align: right; }
  tbody td { border-bottom: 1px solid #f3f4f6; padding: 12px; font-size: 13px; }
  tbody td.right { text-align: right; color: #6b7280; }
  tbody td.amount { text-align: right; font-weight: 600; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 40px; }
  .totals-box { width: 260px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .totals-row.sub { color: #6b7280; }
  .totals-row.grand { font-size: 16px; font-weight: 700; border-top: 2px solid #111827; padding-top: 12px; margin-top: 6px; }
  .totals-row.grand .grand-amount { color: #6C63FF; }
  .bank-box { background: #6C63FF0d; border: 1px solid #6C63FF33; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .bank-box h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6C63FF; font-weight: 600; margin-bottom: 8px; }
  .bank-row { display: flex; gap: 32px; font-size: 13px; }
  .bank-row div span { display: block; font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; }
  .notes-box { background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 40px; }
  .notes-box h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; font-weight: 600; margin-bottom: 8px; }
  .notes-box p { font-size: 12px; color: #374151; line-height: 1.6; white-space: pre-wrap; }
  .footer { padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
  .footer-brand { font-size: 12px; color: #9ca3af; }
  .footer-brand strong { color: #6C63FF; }
  @media print {
    body { padding: 24px; }
    .print-bar { display: none; }
  }
</style>
</head>
<body>

<div class="print-bar">
  <span>Invoice ${inv.invoice_number ?? ''} — ready to print</span>
  <button onclick="window.print()">Print / Save as PDF</button>
</div>

<div class="header">
  <div>
    ${showLogo
      ? `<div class="org-block">
           <img src="${org.logo_url}" alt="${orgName}" class="org-logo" />
           <div>
             <div class="org-name">${orgName}</div>
             <div class="org-contact">${[org?.address, orgPhone].filter(Boolean).join('<br>')}</div>
           </div>
         </div>`
      : `<div>
           <div class="org-name-large">${orgName}</div>
           <div class="org-contact">${[org?.address, orgPhone].filter(Boolean).join('<br>')}</div>
         </div>`
    }</div>
  <div class="invoice-badge">
    <div class="invoice-word">INVOICE</div>
    <div class="invoice-number">${inv.invoice_number ?? '—'}</div>
    <div><span class="status-tag">${inv.status.toUpperCase()}</span></div>
  </div>
</div>

<div class="meta-row">
  <div>
    <div class="meta-label">Bill To</div>
    <div class="meta-value">
      ${clientName}
      ${clientEmail ? `<small>${clientEmail}</small>` : ''}
    </div>
  </div>
  <div class="dates">
    <div class="date-row">
      <span class="date-label">Issue Date</span>
      <span class="date-val">${formatDate(inv.issue_date)}</span>
    </div>
    ${inv.due_date ? `<div class="date-row">
      <span class="date-label">Due Date</span>
      <span class="date-val">${formatDate(inv.due_date)}</span>
    </div>` : ''}
    ${inv.paid_at ? `<div class="date-row">
      <span class="date-label" style="color:#059669">Paid On</span>
      <span class="date-val" style="color:#059669">${formatDate(inv.paid_at)}</span>
    </div>` : ''}
  </div>
</div>

<table>
<thead>
  <tr>
    <th>Description</th>
    <th class="right" style="width:60px">Qty</th>
    <th class="right" style="width:120px">Unit Price</th>
    <th class="right" style="width:120px">Total</th>
  </tr>
</thead>
<tbody>
  ${lineItems.length === 0 ? '<tr><td colspan="4" style="color:#9ca3af;text-align:center;padding:24px">No line items</td></tr>' :
    lineItems.map(item => `<tr>
    <td>${item.description}</td>
    <td class="right">${item.quantity}</td>
    <td class="right">${formatCurrency(item.unit_price, inv.currency)}</td>
    <td class="amount">${formatCurrency(item.total, inv.currency)}</td>
  </tr>`).join('')}
</tbody>
</table>

<div class="totals">
  <div class="totals-box">
    <div class="totals-row sub">
      <span>Subtotal</span>
      <span>${formatCurrency(inv.subtotal, inv.currency)}</span>
    </div>
    ${inv.tax_rate > 0 ? `<div class="totals-row sub">
      <span>Tax (${inv.tax_rate}%)</span>
      <span>${formatCurrency(inv.tax_amount, inv.currency)}</span>
    </div>` : ''}
    <div class="totals-row grand">
      <span>Total Due</span>
      <span class="grand-amount">${formatCurrency(inv.total_amount, inv.currency)}</span>
    </div>
  </div>
</div>

${hasBankDetails ? `<div class="bank-box">
  <h4>Payment Details</h4>
  <div class="bank-row">
    <div><span>Account Name</span>${org!.bank_account_name}</div>
    <div><span>Account Number</span>${org!.bank_account_number}</div>
    <div><span>Bank</span>${org!.bank_name}</div>
  </div>
</div>` : ''}

${inv.notes ? `<div class="notes-box">
  <h4>Notes / Payment Terms</h4>
  <p>${inv.notes}</p>
</div>` : ''}

<div class="footer">
  <div class="footer-brand">Generated by <strong>TrueFlow</strong> · gettrueflow.com</div>
  <div class="footer-brand">${orgName} · Confidential</div>
</div>

</body>
</html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="invoice-${inv.invoice_number ?? id}.html"`,
      },
    })
  } catch (err) {
    console.error('invoices/pdf route failed:', err)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }
}
