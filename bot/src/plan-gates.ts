// plan-gates.ts
// Bot-side feature gates. These now read the ADMIN-EDITABLE plan_definitions
// table (see bot/sql/step16-admin-plan-editor.sql, edited via
// app.gettrueflow.com/admin/plans) instead of a hardcoded plan-name check —
// a Super Admin toggling a feature flag there takes effect on the bot within
// CACHE_TTL_MS, no redeploy needed. Falls back to the pre-admin-editor
// hardcoded defaults only if the DB row can't be fetched (network hiccup,
// row missing), so a Supabase outage degrades to the old known-safe
// behaviour rather than the bot going silent or crashing mid-conversation.
//
// Bot and web are separate deployments with no shared package (same
// precedent as timezone-util.ts), so this reads plan_definitions directly
// rather than importing web/lib/plans-db.ts.

import { supabase } from './supabase'

const DEPRECATED_TO_BUSINESS = new Set(['freelancer', 'sme_starter'])
const DEPRECATED_TO_BUSINESS_PRO = new Set(['agency', 'sme_pro', 'studio'])

type ResolvedPlan = 'free' | 'individual' | 'business' | 'business_pro' | 'enterprise'

function resolvePlan(rawPlan: string | null | undefined): ResolvedPlan {
  if (!rawPlan) return 'free'
  if (rawPlan === 'individual' || rawPlan === 'business' || rawPlan === 'business_pro' || rawPlan === 'enterprise') return rawPlan
  if (rawPlan === 'free_trial' || rawPlan === 'family') return rawPlan === 'family' ? 'individual' : 'free'
  if (rawPlan === 'solo') return 'individual'
  if (rawPlan === 'pro') return 'business_pro'
  if (DEPRECATED_TO_BUSINESS.has(rawPlan)) return 'business'
  if (DEPRECATED_TO_BUSINESS_PRO.has(rawPlan)) return 'business_pro'
  return 'free'
}

// Pre-admin-editor hardcoded fallback values — used only if the live DB
// fetch fails, so the bot degrades to previously-known-safe behaviour
// instead of erroring out on an ordinary message.
const FALLBACK_INVOICE_BRANDING: Record<ResolvedPlan, boolean> = {
  free: false, individual: false, business: true, business_pro: true, enterprise: true,
}
const FALLBACK_AUTOMATED_REMINDER: Record<ResolvedPlan, boolean> = {
  free: false, individual: true, business: true, business_pro: true, enterprise: true,
}
const FALLBACK_STAFF_LIMIT: Record<ResolvedPlan, number> = {
  free: 0, individual: 0, business: 0, business_pro: -1, enterprise: -1,
}

interface PlanFlagsRow {
  automated_reminder: boolean
  invoice_branding: boolean
  staff_limit: number
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { row: PlanFlagsRow | null; fetchedAt: number }>()

async function fetchPlanFlags(planId: ResolvedPlan): Promise<PlanFlagsRow | null> {
  const cached = cache.get(planId)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.row

  const { data, error } = await supabase
    .from('plan_definitions')
    .select('automated_reminder, invoice_branding, staff_limit')
    .eq('id', planId)
    .maybeSingle()

  const row = !error && data ? (data as PlanFlagsRow) : null
  cache.set(planId, { row, fetchedAt: Date.now() })
  return row
}

// Business (Starter) and above get the uploaded logo on generated invoices;
// only Free and Individual don't — unless a Super Admin has changed that
// via /admin/plans.
export async function canUseInvoiceBranding(rawPlan: string | null | undefined): Promise<boolean> {
  const plan = resolvePlan(rawPlan)
  const flags = await fetchPlanFlags(plan)
  return flags ? flags.invoice_branding : FALLBACK_INVOICE_BRANDING[plan]
}

// Automated Reminder is inactive on Free by default — every paid tier has
// it — unless a Super Admin has changed that via /admin/plans.
export async function canUseAutomatedReminders(rawPlan: string | null | undefined): Promise<boolean> {
  const plan = resolvePlan(rawPlan)
  const flags = await fetchPlanFlags(plan)
  return flags ? flags.automated_reminder : FALLBACK_AUTOMATED_REMINDER[plan]
}

// Business (Starter) is blocked from inviting team members by default —
// that's Business Pro's defining upsell — unless a Super Admin raises
// Business (Starter)'s staff_limit via /admin/plans.
export async function canInviteTeamMembers(rawPlan: string | null | undefined): Promise<boolean> {
  const plan = resolvePlan(rawPlan)
  const flags = await fetchPlanFlags(plan)
  const staffLimit = flags ? flags.staff_limit : FALLBACK_STAFF_LIMIT[plan]
  return staffLimit !== 0
}

// ── WhatsApp automation trial window (Free plan only) ────────────────────
// Mirrors web/lib/plans.ts's WHATSAPP_TRIAL_DAYS / WHATSAPP_TRIAL_ENFORCEMENT_START
// exactly — update both together. Grandfathers every org created before the
// cutoff so this new gate never silently cuts off an already-active free
// account (test/ambassador users included).
export const WHATSAPP_TRIAL_DAYS = 14
export const WHATSAPP_TRIAL_ENFORCEMENT_START = '2026-07-23T00:00:00.000Z'

export function canUseWhatsAppAutomation(rawPlan: string | null | undefined, orgCreatedAt: string | null | undefined): boolean {
  if (resolvePlan(rawPlan) !== 'free') return true
  if (!orgCreatedAt) return true
  if (orgCreatedAt < WHATSAPP_TRIAL_ENFORCEMENT_START) return true // grandfathered
  const trialEnd = new Date(orgCreatedAt).getTime() + WHATSAPP_TRIAL_DAYS * 24 * 60 * 60 * 1000
  return Date.now() < trialEnd
}
