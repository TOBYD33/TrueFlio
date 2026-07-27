// prompt-examples-whatsapp.ts
// WhatsApp-specific formatting on top of the shared prompt-examples.ts data:
// the plain-text category menu, per-category example replies, and the
// reactive-fallback reply for a message Tello couldn't understand.
//
// Native interactive list/button messages (Requirement 3.1) would need
// Twilio Content API templates set up in the Twilio console first — FLAGGED,
// not done here. This ships a numbered plain-text menu instead, which needs
// no external setup and is fully functional today; upgrade to a real
// interactive list later if that's wanted.

import { supabase } from './supabase'
import { CATEGORIES, MOST_COMMON_CATEGORY_IDS, ExampleCategory, ExampleCategoryId, guessCategory, visibleCategories } from './prompt-examples'

export function isHelpCommand(messageText: string): boolean {
  const t = messageText.trim().toLowerCase()
  return /^(help|examples|menu)$/.test(t) || /^what can you do\??$/.test(t)
}

function formatCategoryReply(cat: ExampleCategory): string {
  if (cat.instructionOverride) {
    return `${cat.emoji} *${cat.label}*\n\n${cat.instructionOverride}`
  }
  return `${cat.emoji} *${cat.label}* — try something like:\n\n${cat.examples.map(e => `• "${e}"`).join('\n')}`
}

// The numbered menu shown for "help"/"examples". Numbers map 1:1 to the
// visible categories list (Team filtered out for plans that can't invite).
export function buildHelpMenu(canInviteTeam: boolean): { text: string; categories: ExampleCategory[] } {
  const categories = visibleCategories(canInviteTeam)
  const lines = categories.map((c, i) => `${i + 1}️⃣ ${c.emoji} ${c.label}`)
  return {
    text: `Here's what I can help with — reply with a number:\n\n${lines.join('\n')}`,
    categories,
  }
}

// Resolves a reply to the help menu (a bare number) to that category's
// example text, or null if it doesn't look like a menu selection.
export function resolveHelpMenuSelection(messageText: string, categories: ExampleCategory[]): string | null {
  const n = parseInt(messageText.trim(), 10)
  if (!Number.isFinite(n) || n < 1 || n > categories.length) return null
  return formatCategoryReply(categories[n - 1])
}

// ── Pending "waiting for a number reply to the help menu" state ──────────
// Same setup_state JSON + flow-discriminator pattern as
// business-card-service.ts's duplicate-check state. Stores the exact
// category id list shown, since it's plan-filtered and numbers only make
// sense against the list the user actually saw.
interface PendingHelpMenuState {
  flow: 'help_menu'
  category_ids: ExampleCategoryId[]
}

export async function startHelpMenu(phoneNumber: string, categories: ExampleCategory[]): Promise<void> {
  const state: PendingHelpMenuState = { flow: 'help_menu', category_ids: categories.map(c => c.id) }
  await supabase.from('whatsapp_sessions').update({ setup_state: state }).eq('phone_number', phoneNumber)
}

export async function getPendingHelpMenu(phoneNumber: string): Promise<ExampleCategory[] | null> {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('setup_state')
    .eq('phone_number', phoneNumber)
    .maybeSingle()

  const state = data?.setup_state as PendingHelpMenuState | null
  if (!state || state.flow !== 'help_menu') return null
  return state.category_ids.map(id => CATEGORIES.find(c => c.id === id)!).filter(Boolean)
}

export async function clearHelpMenu(phoneNumber: string): Promise<void> {
  await supabase.from('whatsapp_sessions').update({ setup_state: null }).eq('phone_number', phoneNumber)
}

// Requirement 2: reactive fallback when Tello can't map a message (typed
// or a voice transcript — both go through the exact same text pipeline,
// see webhook.ts) to any known action.
export function buildFallbackExamplesReply(messageText: string): string {
  const guessed = guessCategory(messageText)
  if (guessed) {
    const cat = CATEGORIES.find(c => c.id === guessed)!
    return `Here's how you might phrase that:\n\n${formatCategoryReply(cat)}`
  }

  const top = MOST_COMMON_CATEGORY_IDS.map(id => CATEGORIES.find(c => c.id === id)!)
  const lines = top.map(c => `${c.emoji} "${c.examples[0]}"`)
  return `Not sure I followed that — here are a few things you can try:\n\n${lines.join('\n')}\n\nOr reply "help" to see everything I can do.`
}
