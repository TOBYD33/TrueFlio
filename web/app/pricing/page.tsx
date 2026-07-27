'use client'
// pricing/page.tsx
// Public marketing pricing page. Fetches live plan/discount data from
// /api/plans (backed by the plan_definitions/billing_discounts tables) —
// the SAME data source the in-app Settings → Subscription ("All Plans")
// page and Flutterwave checkout use — so an admin edit in /admin/plans
// takes effect here immediately, with no deploy, and the two pages can
// never drift out of sync. Falls back to the static PLAN_CONFIG defaults
// (lib/plans.ts) only if the fetch fails, so the page is never blank.
// Layout mirrors the All Plans page deliberately: Free/Individual/
// Business/Business Pro in one row, Enterprise alone below.
//
// No mention of "Family" anywhere on this page, intentionally — it's a
// standalone announcement ~2 months post-launch and should look like it
// was never part of this plan, not delayed.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Check, X, Sparkles, Zap, User, Briefcase, Users } from 'lucide-react'
import {
  PLAN_CONFIG, PlanId, PlanConfig, BillingCycle,
  QUARTERLY_DISCOUNT_PCT as STATIC_QUARTERLY_PCT, YEARLY_DISCOUNT_PCT as STATIC_YEARLY_PCT,
  WHATSAPP_TRIAL_DAYS,
} from '@/lib/plans'

const FALLBACK_PLANS: PlanConfig[] = ['free', 'individual', 'business', 'business_pro'].map(id => PLAN_CONFIG[id as PlanId])
const FALLBACK_DISCOUNTS = { quarterlyDiscountPct: STATIC_QUARTERLY_PCT, yearlyDiscountPct: STATIC_YEARLY_PCT }

function priceForCycleLocal(monthlyNgn: number, cycle: BillingCycle, discounts: { quarterlyDiscountPct: number; yearlyDiscountPct: number }): number {
  if (monthlyNgn <= 0) return monthlyNgn
  if (cycle === 'quarterly') return Math.round(monthlyNgn * 3 * (1 - discounts.quarterlyDiscountPct / 100))
  if (cycle === 'yearly') return Math.round(monthlyNgn * 12 * (1 - discounts.yearlyDiscountPct / 100))
  return monthlyNgn
}

const BRAND = {
  violet: '#6C63FF',
  mint: '#00D4AA',
  mintDeep: '#00A88A',
  black: '#0A0A0F',
  cloud: '#F5F5F7',
}

// Split into amount + suffix, rendered as two separately-sized spans — a
// single unbroken string like "₦13,500/quarter" has no spaces for the
// browser to wrap at, so on a narrow card it silently overflows the
// border instead of wrapping.
function formatPriceParts(
  monthlyNgn: number, cycle: BillingCycle, discounts: { quarterlyDiscountPct: number; yearlyDiscountPct: number }
): { amount: string; suffix: string } {
  if (monthlyNgn === -1) return { amount: 'Custom', suffix: '' }
  if (monthlyNgn === 0) return { amount: '₦0', suffix: '' }
  const price = priceForCycleLocal(monthlyNgn, cycle, discounts)
  const suffix = cycle === 'quarterly' ? '/quarter' : cycle === 'yearly' ? '/year' : '/month'
  return { amount: `₦${price.toLocaleString('en-NG')}`, suffix }
}

