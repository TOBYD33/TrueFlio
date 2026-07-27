// conversation.ts
// Loads and saves WhatsApp conversation history per phone number.
// Keeps last 50 messages. Claude uses this as memory.

import { supabase } from './supabase'

// Confirmed bug (2026-07-27): the old count-only limit had no time cutoff,
// so a low-frequency account's "last 20 messages" could span back over a
// week. Claude was still seeing a days-old, unrelated multi-step
// conversation (e.g. "set a client's birthday AND a reminder") as recent
// context, and pattern-matched/imitated it onto a brand-new, unrelated
// request — producing a birthday-save confirmation and duplicate reminder
// attempts for a message that never mentioned either. A message from days
// ago is essentially never relevant to interpreting today's fresh request,
// so history is now also capped by recency, not just count.
const HISTORY_MAX_AGE_HOURS = 24

export async function getConversationHistory(phoneNumber: string, limit = 20) {
  const cutoff = new Date(Date.now() - HISTORY_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('role, content')
    .eq('phone_number', phoneNumber)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) console.error('getConversationHistory failed:', error)
  return (data || []).reverse().map(m => ({ role: m.role, content: m.content }))
}

export async function saveMessage(phoneNumber: string, role: 'user' | 'assistant', content: string) {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .insert({ phone_number: phoneNumber, role, content })

  if (error) console.error('saveMessage failed:', error)

  // Trim to last 50 messages
  const { data: old } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: false })
    .range(50, 9999)

  if (old && old.length > 0) {
    await supabase
      .from('whatsapp_conversations')
      .delete()
      .in('id', old.map((r: any) => r.id))
  }
}
