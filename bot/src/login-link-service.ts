// login-link-service.ts
// Deterministic "I want to log in" handling — checked before AI routing so
// it works with zero API cost and never depends on Claude recognizing it
// (this is exactly the bug reported: a user asked "I want to login" and
// Tello answered "no login needed" instead of pointing them anywhere).
//
// Sends BOTH access paths in one reply:
//   1. A one-time magic link (same mechanism as the post-onboarding
//      follow-up in onboarding-service.ts) — taps straight into a session,
//      no code to type, expires in 15 minutes.
//   2. A pointer to app.gettrueflow.com/login, where WhatsApp Sign In
//      (phone number + OTP) works any time the magic link has expired.

import { generateMagicToken } from './onboarding-service'

const LOGIN_PHRASE = /\b(log\s*in|login|sign\s*in|web\s*app|web\s*dashboard|dashboard)\b/i

export function isLoginCommand(text: string): boolean {
  return LOGIN_PHRASE.test(text.trim())
}

export async function buildLoginLinkReply(userId: string): Promise<string> {
  const appUrl = process.env.WEBAPP_URL || 'app.gettrueflow.com'
  const token = await generateMagicToken(userId)

  return (
    `Here's your quick link to log in, no password needed:\n` +
    `${appUrl}/login?token=${token}\n(Expires in 15 minutes for your security.)\n\n` +
    `If it expires, go to ${appUrl}/login any time and sign in with this WhatsApp number — we'll text you a code right here.`
  )
}
