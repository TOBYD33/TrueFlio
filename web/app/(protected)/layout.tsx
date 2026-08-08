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

    // Self-healing fallback: confirmed in production that the WhatsApp
    // OTP identity-merge (verify-otp.ts) can mark an old profile
    // merged_into_id -> this one without actually moving its org_members
    // row over — leaving this account correctly authenticated but with
    // NO org_members row of its own, so the lookup above comes up empty.
    // That's a null orgId with no error anywhere, which is exactly what
    // silently hid the whole dashboard (including TelloBubble, which is
    // gated on `orgId &&`) for real, currently-active users. Rather than
    // leave this account permanently broken until a manual data fix, look
    // for the org_members row still sitting under whichever old profile(s)
    // merged into this one, and adopt it — repairing the data in place so
    // this fallback only has to run once per affected account.
    if (!orgId) {
      const { data: mergedFrom } = await admin
        .from('profiles')
        .select('id')
        .eq('merged_into_id', effectiveUserId)
      const oldIds = (mergedFrom ?? []).map(p => p.id)

      if (oldIds.length > 0) {
        const { data: staleMembers } = await admin
          .from('org_members')
          .select('id, org_id')
          .in('user_id', oldIds)
          .is('removed_at', null)

        const staleMember = staleMembers?.[0]
        if (staleMember) {
          orgId = staleMember.org_id
          const { error: repairError } = await admin
            .from('org_members')
            .update({ user_id: effectiveUserId })
            .eq('id', staleMember.id)
          if (repairError) {
            console.error('layout: failed to repair stale org_members row for', effectiveUserId, repairError)
          } else {
            await admin.from('whatsapp_sessions').update({ user_id: effectiveUserId }).in('user_id', oldIds)
          }
        }
      }
    }

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
