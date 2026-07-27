// plan-gates.ts
// Bot-side mirror of web/lib/plans.ts's feature gates — bot and web are
// separate deployments with no shared package (same precedent as
// timezone-util.ts). Only the gates the bot actually needs to enforce live
// here; the full plan/price config is web/lib/plans.ts's job.
// Keep both files' plan-name mapping and thresholds in sync by hand.

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

// Business (Starter) and above get the uploaded logo on generated invoices;
// only Free and Individual don't.
export function canUseInvoiceBranding(rawPlan: string | null | undefined): boolean {
  const plan = resolvePlan(rawPlan)
  return plan === 'business' || plan === 'business_pro' || plan === 'enterprise'
}

// Automated Reminder is inactive on Free — every paid tier has it.
export function canUseAutomatedReminders(rawPlan: string | null | undefined): boolean {
  return resolvePlan(rawPlan) !== 'free'
}

// Business (Starter) is explicitly, permanently blocked from inviting ANY
// team member — that's Business Pro's defining upsell. Only Business Pro/
// Enterprise can add team members.
export function canInviteTeamMembers(rawPlan: string | null | undefined): boolean {
  const plan = resolvePlan(rawPlan)
  return plan === 'business_pro' || plan === 'enterprise'
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
