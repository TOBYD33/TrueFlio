'use client'
// notifications/page.tsx
// Full notification history for the logged-in user — the "View all
// notifications" destination from the header bell's dropdown.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { NotificationHistoryList } from '@/components/shared/NotificationHistoryList'

export default function NotificationsPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  if (!userId) return null
  return <NotificationHistoryList recipientType="user" recipientId={userId} />
}
