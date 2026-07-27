'use client'
// app/admin/plans/page.tsx
// Super Admin plan/pricing/feature editor — Requirement 1 of the pricing
// admin ticket. Same permission tier as Broadcast/Admin Team/Permanently
// Erase (API enforces requireAdmin(['super']); nav already hides this for
// other roles).
//
// Every field edit goes through a before/after review modal (Requirement
// 5) before it's actually saved (Requirement 4 logs the diff to
// admin_audit_log server-side). Migrating existing subscribers onto a
// plan's current price is a wholly separate action requiring a typed
// "MIGRATE" confirmation with an affected-subscriber count shown first
// (Requirement 3) — editing a plan's price here NEVER touches anyone
// already subscribed.

import { useEffect, useState } from 'react'
import { ThemedCard, PageHeader, BrandButton } from '@/components/shared/Cards'
import { useTheme, tone, BRAND } from '@/components/shared/theme'
import { toast } from 'sonner'
import { Plus, X, ArchiveRestore, Archive, RefreshCw } from 'lucide-react'

interface PlanRow {
  id: string
  label: string
  displayLabel: string
  tagline: string
  monthlyNgn: number
  scanLimit: number
  clientLimit: number
  automatedReminder: boolean
  staffLimit: number
  taxAnalysis: 'inactive' | 'basic' | 'advanced'
  invoiceBranding: boolean
  supportPriority: boolean
  selfServe: boolean
  mostPopular: boolean
  isRetired: boolean
  sortOrder: number
}

// Maps camelCase PlanRow keys to the snake_case columns the PATCH API expects.
const FIELD_TO_COLUMN: Record<string, string> = {
  label: 'label', displayLabel: 'display_label', tagline: 'tagline', monthlyNgn: 'monthly_ngn',
  scanLimit: 'scan_limit', clientLimit: 'client_limit', automatedReminder: 'automated_reminder',
  staffLimit: 'staff_limit', taxAnalysis: 'tax_analysis', invoiceBranding: 'invoice_branding',
  supportPriority: 'support_priority', selfServe: 'self_serve', mostPopular: 'most_popular',
  isRetired: 'is_retired',
}

const FIELD_LABELS: Record<string, string> = {
  label: 'Internal label', displayLabel: 'Display label', tagline: 'Tagline', monthlyNgn: 'Monthly price (₦)',
  scanLimit: 'Scan limit (-1 = unlimited)', clientLimit: 'Client limit (-1 = unlimited, 0 = none)',
  automatedReminder: 'Automated reminders', staffLimit: 'Staff limit (-1 = unlimited, 0 = none)',
  taxAnalysis: 'Tax analysis', invoiceBranding: 'Invoice branding', supportPriority: 'Support priority',
  selfServe: 'Self-serve checkout', mostPopular: 'Most popular badge', isRetired: 'Retired (hidden from new signups)',
}

