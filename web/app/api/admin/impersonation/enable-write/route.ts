// api/admin/impersonation/enable-write/route.ts
// Elevates the caller's own active impersonation session to write access.
// Super Admin only (Support Admin impersonation stays read-only, always —
// this is non-negotiable per the permission spec, not just a UI default).
// Logs the elevation to admin_audit_log before flipping the flag, same
// "log first" discipline as starting the session itself.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getAdmin()

  const { data: profile } = await admin
    .from('profiles')
    .select('admin_role, is_super_admin')
    .eq('id', user.id)
    .single()

  const adminRole = profile?.admin_role ?? (profile?.is_super_admin ? 'super' : null)
  if (adminRole !== 'super') {
    return NextResponse.json({ error: 'Only Super Admin can enable write access during impersonation' }, { status: 403 })
  }

  const cookieStore = await cookies()
  const sessionId = cookieStore.get('impersonation_session_id')?.value
  if (!sessionId) return NextResponse.json({ error: 'No active impersonation session' }, { status: 400 })

  const { data: session } = await admin
    .from('impersonation_sessions')
    .select('id, admin_id, target_user_id, target_org_id, is_active')
    .eq('id', sessionId)
    .eq('admin_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Impersonation session not found or already ended' }, { status: 404 })

  // Log before flipping the flag — if this fails, write access never activates.
  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_id: user.id,
    action: 'impersonation_write_enabled',
    target_table: 'profiles',
    target_id: session.target_user_id,
    details: { session_id: session.id, target_org_id: session.target_org_id },
  })

  if (auditError) {
    console.error('impersonation/enable-write: audit log failed:', auditError)
    return NextResponse.json({ error: 'Failed to log elevation — write access not enabled' }, { status: 500 })
  }

  const { error: updateError } = await admin
    .from('impersonation_sessions')
    .update({ is_write_enabled: true })
    .eq('id', session.id)

  if (updateError) {
    console.error('impersonation/enable-write: update failed:', updateError)
    return NextResponse.json({ error: 'Failed to enable write access' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
