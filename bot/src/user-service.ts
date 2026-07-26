// user-service.ts
// Looks up or creates a user by WhatsApp phone number.
// Fetches all permission fields from org_members including the new Layer 2 columns.
// Staff can use the bot without a full app account — linked by phone number only.

import { supabase } from './supabase'
import { UserContext } from '../types'

export async function getOrCreateUser(phoneNumber: string): Promise<UserContext | null> {
  // Look up existing session
  const { data: session, error: sessionError } = await supabase
    .from('whatsapp_sessions')
    .select(`
      *,
      organizations(id, name, plan, currency, receipt_limit, default_tax_country, status, created_at),
      profiles(id, full_name, merged_into_id)
    `)
    .eq('phone_number', phoneNumber)
    .single()

  if (session && !sessionError) {
    await supabase
      .from('whatsapp_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('phone_number', phoneNumber)

    const org = session.organizations as any
    let profile = session.profiles as any

    // Identity merge: if this profile was merged into another, transparently
    // resolve to the primary profile on every message, and self-heal the
    // session row so future lookups are direct.
    let resolvedUserId = session.user_id
    if (profile?.merged_into_id) {
      resolvedUserId = profile.merged_into_id
      const { data: primaryProfile } = await supabase
        .from('profiles')
        .select('id, full_name, merged_into_id')
        .eq('id', resolvedUserId)
        .maybeSingle()
      if (primaryProfile) profile = primaryProfile
      await supabase
        .from('whatsapp_sessions')
        .update({ user_id: resolvedUserId })
        .eq('phone_number', phoneNumber)
    }

    // Feed the Inactivity Re-Engagement / Daily Brief activity tracker —
    // ANY WhatsApp message counts, not just ones that reach a full reply.
    // Resetting reengagement_stage here (not in a separate detection step)
    // is what implements "becoming active resets the cycle back to the
    // start" — the very next lapse starts again at 24h.
    supabase.from('profiles').update({
      last_active_at: new Date().toISOString(),
      reengagement_stage: 0,
      reengagement_stage_at: null,
    }).eq('id', resolvedUserId)
      .then(({ error }) => { if (error) console.error('user-service: last_active_at update failed:', error) })

    const { data: member } = await supabase
      .from('org_members')
      .select('role, whatsapp_active, can_see_clients, can_see_income, can_export')
      .eq('org_id', session.org_id)
      .eq('user_id', resolvedUserId)
      .is('removed_at', null)
      .single()

    return {
      user_id: resolvedUserId,
      org_id: session.org_id,
      org_name: org?.name || 'My Business',
      org_status: org?.status || 'active',
      org_created_at: org?.created_at || new Date().toISOString(),
      full_name: profile?.full_name || phoneNumber,
      plan: org?.plan || 'free',
      currency: org?.currency || 'NGN',
      receipt_limit: org?.receipt_limit || 10,
      whatsapp_number: phoneNumber,
      role: member?.role || 'staff',
      whatsapp_active: member?.whatsapp_active ?? true,
      can_see_clients: member?.can_see_clients ?? false,
      can_see_income: member?.can_see_income ?? false,
      can_export: member?.can_export ?? false,
      default_tax_country: org?.default_tax_country || 'Nigeria',
    }
  }

  // New user — look them up in org_members by whatsapp_number
  const { data: orgMember, error: memberError } = await supabase
    .from('org_members')
    .select(`
      *,
      organizations(id, name, plan, currency, receipt_limit, default_tax_country, status, created_at),
      profiles(id, full_name)
    `)
    .eq('whatsapp_number', phoneNumber)
    .eq('whatsapp_active', true)
    .is('removed_at', null)
    .is('invite_token', null)
    .single()

  if (orgMember && !memberError) {
    const org = orgMember.organizations as any
    const profile = orgMember.profiles as any

    await supabase.from('whatsapp_sessions').insert({
      phone_number: phoneNumber,
      org_id: orgMember.org_id,
      user_id: orgMember.user_id,
      is_new: false,
    })

    return {
      user_id: orgMember.user_id,
      org_id: orgMember.org_id,
      org_name: org?.name || 'My Business',
      org_status: org?.status || 'active',
      org_created_at: org?.created_at || new Date().toISOString(),
      full_name: profile?.full_name || phoneNumber,
      plan: org?.plan || 'free',
      currency: org?.currency || 'NGN',
      receipt_limit: org?.receipt_limit || 10,
      whatsapp_number: phoneNumber,
      role: orgMember.role,
      whatsapp_active: orgMember.whatsapp_active ?? true,
      can_see_clients: orgMember.can_see_clients ?? false,
      can_see_income: orgMember.can_see_income ?? false,
      can_export: orgMember.can_export ?? false,
      default_tax_country: org?.default_tax_country || 'Nigeria',
    }
  }

  // Brand new user — not in the system yet
  const { data: newProfile, error: profileError } = await supabase
    .from('profiles')
    .insert({ phone: phoneNumber, full_name: null })
    .select()
    .single()

  if (profileError) {
    console.error('getOrCreateUser: profile insert failed:', profileError)
    return null
  }

  // Starts directly on 'free' (no separate free_trial plan anymore — see
  // web/lib/plans.ts's revision note). WhatsApp automation itself stays
  // active for WHATSAPP_TRIAL_DAYS from created_at before locking; scanning
  // (10) and client (5) caps apply from day one, per the new Free feature
  // set. Mirrors web/lib/plans.ts's PLAN_CONFIG.free values.
  const { data: newOrg, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: 'My Business',
      type: 'sme',
      owner_id: newProfile.id,
      plan: 'free',
      receipt_limit: 10,
      client_limit: 5,
      currency: 'NGN',
    })
    .select()
    .single()

  if (orgError) {
    console.error('getOrCreateUser: org insert failed:', orgError)
    return null
  }

  await supabase.from('org_members').insert({
    org_id: newOrg.id,
    user_id: newProfile.id,
    role: 'owner',
    whatsapp_number: phoneNumber,
    whatsapp_active: true,
    can_see_clients: true,
    can_see_income: true,
    can_export: true,
    joined_at: new Date().toISOString(),
  })

  await supabase.from('whatsapp_sessions').insert({
    phone_number: phoneNumber,
    org_id: newOrg.id,
    user_id: newProfile.id,
    is_new: true,
  })

  return {
    user_id: newProfile.id,
    org_id: newOrg.id,
    org_name: 'My Business',
    org_status: 'active',
    org_created_at: newOrg.created_at,
    full_name: phoneNumber,
    plan: 'free',
    currency: 'NGN',
    receipt_limit: 10,
    whatsapp_number: phoneNumber,
    role: 'owner',
    whatsapp_active: true,
    can_see_clients: true,
    can_see_income: true,
    can_export: true,
    default_tax_country: 'Nigeria',
  }
}

// Checks if the message is a "START" reply from a pending WhatsApp invite.
// Returns the pending invite org_members row if found, null otherwise.
export async function findPendingInvite(phoneNumber: string) {
  const { data } = await supabase
    .from('org_members')
    .select(`
      id, org_id, role, whatsapp_number, can_see_clients, can_see_income, can_export,
      organizations(id, name, plan, currency, receipt_limit, default_tax_country, status)
    `)
    .eq('whatsapp_number', phoneNumber)
    .not('invite_token', 'is', null)
    .is('user_id', null)
    .is('removed_at', null)
    .single()

  return data ?? null
}

export async function isNewUser(phoneNumber: string): Promise<boolean> {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('is_new')
    .eq('phone_number', phoneNumber)
    .single()

  return data?.is_new === true
}

export async function markUserNotNew(phoneNumber: string): Promise<void> {
  await supabase
    .from('whatsapp_sessions')
    .update({ is_new: false })
    .eq('phone_number', phoneNumber)
}

export async function getMonthlyReceiptCount(orgId: string): Promise<number> {
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { count, error } = await supabase
    .from('receipts')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', firstOfMonth)

  if (error) console.error('getMonthlyReceiptCount failed:', error)
  return count || 0
}
