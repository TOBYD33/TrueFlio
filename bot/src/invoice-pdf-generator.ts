// invoice-pdf-generator.ts
// Renders an invoice to PDF and uploads it to Supabase Storage. Delivered
// directly via WhatsApp — unlike the web app's authenticated print route,
// this link needs no login, since the recipient forwarding it to their
// client obviously has no TrueFlow account. Bank account details (the
// default/fallback payment method) are always rendered, independent of
// whether a payment-link integration exists.

import puppeteer from 'puppeteer'
import { supabase } from './supabase'
import { canUseInvoiceBranding } from './plan-gates'

interface InvoicePdfData {
  orgName: string
  orgAddress?: string | null
  orgLogoUrl?: string | null
  invoiceNumber: string
  clientName: string
  lineItems: { description: string; quantity: number; unit_price: number; total: number }[]
  subtotal: number
  totalAmount: number
  currency: string
  issueDate: string
  dueDate?: string | null
  bankAccountName?: string | null
  bankAccountNumber?: string | null
  bankName?: string | null
}

function money(n: number, currency: string): string {
  return `${currency} ${Number(n).toLocaleString()}`
}

function buildInvoiceHtml(d: InvoicePdfData): string {
  const hasBankDetails = !!(d.bankAccountName && d.bankAccountNumber && d.bankName)

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 13px; padding: 40px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 32px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .org-logo { width: 56px; height: 56px; object-fit: contain; border-radius: 8px; flex-shrink: 0; }
  .org-name { font-size: 20px; font-weight: 700; }
  .org-address { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .invoice-word { font-size: 28px; font-weight: 700; color: #6C63FF; text-align: right; }
  .invoice-number { font-size: 12px; color: #6b7280; text-align: right; font-family: monospace; }
  .meta { display: flex; justify-content: space-between; background: #f9fafb; border-radius: 8px; padding: 18px; margin-bottom: 28px; }
  .meta-label { font-size: 10px; text-transform: uppercase; color: #9ca3af; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { border-bottom: 2px solid #111827; padding: 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; text-align: left; }
  thead th.right { text-align: right; }
  tbody td { border-bottom: 1px solid #f3f4f6; padding: 10px 8px; font-size: 13px; }
  tbody td.right { text-align: right; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 28px; }
  .totals-row { display: flex; justify-content: space-between; width: 240px; padding: 4px 0; }
  .totals-row.grand { font-weight: 700; font-size: 15px; border-top: 2px solid #111827; padding-top: 8px; color: #6C63FF; }
  .bank-box { background: #f0f0ff; border: 1px solid #6C63FF33; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .bank-box h4 { font-size: 11px; text-transform: uppercase; color: #6C63FF; margin-bottom: 8px; }
  .bank-row { display: flex; gap: 24px; font-size: 13px; }
  .bank-row div span { display: block; font-size: 10px; color: #6b7280; text-transform: uppercase; }
  .footer { font-size: 11px; color: #9ca3af; text-align: center; margin-top: 20px; }
</style></head>
<body>
  <div class="header">
    <div class="header-left">
      ${d.orgLogoUrl ? `<img src="${d.orgLogoUrl}" alt="${d.orgName}" class="org-logo" />` : ''}
      <div>
        <div class="org-name">${d.orgName}</div>
        ${d.orgAddress ? `<div class="org-address">${d.orgAddress}</div>` : ''}
      </div>
    </div>
    <div>
      <div class="invoice-word">INVOICE</div>
      <div class="invoice-number">${d.invoiceNumber}</div>
    </div>
  </div>

  <div class="meta">
    <div>
      <div class="meta-label">Bill To</div>
      <div>${d.clientName}</div>
    </div>
    <div>
      <div class="meta-label">Issue Date</div>
      <div>${d.issueDate}</div>
    </div>
    ${d.dueDate ? `<div><div class="meta-label">Due Date</div><div>${d.dueDate}</div></div>` : ''}
  </div>

  <table>
    <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Total</th></tr></thead>
    <tbody>
      ${d.lineItems.map(item => `<tr>
        <td>${item.description}</td>
        <td class="right">${item.quantity}</td>
        <td class="right">${money(item.unit_price, d.currency)}</td>
        <td class="right">${money(item.total, d.currency)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div>
      <div class="totals-row"><span>Subtotal</span><span>${money(d.subtotal, d.currency)}</span></div>
      <div class="totals-row grand"><span>Total Due</span><span>${money(d.totalAmount, d.currency)}</span></div>
    </div>
  </div>

  ${hasBankDetails ? `<div class="bank-box">
    <h4>Payment Details</h4>
    <div class="bank-row">
      <div><span>Account Name</span>${d.bankAccountName}</div>
      <div><span>Account Number</span>${d.bankAccountNumber}</div>
      <div><span>Bank</span>${d.bankName}</div>
    </div>
  </div>` : ''}

  <div class="footer">Generated by TrueFlow · gettrueflow.com</div>
</body></html>`
}

export async function generateInvoicePdf(invoiceId: string): Promise<string | null> {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, organizations(name, currency, address, logo_url, plan, bank_account_name, bank_account_number, bank_name)')
    .eq('id', invoiceId)
    .single()

  if (error || !invoice) {
    console.error('generateInvoicePdf: invoice not found:', error)
    return null
  }

  const org = invoice.organizations as any
  const invoiceBrandingAllowed = await canUseInvoiceBranding(org?.plan)

  const html = buildInvoiceHtml({
    orgName: org?.name || 'Your Business',
    orgAddress: org?.address,
    orgLogoUrl: invoiceBrandingAllowed ? org?.logo_url : null,
    invoiceNumber: invoice.invoice_number,
    clientName: invoice.client_name,
    lineItems: invoice.line_items || [],
    subtotal: Number(invoice.subtotal),
    totalAmount: Number(invoice.total_amount),
    currency: invoice.currency,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    bankAccountName: org?.bank_account_name,
    bankAccountNumber: org?.bank_account_number,
    bankName: org?.bank_name,
  })

  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true })
    await browser.close()

    const filename = `${invoice.org_id}/${invoiceId}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(filename, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error('generateInvoicePdf: upload failed:', uploadError)
      return null
    }

    const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(filename)
    const publicUrl = urlData.publicUrl

    await supabase.from('invoices').update({ pdf_url: publicUrl }).eq('id', invoiceId)

    return publicUrl
  } catch (err) {
    console.error('generateInvoicePdf failed:', err)
    return null
  }
}