function fmtVal(v: unknown) {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

export default function AdminPlansPage() {
  const { dark } = useTheme()
  const t = tone(dark)

  const [plans, setPlans] = useState<PlanRow[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, PlanRow>>({})
  const [discounts, setDiscounts] = useState<{ quarterlyDiscountPct: number; yearlyDiscountPct: number } | null>(null)
  const [discountDraft, setDiscountDraft] = useState<{ quarterlyDiscountPct: number; yearlyDiscountPct: number } | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null) // plan id under before/after review
  const [saving, setSaving] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [migrating, setMigrating] = useState<{ planId: string; label: string; count: number; confirmText: string } | null>(null)

  async function load() {
    const [plansRes, discountsRes] = await Promise.all([
      fetch('/api/admin/plans'),
      fetch('/api/admin/billing-discounts'),
    ])
    if (plansRes.status === 403 || discountsRes.status === 403) { setForbidden(true); return }
    const plansJson = await plansRes.json()
    const discountsJson = await discountsRes.json()
    setPlans(plansJson.plans)
    setDrafts(Object.fromEntries((plansJson.plans as PlanRow[]).map(p => [p.id, { ...p }])))
    setDiscounts(discountsJson.discounts)
    setDiscountDraft(discountsJson.discounts)
  }

  useEffect(() => { load() }, [])

  if (forbidden) {
    return <p className="text-sm py-8" style={{ color: t.textDim }}>Plans & Pricing is available to Super Admin only.</p>
  }

  if (!plans || !discounts || !discountDraft) {
    return <p className="text-sm py-8" style={{ color: t.textDim }}>Loading…</p>
  }

  function updateDraft(planId: string, field: keyof PlanRow, value: unknown) {
    setDrafts(prev => ({ ...prev, [planId]: { ...prev[planId], [field]: value } }))
  }

  function diffFor(planId: string): Record<string, { old: unknown; new: unknown }> {
    const original = plans!.find(p => p.id === planId)!
    const draft = drafts[planId]
    const diff: Record<string, { old: unknown; new: unknown }> = {}
    for (const key of Object.keys(FIELD_TO_COLUMN) as (keyof PlanRow)[]) {
      if (original[key] !== draft[key]) diff[key] = { old: original[key], new: draft[key] }
    }
    return diff
  }

  async function confirmSave(planId: string) {
    const diff = diffFor(planId)
    if (Object.keys(diff).length === 0) { setReviewing(null); return }
    setSaving(planId)
    const body: Record<string, unknown> = {}
    for (const field of Object.keys(diff)) body[FIELD_TO_COLUMN[field]] = diff[field].new
    try {
      const res = await fetch(`/api/admin/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Save failed'); setSaving(null); return }
      toast.success(`${drafts[planId].label} updated`)
      setReviewing(null)
      setSaving(null)
      await load()
    } catch {
      toast.error('Network error — plan may not have saved')
      setSaving(null)
    }
  }

  async function saveDiscounts() {
    if (!discountDraft || !discounts) return
    const changed: Record<string, number> = {}
    if (discountDraft.quarterlyDiscountPct !== discounts.quarterlyDiscountPct) changed.quarterlyDiscountPct = discountDraft.quarterlyDiscountPct
    if (discountDraft.yearlyDiscountPct !== discounts.yearlyDiscountPct) changed.yearlyDiscountPct = discountDraft.yearlyDiscountPct
    if (Object.keys(changed).length === 0) return
    try {
      const res = await fetch('/api/admin/billing-discounts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Save failed'); return }
      toast.success('Discounts updated — applies to new checkouts only')
      await load()
    } catch {
      toast.error('Network error')
    }
  }

  async function startMigratePreview(planId: string, label: string) {
    try {
      const res = await fetch(`/api/admin/plans/migrate-subscribers?planId=${planId}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Preview failed'); return }
      if (json.count === 0) { toast.success('No existing subscribers need repricing — everyone is already on the current price.'); return }
      setMigrating({ planId, label, count: json.count, confirmText: '' })
    } catch {
      toast.error('Network error')
    }
  }

  async function runMigrate() {
    if (!migrating) return
    try {
      const res = await fetch('/api/admin/plans/migrate-subscribers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: migrating.planId, confirmation: migrating.confirmText }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Migration failed'); return }
      toast.success(`Migrated ${json.migrated} subscriber(s) to the current price`)
      setMigrating(null)
    } catch {
      toast.error('Network error — migration may not have completed')
    }
  }

  const inputCls = 'w-full h-9 px-2.5 rounded-lg border text-sm bg-transparent outline-none'
  const inputStyle = { borderColor: t.border, color: t.text }
  const labelCls = 'text-xs mb-1 block'

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Plans & Pricing"
        subtitle="Edit plan prices and features. New signups get changes immediately — existing subscribers never do, unless you explicitly migrate them below."
        action={<BrandButton onClick={() => setShowAddForm(s => !s)}><Plus size={15} /> Add plan</BrandButton>}
      />

      <ThemedCard title="Global billing discounts" action={<span className="text-xs" style={{ color: t.textDim }}>Applies to new checkouts only</span>}>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className={labelCls} style={{ color: t.textDim }}>Quarterly discount %</label>
            <input type="number" min={0} max={100} className={inputCls} style={inputStyle}
              value={discountDraft.quarterlyDiscountPct}
              onChange={e => setDiscountDraft(d => ({ ...d!, quarterlyDiscountPct: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={labelCls} style={{ color: t.textDim }}>Yearly discount %</label>
            <input type="number" min={0} max={100} className={inputCls} style={inputStyle}
              value={discountDraft.yearlyDiscountPct}
              onChange={e => setDiscountDraft(d => ({ ...d!, yearlyDiscountPct: Number(e.target.value) }))} />
          </div>
          <BrandButton
            disabled={discountDraft.quarterlyDiscountPct === discounts.quarterlyDiscountPct && discountDraft.yearlyDiscountPct === discounts.yearlyDiscountPct}
            onClick={saveDiscounts}
          >
            Save discounts
          </BrandButton>
        </div>
      </ThemedCard>

      {showAddForm && <AddPlanForm t={t} onCancel={() => setShowAddForm(false)} onCreated={async () => { setShowAddForm(false); await load() }} />}

      {plans.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(plan => {
        const draft = drafts[plan.id]
        if (!draft) return null
        const diff = diffFor(plan.id)
        const hasChanges = Object.keys(diff).length > 0
        return (
          <ThemedCard
            key={plan.id}
            title={`${plan.displayLabel}${plan.isRetired ? ' (retired)' : ''}`}
            action={
              <div className="flex items-center gap-2">
                {plan.selfServe && (
                  <button
                    onClick={() => startMigratePreview(plan.id, plan.label)}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border"
                    style={{ borderColor: t.border, color: t.textDim }}
                    title="Move existing subscribers on this plan onto its current price"
                  >
                    <RefreshCw size={12} /> Migrate subscribers
                  </button>
                )}
                <span className="text-xs font-mono" style={{ color: t.textDim }}>{plan.id}</span>
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls} style={{ color: t.textDim }}>{FIELD_LABELS.label}</label>
                <input className={inputCls} style={inputStyle} value={draft.label} onChange={e => updateDraft(plan.id, 'label', e.target.value)} />
              </div>
              <div>
                <label className={labelCls} style={{ color: t.textDim }}>{FIELD_LABELS.displayLabel}</label>
                <input className={inputCls} style={inputStyle} value={draft.displayLabel} onChange={e => updateDraft(plan.id, 'displayLabel', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} style={{ color: t.textDim }}>{FIELD_LABELS.tagline}</label>
                <input className={inputCls} style={inputStyle} value={draft.tagline} onChange={e => updateDraft(plan.id, 'tagline', e.target.value)} />
              </div>
              <div>
                <label className={labelCls} style={{ color: t.textDim }}>{FIELD_LABELS.monthlyNgn}</label>
                <input type="number" className={inputCls} style={inputStyle} value={draft.monthlyNgn} onChange={e => updateDraft(plan.id, 'monthlyNgn', Number(e.target.value))} />
              </div>
              <div>
                <label className={labelCls} style={{ color: t.textDim }}>{FIELD_LABELS.taxAnalysis}</label>
                <select className={inputCls} style={inputStyle} value={draft.taxAnalysis} onChange={e => updateDraft(plan.id, 'taxAnalysis', e.target.value as PlanRow['taxAnalysis'])}>
                  <option value="inactive">Inactive</option>
                  <option value="basic">Basic</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div>
                <label className={labelCls} style={{ color: t.textDim }}>{FIELD_LABELS.scanLimit}</label>
                <input type="number" className={inputCls} style={inputStyle} value={draft.scanLimit} onChange={e => updateDraft(plan.id, 'scanLimit', Number(e.target.value))} />
              </div>
              <div>
                <label className={labelCls} style={{ color: t.textDim }}>{FIELD_LABELS.clientLimit}</label>
                <input type="number" className={inputCls} style={inputStyle} value={draft.clientLimit} onChange={e => updateDraft(plan.id, 'clientLimit', Number(e.target.value))} />
              </div>
              <div>
                <label className={labelCls} style={{ color: t.textDim }}>{FIELD_LABELS.staffLimit}</label>
                <input type="number" className={inputCls} style={inputStyle} value={draft.staffLimit} onChange={e => updateDraft(plan.id, 'staffLimit', Number(e.target.value))} />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 sm:col-span-2 pt-1">
                {(['automatedReminder', 'invoiceBranding', 'supportPriority', 'selfServe', 'mostPopular', 'isRetired'] as const).map(field => (
                  <label key={field} className="inline-flex items-center gap-1.5 text-sm" style={{ color: t.text }}>
                    <input type="checkbox" checked={Boolean(draft[field])} onChange={e => updateDraft(plan.id, field, e.target.checked)} />
                    {FIELD_LABELS[field]}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <BrandButton disabled={!hasChanges} onClick={() => setReviewing(plan.id)}>Review changes</BrandButton>
              {hasChanges && (
                <button
                  onClick={() => setDrafts(prev => ({ ...prev, [plan.id]: { ...plan } }))}
                  className="text-xs underline"
                  style={{ color: t.textDim }}
                >
                  Discard
                </button>
              )}
            </div>

            {reviewing === plan.id && (
              <div className="mt-4 rounded-xl border p-4 space-y-3" style={{ borderColor: BRAND.violet, background: 'rgba(108,99,255,0.06)' }}>
                <p className="text-sm font-semibold" style={{ color: t.text }}>Confirm changes to {plan.label}</p>
                <div className="space-y-1.5">
                  {Object.entries(diff).map(([field, { old, new: next }]) => (
                    <div key={field} className="text-sm flex flex-wrap items-center gap-1.5">
                      <span style={{ color: t.textDim }}>{FIELD_LABELS[field] ?? field}:</span>
                      <span className="line-through" style={{ color: t.textDim }}>{fmtVal(old)}</span>
                      <span style={{ color: t.text }}>→</span>
                      <span className="font-semibold" style={{ color: BRAND.violet }}>{fmtVal(next)}</span>
                    </div>
                  ))}
                </div>
                {'monthlyNgn' in diff && plan.selfServe && (
                  <p className="text-xs" style={{ color: t.textDim }}>
                    This changes the price for NEW signups only. Existing subscribers keep their current locked-in price until you run "Migrate subscribers" above.
                  </p>
                )}
                <div className="flex gap-2">
                  <BrandButton disabled={saving === plan.id} onClick={() => confirmSave(plan.id)}>
                    {saving === plan.id ? 'Saving…' : 'Confirm & save'}
                  </BrandButton>
                  <BrandButton variant="secondary" onClick={() => setReviewing(null)}>Cancel</BrandButton>
                </div>
              </div>
            )}
          </ThemedCard>
        )
      })}

      {migrating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: t.text }}>Migrate existing subscribers — {migrating.label}</p>
              <button onClick={() => setMigrating(null)}><X size={16} style={{ color: t.textDim }} /></button>
            </div>
            <p className="text-sm mb-3" style={{ color: t.text }}>
              This reprices <strong style={{ color: BRAND.violet }}>{migrating.count}</strong> existing subscriber{migrating.count === 1 ? '' : 's'} onto {migrating.label}&apos;s current live price. This cannot be undone automatically.
            </p>
            <label className="text-xs" style={{ color: t.textDim }}>
              Type <span className="font-mono font-bold" style={{ color: t.text }}>MIGRATE</span> to confirm:
            </label>
            <input
              value={migrating.confirmText}
              onChange={e => setMigrating(m => m && { ...m, confirmText: e.target.value })}
              className="w-full mt-1.5 h-10 px-3 rounded-xl border text-sm bg-transparent outline-none"
              style={{ borderColor: t.border, color: t.text }}
              placeholder="MIGRATE"
            />
            <div className="flex gap-2 mt-4">
              <BrandButton variant="danger" disabled={migrating.confirmText !== 'MIGRATE'} onClick={runMigrate}>
                Migrate {migrating.count} subscriber{migrating.count === 1 ? '' : 's'}
              </BrandButton>
              <BrandButton variant="secondary" onClick={() => setMigrating(null)}>Cancel</BrandButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddPlanForm({ t, onCancel, onCreated }: { t: ReturnType<typeof tone>; onCancel: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    id: '', label: '', display_label: '', tagline: '', monthly_ngn: 0,
    scan_limit: -1, client_limit: 0, staff_limit: 0, tax_analysis: 'basic',
    automated_reminder: true, invoice_branding: false, support_priority: false, self_serve: true,
  })
  const [creating, setCreating] = useState(false)

  const inputCls = 'w-full h-9 px-2.5 rounded-lg border text-sm bg-transparent outline-none'
  const inputStyle = { borderColor: t.border, color: t.text }

  async function create() {
    if (!form.id || !form.label || !form.display_label || !form.tagline) {
      toast.error('id, label, display label, and tagline are required')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Create failed'); setCreating(false); return }
      toast.success(`Plan "${json.id}" created`)
      onCreated()
    } catch {
      toast.error('Network error')
      setCreating(false)
    }
  }

  return (
    <ThemedCard title="New plan" action={<button onClick={onCancel}><X size={16} style={{ color: t.textDim }} /></button>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: t.textDim }}>Plan id (lowercase, no spaces)</label>
          <input className={inputCls} style={inputStyle} value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} placeholder="e.g. business_lite" />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: t.textDim }}>Monthly price (₦)</label>
          <input type="number" className={inputCls} style={inputStyle} value={form.monthly_ngn} onChange={e => setForm(f => ({ ...f, monthly_ngn: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: t.textDim }}>Internal label</label>
          <input className={inputCls} style={inputStyle} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: t.textDim }}>Display label</label>
          <input className={inputCls} style={inputStyle} value={form.display_label} onChange={e => setForm(f => ({ ...f, display_label: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs mb-1 block" style={{ color: t.textDim }}>Tagline</label>
          <input className={inputCls} style={inputStyle} value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} />
        </div>
      </div>
      <p className="text-xs mt-3" style={{ color: t.textDim }}>
        Note: a brand new plan id gets full editable pricing/feature-flag control here and on the pricing pages immediately, but deep feature-gate enforcement (Tax Hub access, invoice branding, team limits, reminder blocking) in the app and WhatsApp bot only recognizes the five built-in plan ids until those code paths are updated to match.
      </p>
      <div className="mt-4">
        <BrandButton disabled={creating} onClick={create}>{creating ? 'Creating…' : 'Create plan'}</BrandButton>
      </div>
    </ThemedCard>
  )
}
