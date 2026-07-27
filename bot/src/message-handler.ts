// message-handler.ts
// Orchestrates the full message handling flow for every incoming WhatsApp message.
// Images are downloaded ONCE and analyzed in a SINGLE Claude Vision call to avoid
// Twilio's 15-second webhook timeout. Direction determines whether the image is
// an incoming client payment or an outgoing expense.
//
// Permission gate order (must not change):
//   1. Organization suspended
//   2. whatsapp_active revoked
//   3. Viewer role (read-only, no submissions)
//   4. Free plan's WhatsApp automation trial window expired

import { getOrCreateUser, isNewUser, markUserNotNew, getMonthlyReceiptCount, findPendingInvite } from './user-service'
import { canUseWhatsAppAutomation, canInviteTeamMembers } from './plan-gates'
import {
  isHelpCommand, buildHelpMenu, resolveHelpMenuSelection,
  getPendingHelpMenu, startHelpMenu, clearHelpMenu, buildFallbackExamplesReply,
} from './prompt-examples-whatsapp'
import { analyzeImage, buildMissingFieldsNote } from './image-analyzer'
import { handleIncomingPayment } from './smart-transfer'
import { saveFromAnalysis } from './receipt-scanner'
import { getAIResponse } from './ai-assistant'
import { executeActions } from './action-executor'
import { buildTextResponse, buildEmptyResponse } from './twiml-builder'
import { sendWhatsAppMessage } from './twilio-sender'
import { getSetupState, continueGuidedSetup } from './client-setup-service'
import { getPendingInvoiceSetup, continueInvoiceSetup } from './invoice-setup-service'
import { handleMergeReply } from './merge-service'
import { startOnboarding, handleOnboardingReply, completeOnboarding, sendPostOnboardingFollowUps } from './onboarding-service'
import {
  saveBusinessCardLead,
  findDuplicateLead,
  startDuplicateCheck,
  getPendingDuplicateCheck,
  resolveDuplicateCheck,
  markPendingLeadFollowUp,
} from './business-card-service'
import { supabase } from './supabase'
import { TwilioWebhookBody } from '../types'

const FREE_TIER_LIMIT = 10
const APP_URL = process.env.WEBAPP_URL || 'app.trueflow.com'

// A message with an image also carries a text Body when the user attaches
// a caption/instruction alongside the photo (e.g. a business card forwarded
// with "remind me in 2 min to call this person"). The image-handling paths
// below only ever looked at the image and returned immediately, so any
// accompanying instruction was silently discarded — never parsed, never
// executed, never confirmed, and never mentioned as failed either. Run the
// accompanying text through the same AI + action pipeline used for normal
// messages, and only report an action as done if it actually wrote to the
// database (executeActions already tracks and reports failures honestly —
// reused here rather than duplicated).
async function processAccompanyingText(
  phoneNumber: string,
  messageText: string,
  user: any,
  userPermissions: any
): Promise<string | null> {
  const text = messageText.trim()
  if (!text) return null

  const { actions } = await getAIResponse({
    phoneNumber,
    orgId: user.org_id,
    orgName: user.org_name,
    userName: user.full_name,
    userMessage: text,
    currency: user.currency,
    plan: user.plan,
    defaultTaxCountry: user.default_tax_country,
    userPermissions,
  })

  if (actions.length === 0) return null

  const { notifications, failures } = await executeActions(actions, user)
  if (failures.length > 0) return failures.join('\n\n')
  if (notifications.length > 0) return notifications.join('\n\n')
  return null
}

