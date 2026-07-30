// api/team/accept-invite/route.ts
// Accepts a pending invite — links the authenticated user to the org_members row.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { notifyOrgMembers } from '@/lib/notifications'

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
  if (!user) return NextResponse.json({ error: 'You must be signed in to accept an invite' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const admin = getAdmin()

  const { data: invite } = await admin
    .from('org_members')
    .select('id, org_id, invite_expires_at, user_id')
    .eq('invite_token', token)
    .is('removed_at', null)
    .single()

  if (!invite) return NextResponse.json({ error: 'Invite not found or already used' }, { status: 404 })
  if (invite.user_id) return NextResponse.json({ error: 'This invite has already been accepted' }, { status: 400 })
  if (invite.invite_expires_at && new Date(invite.invite_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired. Ask the owner to resend it.' }, { status: 400 })
  }

  // Link the authenticated user to the org_members row
  const { error } = await admin
    .from('org_members')
    .update({
      user_id: user.id,
      joined_at: new Date().toISOString(),
      invite_token: null,
      invite_expires_at: null,
    })
    .eq('id', invite.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  await notifyOrgMembers({
    orgId: invite.org_id,
    category: 'system',
    title: 'Team member joined',
    body: `${profile?.full_name || user.email || 'A new team member'} joined the team.`,
    link: '/settings/team',
  })

  return NextResponse.json({ ok: true, orgId: invite.org_id })
}
