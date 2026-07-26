// twilio-sender.ts
// Sends outbound WhatsApp messages via Twilio.
// Used by scheduler and reminder-service for proactive notifications.

import twilio from 'twilio'

let client: ReturnType<typeof twilio> | null = null

function getClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  }
  return client
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  try {
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
    const rawFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'
    // Twilio needs the whatsapp: prefix — a bare "+234..." fails with 21910
    const from = rawFrom.startsWith('whatsapp:') ? rawFrom : `whatsapp:${rawFrom}`

    await getClient().messages.create({ from, to: toNumber, body })
  } catch (err) {
    console.error('sendWhatsAppMessage failed:', err)
    throw err
  }
}

// Sends a Meta-approved WhatsApp template (Twilio Content API), REQUIRED
// for any proactive message to a user outside an active 24-hour customer
// service window (e.g. Inactivity Re-Engagement, Daily Brief) — free-form
// sendWhatsAppMessage() above will fail/be rejected in that situation.
// contentSid is a Twilio Content Template SID (HXxxxxxxxx...), created
// from a template that has already been submitted to and approved by
// Meta — never call this with an unapproved template.
export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  contentVariables: Record<string, string>
): Promise<void> {
  try {
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
    const rawFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'
    const from = rawFrom.startsWith('whatsapp:') ? rawFrom : `whatsapp:${rawFrom}`

    await getClient().messages.create({
      from,
      to: toNumber,
      contentSid,
      contentVariables: JSON.stringify(contentVariables),
    })
  } catch (err) {
    console.error('sendWhatsAppTemplate failed:', err)
    throw err
  }
}
