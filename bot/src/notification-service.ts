// notification-service.ts
// Dual-channel delivery for recurring/scheduled bot notifications (weekly
// summaries, monthly reports, budget alerts, reminders). WhatsApp stays the
// primary, required channel — nothing here changes its behavior or errors.
// Email is a best-effort bonus channel, sent only when the org owner has a
// verified profiles.email on file (see the Cross-Channel Identity Merge /
// onboarding_email flow in merge-service.ts and onboarding-service.ts — that
// is the ONLY way an email lands there, so every address here is already
// either verified or self-supplied by the owner, never assumed).
// Never let an email failure affect the WhatsApp send or throw to the caller.

import { sendWhatsAppMessage } from './twilio-sender'

// Exported for other proactive-notification features (Inactivity
// Re-Engagement, Daily Brief) that need fully-dynamic email content —
// this is now the ONE Resend-sending helper in the bot, don't add another.
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TrueFlow <hello@verify.gettrueflow.com>',
        to,
        subject,
        html,
      }),
    })
    return res.ok
  } catch (err) {
    console.error('notification-service: sendEmail failed:', err)
    return false
  }
}

// WhatsApp bot messages use *bold* / lightweight markdown and rely on line
// breaks for structure — convert both to something readable in an inbox.
function whatsappToEmailHtml(message: string): string {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const withBold = escaped.replace(/\*(.+?)\*/g, '<strong>$1</strong>')
  return `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #111827; white-space: pre-line; line-height: 1.6;">
    ${withBold}
    <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">Sent by TrueFlow · gettrueflow.com</p>
  </div>`
}

// Sends a notification over WhatsApp (always, required — errors propagate
// exactly as sendWhatsAppMessage already does) and, if the owner has a
// verified email on file, also fires the same content to their inbox as a
// best-effort bonus channel. Email never blocks or fails the caller.
export async function notifyOwner(params: {
  whatsappNumber: string
  ownerEmail?: string | null
  message: string
  emailSubject: string
}): Promise<void> {
  await sendWhatsAppMessage(params.whatsappNumber, params.message)

  if (params.ownerEmail) {
    sendEmail(params.ownerEmail, params.emailSubject, whatsappToEmailHtml(params.message)).catch(() => {})
  }
}
