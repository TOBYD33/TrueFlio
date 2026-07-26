// daily-brief-service.ts
// Feature 2: Daily Brief. Sends once per day, at a consistent LOCAL time
// per user (default 7am, configurable via DAILY_BRIEF_LOCAL_HOUR), to
// users who are currently active (not flagged inactive — see mutual
// exclusion below) and opted in. Reuses the exact same timezone-resolution
// logic as the reminder system (resolveTimezone/dateStrInTimezone) and the
// exact same contextual-data pull as Feature 1 (getPendingSummary) — no
// new date math, no duplicated pending-count logic.
//
// Mutual exclusion with Feature 1 (Inactivity Re-Engagement): a user with
// reengagement_stage > 0 has already been flagged inactive (crossed the
// 24h threshold) and is excluded here — they get re-engagement nudges
// instead, never both on the same day. Run scheduler.ts's reengagement
// job and this one in either order; the stage flip is what matters, not
// which cron fires first.
//
// FLAGGED — WhatsApp channel requires two Meta-approved Twilio Content
// Templates (contextual + low-key "nothing pending" fallback), SEPARATE
// from Feature 1's templates. Until TWILIO_TEMPLATE_DAILY_BRIEF_CONTEXTUAL
// and TWILIO_TEMPLATE_DAILY_BRIEF_FALLBACK are set, WhatsApp sends are
// skipped (logged, not silently dropped).

import { supabase } from './supabase'
import { sendWhatsAppTemplate } from './twilio-sender'
import { sendEmail } from './notification-service'
import { getPendingSummary, PendingSummary } from './engagement-data'
import { resolveTimezone, dateStrInTimezone, localHour } from './timezone-util'

const TARGET_LOCAL_HOUR = Number(process.env.DAILY_BRIEF_LOCAL_HOUR ?? 7)

const CONTEXTUAL_TEMPLATE_SID = process.env.TWILIO_TEMPLATE_DAILY_BRIEF_CONTEXTUAL
const FALLBACK_TEMPLATE_SID = process.env.TWILIO_TEMPLATE_DAILY_BRIEF_FALLBACK

interface RecentActivity {
  receiptsThisWeek: number
  totalSpentThisWeek: number
}

async function getRecentActivity(orgId: string, tz: string): Promise<RecentActivity> {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const since = dateStrInTimezone(tz, weekAgo)

  const { data } = await supabase
    .from('receipts')
    .select('amount')
    .eq('org_id', orgId)
    .gte('date', since)

  const rows = data || []
  return {
    receiptsThisWeek: rows.length,
    totalSpentThisWeek: rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
  }
}

function buildBriefMessage(name: string | null, summary: PendingSummary, activity: RecentActivity, currency: string): string {
  const greeting = name ? `Morning ${name.split(' ')[0]}!` : 'Morning!'

  if (!summary.hasAnyPending) {
    return `${greeting} Nothing urgent on your plate today — all clear. 🎉` +
      (activity.receiptsThisWeek > 0
        ? ` You've logged ${activity.receiptsThisWeek} receipt${activity.receiptsThisWeek === 1 ? '' : 's'} this week, ${currency} ${activity.totalSpentThisWeek.toLocaleString()} total.`
        : '')
  }

  const lines = [`${greeting} Here's your daily brief:`]
  if (summary.remindersDueTodayCount > 0) lines.push(`⏰ ${summary.remindersDueTodayCount} reminder${summary.remindersDueTodayCount === 1 ? '' : 's'} due today`)
  if (summary.unpaidInvoiceCount > 0) {
    lines.push(summary.overdueInvoiceCount > 0
      ? `📄 ${summary.unpaidInvoiceCount} unpaid invoice${summary.unpaidInvoiceCount === 1 ? '' : 's'} (${summary.overdueInvoiceCount} overdue)`
      : `📄 ${summary.unpaidInvoiceCount} unpaid invoice${summary.unpaidInvoiceCount === 1 ? '' : 's'}`)
  }
  if (summary.taxPendingCount > 0) lines.push(`🧾 ${summary.taxPendingCount} Tax Hub item${summary.taxPendingCount === 1 ? '' : 's'} pending`)
  if (activity.receiptsThisWeek > 0) lines.push(`This week: ${activity.receiptsThisWeek} receipts, ${currency} ${activity.totalSpentThisWeek.toLocaleString()} spent`)

  return lines.join('\n')
}

export async function runDailyBrief(): Promise<void> {
  const { data: owners, error } = await supabase
    .from('org_members')
    .select('org_id, whatsapp_number, organizations(currency), profiles(id, full_name, email, reengagement_stage, daily_brief_enabled, last_daily_brief_date)')
    .eq('role', 'owner')

  if (error) { console.error('runDailyBrief: query failed:', error); return }

  for (const row of owners || []) {
    const profile = (row as any).profiles
    const orgId = (row as any).org_id as string
    const whatsappNumber = (row as any).whatsapp_number as string | null
    const currency = (row as any).organizations?.currency || 'NGN'
    if (!profile) continue

    // Mutual exclusion with Feature 1 — already flagged inactive today.
    if ((profile.reengagement_stage || 0) > 0) continue
    if (profile.daily_brief_enabled === false) continue

    const tz = resolveTimezone(whatsappNumber || '')
    const hour = localHour(tz, new Date())
    if (hour !== TARGET_LOCAL_HOUR) continue

    const today = dateStrInTimezone(tz, new Date())
    if (profile.last_daily_brief_date === today) continue // already sent today (hourly job re-check guard)

    try {
      const [summary, activity] = await Promise.all([
        getPendingSummary(orgId, tz),
        getRecentActivity(orgId, tz),
      ])
      const message = buildBriefMessage(profile.full_name, summary, activity, currency)

      if (whatsappNumber) {
        if (CONTEXTUAL_TEMPLATE_SID && FALLBACK_TEMPLATE_SID) {
          const useContextual = summary.hasAnyPending
          const templateSid = useContextual ? CONTEXTUAL_TEMPLATE_SID : FALLBACK_TEMPLATE_SID
          const variables: Record<string, string> = useContextual
            ? {
                '1': profile.full_name || 'there',
                '2': String(summary.remindersDueTodayCount),
                '3': String(summary.unpaidInvoiceCount),
                '4': String(summary.taxPendingCount),
              }
            : { '1': profile.full_name || 'there' }
          try {
            await sendWhatsAppTemplate(whatsappNumber, templateSid, variables)
          } catch (err) {
            console.error(`runDailyBrief: WhatsApp template send failed for org ${orgId}:`, err)
          }
        } else {
          console.warn('runDailyBrief: WhatsApp templates not configured (TWILIO_TEMPLATE_DAILY_BRIEF_*) — skipping WhatsApp channel')
        }
      }

      if (profile.email) {
        await sendEmail(
          profile.email,
          summary.hasAnyPending ? 'Your TrueFlow Daily Brief' : 'All clear today — Daily Brief',
          `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #111827; white-space: pre-line; line-height: 1.6;">
            ${message}
            <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
              Don't want daily briefs? Turn them off in Settings → Profile.
            </p>
          </div>`
        ).catch(() => {})
      }

      await supabase.from('whatsapp_conversations').insert({
        phone_number: `web:${profile.id}`,
        role: 'assistant',
        content: message,
        is_proactive: true,
      })

      await supabase.from('profiles').update({ last_daily_brief_date: today }).eq('id', profile.id)
    } catch (err) {
      console.error(`runDailyBrief: failed for org ${orgId}:`, err)
    }
  }
}
