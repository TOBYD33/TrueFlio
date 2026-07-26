// settings/team/page.tsx
// Team management — list members, invite new staff, manage permissions, accountant links.
// Server component that fetches all data; hands off interactive parts to client components.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { formatDate } from '@/lib/utils'
import { TeamActions } from './TeamActions'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const SLOT_LIMITS: Record<string, number> = {
  free: 0, individual: 0, family: 6,
  sme_starter: 5, sme_pro: 15,
  freelancer: 1, agency: 3, studio: 10, enterprise: 999,
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', staff: 'Staff',
  family_member: 'Family Member', viewer: 'Viewer',
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-[#00D4AA]/10 text-[#00A88A]',
  admin: 'bg-[#6C63FF]/10 text-[#6C63FF]',
  staff: 'bg-gray-100 text-gray-600',
  family_member: 'bg-[#6C63FF]/10 text-[#6C63FF]',
  viewer: 'bg-yellow-100 text-yellow-700',
}

export default async function TeamSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = getAdmin()

  // Get current user's membership
  const { data: myMember } = await admin
    .from('org_members')
    .select('org_id, role, can_see_clients, can_see_income, can_export, whatsapp_active')
    .eq('user_id', user.id)
    .is('removed_at', null)
    .single()

  if (!myMember) redirect('/dashboard')

  // Only owner and admin can manage team
  if (!['owner', 'admin'].includes(myMember.role)) redirect('/settings/profile')

  const { org_id, role: myRole } = myMember

  // Fetch org details
  const { data: org } = await admin
    .from('organizations')
    .select('name, plan, currency')
    .eq('id', org_id)
    .single()

  // Fetch all active members
  const { data: members } = await admin
    .from('org_members')
    .select('id, user_id, role, whatsapp_number, whatsapp_active, can_see_clients, can_see_income, can_export, joined_at, profiles(full_name, phone, avatar_url)')
    .eq('org_id', org_id)
    .is('removed_at', null)
    .order('role', { ascending: true })

  // Fetch pending invites (invite_token not null and not expired)
  const { data: pendingInvites } = await admin
    .from('org_members')
    .select('id, role, invited_email, whatsapp_number, invite_expires_at, can_see_clients, can_see_income, can_export')
    .eq('org_id', org_id)
    .not('invite_token', 'is', null)
    .is('removed_at', null)
    .order('invite_expires_at', { ascending: true })

  // Fetch accountant share links
  const { data: shareLinks } = await admin
    .from('share_links')
    .select('id, token, permission, expires_at, created_at')
    .eq('org_id', org_id)
    .order('created_at', { ascending: false })

  const plan = org?.plan ?? 'free'
  const slotLimit = SLOT_LIMITS[plan] ?? 0
  const activeNonOwners = (members ?? []).filter((m: any) => m.role !== 'owner')
  const slotsUsed = activeNonOwners.length

  const myProfile = await admin
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <div />
        <TeamActions
          orgId={org_id}
          plan={plan}
          slotsUsed={slotsUsed}
          slotLimit={slotLimit}
          myRole={myRole}
          currentUserId={user.id}
        />
      </div>

      {/* Slot counter */}
      {slotLimit > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{slotsUsed} of {slotLimit} team slots used</span>
          {slotsUsed >= slotLimit && (
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700">Limit reached</span>
          )}
        </div>
      )}

      {/* Section: You */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">You</h2>
        </div>
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#00D4AA]/10 flex items-center justify-center">
              <span className="text-sm font-bold text-[#00A88A]">
                {(myProfile.data?.full_name ?? user.email ?? '?')[0].toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{myProfile.data?.full_name ?? user.email}</p>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mt-0.5 ${ROLE_COLORS[myRole] ?? 'bg-gray-100 text-gray-600'}`}>
                {ROLE_LABELS[myRole] ?? myRole}
              </span>
            </div>
          </div>
          <span className="text-xs text-gray-400">Full access · Cannot be changed</span>
        </div>
      </div>

      {/* Section: Staff & Admins */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Team ({slotsUsed} of {slotLimit === 999 ? '∞' : slotLimit} slots)
          </h2>
        </div>
        {activeNonOwners.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">No team members yet. Invite someone to get started.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activeNonOwners.map((member: any) => {
              const profile = member.profiles
              const name = profile?.full_name ?? member.whatsapp_number ?? 'Unnamed'
              return (
                <div key={member.id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-gray-500">
                        {name[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ROLE_LABELS[member.role] ?? member.role}
                        </span>
                        <span className="text-xs text-gray-400">
                          WhatsApp {member.whatsapp_active ? '✅' : '❌'}
                        </span>
                        <span className="text-xs text-gray-400">
                          Clients {member.can_see_clients ? '✅' : '❌'}
                        </span>
                        <span className="text-xs text-gray-400">
                          Export {member.can_export ? '✅' : '❌'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {myRole === 'owner' && (
                    <TeamActions
                      orgId={org_id}
                      plan={plan}
                      slotsUsed={slotsUsed}
                      slotLimit={slotLimit}
                      myRole={myRole}
                      currentUserId={user.id}
                      memberId={member.id}
                      memberName={name}
                      memberRole={member.role}
                      memberWhatsapp={member.whatsapp_active}
                      memberClients={member.can_see_clients}
                      memberExport={member.can_export}
                      inline
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Section: Accountant Access */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Accountant Access</h2>
        </div>
        <div className="px-5 py-4">
          {!shareLinks?.length ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">No share link active. Generate one for your accountant.</p>
              <TeamActions
                orgId={org_id}
                plan={plan}
                slotsUsed={slotsUsed}
                slotLimit={slotLimit}
                myRole={myRole}
                currentUserId={user.id}
                accountantMode
              />
            </div>
          ) : (
            <div className="space-y-3">
              {shareLinks.map((link: any) => {
                const expired = link.expires_at && new Date(link.expires_at) < new Date()
                return (
                  <div key={link.id} className="flex items-center justify-between gap-4 py-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-gray-600 truncate max-w-[200px]">
                          {`/accountant/${link.token.slice(0, 12)}…`}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${expired ? 'bg-red-100 text-red-600' : 'bg-[#00D4AA]/10 text-[#00A88A]'}`}>
                          {expired ? 'Expired' : link.permission === 'export' ? 'Read + Export' : 'Read only'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {expired ? 'Expired' : `Expires ${formatDate(link.expires_at)}`}
                      </p>
                    </div>
                    <TeamActions
                      orgId={org_id}
                      plan={plan}
                      slotsUsed={slotsUsed}
                      slotLimit={slotLimit}
                      myRole={myRole}
                      currentUserId={user.id}
                      accountantMode
                      shareLinkId={link.id}
                      shareLinkToken={link.token}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section: Pending Invites */}
      {pendingInvites && pendingInvites.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending Invites</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingInvites.map((invite: any) => {
              const contact = invite.invited_email ?? invite.whatsapp_number ?? 'Unknown'
              const expired = invite.invite_expires_at && new Date(invite.invite_expires_at) < new Date()
              return (
                <div key={invite.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {invite.invited_email ? '📧' : '📱'} {contact}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[invite.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[invite.role] ?? invite.role}
                      </span>
                      <span className={`text-xs ${expired ? 'text-red-500' : 'text-gray-400'}`}>
                        {expired ? 'Expired' : invite.invite_expires_at ? `Expires ${formatDate(invite.invite_expires_at)}` : ''}
                      </span>
                    </div>
                  </div>
                  <TeamActions
                    orgId={org_id}
                    plan={plan}
                    slotsUsed={slotsUsed}
                    slotLimit={slotLimit}
                    myRole={myRole}
                    currentUserId={user.id}
                    pendingInviteId={invite.id}
                    pendingInviteContact={contact}
                    pendingInviteRole={invite.role}
                    pendingInviteIsEmail={!!invite.invited_email}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
