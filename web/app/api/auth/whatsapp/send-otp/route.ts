// api/auth/whatsapp/send-otp/route.ts
// Generates a 6-digit OTP, stores it in whatsapp_otps, and sends it to the user
// via Twilio WhatsApp. Called from the WhatsApp Sign In section on the login page.
//
// SEND PATH: a registered user may not have messaged the TrueFlow bot in
// the last 24 hours, and WhatsApp's Business Platform rules only allow a
// business to freeform-message a user within that window since their last
// inbound message (Twilio error 63016 otherwise — confirmed happening in
// production for other freeform sends in this project). A closed window
// looks IDENTICAL, from this route's side, to "this number never chatted
// with the bot at all" — Twilio rejects the message creation call itself
// either way, so the two cases can't be told apart from a failed send.
// That's why the old error message ("make sure your number has chatted
// with the bot before") was actively misleading for the very common case
// of an already-registered user who just hasn't opened WhatsApp recently.
//
// Fix: send via a Meta-approved WhatsApp Authentication template
// (TWILIO_TEMPLATE_OTP_LOGIN) when configured — templates are explicitly
// exempt from the 24-hour window, which is the whole reason that Meta
// template category exists. OPERATIONAL DEPENDENCY: this requires an
// Authentication template to be created in the Twilio Content API and
// submitted for Meta approval — code alone can't do this. Until that SID
// is set, this falls back to the old freeform send, which will keep
// failing outside the window; the error message below is honest about
// that instead of blaming the user's chat history.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage, sendWhatsAppTemplate, normalisePhone } from '@/lib/whatsapp'

const OTP_TEMPLATE_SID = process.env.TWILIO_TEMPLATE_OTP_LOGIN

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json() as { phone: string }
    if (!phone?.trim()) {
      return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 })
    }

    const normalised = normalisePhone(phone.trim())
    if (!normalised.startsWith('+') || normalised.length < 10) {
      return NextResponse.json(
        { error: 'Enter your number with country code — e.g. +2348012345678' },
        { status: 400 }
      )
    }

    const admin = getSupabaseAdmin()

    // Check registration BEFORE attempting any send — a number with
    // neither a profile nor a bot session has no TrueFlow account to sign
    // into (same check verify-otp does at code-verification time), so
    // reject clearly now instead of burning a send attempt and giving a
    // vague failure later.
    const [{ data: profileMatch }, { data: sessionMatch }] = await Promise.all([
      admin.from('profiles').select('id').eq('phone', normalised).maybeSingle(),
      admin.from('whatsapp_sessions').select('phone_number').eq('phone_number', normalised).maybeSingle(),
    ])
    if (!profileMatch && !sessionMatch) {
      return NextResponse.json(
        { error: "We don't recognize this number yet — message TrueFlow on WhatsApp first to get started." },
        { status: 404 }
      )
    }

    const code = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: dbError } = await admin
      .from('whatsapp_otps')
      .upsert({ phone: normalised, code, expires_at: expiresAt, attempts: 0 })

    if (dbError) {
      console.error('send-otp: db error:', dbError)
      return NextResponse.json({ error: 'Could not generate code. Please try again.' }, { status: 500 })
    }

    let sent: boolean
    if (OTP_TEMPLATE_SID) {
      sent = await sendWhatsAppTemplate(normalised, OTP_TEMPLATE_SID, { '1': code })
    } else {
      const messageBody =
        `Your TrueFlow sign-in code is: *${code}*\n\n` +
        `This code expires in 10 minutes. Do not share it with anyone.\n\n` +
        `— TrueFlow`
      sent = await sendWhatsAppMessage(normalised, messageBody)
    }

    if (!sent) {
      const message = OTP_TEMPLATE_SID
        // Template configured — a genuine delivery failure, not a window issue.
        ? 'Could not send your sign-in code right now. Please try again in a moment, or contact support@gettrueflow.com if this keeps happening.'
        // No template configured yet — the real, honest cause: WhatsApp only
        // allows us to message a number within 24 hours of their last message
        // to the bot.
        : "Could not send your code — WhatsApp only lets us message you within 24 hours of your last message to the TrueFlow bot. Send the bot any message on WhatsApp, then try signing in again."
      return NextResponse.json({ error: message }, { status: 502 })
    }

    return NextResponse.json({ success: true, phone: normalised })
  } catch (err) {
    console.error('send-otp: unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
