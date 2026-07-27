// lib/plans-db.ts
// DB-backed plan/pricing/feature-flag source of truth — read by the
// marketing pricing page, the in-app "All Plans" page, and Flutterwave
// checkout, so an admin edit in /admin/plans takes effect immediately on
// all three with no deploy. See bot/sql/step16-admin-plan-editor.sql.
//
// SCOPE NOTE (flagged, not a bug): deeper feature-gate ENFORCEMENT (Tax
// Hub access, invoice branding, team-invite limits, automated-reminder
// blocking, client caps) still reads the STATIC PLAN_CONFIG in lib/plans.ts
// and bot/src/plan-gates.ts, not this table. Toggling a flag here updates
// what the pricing pages DISPLAY immediately, but does not yet change live
// enforcement at those gates — wiring every enforcement call site to this
// table too is a larger follow-up (~6 more files across web + bot), kept
// out of this pass to bound risk on a billing-safety-critical feature per
// the ticket's own instruction to prioritize correctness over completeness.
//
// PRICING SAFETY: this table's monthly_ngn is what NEW checkouts charge.
// It is never read for an EXISTING subscriber's "current plan" price —
// that comes from organizations.subscribed_price_ngn, locked in once at
// activation and never recomputed. See lib/plans.ts's PlanConfig shape,
// which this mirrors field-for-field.

import { createClient } from '@supabase/supabase-js'
import type { PlanConfig, PlanId } from './plans'

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
