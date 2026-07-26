'use client'
// invoices/[id]/page.tsx
// Invoice detail — preview layout, mark paid, download PDF, status management

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Invoice } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CheckCircle, Download, Send, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { touchActivity } from '@/lib/activity'

interface LineItem { description: string; quantity: number; unit_price: number; total: number }
interface BankDetails { bank_account_name: string | null; bank_account_number: string | null; bank_name: string | null }

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-[#6C63FF]/10 text-[#6C63FF]',
  paid: 'bg-[#00D4AA]/10 text-[#00A88A]',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-yellow-100 text-yellow-700',
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const invoiceId = params.id as string

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [orgName, setOrgName] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  // Edit mode — line items, due date, notes. Bank details are edited from
  // org settings (they're shared across every invoice), not per-invoice.
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editItems, setEditItems] = useState<LineItem[]>([])
  const [editDueDate, setEditDueDate] = useState('')
  const [editNotes, setEditNotes] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: member } = await supabase
          .from('org_members')
          .select('org_id, organizations(name, bank_account_name, bank_account_number, bank_name)')
          .eq('user_id', user.id)
          .single()
        if (!member) return
        const org = (member as unknown as {
          org_id: string
          organizations: (BankDetails & { name: string }) | null
        })
        setOrgName(org.organizations?.name ?? '')
        setOrgId(org.org_id)
        setBankDetails(org.organizations ?? null)

        const { data } = await supabase.from('invoices').select('*, clients(name, email)').eq('id', invoiceId).single()
        setInvoice(data as unknown as Invoice)
        touchActivity()
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [invoiceId])

  function startEditing() {
    if (!invoice) return
    setEditItems(Array.isArray(invoice.line_items) ? JSON.parse(JSON.stringify(invoice.line_items)) : [])
    setEditDueDate(invoice.due_date ?? '')
    setEditNotes(invoice.notes ?? '')
    setEditing(true)
  }

  function updateEditItem(index: number, field: 'description' | 'quantity' | 'unit_price', value: string) {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== index) return item
      const next = { ...item, [field]: field === 'description' ? value : Number(value) || 0 }
      next.total = next.quantity * next.unit_price
      return next
    }))
  }

  function addEditItem() {
    setEditItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, total: 0 }])
  }

  function removeEditItem(index: number) {
    setEditItems(prev => prev.filter((_, i) => i !== index))
  }

  async function saveEdits() {
    if (!invoice) return
    setSaving(true)
    const subtotal = editItems.reduce((sum, item) => sum + item.total, 0)
    const taxAmount = subtotal * (Number(invoice.tax_rate) / 100)
    const totalAmount = subtotal + taxAmount

    const { error } = await supabase
      .from('invoices')
      .update({
        line_items: editItems,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        due_date: editDueDate || null,
        notes: editNotes || null,
      })
      .eq('id', invoiceId)

    setSaving(false)
    if (error) { toast.error(error.message); return }

    setInvoice(prev => prev ? {
      ...prev,
      line_items: editItems,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      due_date: editDueDate || null,
      notes: editNotes || null,
    } : prev)
    setEditing(false)
    toast.success('Invoice updated')
  }

  async function updateStatus(status: 'paid' | 'sent' | 'cancelled') {
    setUpdating(true)
    const update: Record<string, unknown> = { status }
    if (status === 'paid') update.paid_at = new Date().toISOString()
    const { error } = await supabase.from('invoices').update(update).eq('id', invoiceId)
    setUpdating(false)
    if (error) { toast.error(error.message); return }
    setInvoice(prev => prev ? { ...prev, status, paid_at: status === 'paid' ? new Date().toISOString() : prev.paid_at } : prev)
    toast.success(`Invoice marked as ${status}`)
  }

  function downloadPDF() {
    window.open(`/api/invoices/pdf/${invoiceId}`, '_blank')
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!invoice) return <div className="p-8 text-center text-gray-400">Invoice not found</div>

  const clientName = (invoice.clients as unknown as { name: string } | null)?.name ?? invoice.client_name ?? '—'
  const clientEmail = (invoice.clients as unknown as { email: string | null } | null)?.email ?? invoice.client_email ?? ''
  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : []

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Toolbar — hidden on print */}
      <div className="flex items-center gap-3 print:hidden">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <Badge variant="outline" className={STATUS_STYLES[invoice.status] ?? ''}>{invoice.status}</Badge>
        <div className="flex-1" />
        {invoice.status === 'draft' && (
          <Button variant="outline" className="gap-2" onClick={() => updateStatus('sent')} disabled={updating}>
            <Send size={15} /> Mark as Sent
          </Button>
        )}
        {(invoice.status === 'sent' || invoice.status === 'overdue') && (
          <Button className="bg-[#6C63FF] hover:bg-[#5A52E0] gap-2" onClick={() => updateStatus('paid')} disabled={updating}>
            <CheckCircle size={15} /> Mark as Paid
          </Button>
        )}
        <Button variant="outline" className="gap-2" onClick={downloadPDF}>
          <Download size={15} /> Download PDF
        </Button>
        {!editing ? (
          <Button variant="outline" className="gap-2" onClick={startEditing}>
            <Pencil size={15} /> Edit
          </Button>
        ) : (
          <>
            <Button variant="outline" className="gap-2" onClick={() => setEditing(false)} disabled={saving}>
              <X size={15} /> Cancel
            </Button>
            <Button className="bg-[#6C63FF] hover:bg-[#5A52E0] gap-2" onClick={saveEdits} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </>
        )}
      </div>

      {/* Invoice preview — looks like a real invoice */}
      <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm print:shadow-none print:border-none print:rounded-none">
        {/* Header */}
        <div className="flex justify-between items-start mb-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{orgName}</h2>
            <p className="text-sm text-gray-400 mt-1">hello@gettrueflow.com</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-[#00A88A]">INVOICE</p>
            <p className="text-sm font-mono text-gray-500 mt-1">{invoice.invoice_number ?? '—'}</p>
          </div>
        </div>

        {/* Bill to + dates */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Bill To</p>
            <p className="font-semibold text-gray-900">{clientName}</p>
            {clientEmail && <p className="text-sm text-gray-500">{clientEmail}</p>}
          </div>
          <div className="text-right space-y-1">
            <div className="flex justify-end gap-4 text-sm">
              <span className="text-gray-400">Issue Date</span>
              <span className="font-medium">{formatDate(invoice.issue_date)}</span>
            </div>
            {editing ? (
              <div className="flex justify-end items-center gap-2 text-sm print:hidden">
                <span className="text-gray-400">Due Date</span>
                <input
                  type="date"
                  className="h-8 px-2 rounded-md border border-gray-200 text-sm"
                  value={editDueDate ?? ''}
                  onChange={e => setEditDueDate(e.target.value)}
                />
              </div>
            ) : invoice.due_date && (
              <div className="flex justify-end gap-4 text-sm">
                <span className="text-gray-400">Due Date</span>
                <span className="font-medium">{formatDate(invoice.due_date)}</span>
              </div>
            )}
            {invoice.paid_at && (
              <div className="flex justify-end gap-4 text-sm">
                <span className="text-gray-400">Paid On</span>
                <span className="font-medium text-[#00A88A]">{formatDate(invoice.paid_at)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Line items */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="pb-2 text-left font-semibold text-gray-700">Description</th>
              <th className="pb-2 text-right font-semibold text-gray-700 w-16">Qty</th>
              <th className="pb-2 text-right font-semibold text-gray-700 w-28">Unit Price</th>
              <th className="pb-2 text-right font-semibold text-gray-700 w-28">Total</th>
            </tr>
          </thead>
          <tbody>
            {(editing ? editItems : lineItems).map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                {editing ? (
                  <>
                    <td className="py-2 pr-2">
                      <input
                        className="w-full h-9 px-2 rounded-md border border-gray-200 text-sm"
                        value={item.description}
                        onChange={e => updateEditItem(i, 'description', e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-1">
                      <input
                        type="number"
                        className="w-16 h-9 px-2 rounded-md border border-gray-200 text-sm text-right"
                        value={item.quantity}
                        onChange={e => updateEditItem(i, 'quantity', e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-1">
                      <input
                        type="number"
                        className="w-28 h-9 px-2 rounded-md border border-gray-200 text-sm text-right"
                        value={item.unit_price}
                        onChange={e => updateEditItem(i, 'unit_price', e.target.value)}
                      />
                    </td>
                    <td className="py-3 text-right font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {formatCurrency(item.total, invoice.currency)}
                        <button onClick={() => removeEditItem(i)} className="text-gray-300 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-3 text-gray-700">{item.description}</td>
                    <td className="py-3 text-right text-gray-500">{item.quantity}</td>
                    <td className="py-3 text-right text-gray-500">{formatCurrency(item.unit_price, invoice.currency)}</td>
                    <td className="py-3 text-right font-medium">{formatCurrency(item.total, invoice.currency)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {editing && (
          <button
            onClick={addEditItem}
            className="flex items-center gap-1.5 text-sm text-[#6C63FF] hover:text-[#5A52E0] mb-6 print:hidden"
          >
            <Plus size={15} /> Add line item
          </button>
        )}

        {/* Totals */}
        {(() => {
          const liveSubtotal = editing ? editItems.reduce((sum, item) => sum + item.total, 0) : invoice.subtotal
          const liveTaxAmount = editing ? liveSubtotal * (Number(invoice.tax_rate) / 100) : invoice.tax_amount
          const liveTotal = editing ? liveSubtotal + liveTaxAmount : invoice.total_amount
          return (
            <div className="flex justify-end mb-8">
              <div className="w-60 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span>{formatCurrency(liveSubtotal, invoice.currency)}</span>
                </div>
                {invoice.tax_rate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tax ({invoice.tax_rate}%)</span>
                    <span>{formatCurrency(liveTaxAmount, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>Total</span>
                  <span className="text-[#00A88A]">{formatCurrency(liveTotal, invoice.currency)}</span>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Payment Details — the default/fallback payment method, always
            shown when the org has bank details saved. Editable from
            Settings, not per-invoice, since it's shared across every
            invoice this org sends. */}
        {bankDetails?.bank_account_name && bankDetails?.bank_account_number && bankDetails?.bank_name ? (
          <div className="bg-[#6C63FF]/5 border border-[#6C63FF]/20 rounded-lg p-5 mb-8">
            <p className="text-xs font-semibold text-[#6C63FF] uppercase mb-3">Payment Details</p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase mb-0.5">Account Name</p>
                <p className="font-medium text-gray-800">{bankDetails.bank_account_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase mb-0.5">Account Number</p>
                <p className="font-medium text-gray-800">{bankDetails.bank_account_number}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase mb-0.5">Bank</p>
                <p className="font-medium text-gray-800">{bankDetails.bank_name}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8 print:hidden">
            <p className="text-sm text-yellow-800">
              No bank account details saved yet — add them in <a href="/settings/business" className="underline font-medium">Settings</a> so clients know where to pay.
            </p>
          </div>
        )}

        {/* Notes */}
        {editing ? (
          <div className="border-t pt-6 print:hidden">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Notes</p>
            <textarea
              className="w-full rounded-md border border-gray-200 text-sm p-2 min-h-20"
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Payment terms, thank-you note, etc."
            />
          </div>
        ) : invoice.notes && (
          <div className="border-t pt-6">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Notes</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-6 border-t text-center text-xs text-gray-400">
          Generated by TrueFlow · gettrueflow.com
        </div>
      </div>
    </div>
  )
}
