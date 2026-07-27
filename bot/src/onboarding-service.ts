// onboarding-service.ts
// Conversational first-contact onboarding: name -> business/family/personal
// -> [business name, business accounts only] -> capability list -> first
// real action (receipt, reminder, or business card). Exactly 2 questions
// for family/personal accounts, always, before the first aha moment.
// Business accounts get one extra, conditional question — their business
// name — since organizations.name otherwise stays the onboarding
// placeholder forever with no other point where it's ever captured.
//
// State lives on whatsapp_sessions.onboarding_step:
//   'awaiting_name' -> 'awaiting_type' -> ['awaiting_business_name' ->]
//   'awaiting_first_action' -> null (done)
//
// 'nudge_business_name' is a separate, lighter-weight step used only by
// nudgeMissingBusinessNames() below, for orgs that already finished
// onboarding long ago but got stuck on the placeholder name (created
// before the awaiting_business_name step existed). It captures the same
// answer but never re-enters the real onboarding flow or re-fires
// sendPostOnboardingFollowUps — that would resend the magic-link/email
// prompts to someone who already has an established account.

import crypto from 'crypto'
import { supabase } from './supabase'
import { sendWhatsAppMessage } from './twilio-sender'

export type OnboardingStep = 'awaiting_name' | 'awaiting_type' | 'awaiting_business_name' | 'awaiting_first_action' | 'nudge_business_name'

export interface OnboardingResult {
  reply: string | null   // what to send back; null when not handled here
  handled: boolean       // true if this message was fully consumed by onboarding
  step: OnboardingStep | null // the step as observed for THIS message
}

export async function getOnboardingStep(phoneNumber: string): Promise<OnboardingStep | null> {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('onboarding_step')
    .eq('phone_number', phoneNumber)
    .maybeSingle()
  return (data?.onboarding_step as OnboardingStep) ?? null
}

export async function startOnboarding(phoneNumber: string): Promise<string> {
  await supabase
    .from('whatsapp_sessions')
    .update({ onboarding_step: 'awaiting_name' })
    .eq('phone_number', phoneNumber)

  return "Hey! I'm TrueFlow 👋\nWhat should I call you?"
}

function capabilityList(includeBusinessCard: boolean): string {
  const lines = [
    '📷 Scan receipts, just send a photo',
    '💰 Track client payments',
    '📊 Set budgets by category, like a Budget for Family Trip',
    '⏰ Reminders for bills, deadlines, even birthdays',
    '🗂️ Manage clients and projects',
  ]
  if (includeBusinessCard) lines.push('🪪 Scan a business card to save a new lead automatically')
  return lines.join('\n')
}

// Handles the name/type questions only. Returns handled:false (and does
// nothing) once onboarding reaches awaiting_first_action or has finished,
// so the caller falls through to normal image/AI handling.
export async function handleOnboardingReply(
  phoneNumber: string,
  messageText: string,
  hasImage: boolean,
  orgId: string,
  userId: string
): Promise<OnboardingResult> {
  const step = await getOnboardingStep(phoneNumber)
  if (!step || step === 'awaiting_first_action') {
    return { reply: null, handled: false, step }
  }

  if (step === 'awaiting_name') {
    if (hasImage || !messageText.trim()) {
      return { handled: true, step, reply: "Before we dive in — what should I call you?" }
    }
    const name = messageText.trim().slice(0, 80)

    await supabase.from('profiles').update({ full_name: name }).eq('id', userId)
    await supabase.from('whatsapp_sessions').update({ onboarding_step: 'awaiting_type' }).eq('phone_number', phoneNumber)

    return {
      handled: true,
      step,
      reply: `Nice to meet you, ${name}! Quick one, is this for your business, your family, or just you?`,
    }
  }

  if (step === 'nudge_business_name') {
    if (hasImage || !messageText.trim()) {
      return { handled: true, step, reply: 'What should I call your business? (just the name is fine)' }
    }
    const businessName = messageText.trim().slice(0, 120)

    await supabase.from('organizations').update({ name: businessName }).eq('id', orgId)
    await supabase.from('whatsapp_sessions').update({ onboarding_step: null }).eq('phone_number', phoneNumber)

    return { handled: true, step, reply: `${businessName} ✅ Thanks — updated!` }
  }

  if (step === 'awaiting_business_name') {
    if (hasImage || !messageText.trim()) {
      return { handled: true, step, reply: 'What should I call your business? (just the name is fine)' }
    }
    const businessName = messageText.trim().slice(0, 120)

    await supabase.from('organizations').update({ name: businessName }).eq('id', orgId)
    await supabase.from('whatsapp_sessions').update({ onboarding_step: 'awaiting_first_action' }).eq('phone_number', phoneNumber)

    return {
      handled: true,
      step,
      reply:
        `${businessName} ✅\n\nHere's what we can do together:\n${capabilityList(true)}\n\n` +
        `Let's try it. Got a receipt handy? Send a photo.\n\n` +
        `No receipt nearby? Tell me something to remind you about instead, like 'remind me to pay rent Friday.'\n\n` +
        `(You can always type "help" to see examples of what to say.)`,
    }
  }

  // step === 'awaiting_type'
  if (hasImage) {
    return { handled: true, step, reply: 'Just one more thing first — is this for your business, your family, or just you?' }
  }

  const lower = messageText.toLowerCase()
  let type: 'sme' | 'family' | 'individual' | null = null
  if (/^1\b/.test(lower) || /\b(biz|business|work|company|shop|store)\b/.test(lower)) type = 'sme'
  else if (/^2\b/.test(lower) || /\b(family|household|home)\b/.test(lower)) type = 'family'
  else if (/^3\b/.test(lower) || /\b(just me|myself|personal|me only|individual)\b/.test(lower)) type = 'individual'

  if (!type) {
    return {
      handled: true,
      step,
      reply: 'Sorry, just to be clear — is this for your *business*, your *family*, or *just you*?',
    }
  }

  await supabase.from('organizations').update({ type }).eq('id', orgId)

  // Business accounts get one more question before the capability list —
  // organizations.name otherwise never gets captured anywhere else.
  if (type === 'sme') {
    await supabase.from('whatsapp_sessions').update({ onboarding_step: 'awaiting_business_name' }).eq('phone_number', phoneNumber)
    return {
      handled: true,
      step,
      reply: `Got it! What should I call your business?`,
    }
  }

  await supabase.from('whatsapp_sessions').update({ onboarding_step: 'awaiting_first_action' }).eq('phone_number', phoneNumber)

  return {
    handled: true,
    step,
    reply:
      `Here's what we can do together:\n${capabilityList(false)}\n\n` +
      `Let's try it. Got a receipt handy? Send a photo.\n\n` +
      `No receipt nearby? Tell me something to remind you about instead, like 'remind me to pay rent Friday.'`,
  }
}

