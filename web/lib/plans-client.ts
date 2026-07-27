'use client'
// lib/plans-client.ts
// Client-side counterpart to lib/plans-db.ts's DB-backed gates, for
// 'use client' pages that need a live feature flag but can't use the
// server-only service-role Supabase client. Fetches the public /api/plans
// endpoint (the same one the pricing pages use) and returns the org's
// resolved plan row.
//
// Falls back to the static PLAN_CONFIG if the plan isn't in the response —
// e.g. this org is on a plan that's since been retired (correctly excluded
// from the public/signup-facing list) or the fetch failed — same
// safety-net pattern as plans-db.ts and bot/src/plan-gates.ts.
//
// This is a UX-layer check only (hides/shows UI, gives an early toast). The
// actual security boundary for anything sensitive is enforced server-side
// (see plans-db.ts's canUseXDb functions), never here.

import { getPlanConfig, resolvePlan, type PlanConfig } from './plans'

export async function fetchLivePlanConfig(rawPlan: string | null | undefined): Promise<PlanConfig> {
  const resolved = resolvePlan(rawPlan)
  try {
    const res = await fetch('/api/plans')
    if (!res.ok) return getPlanConfig(rawPlan)
    const json = await res.json()
    const row = (json.plans as PlanConfig[] | undefined)?.find(p => p.id === resolved)
    return row ?? getPlanConfig(rawPlan)
  } catch {
    return getPlanConfig(rawPlan)
  }
}
