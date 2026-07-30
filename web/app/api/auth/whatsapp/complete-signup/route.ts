// api/auth/whatsapp/complete-signup/route.ts
// Called after WhatsApp OTP verification for NEW users.
// Creates their profile + org + org_members, then returns a fresh magic link.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyAdmins } from '@/lib/notifications'

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
    const { phone, fullName, businessName, orgType } = await req.json() as {
      phone: string
      fullName: string
      businessName: string
      orgType?: string
    }

    if (!phone || !fullName) {
      return NextResponse.json({ error: 'Phone and name are required.' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const sanitizedPhone = phone.replace(/[^0-9]/g, '')
    const derivedEmail = `wa_${sanitizedPhone}@trueflow.app`

    // Find the auth user created during OTP verification
    const { data: { users }, error: listError } = await admin.auth.admin.listUsers()
    if (listError) {
      return NextResponse.json({ error: 'Could not look up account.' }, { status: 500 })
    }

    const authUser = users.find(u => u.email === derivedEmail)
    if (!authUser) {
      return NextResponse.json({ error: 'Account not found. Please verify your number again.' }, { status: 404 })
    }

    const userId = authUser.id

    // Upsert profile (may already exist if they used the bot before)
    await admin.from('profiles').upsert({
      id: userId,
      full_name: fullName,
      phone,
    })

    // Check if already in an org (from bot usage)
    const { data: existingMember } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId)
      .single()

    if (!existingMember) {
      // Create a new org and make them owner
      const orgName = businessName?.trim() || `${fullName}'s Business`
      const { data: org, error: orgError } = await admin
        .from('organizations')
        .insert({ name: orgName, owner_id: userId, type: orgType ?? 'sme' })
        .select()
        .single()

      if (orgError || !org) {
        console.error('complete-signup: org creation failed:', orgError)
        return NextResponse.json({ error: 'Could not create your organisation.' }, { status: 500 })
      }

      await admin.from('org_members').insert({
        org_id: org.id,
        user_id: userId,
        role: 'owner',
        joined_at: new Date().toISOString(),
      })

      await notifyAdmins({
        category: 'admin',
        title: 'New user signup',
        body: `${fullName} signed up (${orgName}) via WhatsApp web sign-in.`,
        link: '/admin/users',
      })
    }

    // Generate a fresh magic link
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: derivedEmail,
      options: { redirectTo: CALLBACK_URL },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('complete-signup: generateLink failed:', linkError)
      return NextResponse.json({ error: 'Could not create sign-in link.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, redirect: linkData.properties.action_link })
  } catch (err) {
    console.error('complete-signup: unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