export async function handleMessage(body: TwilioWebhookBody): Promise<string> {
  const phoneNumber = body.From.replace('whatsapp:', '')
  const messageText = body.Body?.trim() || ''
  const hasImage = parseInt(body.NumMedia) > 0
  const imageUrl = body.MediaUrl0
  const imageType = body.MediaContentType0

  // ── Step 12: Handle "START" before normal onboarding ────────────────────
  // If this phone number has a pending team invite and the message is START,
  // link them to the invite rather than creating a new owner account.
  if (messageText.toUpperCase() === 'START') {
    const pendingInvite = await findPendingInvite(phoneNumber)
    if (pendingInvite) {
      const org = pendingInvite.organizations as any

      // Create a profile if one doesn't exist for this number
      let { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', phoneNumber)
        .single()

      if (!existingProfile) {
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({ phone: phoneNumber, full_name: null })
          .select()
          .single()
        existingProfile = newProfile
      }

      if (existingProfile) {
        // Link the profile to the pending org_members row
        await supabase
          .from('org_members')
          .update({
            user_id: existingProfile.id,
            joined_at: new Date().toISOString(),
            invite_token: null,
            invite_expires_at: null,
          })
          .eq('id', pendingInvite.id)

        // Create a WhatsApp session
        await supabase.from('whatsapp_sessions').insert({
          phone_number: phoneNumber,
          org_id: pendingInvite.org_id,
          user_id: existingProfile.id,
          is_new: false,
        })

        return buildTextResponse(
          `✅ You're in! Welcome to *${org?.name || 'the team'}*.\n\n` +
          `You can now send receipts and I'll log them straight to the business account.\n\n` +
          `Go ahead and send your first receipt whenever you're ready.`
        )
      }
    }
  }

  // ── Step 1: Resolve user ─────────────────────────────────────────────────
  const user = await getOrCreateUser(phoneNumber)
  if (!user) {
    return buildTextResponse('Sorry, I could not set up your account. Please try again.')
  }

  // ── Permission Gate 1: Organization suspended ────────────────────────────
  if (user.org_status === 'suspended') {
    return buildTextResponse(
      '⚠️ Your account is currently paused.\nContact support@trueflow.com for help.'
    )
  }

  // ── Permission Gate 2: WhatsApp access revoked ───────────────────────────
  if (!user.whatsapp_active) {
    return buildTextResponse(
      "You don't currently have WhatsApp access for this account.\n" +
      'Ask your account owner to enable it in their team settings.'
    )
  }

  // ── Permission Gate 3: Viewer role ───────────────────────────────────────
  if (user.role === 'viewer') {
    return buildTextResponse(
      'Your account has view-only access.\n' +
      "You can check summaries but can't submit receipts or make changes via WhatsApp."
    )
  }

  // ── Permission Gate 4: Free plan's WhatsApp trial window expired ────────
  // Grandfathers every org created before WHATSAPP_TRIAL_ENFORCEMENT_START,
  // so this new gate never silently cuts off an already-active free account.
  if (!canUseWhatsAppAutomation(user.plan, user.org_created_at)) {
    return buildTextResponse(
      "⏳ Your 14-day WhatsApp trial has ended.\n" +
      "Upgrade at app.gettrueflow.com/settings/subscription to keep using TrueFlow on WhatsApp — " +
      "your data is safe and waiting for you either way."
    )
  }

  // Build permission context to pass to AI
  const userPermissions = {
    canSeeClients: user.can_see_clients || ['owner', 'admin'].includes(user.role),
    canSeeIncome: user.can_see_income || ['owner', 'admin'].includes(user.role),
    canExport: user.can_export || ['owner', 'admin'].includes(user.role),
    isOwnerOrAdmin: ['owner', 'admin'].includes(user.role),
  }

  // ── Step 2: Start conversational onboarding for brand-new users ─────────
  // Exactly 2 questions (name, then business/family/personal), never more,
  // never before this point — see the Refined First-Contact Onboarding
  // Flow (Finalized) section in CLAUDE.md.
  const newUser = await isNewUser(phoneNumber)
  if (newUser) {
    await markUserNotNew(phoneNumber)
    const firstMessage = await startOnboarding(phoneNumber)
    return buildTextResponse(firstMessage)
  }

  // ── Step 2a: Mid-onboarding name/type questions ──────────────────────────
  // Only short-circuits while awaiting the name or type answer. Once
  // onboarding reaches awaiting_first_action, this is a no-op and the
  // message falls through to the real image/AI handling below.
  const onboardingResult = await handleOnboardingReply(phoneNumber, messageText, hasImage, user.org_id, user.user_id)
  if (onboardingResult.handled) return buildTextResponse(onboardingResult.reply!)
  const onboardingStepBefore = onboardingResult.step
  const wasOnboarding = onboardingStepBefore === 'awaiting_first_action'

  // Fires the magic-link + separate email-offer sequence once, only when
  // this message is the aha moment that just closed out onboarding.
  async function closeOutOnboardingIfNeeded(): Promise<void> {
    if (!wasOnboarding) return
    await completeOnboarding(phoneNumber)
    await sendPostOnboardingFollowUps(phoneNumber, user!.user_id)
  }

  // The onboarding follow-ups above (web link, email ask) are sent via
  // direct Twilio API calls, same as webhook.ts's own background relay for
  // image messages. Both of those can race ahead of a reply that's simply
  // returned as TwiML, which is exactly what caused the reported bug (the
  // "want to see this on the web" / "add your email" messages arriving
  // before "saved as a new lead"). Only the aha-moment turn actually risks
  // this race, so only that turn needs to change delivery mechanism — every
  // other reply keeps returning plain TwiML as before.
  async function deliverAndCloseOut(text: string): Promise<string> {
    if (wasOnboarding) {
      await sendWhatsAppMessage(phoneNumber, text)
      await closeOutOnboardingIfNeeded()
      return buildEmptyResponse()
    }
    return buildTextResponse(text)
  }

  // ── Step 2b: Business-card duplicate confirmation (pending from a prior
  // card scan) — must be checked before the identity-merge/setup routing
  // below since it's also a plain-text reply with no special prefix.
  if (!hasImage && messageText) {
    const pendingDup = await getPendingDuplicateCheck(phoneNumber)
    if (pendingDup) {
      const reply = await resolveDuplicateCheck(phoneNumber, messageText, pendingDup)
      return await deliverAndCloseOut(reply)
    }
  }

  // ── Step 2b2: Pending invoice bank-details reply (waiting from a prior
  // CREATE_INVOICE call that had none saved yet) — same priority as the
  // business-card duplicate check above, another plain-text pending reply.
  if (!hasImage && messageText) {
    const pendingInvoice = await getPendingInvoiceSetup(phoneNumber)
    if (pendingInvoice) {
      const reply = await continueInvoiceSetup(phoneNumber, messageText, pendingInvoice)
      return await deliverAndCloseOut(reply)
    }
  }

  // ── Step 2b3: Pending help-menu number selection, or a fresh "help" /
  // "examples" request — checked before AI routing so it works with zero
  // API cost and never depends on Claude recognizing it.
  if (!hasImage && messageText) {
    const pendingCategories = await getPendingHelpMenu(phoneNumber)
    if (pendingCategories) {
      const selectionReply = resolveHelpMenuSelection(messageText, pendingCategories)
      if (selectionReply) {
        await clearHelpMenu(phoneNumber)
        return await deliverAndCloseOut(selectionReply)
      }
      // Not a valid number for the menu they were just shown — fall
      // through to normal handling rather than getting stuck here forever.
      await clearHelpMenu(phoneNumber)
    }

    if (isHelpCommand(messageText)) {
      const { text, categories } = buildHelpMenu(canInviteTeamMembers(user.plan))
      await startHelpMenu(phoneNumber, categories)
      return await deliverAndCloseOut(text)
    }
  }

  // ── Step 2c: Identity-merge conversation (post-onboarding, optional) ─────
  // Watches for an email reply to the link offer (either the standalone
  // 'offered' prompt or the finalized onboarding's 'onboarding_email'
  // step), or the 6-digit verification code. Anything else falls through.
  if (!hasImage && messageText) {
    const mergeReply = await handleMergeReply(phoneNumber, messageText, user)
    if (mergeReply) return buildTextResponse(mergeReply)
  }

  // ── Step 3: Handle image — SINGLE Claude Vision call ─────────────────────
  let scannedReceipt: any = null

  if (hasImage && imageUrl) {
    if (imageType && !imageType.startsWith('image/')) {
      return buildTextResponse('Please send a photo of your receipt or payment proof. I can only scan images.')
    }

    const analysis = await analyzeImage(imageUrl)

    if (!analysis) {
      return buildTextResponse(
        `I had trouble reading that image. Try a clearer photo, or add the details manually at *${APP_URL}/receipts*`
      )
    }

    if (analysis.content_type === 'business_card') {
      const name = analysis.contact_name?.trim()
      if (!name) {
        return buildTextResponse(
          `I can see a business card but couldn't read a name clearly. Try a clearer photo, or add the contact manually at *${APP_URL}/clients*`
        )
      }

      const company = analysis.contact_company?.trim() || null
      const cardFields = {
        contact_name: analysis.contact_name,
        contact_company: analysis.contact_company,
        contact_role: analysis.contact_role,
        contact_phone: analysis.contact_phone,
        contact_email: analysis.contact_email,
      }

      // Never silently double-save the same person — confirm first.
      const duplicate = await findDuplicateLead(user.org_id, name, company)
      if (duplicate) {
        await startDuplicateCheck(phoneNumber, { existing_client_id: duplicate.id, org_id: user.org_id, pending_fields: cardFields })
        return buildTextResponse(
          `Looks like *${name}*${company ? ` from *${company}*` : ''} might already be saved, update their info or is this someone new?`
        )
      }

      const lead = await saveBusinessCardLead(user.org_id, cardFields)
      if (!lead) {
        return buildTextResponse(
          `I had trouble saving that contact. Please try again or add it manually at *${APP_URL}/clients*`
        )
      }
      await markPendingLeadFollowUp(phoneNumber, lead.id)

      const leadLine = `Got it! Saved *${lead.name}*${lead.company ? ` from *${lead.company}*` : ''} as a new lead 🪪`

      // Anything the user said alongside the card (e.g. "remind me in 2 min
      // to call this person") was previously discarded — this message
      // branch always returned before ever looking at messageText. Run it
      // through the same action pipeline as a normal message now.
      const extra = await processAccompanyingText(phoneNumber, messageText, user, userPermissions)

      const confirmation = extra
        ? `${leadLine}\n\n${extra}`
        : `${leadLine}\n\nWant me to set a follow-up reminder? Just say when, like 'remind me in 3 days.'`

      return await deliverAndCloseOut(confirmation)
    }

    if (analysis.direction === 'incoming') {
      if (!userPermissions.canSeeClients) {
        return buildTextResponse(
          '📥 I can see a payment proof, but your account doesn\'t have access to client income tracking.\n' +
          'Ask your account owner to enable client visibility for your account.'
        )
      }
      return buildTextResponse(await handleIncomingPayment(analysis, user))
    }

    if (analysis.direction === 'unknown') {
      return buildTextResponse(
        `❓ I can see a financial image but I'm not sure which direction the money went.\n\n` +
        `Is this:\n• *1* — Money you *received* from a client (income)\n• *2* — An *expense* you paid\n\n` +
        `Reply 1 or 2, or add it manually at *${APP_URL}*`
      )
    }

    // Outgoing expense — check free tier limit
    if (user.plan === 'free') {
      const count = await getMonthlyReceiptCount(user.org_id)
      if (count >= FREE_TIER_LIMIT) {
        return buildTextResponse(
          `⚠️ You've reached your *${FREE_TIER_LIMIT} receipt limit* for this month on the Free plan.\n\nUpgrade for unlimited receipts: ${process.env.PRICING_PAGE_URL || 'trueflow.com/pricing'}`
        )
      }
    }

    scannedReceipt = await saveFromAnalysis(analysis, user.org_id, user.user_id, user.currency)

    if (scannedReceipt) {
      const missingNote = buildMissingFieldsNote(analysis)
      if (missingNote) {
        const vendor = analysis.vendor_name || 'Unknown vendor'
        const amount = analysis.amount
          ? `${user.currency} ${Number(analysis.amount).toLocaleString()}`
          : 'unknown amount'

        // Same ordering fix as the business-card branch above: send the
        // scan confirmation directly, before any onboarding follow-ups,
        // and pick up anything the user said alongside the photo instead
        // of silently dropping it.
        let confirmation =
          `✅ *Receipt logged!*\n\n` +
          `Vendor: ${vendor}\nAmount: ${amount}\nCategory: ${analysis.category}` +
          missingNote

        const extra = await processAccompanyingText(phoneNumber, messageText, user, userPermissions)
        if (extra) confirmation = `${confirmation}\n\n${extra}`

        return await deliverAndCloseOut(confirmation)
      }
    } else {
      return buildTextResponse(
        `I had trouble saving that receipt. Please try again or add it at *${APP_URL}/receipts*`
      )
    }
  }

  // ── Step 4a: Mid-guided-setup routing ────────────────────────────────────
  if (!hasImage) {
    const setupState = await getSetupState(phoneNumber)
    if (setupState) {
      const { reply: setupReply, done } = await continueGuidedSetup(
        phoneNumber,
        messageText,
        setupState
      )
      if (setupReply) return buildTextResponse(setupReply)
    }
  }

  // ── Step 4: Get AI response ───────────────────────────────────────────────
  const { reply, actions } = await getAIResponse({
    phoneNumber,
    orgId: user.org_id,
    orgName: user.org_name,
    userName: user.full_name,
    userMessage: messageText,
    currency: user.currency,
    plan: user.plan,
    defaultTaxCountry: user.default_tax_country,
    scannedReceipt,
    userPermissions,
  })

  // ── Step 4b: Reactive example fallback (Requirement 2) — Claude emits
  // ACTION:UNRECOGNIZED_INTENT when it can't map the message to any known
  // capability. Applies identically to typed text and voice transcripts,
  // since both reach here through the exact same pipeline (see webhook.ts).
  const hadUnrecognizedIntent = actions.includes('UNRECOGNIZED_INTENT')
  const realActions = actions.filter(a => a !== 'UNRECOGNIZED_INTENT')

  // ── Step 5: Execute any actions Claude detected ───────────────────────────
  let finalReply = reply
  if (hadUnrecognizedIntent) {
    finalReply = [reply, buildFallbackExamplesReply(messageText)].filter(Boolean).join('\n\n')
  }
  if (realActions.length > 0) {
    const { notifications, failures } = await executeActions(realActions, user)

    // Claude's own reply text is generated BEFORE any write happens, so it
    // can (and did) claim success for actions that actually failed. Once
    // any action fails this turn, that free-text reply can no longer be
    // trusted for what it says about the action — send the honest,
    // execution-verified result instead of compounding a false confirmation.
    // De-duped as a second backstop (ai-assistant.ts already dedupes the
    // raw action tags) — never show the same notification/failure line
    // twice in one message.
    if (failures.length > 0) {
      finalReply = [...new Set([...failures, ...notifications])].filter(Boolean).join('\n\n')
    } else if (notifications.length > 0) {
      finalReply = [reply, ...new Set(notifications)].filter(Boolean).join('\n\n')
    }
  }

  return await deliverAndCloseOut(finalReply)
}