function planFeatureRows(c: PlanConfig): { label: string; value: string; ok: boolean }[] {
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

const DEFAULT_ICON = { Icon: Sparkles, bg: 'bg-gray-100', color: '#6b7280' }

function BillingToggle({
  cycle, onChange, discounts,
}: {
  cycle: BillingCycle
  onChange: (c: BillingCycle) => void
  discounts: { quarterlyDiscountPct: number; yearlyDiscountPct: number }
}) {
  const options: { value: BillingCycle; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: `Quarterly (save ${discounts.quarterlyDiscountPct}%)` },
    { value: 'yearly', label: `Yearly (save ${discounts.yearlyDiscountPct}%)` },
  ]
  return (
    <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-gray-200 shadow-sm">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            cycle === o.value ? 'text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
          style={cycle === o.value ? { background: BRAND.violet } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function PlanCard({
  config: c, cycle, discounts,
}: {
  config: PlanConfig
  cycle: BillingCycle
  discounts: { quarterlyDiscountPct: number; yearlyDiscountPct: number }
}) {
  const { Icon, bg, color } = PLAN_ICONS[c.id as PlanId] ?? DEFAULT_ICON
  const price = formatPriceParts(c.monthlyNgn, cycle, discounts)

  return (
    <div
      className={`rounded-2xl border p-6 sm:p-8 flex flex-col relative ${
        c.mostPopular ? 'border-[#6C63FF] shadow-xl bg-white' : 'bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow'
      }`}
    >
      {/* Floats above the card entirely — can never collide with the icon
          or title below it, regardless of how long the title wraps. */}
      {c.mostPopular && (
        <span
          className="absolute -top-3 left-6 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide text-white"
          style={{ background: BRAND.violet }}
        >
          Most Popular
        </span>
      )}

      {/* Icon + title row — title wraps onto a second line rather than
          ever being cut off with an ellipsis. */}
      <div className="flex items-start gap-2.5 mb-6">
        <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center shrink-0`}>
          <Icon size={18} style={{ color }} />
        </div>
        <h3 className="text-lg font-bold text-gray-900 leading-snug break-words">{c.displayLabel}</h3>
      </div>

      {/* Price */}
      <p className="font-bold mb-6 flex items-baseline gap-1.5 flex-wrap">
        <span className="text-3xl" style={{ color }}>{price.amount}</span>
        {price.suffix && <span className="text-sm font-medium text-gray-400">{price.suffix}</span>}
      </p>

      {/* CTA */}
      <Link
        href="/signup"
        className="block text-center text-sm font-semibold px-5 py-3 rounded-lg text-white transition-colors mb-6"
        style={{ background: c.mostPopular ? BRAND.mint : BRAND.black }}
      >
        {c.monthlyNgn === 0 ? 'Get started free' : `Get ${c.label}`}
      </Link>

      {/* Tagline */}
      <p className="text-sm text-gray-500 mb-6 leading-relaxed">{c.tagline}</p>

      {/* Feature checklist */}
      <div className="space-y-3.5 flex-1">
        {planFeatureRows(c).map(row => (
          <div key={row.label} className="flex items-center gap-2 text-sm">
            {row.ok ? <Check size={14} className="text-[#00A88A] shrink-0" /> : <X size={14} className="text-gray-300 shrink-0" />}
            <span className={`flex-1 min-w-0 ${row.ok ? 'text-gray-700' : 'text-gray-400'}`}>{row.label}</span>
            <span className={`shrink-0 font-medium text-xs ${row.ok ? 'text-gray-500' : 'text-gray-300'}`}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Enterprise reads as prose, not a feature checklist — "everything,
// custom-priced" doesn't fit a row-by-row comparison the way the other
// four tiers do.
function EnterpriseCard({ config }: { config?: PlanConfig }) {
  const label = config?.displayLabel ?? 'Enterprise'
  const tagline = config?.tagline ?? 'Custom pricing, built around your organisation'
  return (
    <div className="rounded-2xl border border-[#6C63FF]/30 bg-white p-6 sm:p-8 max-w-2xl mx-auto">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#6C63FF]/10 flex items-center justify-center shrink-0">
          <Sparkles size={18} style={{ color: BRAND.violet }} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">{label}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{tagline}</p>
        </div>
      </div>
      <p className="text-sm text-gray-600 leading-relaxed mb-6">
        Unlimited receipts, clients, and team members, advanced tax reporting, custom invoice
        branding, and priority support — all scoped and priced around how your business actually
        works. No fixed tiers, no self-serve checkout, just a plan built for you.
      </p>
      <a
        href="mailto:hello@gettrueflow.com?subject=Enterprise%20plan%20consultation"
        className="inline-block text-sm font-semibold px-6 py-2.5 rounded-lg text-white transition-colors"
        style={{ background: BRAND.violet }}
      >
        Talk to Us
      </a>
    </div>
  )
}

const FAQS = [
  {
    q: 'Can I start for free?',
    a: `Yes. The Free plan is ₦0, no card required. WhatsApp automation stays active for the first ${WHATSAPP_TRIAL_DAYS} days; scanning and client limits apply from day one.`,
  },
  {
    q: 'How does the WhatsApp bot work?',
    a: 'Send a receipt photo to our WhatsApp number. The AI reads it, extracts the amount, vendor, and category, and logs it to your account automatically. It also works for client payment screenshots and business cards.',
  },
  {
    q: 'What is Smart Transfer Recognition?',
    a: "When a client sends you a payment proof (bank screenshot) on WhatsApp, forward it to TrueFlow. We read the screenshot, identify the sender, and update your books automatically. Works with all Nigerian banks.",
  },
  {
    q: 'Why can\'t Business (Starter) invite team members?',
    a: "Business (Starter) is built for solo-run businesses that want to look professional — custom invoices, unlimited clients, basic tax tracking. Adding a team is exactly what Business (Pro) unlocks.",
  },
  {
    q: 'What\'s the difference between Basic and Advanced Tax Analysis?',
    a: 'Basic (Individual, Business Starter) tracks and estimates tax month by month. Advanced (Business Pro, Enterprise) adds quarterly and yearly reporting.',
  },
  {
    q: 'How do I upgrade or cancel?',
    a: 'Manage your plan any time from Settings → Subscription inside the app, or email hello@gettrueflow.com.',
  },
]

export default function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [plans, setPlans] = useState<PlanConfig[]>(FALLBACK_PLANS)
  const [enterprisePlan, setEnterprisePlan] = useState<PlanConfig | undefined>(PLAN_CONFIG.enterprise)
  const [discounts, setDiscounts] = useState(FALLBACK_DISCOUNTS)

  useEffect(() => {
    fetch('/api/plans')
      .then(r => r.json())
      .then((data: { plans?: PlanConfig[]; discounts?: typeof FALLBACK_DISCOUNTS }) => {
        if (!data.plans || data.plans.length === 0) return // keep fallback on empty/error response
        setPlans(data.plans.filter(p => p.id !== 'enterprise'))
        setEnterprisePlan(data.plans.find(p => p.id === 'enterprise'))
        if (data.discounts) setDiscounts(data.discounts)
      })
      .catch(() => { /* keep static fallback — page must never go blank */ })
  }, [])

  return (
    <div className="min-h-screen" style={{ background: BRAND.cloud }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="text-xl font-bold shrink-0" style={{ color: BRAND.violet }}>TrueFlow</Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="hidden sm:inline text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg text-white transition-colors whitespace-nowrap"
              style={{ background: BRAND.violet }}
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Simple pricing for all your needs</h1>
          <p className="text-base sm:text-lg text-gray-500 max-w-xl mx-auto px-2">
            Start for free, upgrade when you love it — no card required to try. All prices in NGN.
          </p>
        </div>

        <div className="flex justify-center mb-10 px-2">
          <BillingToggle cycle={cycle} onChange={setCycle} discounts={discounts} />
        </div>

        {/* Free / Individual / Business / Business Pro — one row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-8 mb-8">
          {plans.map(p => (
            <PlanCard key={p.id} config={p} cycle={cycle} discounts={discounts} />
          ))}
        </div>

        {/* Enterprise — stands alone, prose card like Andrea Aid's style */}
        <div className="mb-16">
          <EnterpriseCard config={enterprisePlan} />
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Frequently asked questions</h2>
          <div className="divide-y divide-gray-200 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {FAQS.map(faq => (
              <div key={faq.q} className="px-6 py-5">
                <h3 className="font-semibold text-gray-900 mb-1 text-sm">{faq.q}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white mt-16 py-8 text-center text-sm text-gray-400">
        <p>
          © {new Date().getFullYear()} True Financial Portfolio Ltd ·{' '}
          <a href="mailto:hello@gettrueflow.com" className="hover:text-gray-600 transition-colors">
            hello@gettrueflow.com
          </a>
        </p>
      </footer>
    </div>
  )
}
