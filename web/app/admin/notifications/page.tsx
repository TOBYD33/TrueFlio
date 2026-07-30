'use client'
// admin/notifications/page.tsx
// Full notification history for the logged-in platform admin — the "View
// all notifications" destination from the admin header bell's dropdown.
// No role gate needed beyond being inside /admin/* at all — every admin
// role only ever sees their own recipient_id's rows (RLS-enforced).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { NotificationHistoryList } from '@/components/shared/NotificationHistoryList'

export default function AdminNotificationsPage() {
  const supabase = createClient()
  const [adminId, setAdminId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setAdminId(user?.id ?? null))
  }, [])

  if (!adminId) return null
  return <NotificationHistoryList recipientType="admin" recipientId={adminId} />
}
