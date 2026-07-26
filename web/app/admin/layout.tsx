// app/admin/layout.tsx
// Platform admin gate — redirects if no admin_role (falls back to
// is_super_admin for compat). Chrome rendered by AdminShell in the
// approved /dashboard-concept design system (light base, icon rail,
// violet actives, light/dark toggle). Broadcast/Admin Team nav are
// Super Admin only. ImpersonationBanner shown if a session is active.

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { AdminShell } from '@/components/shared/AdminShell'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = getAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('admin_role, is_super_admin, full_name')
    .eq('id', user.id)
    .single()

  // Accept admin_role column or legacy is_super_admin boolean
  const adminRole = profile?.admin_role ?? (profile?.is_super_admin ? 'super' : null)
  if (!adminRole) redirect('/dashboard')

  // Check for active impersonation session
  const cookieStore = await cookies()
  const impersonationSessionId = cookieStore.get('impersonation_session_id')?.value
  let impersonationUserName: string | null = null
  let impersonationWriteEnabled = false

  if (impersonationSessionId) {
    const { data: imp } = await admin
      .from('impersonation_sessions')
      .select('target_user_id, is_write_enabled, target:profiles!target_user_id(full_name)')
      .eq('id', impersonationSessionId)
      .eq('is_active', true)
      .single()
    impersonationUserName = (imp as any)?.target?.full_name ?? 'Unknown user'
    impersonationWriteEnabled = (imp as any)?.is_write_enabled ?? false
  }

  return (
    <>
      {impersonationSessionId && impersonationUserName && (
        <ImpersonationBanner
          userName={impersonationUserName}
          sessionId={impersonationSessionId}
          isWriteEnabled={impersonationWriteEnabled}
          canElevate={adminRole === 'super'}
        />
      )}
      <div style={impersonationSessionId ? { paddingTop: '44px' } : undefined}>
        <AdminShell role={adminRole} adminName={profile?.full_name ?? user.email ?? 'Admin'}>
          {children}
        </AdminShell>
      </div>
    </>
  )
}
