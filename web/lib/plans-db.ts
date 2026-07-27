// lib/plans-db.ts
// DB-backed plan/pricing/feature-flag source of truth — read by the
// marketing pricing page, the in-app "All Plans" page, and Flutterwave
// checkout, so an admin edit in /admin/plans takes effect immediately on
// all three with no deploy. See bot/sql/step16-admin-plan-editor.sql.
//
// Feature-gate ENFORCEMENT (Tax Hub access, invoice branding, team-invite
// limits, automated-reminder blocking, client caps) also reads this table
// now, via the canUseXDb/xLimitForDb functions below — a Super Admin toggle
// in /admin/plans takes effect on both server-side enforcement and what the
// pricing pages display, with no deploy. bot/src/plan-gates.ts is the
// bot-side equivalent (separate deployment, reads plan_definitions directly
// via its own Supabase client since bot/web share no package).
//
// PRICING SAFETY: this table's monthly_ngn is what NEW checkouts charge.
// It is never read for an EXISTING subscriber's "current plan" price —
// that comes from organizations.subscribed_price_ngn, locked in once at
// activation and never recomputed. See lib/plans.ts's PlanConfig shape,
// which this mirrors field-for-field.

import { createClient } from '@supabase/supabase-js'
import type { PlanConfig, PlanId } from './plans'
import { getPlanConfig, resolvePlan } from './plans'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface PlanRow extends PlanConfig {
  isRetired: boolean
  sortOrder: number
}

interface RawPlanRow {
  id: string
  label: string
  display_label: string
  tagline: string
  monthly_ngn: number
  scan_limit: number
  client_limit: number
  automated_reminder: boolean
  staff_limit: number
  tax_analysis: 'inactive' | 'basic' | 'advanced'
  invoice_branding: boolean
  support_priority: boolean
  self_serve: boolean
  most_popular: boolean
  is_retired: boolean
  sort_order: number
}

function toRow(r: RawPlanRow): PlanRow {
  return {
    id: r.id as PlanId,
    label: r.label,
    displayLabel: r.display_label,
    tagline: r.tagline,
    monthlyNgn: Number(r.monthly_ngn),
    scanLimit: r.scan_limit,
    clientLimit: r.client_limit,
    automatedReminder: r.automated_reminder,
    staffLimit: r.staff_limit,
    taxAnalysis: r.tax_analysis,
    invoiceBranding: r.invoice_branding,
    supportPriority: r.support_priority,
    selfServe: r.self_serve,
    mostPopular: r.most_popular,
    isRetired: r.is_retired,
    sortOrder: r.sort_order,
  }
}

// Public pricing surfaces call this — retired plans excluded so they never
// appear for new signups, but existing subscribers already on one are
// completely unaffected (nothing about their access is gated by this list).
export async function fetchVisiblePlanDefinitions(): Promise<PlanRow[]> {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('plan_definitions')
    .select('*')
    .eq('is_retired', false)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as RawPlanRow[]).map(toRow)
}

// Admin panel needs retired plans too, so they can still be un-retired.
export async function fetchAllPlanDefinitions(): Promise<PlanRow[]> {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('plan_definitions')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as RawPlanRow[]).map(toRow)
}

export async function fetchPlanDefinition(id: string): Promise<PlanRow | null> {
  const admin = getAdmin()
  const { data, error } = await admin.from('plan_definitions').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toRow(data as RawPlanRow) : null
}

export interface BillingDiscounts {
  quarterlyDiscountPct: number
  yearlyDiscountPct: number
}

export async function fetchBillingDiscounts(): Promise<BillingDiscounts> {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('billing_discounts')
    .select('quarterly_discount_pct, yearly_discount_pct')
    .eq('id', 'global')
    .single()
  if (error) throw new Error(error.message)
  return { quarterlyDiscountPct: data.quarterly_discount_pct, yearlyDiscountPct: data.yearly_discount_pct }
}

export function priceForCycleDb(monthlyNgn: number, cycle: 'monthly' | 'quarterly' | 'yearly', discounts: BillingDiscounts): number {
  if (monthlyNgn <= 0) return monthlyNgn
  if (cycle === 'quarterly') return Math.round(monthlyNgn * 3 * (1 - discounts.quarterlyDiscountPct / 100))
  if (cycle === 'yearly') return Math.round(monthlyNgn * 12 * (1 - discounts.yearlyDiscountPct / 100))
  return monthlyNgn
}

// ── DB-backed enforcement gates ───────────────────────────────────────────
// These mirror lib/plans.ts's canUseX/xLimitFor functions field-for-field,
// but read the live plan_definitions row instead of the static PLAN_CONFIG,
// so a Super Admin's edit in /admin/plans takes effect immediately for
// server-side enforcement too, not just what the pricing pages display.
// Falls back to the static PLAN_CONFIG only if the plan id isn't found in
// the DB (shouldn't happen once step16 is run, but never crash a request
// over it) — same safety-net pattern as bot/src/plan-gates.ts.

export async function canUseAutomatedRemindersDb(rawPlan: string | null | undefined): Promise<boolean> {
  const planDef = await fetchPlanDefinition(resolvePlan(rawPlan))
  return planDef ? planDef.automatedReminder : getPlanConfig(rawPlan).automatedReminder
}

export async function canUseInvoiceBrandingDb(rawPlan: string | null | undefined): Promise<boolean> {
  const planDef = await fetchPlanDefinition(resolvePlan(rawPlan))
  return planDef ? planDef.invoiceBranding : getPlanConfig(rawPlan).invoiceBranding
}

export async function canUseTaxHubDb(rawPlan: string | null | undefined): Promise<boolean> {
  const planDef = await fetchPlanDefinition(resolvePlan(rawPlan))
  return planDef ? planDef.taxAnalysis !== 'inactive' : getPlanConfig(rawPlan).taxAnalysis !== 'inactive'
}

export async function canUseAdvancedTaxHubDb(rawPlan: string | null | undefined): Promise<boolean> {
  const planDef = await fetchPlanDefinition(resolvePlan(rawPlan))
  return planDef ? planDef.taxAnalysis === 'advanced' : getPlanConfig(rawPlan).taxAnalysis === 'advanced'
}

export async function canInviteTeamMembersDb(rawPlan: string | null | undefined): Promise<boolean> {
  const planDef = await fetchPlanDefinition(resolvePlan(rawPlan))
  const staffLimit = planDef ? planDef.staffLimit : getPlanConfig(rawPlan).staffLimit
  return staffLimit !== 0
}

export async function staffLimitForDb(rawPlan: string | null | undefined): Promise<number> {
  const planDef = await fetchPlanDefinition(resolvePlan(rawPlan))
  return planDef ? planDef.staffLimit : getPlanConfig(rawPlan).staffLimit
}

export async function clientLimitForDb(rawPlan: string | null | undefined): Promise<number> {
  const planDef = await fetchPlanDefinition(resolvePlan(rawPlan))
  return planDef ? planDef.clientLimit : getPlanConfig(rawPlan).clientLimit
}
