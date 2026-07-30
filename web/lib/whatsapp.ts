// lib/whatsapp.ts
// The web app's single outbound WhatsApp sender (Twilio REST) plus phone
// normalisation. Extracted from the OTP login route so every web feature
// (OTP login, identity linking, notifications) shares one implementation.
// The bot has its own copy in bot/src/twilio-sender.ts because it is a
// separate deployment — keep the two behaviourally identical.

export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, '')
  // Nigerian local format: 0XXXXXXXXXX → +234XXXXXXXXX
  if (/^0[7-9][01]\d{8}$/.test(digits)) return `+234${digits.slice(1)}`
  if (digits.startsWith('+')) return digits
  if (digits.length >= 10) return `+${digits}`
  return digits
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<boolean> {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const rawFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'
  // Twilio requires the whatsapp: channel prefix on BOTH sides — a bare
  // "+234..." From fails with error 21910, so normalise defensively.
  const fromNumber = rawFrom.startsWith('whatsapp:') ? rawFrom : `whatsapp:${rawFrom}`

  if (!twilioSid || !twilioToken) {
    console.error('sendWhatsAppMessage: Twilio credentials not configured')
    return false
  }

  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: fromNumber, To: toNumber, Body: body }).toString(),
      }
    )
    if (!res.ok) {
      console.error('sendWhatsAppMessage: Twilio error:', await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('sendWhatsAppMessage failed:', err)
    return false
  }
}

// Sends a Meta-approved WhatsApp template (Twilio Content API) — REQUIRED
// for any message to a user outside an active 24-hour customer service
// window (WhatsApp error 63016 otherwise; confirmed in production Twilio
// logs for this project — a freeform reminder to a different number failed
// with exactly this error). sendWhatsAppMessage() above will be rejected
// by Twilio in that situation with no message resource ever created, which
// is indistinguishable, from the caller's side, from "never chatted at
// all" — that's why send-otp/route.ts needs this template path rather than
// assuming a failed freeform send always means an unregistered number.
// contentSid is a Twilio Content Template SID (HXxxxxxxxx...) that has
// already been submitted to and approved by Meta — never call this with
// an unapproved template. Mirrors bot/src/twilio-sender.ts's
// sendWhatsAppTemplate, kept separate since bot/web share no package.
export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  contentVariables: Record<string, string>
): Promise<boolean> {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const rawFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'
  const fromNumber = rawFrom.startsWith('whatsapp:') ? rawFrom : `whatsapp:${rawFrom}`

  if (!twilioSid || !twilioToken) {
    console.error('sendWhatsAppTemplate: Twilio credentials not configured')
    return false
  }

  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: toNumber,
          ContentSid: contentSid,
          ContentVariables: JSON.stringify(contentVariables),
        }).toString(),
      }
    )
    if (!res.ok) {
      console.error('sendWhatsAppTemplate: Twilio error:', await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('sendWhatsAppTemplate failed:', err)
    return false
  }
}
