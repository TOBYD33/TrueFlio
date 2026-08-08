// api/auth/whatsapp/verify-otp/route.ts
// Verifies the 6-digit OTP, finds or creates a Supabase auth user for the phone number,
// generates a magic link, and returns the action_link for the client to redirect to.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.gettrueflow.com'
const CALLBACK_URL = `${APP_URL}/auth/callback`

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json() as { phone: string; code: string }

    if (!phone || !code) {
      return NextResponse.json({ error: 'Phone and code are required.' }, { status: 400 })
    }

    // Load stored OTP
    const { data: otp, error: otpError } = await getSupabaseAdmin()
      .from('whatsapp_otps')
      .select('*')
      .eq('phone', phone)
      .single()

    if (otpError || !otp) {
      return NextResponse.json({ error: 'No code found. Please request a new one.' }, { status: 400 })
    }

    if (new Date(otp.expires_at) < new Date()) {
      await getSupabaseAdmin().from('whatsapp_otps').delete().eq('phone', phone)
      return NextResponse.json({ error: 'Code has expired. Please request a new one.' }, { status: 400 })
    }

    if (otp.attempts >= 5) {
      return NextResponse.json({ error: 'Too many attempts. Please request a new code.' }, { status: 429 })
    }

    // Increment attempts before verifying
    await getSupabaseAdmin()
      .from('whatsapp_otps')
      .update({ attempts: otp.attempts + 1 })
      .eq('phone', phone)

    if (otp.code !== code.trim()) {
      return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 })
    }

    // Code correct — consume it
    await getSupabaseAdmin().from('whatsapp_otps').delete().eq('phone', phone)

    // Find profile by phone number
    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('id, full_name, phone')
      .eq('phone', phone)
      .single()

    // Also check whatsapp_sessions — covers users who used the bot but signed up via email
    const { data: waSession } = await getSupabaseAdmin()
      .from('whatsapp_sessions')
      .select('user_id')
      .eq('phone_number', phone)
      .single()

    // Derive a stable email from phone (used for WhatsApp-only users)
    const sanitizedPhone = phone.replace(/[^0-9]/g, '')
    const derivedEmail = `wa_${sanitizedPhone}@trueflow.app`

    let authEmail = derivedEmail
    let isNewUser = true

    // Candidate identities for this phone: the profile that holds the
    // phone, and the user the bot session points at. Resolve each through
    // merged_into_id, then PREFER whichever already has a real auth
    // account — this logs a WhatsApp+web user into their existing web
    // account instead of minting a duplicate wa_...@trueflow.app one.
    const admin = getSupabaseAdmin()
    const rawCandidates = [profile?.id, waSession?.user_id].filter(Boolean) as string[]
    const candidates: string[] = []
    for (const cand of rawCandidates) {
      const { data: mergeCheck } = await admin
        .from('profiles')
        .select('merged_into_id')
        .eq('id', cand)
        .maybeSingle()
      const resolved = mergeCheck?.merged_into_id ?? cand
      if (!candidates.includes(resolved)) candidates.push(resolved)
    }

    // A phone with NO profile and NO WhatsApp session has no TrueFlow data
    // to log into — reject clearly instead of creating an orphan account.
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "This WhatsApp number isn't linked to a TrueFlow account yet. Message the TrueFlow bot on WhatsApp to get started, or sign in with your email." },
        { status: 404 }
      )
    }

    let matchedUserId: string = candidates[0]
    for (const cand of candidates) {
      const { data: { user: candAuth } } = await admin.auth.admin.getUserById(cand)
      if (candAuth?.email) {
        matchedUserId = cand
        authEmail = candAuth.email
        isNewUser = false
        break
      }
    }

    if (isNewUser) {
      // Create Supabase auth account for this WhatsApp user
      const { data: { user: newUser }, error: createError } = await getSupabaseAdmin().auth.admin.createUser({
        email: derivedEmail,
        email_confirm: true,
        user_metadata: {
          phone,
          full_name: profile?.full_name || '',
          source: 'whatsapp_signin'
        }
      })

      // Ignore "already registered" errors — user may have signed in this way before
      if (createError && !createError.message.toLowerCase().includes('already')) {
        console.error('verify-otp: createUser failed:', createError)
        return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 })
      }

      // If a new auth user was created, link them to the existing org and
      // fold the old bot-created profile into the new auth-backed one using
      // the same merged_into_id mechanism as the identity-merge feature, so
      // every future lookup (bot, web, OTP) resolves consistently.
      if (newUser && matchedUserId && newUser.id !== matchedUserId) {
        const adminDb = getSupabaseAdmin()
        // Both updates are logged on failure — confirmed in production
        // that this can silently affect 0 rows (or error) while the
        // profiles.merged_into_id write below still succeeds, leaving an
        // account that LOOKS merged but whose org_members row never
        // actually moved, so the merged-into profile has no org at all.
        // (protected)/layout.tsx has a self-healing fallback for accounts
        // already in that state, but this logging is what would let a
        // future occurrence actually be diagnosed instead of rediscovered
        // by grepping raw table data.
        const { error: orgMemberMoveError, data: movedOrgMembers } = await adminDb
          .from('org_members')
          .update({ user_id: newUser.id })
          .eq('user_id', matchedUserId)
          .select('id')
        if (orgMemberMoveError) {
          console.error('verify-otp: org_members move failed for', matchedUserId, '->', newUser.id, orgMemberMoveError)
        } else if (!movedOrgMembers || movedOrgMembers.length === 0) {
          console.warn('verify-otp: org_members move affected 0 rows for', matchedUserId, '->', newUser.id)
        }

        const { error: sessionMoveError } = await adminDb
          .from('whatsapp_sessions')
          .update({ user_id: newUser.id })
          .eq('user_id', matchedUserId)
        if (sessionMoveError) {
          console.error('verify-otp: whatsapp_sessions move failed for', matchedUserId, '->', newUser.id, sessionMoveError)
        }

        // Move phone + name onto the new profile (create it if no trigger did)
        const oldName = profile?.full_name ?? null
        await adminDb.from('profiles').update({ phone: null }).eq('id', matchedUserId)
        const { data: newProfile } = await adminDb.from('profiles').select('id').eq('id', newUser.id).maybeSingle()
        if (newProfile) {
          await adminDb.from('profiles').update({ phone, full_name: oldName }).eq('id', newUser.id)
        } else {
          await adminDb.from('profiles').insert({ id: newUser.id, phone, full_name: oldName })
        }
        await adminDb.from('profiles')
          .update({ merged_into_id: newUser.id, status: 'merged' })
          .eq('id', matchedUserId)
      }
    }

    // Generate a one-time token and return its hash — the login page
    // exchanges it for a session directly via supabase.auth.verifyOtp,
    // with no redirect through Supabase's Site URL (which previously
    // bounced users to the stale true-flio.vercel.app domain).
    const { data: linkData, error: linkError } = await getSupabaseAdmin().auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
      options: { redirectTo: CALLBACK_URL }
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('verify-otp: generateLink failed:', linkError)
      return NextResponse.json({ error: 'Could not create sign-in link. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      token_hash: linkData.properties.hashed_token,
      isNewUser,
      name: profile?.full_name || null
    })
  } catch (err) {
    console.error('verify-otp: unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