export async function completeOnboarding(phoneNumber: string): Promise<void> {
  await supabase
    .from('whatsapp_sessions')
    .update({ onboarding_step: null })
    .eq('phone_number', phoneNumber)
}

// ── Post-aha-moment follow-ups: magic link, THEN a separate email offer ──
// Two distinct WhatsApp messages, sent via the REST API (not appended to
// the aha-moment confirmation), exactly per the finalized onboarding spec's
// business rule 3. Fires once per new onboarding — call this only right
// after completeOnboarding(), from whichever of the three first-action
// paths got there first.
async function generateMagicToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString('hex')
  await supabase.from('magic_login_tokens').insert({
    token,
    user_id: userId,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  })
  return token
}

// ── Backfill nudge: orgs stuck on the placeholder business name ──────────
// awaiting_business_name capture only exists going forward — orgs created
// before that step shipped (or that somehow slipped through it) are stuck
// with organizations.name === 'My Business' forever, since nothing else
// ever prompts for it. Run daily by scheduler.ts: find sme-type orgs still
// on the placeholder that haven't been nudged yet, ask once via WhatsApp,
// and reuse the exact same awaiting_business_name capture step onboarding
// already has — the next message they send is treated as their answer.
const PLACEHOLDER_BUSINESS_NAME = 'My Business'

export async function nudgeMissingBusinessNames(): Promise<void> {
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, org_members(whatsapp_number, role, user_id)')
    .eq('type', 'sme')
    .eq('name', PLACEHOLDER_BUSINESS_NAME)
    .is('business_name_nudge_sent_at', null)

  if (error) { console.error('nudgeMissingBusinessNames: query failed:', error); return }

  for (const org of orgs || []) {
    try {
      const owner = (org as any).org_members?.find((m: any) => m.role === 'owner')
      if (!owner?.whatsapp_number) continue

      // Don't hijack someone mid-onboarding or mid a guided setup flow.
      // Deliberately NOT checking merge_state here — that's the low-stakes,
      // easily-ignored "want to add your email?" prompt, and it has no
      // timeout of its own. A user who never replies to it would otherwise
      // be permanently excluded from ever getting this nudge (confirmed:
      // one org sat on the placeholder name for 10+ days for exactly this
      // reason). onboarding_step for the nudge itself is checked BEFORE
      // merge-service's reply handling in message-handler.ts, so setting
      // it below always wins the race regardless of a stale merge_state.
      const { data: session } = await supabase
        .from('whatsapp_sessions')
        .select('onboarding_step, setup_state')
        .eq('phone_number', owner.whatsapp_number)
        .maybeSingle()
      if (session?.onboarding_step || session?.setup_state) continue

      await sendWhatsAppMessage(
        owner.whatsapp_number,
        `Quick one — I still don't have a name for your business! What should I call it?`
      )
      // Also clear any stale merge_state — otherwise it re-arms right after
      // this nudge resolves and hijacks their NEXT ordinary message as if
      // it were a reply to the old "add your email?" prompt.
      await supabase
        .from('whatsapp_sessions')
        .update({ onboarding_step: 'nudge_business_name', merge_state: null })
        .eq('phone_number', owner.whatsapp_number)
      await supabase
        .from('organizations')
        .update({ business_name_nudge_sent_at: new Date().toISOString() })
        .eq('id', (org as any).id)
    } catch (err) {
      console.error(`nudgeMissingBusinessNames: failed for org ${(org as any).id}:`, err)
    }
  }
}

export async function sendPostOnboardingFollowUps(phoneNumber: string, userId: string): Promise<void> {
  try {
    const appUrl = process.env.WEBAPP_URL || 'app.gettrueflow.com'
    const token = await generateMagicToken(userId)

    await sendWhatsAppMessage(
      phoneNumber,
      `Want to see all this on the web too? Tap below, no password needed, this link logs you straight in:\n` +
      `${appUrl}/login?token=${token}\n(Expires in 15 minutes for your security.)\n\n` +
      `Everything we just did here is already waiting for you there.`
    )

    // Separate message, separate state — the finalized onboarding email
    // step (save directly if new, verify-and-merge if it matches an
    // existing account), distinct from the standalone 'offered' prompt.
    await supabase
      .from('whatsapp_sessions')
      .update({ merge_state: 'onboarding_email' })
      .eq('phone_number', phoneNumber)

    await sendWhatsAppMessage(
      phoneNumber,
      `One more thing, want to add your email? It helps if you ever want your invoices or monthly summaries sent there. Totally optional, just reply with it or skip.`
    )
  } catch (err) {
    console.error('sendPostOnboardingFollowUps failed:', err)
  }
}
