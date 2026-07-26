'use client'
// settings/subscription/page.tsx
// "All Plans" page — current plan, usage stats, and the full plan grid.
// Layout: Free/Individual/Business/Business Pro sit together in one row,
// Enterprise stands alone below it. No mention of "Family" anywhere —
// it's a standalone feature for ~2 months post-launch and should look
// like it was never part of this plan.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, X, Heart, Sparkles, Zap, User, Briefcase, Users } from 'lucide-react'
import {
  PLAN_CONFIG, resolvePlan, PlanId, BillingCycle, priceForCycle,
  QUARTERLY_DISCOUNT_PCT, YEARLY_DISCOUNT_PCT, canUseWhatsAppAutomation, WHATSAPP_TRIAL_DAYS,
} from '@/lib/plans'

function AndreaSection({ orgId }: { orgId: string | null }) {
  const supabase = createClient()
  const [orgTotal, setOrgTotal] = useState<number>(0)
  const [communityTotal, setCommunityTotal] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const [{ data: rows }, communityRes] = await Promise.all([
        supabase.from('andrea_contributions').select('amount').eq('org_id', orgId),
        fetch('/api/andrea/total').then(r => r.json()).catch(() => ({ total: null })),
      ])
      const t = (rows ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0)
      setOrgTotal(t)
      if (communityRes?.total != null) setCommunityTotal(Number(communityRes.total))
      setLoaded(true)
    }
    load()
  }, [orgId])

  const fmt = (n: number) =>
    `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <Card className="border-[#00D4AA]/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-[#00D4AA]/15 flex items-center justify-center shrink-0">
            <Heart size={16} className="text-[#00D4AA] fill-[#00D4AA]" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Andrea Aid Partnership</p>
            <p className="text-xs text-gray-500 mt-0.5">
              2% of every TrueFlow subscription funds life-saving medical treatments in Nigeria
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 p-4 rounded-xl bg-[#00D4AA]/5 border border-[#00D4AA]/20">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Your contribution</p>
            <p className="text-xl font-bold" style={{ color: '#00D4AA' }}>
              {loaded ? fmt(orgTotal) : '—'}
            </p>
            <p className="text-xs text-gray-400">lifetime total</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">TrueFlow community</p>
            <p className="text-xl font-bold" style={{ color: '#00D4AA' }}>
              {communityTotal != null ? fmt(communityTotal) : 'Growing every month'}
            </p>
            <p className="text-xs text-gray-400">contributed in total</p>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Your contribution comes from TrueFlow&apos;s own revenue — you are never charged extra.
          Every naira goes directly to verified patient care at partnered Nigerian hospitals.
        </p>

        <div className="flex gap-3">
          <a
            href="https://andreaaid.com/cases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold px-3 py-2 rounded-lg text-white transition-colors"
            style={{ backgroundColor: '#00D4AA' }}
          >
            Browse patient cases →
          </a>
          <a
            href="https://andreaaid.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Learn about Andrea
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

function formatPrice(monthlyNgn: number, cycle: BillingCycle): string {
  if (monthlyNgn === -1) return 'Custom'
  if (monthlyNgn === 0) return '₦0'
  const price = priceForCycle(monthlyNgn, cycle)
  const suffix = cycle === 'quarterly' ? '/quarter' : cycle === 'yearly' ? '/year' : '/month'
  return `₦${price.toLocaleString('en-NG')}${suffix}`
}

// Split into amount + suffix, rendered as two separately-sized spans — a
// single unbroken string like "₦13,500/quarter" has no spaces for the
// browser to wrap at, so on a narrow card it silently overflows the
// border instead of wrapping. Splitting it also reads closer to the
// reference style ("$12 /per month").
function formatPriceParts(monthlyNgn: number, cycle: BillingCycle): { amount: string; suffix: string } {
  if (monthlyNgn === -1) return { amount: 'Custom', suffix: '' }
  if (monthlyNgn === 0) return { amount: '₦0', suffix: '' }
  const price = priceForCycle(monthlyNgn, cycle)
  const suffix = cycle === 'quarterly' ? '/quarter' : cycle === 'yearly' ? '/year' : '/month'
  return { amount: `₦${price.toLocaleString('en-NG')}`, suffix }
}

// Feature row values, human-readable per the ticket's Active/Inactive/Basic/
// Advanced/count language — not a generic numeric limit table.
function planFeatureRows(id: PlanId): { label: string; value: string; ok: boolean }[] {
  const c = PLAN_CONFIG[id]
  return [
    { label: 'WhatsApp Automation', value: 'Active', ok: true },
    {
      label: 'Scanning (Business Card & Receipt)',
      value: c.scanLimit === -1 ? 'Active' : `${c.scanLimit}x`,
      ok: true,
    },
    {
      label: 'Clients',
      value: c.clientLimit === -1 ? 'Active' : c.clientLimit === 0 ? 'None' : `Up to ${c.clientLimit}`,
      ok: c.clientLimit !== 0,
    },
    { label: 'Automated Reminder', value: c.automatedReminder ? 'Active' : 'Inactive', ok: c.automatedReminder },
    { label: 'Team members', value: c.staffLimit === -1 ? 'Active' : 'Inactive', ok: c.staffLimit === -1 },
    {
      label: 'Tax Analysis',
      value: c.taxAnalysis === 'advanced' ? 'Advanced' : c.taxAnalysis === 'basic' ? 'Basic' : 'Inactive',
      ok: c.taxAnalysis !== 'inactive',
    },
    { label: 'Custom invoice (logo/branding)', value: c.invoiceBranding ? 'Active' : 'Inactive', ok: c.invoiceBranding },
    ...(c.supportPriority ? [{ label: 'Support Priority', value: 'Active', ok: true }] : []),
  ]
}

const PLAN_ICONS: Record<PlanId, { Icon: typeof Zap; bg: string; color: string }> = {
  free: { Icon: Zap, bg: 'bg-gray-100', color: '#6b7280' },
  individual: { Icon: User, bg: 'bg-[#6C63FF]/10', color: '#6C63FF' },
  business: { Icon: Briefcase, bg: 'bg-[#6C63FF]/10', color: '#6C63FF' },
  business_pro: { Icon: Users, bg: 'bg-[#00D4AA]/10', color: '#00A88A' },
  enterprise: { Icon: Sparkles, bg: 'bg-[#6C63FF]/10', color: '#6C63FF' },
}

function BillingToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (c: BillingCycle) => void }) {
  const options: { value: BillingCycle; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: `Quarterly (save ${QUARTERLY_DISCOUNT_PCT}%)` },
    { value: 'yearly', label: `Yearly (save ${YEARLY_DISCOUNT_PCT}%)` },
  ]
  return (
    <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-gray-100">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            cycle === o.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function PlanCard({
  id, plan, cycle, upgrading, onUpgrade,
}: {
  id: PlanId
  plan: string
  cycle: BillingCycle
  upgrading: string | null
  onUpgrade: (id: PlanId) => void
}) {
  const c = PLAN_CONFIG[id]
  const isCurrent = resolvePlan(plan) === id
  const { Icon, bg, color } = PLAN_ICONS[id]
  const price = formatPriceParts(c.monthlyNgn, cycle)

  return (
    <div
      className={`rounded-2xl border p-6 sm:p-7 flex flex-col relative ${
        isCurrent ? 'border-[#00D4AA]/60 bg-[#00D4AA]/5' : c.mostPopular ? 'border-[#6C63FF] bg-white shadow-md' : 'border-gray-200 bg-white'
      }`}
    >
      {/* Floats above the card entirely — can never collide with the icon
          or title below it, regardless of how long the title wraps. */}
      {c.mostPopular && !isCurrent && (
        <span className="absolute -top-3 left-6 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide text-white bg-[#6C63FF]">
          Most Popular
        </span>
      )}

      {/* Icon + title row — title wraps onto a second line rather than
          ever being cut off with an ellipsis. */}
      <div className="flex items-start gap-2.5 mb-5">
        <div className={`w-9 h-9 rounded-full ${bg} flex items-center justify-center shrink-0`}>
          <Icon size={16} style={{ color }} />
        </div>
        <p className="font-semibold text-base text-gray-900 leading-snug break-words">{c.displayLabel}</p>
      </div>

      {/* Price */}
      <p className="text-gray-900 font-bold mb-5 flex items-baseline gap-1 flex-wrap">
        <span className="text-3xl" style={{ color }}>{price.amount}</span>
        {price.suffix && <span className="text-sm font-medium text-gray-400">{price.suffix}</span>}
      </p>

      {/* CTA */}
      {!isCurrent && c.selfServe && (
        <button
          onClick={() => onUpgrade(id)}
          disabled={upgrading === id}
          className="block w-full text-center text-sm font-semibold h-10 leading-10 rounded-lg bg-[#6C63FF] hover:bg-[#5A52E0] text-white transition-colors disabled:opacity-60 px-2 mb-5"
        >
          {upgrading === id ? 'Redirecting…' : `Get ${c.label}`}
        </button>
      )}
      {isCurrent && (
        <div className="w-full text-center text-sm font-semibold h-10 leading-10 rounded-lg bg-gray-100 text-gray-500 mb-5">
          Current plan
        </div>
      )}

      {/* Tagline */}
      <p className="text-xs text-gray-500 mb-5 leading-relaxed">{c.tagline}</p>

      {/* Feature checklist */}
      <div className="space-y-3.5 flex-1">
        {planFeatureRows(id).map(row => (
          <div key={row.label} className="flex items-center gap-2 text-xs">
            {row.ok ? <Check size={13} className="text-[#00A88A] shrink-0" /> : <X size={13} className="text-gray-300 shrink-0" />}
            <span className={`flex-1 min-w-0 ${row.ok ? 'text-gray-700' : 'text-gray-400'}`}>{row.label}</span>
            <span className={`shrink-0 font-medium ${row.ok ? 'text-gray-500' : 'text-gray-300'}`}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Enterprise is deliberately NOT the feature-checklist card style above —
// it reads like the Andrea Aid card below it (icon, prose, one CTA), since
// "everything, custom-priced" doesn't fit a feature-by-feature comparison.
function EnterpriseCard() {
  return (
    <Card className="border-[#6C63FF]/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-[#6C63FF]/15 flex items-center justify-center shrink-0">
            <Sparkles size={16} className="text-[#6C63FF]" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Enterprise</p>
            <p className="text-xs text-gray-500 mt-0.5">Custom pricing, built around your organisation</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-5">
          Unlimited receipts, clients, and team members, advanced tax reporting, custom invoice
          branding, and priority support — all scoped and priced around how your business actually
          works. No fixed tiers, no self-serve checkout, just a plan built for you.
        </p>

        <a
          href="mailto:hello@gettrueflow.com?subject=Enterprise%20plan%20consultation"
          className="inline-block text-sm font-semibold px-5 py-2.5 rounded-lg text-white transition-colors"
          style={{ background: '#6C63FF' }}
        >
          Talk to Us
        </a>
      </CardContent>
    </Card>
  )
}

export default function SubscriptionPage() {
  const supabase = createClient()
  const { orgId } = useViewingContext()
  const [plan, setPlan] = useState('free')
  const [orgCreatedAt, setOrgCreatedAt] = useState<string | null>(null)
  const [receiptCount, setReceiptCount] = useState(0)
  const [clientCount, setClientCount] = useState(0)
  const [staffCount, setStaffCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState<BillingCycle>('monthly')

  useEffect(() => {
    if (!orgId) return
    async function load() {
      try {
        const [{ data: org }, { count: rc }, { count: cc }, { count: sc }] = await Promise.all([
          supabase.from('organizations').select('plan, created_at').eq('id', orgId).single(),
          supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
          supabase.from('clients').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
          supabase.from('org_members').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
        ])

        if (org?.plan) setPlan(resolvePlan(org.plan))
        setOrgCreatedAt(org?.created_at ?? null)
        setReceiptCount(rc ?? 0)
        setClientCount(cc ?? 0)
        setStaffCount(sc ?? 0)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [orgId])

  const currentPlan = PLAN_CONFIG[resolvePlan(plan)]
  const [upgrading, setUpgrading] = useState<string | null>(null)

  async function handleUpgrade(planId: PlanId) {
    setUpgrading(planId)
    try {
      const res = await fetch('/api/flutterwave/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, cycle }),
      })
      const json = await res.json()
      if (!res.ok || !json.link) {
        alert(json.error ?? 'Could not start checkout. Please try again.')
        return
      }
      window.location.href = json.link
    } catch {
      alert('Could not connect to payment provider. Please try again.')
    } finally {
      setUpgrading(null)
    }
  }

  // Show success banner and activate plan after returning from Flutterwave.
  // Flutterwave redirects back with ?status=successful&transaction_id=xxx&tx_ref=xxx&plan=xxx&upgraded=1
  const [showSuccess, setShowSuccess] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const upgraded = params.get('upgraded') === '1'
      const flwStatus = params.get('status')
      const transactionId = params.get('transaction_id')
      const planFromUrl = params.get('plan')

      if (!upgraded || flwStatus === 'cancelled') return

      setShowSuccess(true)
      window.history.replaceState({}, '', '/settings/subscription')

      if (flwStatus === 'successful' && transactionId && planFromUrl) {
        // Verify transaction and activate plan immediately
        fetch('/api/flutterwave/verify-redirect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transaction_id: transactionId, plan_id: planFromUrl }),
        })
          .then(r => r.json())
          .then(data => {
            // Always reload — if success show new plan, if failed webhook may have handled it
            setTimeout(() => window.location.reload(), data.success ? 1500 : 4000)
          })
          .catch(() => {
            setTimeout(() => window.location.reload(), 4000)
          })
      } else {
        // Fallback: reload and let webhook handle activation
        setTimeout(() => window.location.reload(), 5000)
      }
    }
  }, [])

  const whatsappActive = canUseWhatsAppAutomation(plan, orgCreatedAt)

  return (
    <div className="space-y-6">
      {showSuccess && (
        <div className="bg-[#00D4AA]/5 border border-[#00D4AA]/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <Check size={16} className="text-[#00A88A] shrink-0" />
          <p className="text-sm text-[#00A88A] font-medium">Payment received! Your plan will activate within a few minutes.</p>
        </div>
      )}

      {resolvePlan(plan) === 'free' && !whatsappActive && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-700 font-medium">
            Your {WHATSAPP_TRIAL_DAYS}-day WhatsApp trial has ended — upgrade below to keep using TrueFlow on WhatsApp. Everything else keeps working.
          </p>
        </div>
      )}

      {/* Current plan card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Current plan</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{currentPlan.displayLabel}</p>
              <p className="text-lg text-[#00A88A] font-semibold mt-0.5">{formatPrice(currentPlan.monthlyNgn, 'monthly')}</p>
            </div>
            <Badge className="bg-[#00D4AA]/10 text-[#00A88A] border-0 text-xs uppercase tracking-wide">
              {loading ? '…' : currentPlan.label}
            </Badge>
          </div>

          {/* Usage stats */}
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{receiptCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">Receipts scanned</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{clientCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">Clients</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{staffCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">Team members</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All Plans */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">All Plans</h3>
          <BillingToggle cycle={cycle} onChange={setCycle} />
        </div>

        <div className="space-y-8">
          {/* Free / Individual / Business / Business Pro — one row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 xl:gap-8">
            <PlanCard id="free" plan={plan} cycle={cycle} upgrading={upgrading} onUpgrade={handleUpgrade} />
            <PlanCard id="individual" plan={plan} cycle={cycle} upgrading={upgrading} onUpgrade={handleUpgrade} />
            <PlanCard id="business" plan={plan} cycle={cycle} upgrading={upgrading} onUpgrade={handleUpgrade} />
            <PlanCard id="business_pro" plan={plan} cycle={cycle} upgrading={upgrading} onUpgrade={handleUpgrade} />
          </div>

          {/* Enterprise stands alone, in the Andrea-style prose card */}
          <EnterpriseCard />
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Payments processed securely via Flutterwave. Cancel any time from your account settings.
        </p>
      </div>

      {/* Andrea Aid partnership */}
      <AndreaSection orgId={orgId} />
    </div>
  )
}
