// reengagement-service.ts
// Feature 1: Inactivity Re-Engagement. Decaying schedule — 24h, 3d, 7d,
// then monthly indefinitely — NOT a daily ping forever. Anchors the first
// three thresholds to real elapsed inactivity (last_active_at); once past
// 7 days, subsequent monthly nudges are spaced from the last nudge sent
// (reengagement_stage_at), since there's no further fixed total-inactivity
// milestone at that point.
//
// Cycle reset: becoming active resets reengagement_stage back to 0 — see
// the four last_active_at touch points (bot/src/user-service.ts,
// web/app/api/whatsapp/chat/route.ts, web/app/api/chat/message/route.ts,
// web/app/api/activity/touch/route.ts), which all zero the stage in the
// SAME update as touching last_active_at, rather than a separate
// detection step that could drift out of sync.
//
// FLAGGED — WhatsApp channel requires two Meta-approved Twilio Content
// Templates (contextual + generic fallback) before this can send on that
// channel at all. Until TWILIO_TEMPLATE_REENGAGEMENT_CONTEXTUAL and
// TWILIO_TEMPLATE_REENGAGEMENT_GENERIC are set, WhatsApp sends are skipped
// (logged, not silently dropped) — email and in-app chat are unaffected.

import { supabase } from './supabase'
import { sendWhatsAppTemplate } from './twilio-sender'
import { sendEmail } from './notification-service'
import { getPendingSummary, PendingSummary } from './engagement-data'
import { resolveTimezone } from './timezone-util'

const HOUR_MS = 60 * 60 * 1000
const STAGE_1_HOURS = 24
const STAGE_2_HOURS = 72   // 3 days
const STAGE_3_HOURS = 168  // 7 days
const MONTHLY_HOURS = 30 * 24

const CONTEXTUAL_TEMPLATE_SID = process.env.TWILIO_TEMPLATE_REENGAGEMENT_CONTEXTUAL
const GENERIC_TEMPLATE_SID = process.env.TWILIO_TEMPLATE_REENGAGEMENT_GENERIC

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / HOUR_MS
}

// Whether stage `stage` (the LAST nudge already sent, 0 = none yet) is due
// to advance to the next stage, given real time elapsed.
function isNudgeDue(stage: number, lastActiveAt: string, stageAt: string | null): boolean {
  const hoursInactive = hoursSince(lastActiveAt)
  if (stage === 0) return hoursInactive >= STAGE_1_HOURS
  if (stage === 1) return hoursInactive >= STAGE_2_HOURS
  if (stage === 2) return hoursInactive >= STAGE_3_HOURS
  // stage >= 3 — ongoing monthly cadence from the last nudge sent
  if (!stageAt) return true
  return hoursSince(stageAt) >= MONTHLY_HOURS
}

function contextualLine(summary: PendingSummary): string {
  const parts: string[] = []
  const reminderCount = summary.remindersDueTodayCount + summary.taxPendingCount
  if (reminderCount > 0) parts.push(`${reminderCount} pending reminder${reminderCount === 1 ? '' : 's'}`)
  if (summary.unpaidInvoiceCount > 0) parts.push(`${summary.unpaidInvoiceCount} unpaid invoice${summary.unpaidInvoiceCount === 1 ? '' : 's'}`)
  return parts.join(' and ')
}

function buildFreeformMessage(name: string | null, summary: PendingSummary): string {
  const greeting = name ? `Hey ${name.split(' ')[0]}` : 'Hey'
  if (summary.hasAnyPending) {
    return `${greeting}, you have ${contextualLine(summary)} waiting. Come take a look whenever you're ready 👋`
  }
  return `${greeting} — haven't seen you in a while. Tello's here whenever you need to log something 👋`
}

export async function runInactivityReengagement(): Promise<void> {
  const { data: owners, error } = await supabase
    .from('org_members')
    .select('org_id, whatsapp_number, profiles(id, full_name, email, last_active_at, reengagement_stage, reengagement_stage_at, reengagement_enabled)')
    .eq('role', 'owner')

  if (error) { console.error('runInactivityReengagement: query failed:', error); return }

  for (const row of owners || []) {
    const profile = (row as any).profiles
    const orgId = (row as any).org_id as string
    const whatsappNumber = (row as any).whatsapp_number as string | null
    if (!profile) continue
    if (profile.reengagement_enabled === false) continue

    const lastActiveAt: string = profile.last_active_at || new Date().toISOString()
    const stage: number = profile.reengagement_stage || 0
    const stageAt: string | null = profile.reengagement_stage_at

    if (!isNudgeDue(stage, lastActiveAt, stageAt)) continue

    try {
      const tz = resolveTimezone(whatsappNumber || '')
      const summary = await getPendingSummary(orgId, tz)
      const message = buildFreeformMessage(profile.full_name, summary)

      // Race guard (Requirement 7): re-check last_active_at immediately
      // before EACH channel send. If it moved past what we read above, the
      // user responded on some channel mid-cycle — abort every remaining
      // channel for this cycle rather than piling on.
      const stillDue = async () => {
        const { data: fresh } = await supabase.from('profiles').select('last_active_at').eq('id', profile.id).single()
        return fresh?.last_active_at === lastActiveAt
      }

      if (whatsappNumber && await stillDue()) {
        if (CONTEXTUAL_TEMPLATE_SID && GENERIC_TEMPLATE_SID) {
          const useContextual = summary.hasAnyPending
          const templateSid = useContextual ? CONTEXTUAL_TEMPLATE_SID : GENERIC_TEMPLATE_SID
          const variables: Record<string, string> = useContextual
            ? { '1': profile.full_name || 'there', '2': String(summary.remindersDueTodayCount + summary.taxPendingCount), '3': String(summary.unpaidInvoiceCount) }
            : { '1': profile.full_name || 'there' }
          try {
            await sendWhatsAppTemplate(whatsappNumber, templateSid, variables)
          } catch (err) {
            console.error(`runInactivityReengagement: WhatsApp template send failed for org ${orgId}:`, err)
          }
        } else {
          console.warn('runInactivityReengagement: WhatsApp templates not configured (TWILIO_TEMPLATE_REENGAGEMENT_*) — skipping WhatsApp channel')
        }
      }

      if (profile.email && await stillDue()) {
        await sendEmail(
          profile.email,
          summary.hasAnyPending ? "You've got pending items waiting" : "We miss you at TrueFlow",
          `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #111827; line-height: 1.6;">
            <p>${message}</p>
            <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
              Don't want these? Turn off Re-engagement nudges in Settings → Profile.
            </p>
          </div>`
        ).catch(() => {})
      }

      if (await stillDue()) {
        await supabase.from('whatsapp_conversations').insert({
          phone_number: `web:${profile.id}`,
          role: 'assistant',
          content: message,
          is_proactive: true,
        })
      }
    } catch (err) {
      console.error(`runInactivityReengagement: failed for org ${orgId}:`, err)
    }

    await supabase.from('profiles').update({
      reengagement_stage: stage + 1,
      reengagement_stage_at: new Date().toISOString(),
    }).eq('id', profile.id)
  }
}
