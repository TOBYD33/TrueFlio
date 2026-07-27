// (protected)/layout.tsx
// Fetches org data server-side, passes to AppShell client component.
// Mounts TelloBubble and ImpersonationBanner on every protected page.
// During an active impersonation session, uses the target user's org context.

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { AppShell } from '@/components/AppShell'
import { TelloBubble } from '@/components/TelloBubble'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { ViewingContextProvider } from '@/components/ViewingContext'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = getAdmin()

  // Check for active impersonation session
  const cookieStore = await cookies()
  const impersonationSessionId = cookieStore.get('impersonation_session_id')?.value
  let impersonationUserName: string | null = null
  let impersonationOrgId: string | null = null
  let impersonationUserId: string | null = null
  let impersonationPhone: string | null = null
  let impersonationWriteEnabled = false
  let callerIsSuperAdmin = false

  if (impersonationSessionId) {
    const { data: imp } = await admin
      .from('impersonation_sessions')
      .select('target_org_id, target_user_id, is_write_enabled, target:profiles!target_user_id(full_name, phone)')
      .eq('id', impersonationSessionId)
      .eq('is_active', true)
      .single()

    if (imp) {
      const target = (imp as any).target
      impersonationUserName = target?.full_name ?? 'Unknown user'
      impersonationOrgId = (imp as any).target_org_id ?? null
      impersonationUserId = (imp as any).target_user_id ?? null
      impersonationPhone = target?.phone ?? null
      impersonationWriteEnabled = (imp as any).is_write_enabled ?? false

      // If session has no target_org_id, look it up from the target user's org_members row
      if (!impersonationOrgId && impersonationUserId) {
        const { data: targetMember } = await admin
          .from('org_members')
          .select('org_id')
          .eq('user_id', impersonationUserId)
          .is('removed_at', null)
          .maybeSingle()
        impersonationOrgId = targetMember?.org_id ?? null
      }
    }

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('admin_role, is_super_admin')
      .eq('id', user.id)
      .maybeSingle()
    callerIsSuperAdmin = (callerProfile?.admin_role ?? (callerProfile?.is_super_admin ? 'super' : null)) === 'super'
  }

  // Use impersonation org if active — NEVER fall back to admin's own org during impersonation
  let orgId: string | null = impersonationOrgId
  let viewingUserId: string | null = impersonationUserId
  let viewingPhone: string | null = impersonationPhone
  let orgName = 'TrueFlow'
  let plan = 'free'

  if (!impersonationSessionId) {
    // Identity merge: if this profile was merged into a primary profile,
    // resolve through merged_into_id so the user sees the merged account.
    let effectiveUserId = user.id
    const { data: ownRow } = await admin
      .from('profiles')
      .select('merged_into_id')
      .eq('id', user.id)
      .maybeSingle()
    if (ownRow?.merged_into_id) effectiveUserId = ownRow.merged_into_id

    // Use admin client so this works regardless of org_members RLS policy state
    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', effectiveUserId)
      .maybeSingle()
    orgId = member?.org_id ?? null
    viewingUserId = effectiveUserId
    const { data: ownProfile } = await admin
      .from('profiles')
      .select('phone')
      .eq('id', effectiveUserId)
      .maybeSingle()
    viewingPhone = ownProfile?.phone ?? null
  }

  if (orgId) {
    const { data: org } = await admin
      .from('organizations')
      .select('name, plan')
      .eq('id', orgId)
      .single()
    if (org) {
      orgName = org.name ?? orgName
      plan = org.plan ?? plan
    }
  }

  // First-time status: zero receipts in the org
  let isFirstTime = true
  if (orgId) {
    const { count } = await admin
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
    isFirstTime = (count ?? 0) === 0
  }

  return (
    <ViewingContextProvider
      orgId={orgId}
      userId={viewingUserId}
      phone={viewingPhone}
      isImpersonating={!!impersonationSessionId}
    >
      {impersonationSessionId && impersonationUserName && (
        <ImpersonationBanner
          userName={impersonationUserName}
          sessionId={impersonationSessionId}
          isWriteEnabled={impersonationWriteEnabled}
          canElevate={callerIsSuperAdmin}
        />
      )}
      <div style={impersonationSessionId ? { paddingTop: '44px' } : undefined}>
        <AppShell orgName={orgName} plan={plan}>
          {children}
        </AppShell>
        {orgId && !impersonationSessionId && (
          <TelloBubble
            userId={user.id}
            orgId={orgId}
            isFirstTime={isFirstTime}
            plan={plan}
          />
        )}
      </div>
    </ViewingContextProvider>
  )
}
