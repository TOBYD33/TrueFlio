// api/team/invite/route.ts
// Invites a new team member by phone (WhatsApp) or email.
// Checks slot limits before creating the invite record.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { staffLimitForDb } from '@/lib/plans-db'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getAdmin()

  // Get caller's membership and org
  const { data: member } = await admin
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .is('removed_at', null)
    .single()

  if (!member || !['owner', 'admin'].includes(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { org_id } = member

  const { data: org } = await admin
    .from('organizations')
    .select('plan')
    .eq('id', org_id)
    .single()

  // -1 = unlimited (Business Pro/Enterprise). 0 = cannot invite ANY team
  // member at all (Free/Individual/Business Starter — this is Business
  // Pro's defining upsell, not a headcount cap to raise). Any other
  // positive number is a real cap. The old `slotLimit > 0` check treated 0
  // as "no limit" (falsy), which would have silently let Business Starter
  // invite unlimited staff — fixed to explicitly compare against -1.
  const slotLimit = await staffLimitForDb(org?.plan)

  // Count current active non-owner members
  const { count: currentCount } = await admin
    .from('org_members')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', org_id)
    .neq('role', 'owner')
    .is('removed_at', null)

  if (slotLimit !== -1 && (currentCount ?? 0) >= slotLimit) {
    return NextResponse.json({ error: 'Team invites aren\'t available on your current plan. Upgrade to Business Pro to add team members.', upgradeRequired: true }, { status: 403 })
  }

  const { contact, contactType, role, canWhatsapp, canClients, canExport } = await req.json()
  if (!contact || !contactType || !role) {
    return NextResponse.json({ error: 'contact, contactType, and role are required' }, { status: 400 })
  }

  const validRoles = ['admin', 'staff', 'family_member', 'viewer']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const inviteToken = randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  if (contactType === 'phone') {
    // Phone invite — create org_members row with whatsapp_number + invite token
    const { error } = await admin.from('org_members').insert({
      org_id,
      user_id: null,
      role,
      whatsapp_number: contact,
      whatsapp_active: canWhatsapp,
      can_see_clients: canClients,
      can_see_income: canClients,
      can_export: canExport,
      invite_token: inviteToken,
      invite_expires_at: expiresAt,
      invited_by: user.id,
      invited_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Send WhatsApp invite via Twilio (fire and forget)
    const { data: inviterProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const { data: orgData } = await admin
      .from('organizations')
      .select('name')
      .eq('id', org_id)
      .single()

    const orgName = orgData?.name ?? 'a TrueFlow workspace'
    const inviterName = inviterProfile?.full_name ?? 'Your account owner'
    const acceptLink = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.gettrueflow.com'}/invite/accept/${inviteToken}`

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const sid = process.env.TWILIO_ACCOUNT_SID
      const auth = process.env.TWILIO_AUTH_TOKEN
      const body = `👋 ${inviterName} has invited you to join ${orgName} on TrueFlow as ${role}.\n\nTap to accept: ${acceptLink}\n\nOr reply *START* to begin using the bot right away.`
      const form = new URLSearchParams({
        From: process.env.TWILIO_WHATSAPP_NUMBER!,
        To: `whatsapp:${contact}`,
        Body: body,
      })
      fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      }).catch(err => console.error('WhatsApp invite send failed:', err))
    }
  } else {
    // Email invite
    const { error } = await admin.from('org_members').insert({
      org_id,
      user_id: null,
      role,
      whatsapp_active: canWhatsapp,
      can_see_clients: canClients,
      can_see_income: canClients,
      can_export: canExport,
      invited_email: contact,
      invite_token: inviteToken,
      invite_expires_at: expiresAt,
      invited_by: user.id,
      invited_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Send email via Resend if API key is configured
    if (process.env.RESEND_API_KEY) {
      const { data: orgData } = await admin.from('organizations').select('name').eq('id', org_id).single()
      const { data: inviterProfile } = await admin.from('profiles').select('full_name').eq('id', user.id).single()
      const orgName = orgData?.name ?? 'a TrueFlow workspace'
      const inviterName = inviterProfile?.full_name ?? 'Your team owner'
      const acceptLink = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.gettrueflow.com'}/invite/accept/${inviteToken}`

      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'TrueFlow <hello@verify.gettrueflow.com>',
          to: [contact],
          subject: `${inviterName} invited you to join ${orgName} on TrueFlow`,
          html: `<p>Hi there,</p><p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on TrueFlow as <strong>${role}</strong>.</p><p><a href="${acceptLink}" style="background:#6C63FF;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0;">Accept Invitation</a></p><p>This link expires in 7 days.</p><p>— The TrueFlow Team</p>`,
        }),
      }).catch(err => console.error('Resend invite failed:', err))
    }
  }

  return NextResponse.json({ ok: true })
}
