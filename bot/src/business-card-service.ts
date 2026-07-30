// business-card-service.ts
// Turns a scanned business card into a client "lead" — same `clients` table
// as real paying clients, so it appears in /clients ready to be converted
// once actual work is agreed. Never auto-creates a project or invoice.
// Duplicate-safe: a matching name+company already saved as a lead or active
// client triggers a confirm-first flow instead of silently double-saving.

import { supabase } from './supabase'
import { notifyOrgMembers } from './notifications'

export interface BusinessCardFields {
  contact_name: string | null
  contact_company: string | null
  contact_role: string | null
  contact_phone: string | null
  contact_email: string | null
}

export interface PendingDuplicateState {
  flow: 'card_duplicate'
  existing_client_id: string
  org_id: string
  pending_fields: BusinessCardFields
}

export async function saveBusinessCardLead(
  orgId: string,
  fields: BusinessCardFields
): Promise<{ id: string; name: string; company: string | null } | null> {
  const name = fields.contact_name?.trim()
  if (!name) return null

  const company = fields.contact_company?.trim() || null

  const { data, error } = await supabase
    .from('clients')
    .insert({
      org_id: orgId,
      name,
      company,
      role: fields.contact_role?.trim() || null,
      phone: fields.contact_phone?.trim() || null,
      email: fields.contact_email?.trim() || null,
      status: 'lead',
      source: 'business_card',
      created_via: 'whatsapp',
    })
    .select('id')
    .single()

  if (error) {
    console.error('saveBusinessCardLead: insert failed:', error)
    return null
  }

  await notifyOrgMembers({
    orgId,
    category: 'client',
    title: 'New lead added',
    body: `${name}${company ? ` from ${company}` : ''} was saved as a new lead.`,
    link: `/clients/${data.id}`,
  })

  return { id: data.id, name, company }
}

// A business card scan never creates a duplicate — same name (+ company,
// when known) already saved as a lead or active client triggers a
// confirm-first flow instead.
export async function findDuplicateLead(
  orgId: string,
  name: string,
  company: string | null
): Promise<{ id: string } | null> {
  let query = supabase
    .from('clients')
    .select('id')
    .eq('org_id', orgId)
    .ilike('name', name)
    .in('status', ['lead', 'active'])
    .limit(1)

  if (company) query = query.ilike('company', company)

  const { data } = await query.maybeSingle()
  return data ?? null
}

export async function startDuplicateCheck(
  phoneNumber: string,
  state: Omit<PendingDuplicateState, 'flow'>
): Promise<void> {
  await supabase
    .from('whatsapp_sessions')
    .update({ setup_state: { flow: 'card_duplicate', ...state } })
    .eq('phone_number', phoneNumber)
}

export async function getPendingDuplicateCheck(phoneNumber: string): Promise<PendingDuplicateState | null> {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('setup_state')
    .eq('phone_number', phoneNumber)
    .maybeSingle()
  const state = data?.setup_state as any
  if (!state || state.flow !== 'card_duplicate') return null
  return state as PendingDuplicateState
}

// Resolves the "update existing or is this someone new?" question.
// Returns the reply text to send back.
export async function resolveDuplicateCheck(
  phoneNumber: string,
  userReply: string,
  state: PendingDuplicateState
): Promise<string> {
  await supabase.from('whatsapp_sessions').update({ setup_state: null }).eq('phone_number', phoneNumber)

  const lower = userReply.toLowerCase()
  const f = state.pending_fields
  const name = f.contact_name?.trim() ?? 'this contact'

  if (/\bupdate\b/.test(lower)) {
    await supabase
      .from('clients')
      .update({
        company: f.contact_company?.trim() || null,
        role: f.contact_role?.trim() || null,
        phone: f.contact_phone?.trim() || null,
        email: f.contact_email?.trim() || null,
      })
      .eq('id', state.existing_client_id)
    return `Updated *${name}*'s info ✅`
  }

  // "new" or anything else not clearly "update" — save as a genuinely
  // separate lead rather than guessing wrong
  const lead = await saveBusinessCardLead(state.org_id, f)
  if (!lead) return "Sorry, I couldn't save that — try sending the card again."

  await markPendingLeadFollowUp(phoneNumber, lead.id)

  return (
    `Got it! Saved *${lead.name}*${lead.company ? ` from *${lead.company}*` : ''} as a new lead 🪪\n\n` +
    `Want me to set a follow-up reminder? Just say when, like 'remind me in 3 days.'`
  )
}

// Remembers the most recently created lead for this phone number so the
// NEXT message (if it's a reminder request) can be linked to it via
// reminders.client_id. Cleared once a reminder actually consumes it.
export async function markPendingLeadFollowUp(phoneNumber: string, clientId: string): Promise<void> {
  if (!clientId) return
  await supabase.from('whatsapp_sessions').update({ pending_lead_id: clientId }).eq('phone_number', phoneNumber)
}
