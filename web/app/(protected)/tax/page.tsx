'use client'
// tax/page.tsx
// Tax Hub: Track & Estimate.
// Three layers: Layer 1 surfaces tax already recorded on receipts/invoices,
// Layer 2 shows reference rates (never live, always dated), Layer 3 is a
// bounded estimate of liability from recorded income. This is a tracking
// and estimating tool, not a tax filing or guaranteed-accurate calculator.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Receipt, Invoice, Reminder, TaxRateReference, TaxCountry } from '@/types'
import {
  TAX_COUNTRIES,
  COUNTRY_TO_CURRENCY,
  PERIOD_OPTIONS,
  TaxPeriodKey,
  rateReferenceDisclaimer,
  ESTIMATE_DISCLAIMER,
  formatTaxDate,
} from '@/lib/tax'
import { Landmark, Calculator, ScrollText, Bell, ArrowRight, Plus, TrendingDown, TrendingUp, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { getPlanConfig } from '@/lib/plans'
import { fetchLivePlanConfig } from '@/lib/plans-client'

// Advanced Tax Hub (Business Pro/Enterprise) unlocks quarterly and yearly
// reporting periods — Basic tiers (Individual/Business Starter) are capped
// to month-level periods. Free's Tax Analysis is fully inactive — see the
// full-page lock below, not just a period restriction.
const ADVANCED_ONLY_PERIODS: TaxPeriodKey[] = ['this_quarter', 'this_year']

const RECURRENCE_OPTIONS = [
  { value: 'once', label: 'One time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

interface EstimateResult {
  computable: boolean
  taxableIncome: number
  liability?: number
  ratePct?: number
  approximate?: boolean
  currency: string
  rateLabel: string
  lastVerifiedDate: string
  periodLabel: string
}

export default function TaxHubPage() {
  const supabase = createClient()

  const { orgId } = useViewingContext()
  const [loading, setLoading] = useState(true)
  const [country, setCountry] = useState<TaxCountry>('Nigeria')
  const [plan, setPlan] = useState<string | null>(null)
  // Initialised from the static fallback config (correct pre-live-fetch
  // default) then upgraded once fetchLivePlanConfig resolves — so an admin
  // toggle in /admin/plans reflects here without a stale lock/unlock flash.
  const [taxAnalysis, setTaxAnalysis] = useState<'inactive' | 'basic' | 'advanced'>(getPlanConfig(null).taxAnalysis)
  const [rates, setRates] = useState<TaxRateReference[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [taxReminders, setTaxReminders] = useState<Reminder[]>([])

  // Reminder quick-add
  const [reminderForm, setReminderForm] = useState({ title: '', due_date: '', recurrence: 'once' })
  const [savingReminder, setSavingReminder] = useState(false)

  // Layer 3 — estimate
  const [estimateTaxType, setEstimateTaxType] = useState<string>('')
  const [estimatePeriod, setEstimatePeriod] = useState<TaxPeriodKey>('this_month')
  const [estimate, setEstimate] = useState<EstimateResult | null>(null)
  const [calculating, setCalculating] = useState(false)

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const [{ data: org }, { data: rateRows }, { data: receiptRows }, { data: invoiceRows }, { data: reminderRows }] = await Promise.all([
        supabase.from('organizations').select('default_tax_country, currency, plan').eq('id', orgId).single(),
        supabase.from('tax_rate_reference').select('*').order('country').order('tax_type'),
        supabase.from('receipts').select('*').eq('org_id', orgId),
        supabase.from('invoices').select('*').eq('org_id', orgId),
        supabase.from('reminders').select('*').eq('org_id', orgId).eq('category', 'tax').eq('status', 'active').order('due_date', { ascending: true }),
      ])

      if (org?.default_tax_country) setCountry(org.default_tax_country as TaxCountry)
      if (org?.plan) setPlan(org.plan)
      fetchLivePlanConfig(org?.plan).then(cfg => setTaxAnalysis(cfg.taxAnalysis))
      setRates((rateRows as TaxRateReference[]) ?? [])
      setReceipts((receiptRows as Receipt[]) ?? [])
      setInvoices((invoiceRows as Invoice[]) ?? [])
      setTaxReminders((reminderRows as Reminder[]) ?? [])
      setLoading(false)
    }
    load()
  }, [orgId])

  const currency = COUNTRY_TO_CURRENCY[country]
  const countryRates = useMemo(() => rates.filter(r => r.country === country), [rates, country])

  useEffect(() => {
    if (countryRates.length > 0 && !countryRates.some(r => r.tax_type === estimateTaxType)) {
      setEstimateTaxType(countryRates[0].tax_type)
    }
    setEstimate(null)
  }, [countryRates])

  // ── Layer 1 — Transaction Tax Log ──────────────────────────────────────
  const filteredReceipts = useMemo(() => receipts.filter(r => r.currency === currency), [receipts, currency])
  const filteredInvoices = useMemo(() => invoices.filter(i => i.currency === currency && i.status === 'paid'), [invoices, currency])

  const taxPaidOut = filteredReceipts.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0)
  const taxCollected = filteredInvoices.reduce((s, i) => s + Number(i.tax_amount ?? 0), 0)

  const monthlyBreakdown = useMemo(() => {
    const map = new Map<string, { month: string; paidOut: number; collected: number }>()
    function key(d: string) {
      const dt = new Date(d)
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    }
    function label(d: string) {
      return new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    }
    for (const r of filteredReceipts) {
      if (!r.tax_amount) continue
      const k = key(r.date)
      const entry = map.get(k) ?? { month: label(r.date), paidOut: 0, collected: 0 }
      entry.paidOut += Number(r.tax_amount)
      map.set(k, entry)
    }
    for (const i of filteredInvoices) {
      if (!i.tax_amount) continue
      const k = key(i.issue_date)
      const entry = map.get(k) ?? { month: label(i.issue_date), paidOut: 0, collected: 0 }
      entry.collected += Number(i.tax_amount)
      map.set(k, entry)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, v]) => v).slice(0, 6)
  }, [filteredReceipts, filteredInvoices])

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of filteredReceipts) {
      if (!r.tax_amount) continue
      map.set(r.category, (map.get(r.category) ?? 0) + Number(r.tax_amount))
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [filteredReceipts])

  // ── Step 4 — tax reminders ─────────────────────────────────────────────
  async function handleAddReminder() {
    if (!orgId || !reminderForm.title.trim() || !reminderForm.due_date) return
    setSavingReminder(true)
    const { data, error } = await supabase.from('reminders').insert({
      org_id: orgId,
      title: reminderForm.title,
      due_date: reminderForm.due_date,
      recurrence: reminderForm.recurrence,
      category: 'tax',
    }).select().single()
    setSavingReminder(false)
    if (error) { toast.error(error.message); return }
    setTaxReminders(prev => [...prev, data as Reminder].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()))
    setReminderForm({ title: '', due_date: '', recurrence: 'once' })
    toast.success('Tax reminder set')
  }

  // ── Layer 3 — estimate ──────────────────────────────────────────────────
  async function handleCalculate() {
    if (!estimateTaxType) return
    setCalculating(true)
    setEstimate(null)
    try {
      const res = await fetch('/api/tax/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, taxType: estimateTaxType, period: estimatePeriod }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not calculate estimate'); return }
      setEstimate(json as EstimateResult)
    } finally {
      setCalculating(false)
    }
  }

  if (loading) return <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>

  if (taxAnalysis === 'inactive') {
    return (
      <div className="max-w-3xl">
        <Card>
          <CardContent className="py-16 text-center">
            <Lock size={28} className="mx-auto text-gray-300 mb-3" />
            <h2 className="text-lg font-bold text-gray-900 mb-1">Tax Hub is a paid feature</h2>
            <p className="text-sm text-gray-500 mb-5 max-w-sm mx-auto">
              Track and estimate your tax liability by upgrading to Individual or above.
            </p>
            <Link
              href="/settings/subscription"
              className="inline-block text-sm font-semibold px-5 py-2.5 rounded-lg bg-[#6C63FF] hover:bg-[#5A52E0] text-white transition-colors"
            >
              View plans
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Landmark size={24} className="text-[#00A88A]" /> Tax Hub
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Tax Hub: Track &amp; Estimate.</p>
      </div>

      {/* Country selector — sticky while scrolling */}
      <div className="sticky top-14 z-10 -mx-4 px-4 md:-mx-6 md:px-6 py-2 bg-gray-50/95 backdrop-blur">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 shrink-0">Country</span>
            <Select value={country} onValueChange={v => v && setCountry(v as TaxCountry)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TAX_COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-gray-400 ml-auto hidden sm:block">Showing {country} tax data — switch any time</span>
          </CardContent>
        </Card>
      </div>

      {/* Layer 1 — Transaction Tax Log */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <ScrollText size={16} className="text-gray-400" /> Transaction Tax Log
        </h2>
        <p className="text-xs text-gray-400 -mt-2">
          A record of tax already itemized on past transactions — not what you owe. For an estimate of your tax liability, see Estimated Liability below.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Tax paid out</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(taxPaidOut, currency)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Tax itemized on your business expense receipts</p>
                </div>
                <div className="p-2.5 rounded-lg bg-red-50 text-red-500"><TrendingDown size={20} /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Tax itemized on invoices</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(taxCollected, currency)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">e.g. VAT charged to clients on paid invoices — separate from income tax</p>
                </div>
                <div className="p-2.5 rounded-lg bg-[#00D4AA]/5 text-[#00A88A]"><TrendingUp size={20} /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {monthlyBreakdown.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">By month</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase">
                    <th className="px-4 py-2 text-left">Month</th>
                    <th className="px-4 py-2 text-right">Paid out</th>
                    <th className="px-4 py-2 text-right">Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {monthlyBreakdown.map(row => (
                    <tr key={row.month}>
                      <td className="px-4 py-2 text-gray-700">{row.month}</td>
                      <td className="px-4 py-2 text-right text-red-500">{formatCurrency(row.paidOut, currency)}</td>
                      <td className="px-4 py-2 text-right text-[#00A88A]">{formatCurrency(row.collected, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {categoryBreakdown.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Tax paid out by category</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {categoryBreakdown.map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{cat}</span>
                  <span className="font-medium text-gray-900">{formatCurrency(amt, currency)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {filteredReceipts.length === 0 && filteredInvoices.length === 0 && (
          <Card><CardContent className="p-6 text-center text-sm text-gray-400">No {country} transactions with tax recorded yet.</CardContent></Card>
        )}
      </section>

      {/* Layer 2 — Tax Rate Reference */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Landmark size={16} className="text-gray-400" /> Tax Rate Reference — {country}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {countryRates.map(r => (
            <Card key={r.id}>
              <CardContent className="p-5 space-y-2">
                <p className="text-sm text-gray-500 font-medium">{r.tax_type}</p>
                <p className="text-xl font-bold text-gray-900">{r.rate}</p>
                {r.notes && <p className="text-xs text-gray-500">{r.notes}</p>}
                <p className="text-xs text-gray-400 pt-1 border-t border-gray-100 mt-2">{rateReferenceDisclaimer(r.last_verified_date)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Step 4 — tax reminders */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Bell size={16} className="text-gray-400" /> Tax Reminders
        </h2>
        <Card>
          <CardContent className="p-4 space-y-4">
            {taxReminders.length > 0 && (
              <div className="space-y-2">
                {taxReminders.map(r => (
                  <div key={r.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                    <span className="text-gray-700">{r.title}</span>
                    <span className="text-xs text-gray-400">{formatDate(r.due_date)}{r.recurrence !== 'once' ? ` · ${r.recurrence}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px_auto] gap-2 items-end">
              <div>
                <label className="text-xs text-gray-500">Title</label>
                <Input className="mt-1" placeholder="Pay VAT to FIRS" value={reminderForm.title} onChange={e => setReminderForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Due date</label>
                <Input type="date" className="mt-1" value={reminderForm.due_date} onChange={e => setReminderForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Repeats</label>
                <Select value={reminderForm.recurrence} onValueChange={v => v && setReminderForm(f => ({ ...f, recurrence: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="bg-[#6C63FF] hover:bg-[#5A52E0] gap-2"
                onClick={handleAddReminder}
                disabled={savingReminder || !reminderForm.title.trim() || !reminderForm.due_date}
              >
                <Plus size={15} /> Set
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Layer 3 — Estimated Liability */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Calculator size={16} className="text-gray-400" /> Estimated Liability
        </h2>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className="text-xs text-gray-500">Tax type</label>
                <Select value={estimateTaxType} onValueChange={v => v && setEstimateTaxType(v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {countryRates.map(r => <SelectItem key={r.tax_type} value={r.tax_type}>{r.tax_type}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Period</label>
                <Select
                  value={estimatePeriod}
                  onValueChange={v => {
                    if (!v) return
                    if (ADVANCED_ONLY_PERIODS.includes(v as TaxPeriodKey) && taxAnalysis !== 'advanced') {
                      toast.error('Quarterly and yearly reporting is available on Business Pro and above.')
                      return
                    }
                    setEstimatePeriod(v as TaxPeriodKey)
                  }}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIOD_OPTIONS.map(o => {
                      const locked = ADVANCED_ONLY_PERIODS.includes(o.value) && taxAnalysis !== 'advanced'
                      return (
                        <SelectItem key={o.value} value={o.value} disabled={locked}>
                          <span className="flex items-center gap-1.5">
                            {o.label}
                            {locked && <Lock size={11} className="text-gray-400" />}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button className="bg-[#6C63FF] hover:bg-[#5A52E0]" onClick={handleCalculate} disabled={calculating || !estimateTaxType}>
                {calculating ? 'Calculating…' : 'Calculate estimate'}
              </Button>
            </div>

            {estimate && estimate.computable && (
              <div className="rounded-lg border border-[#00D4AA]/30 bg-[#00D4AA]/5 p-4 space-y-3">
                <p className="text-sm text-gray-800">
                  Based on <span className="font-semibold">{formatCurrency(estimate.taxableIncome, estimate.currency)}</span> recorded income this {estimate.periodLabel}, your estimated <span className="font-semibold">{estimateTaxType}</span> liability is approximately <span className="font-semibold">{formatCurrency(estimate.liability ?? 0, estimate.currency)}</span>.
                </p>
                {estimate.approximate && (
                  <p className="text-xs text-amber-700">This tax type has a progressive or multi-tier rate ({estimate.rateLabel}) — this estimate uses the top rate as a rough upper bound, not your actual band.</p>
                )}
                <p className="text-xs text-gray-500">{ESTIMATE_DISCLAIMER}</p>
                <Link href="/settings/accountant" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#00A88A] hover:text-emerald-800">
                  Send this to your accountant <ArrowRight size={14} />
                </Link>
              </div>
            )}

            {estimate && !estimate.computable && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                <p className="text-sm text-gray-800">
                  {estimateTaxType} in {country} is set at <span className="font-semibold">{estimate.rateLabel}</span> — this can&apos;t be reduced to a single number TrueFlow can calculate from. Check the rate reference card above or confirm directly with a local tax authority or accountant.
                </p>
                <p className="text-xs text-gray-400">Reference rate as of {formatTaxDate(estimate.lastVerifiedDate)}.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
