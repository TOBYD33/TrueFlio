'use client'
// components/shared/NotificationHistoryList.tsx
// Full notification history — the "View all notifications" destination
// from NotificationBell's dropdown. Same shared-component principle: one
// list, parameterized by recipient context, used by both
// /notifications (user) and /admin/notifications (admin).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useTheme, tone, BRAND } from './theme'
import { PageHeader, ThemedCard, BrandButton } from './Cards'
import { Check } from 'lucide-react'

interface NotificationRow {
  id: string
  category: string
  title: string
  body: string
  link: string | null
  is_read: boolean
  created_at: string
}

const CATEGORY_LABELS: Record<string, string> = {
  reminder: 'Reminder', invoice: 'Invoice', client: 'Client', billing: 'Billing',
  project: 'Project', admin: 'Admin', system: 'System',
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day}-${month}-${d.getFullYear()} ${hh}:${mm}`
}

export function NotificationHistoryList({
  recipientType,
  recipientId,
}: {
  recipientType: 'user' | 'admin'
  recipientId: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const { dark } = useTheme()
  const t = tone(dark)

  const [items, setItems] = useState<NotificationRow[] | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  async function load() {
    let query = supabase
      .from('notifications')
      .select('id, category, title, body, link, is_read, created_at')
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (filter === 'unread') query = query.eq('is_read', false)
    const { data } = await query
    setItems((data as NotificationRow[]) ?? [])
  }

  useEffect(() => { load() }, [recipientType, recipientId, filter])

  async function markAllAsRead() {
    setItems(prev => prev?.map(i => ({ ...i, is_read: true })) ?? null)
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId)
      .eq('is_read', false)
  }

  async function handleClick(item: NotificationRow) {
    if (!item.is_read) {
      setItems(prev => prev?.map(i => (i.id === item.id ? { ...i, is_read: true } : i)) ?? null)
      await supabase.from('notifications').update({ is_read: true }).eq('id', item.id)
    }
    if (item.link) router.push(item.link)
  }

  const unreadCount = items?.filter(i => !i.is_read).length ?? 0

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Everything that's happened, in one place"
        action={unreadCount > 0 ? (
          <BrandButton variant="secondary" onClick={markAllAsRead}>
            <Check size={14} /> Mark all as read
          </BrandButton>
        ) : undefined}
      />

      <div className="flex gap-2">
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="text-sm px-3 py-1.5 rounded-lg border capitalize"
            style={filter === f
              ? { background: BRAND.violet, borderColor: BRAND.violet, color: '#fff' }
              : { borderColor: t.border, color: t.textMid }}
          >
            {f}
          </button>
        ))}
      </div>

      <ThemedCard padded={false}>
        {items === null ? (
          <p className="text-sm py-10 text-center" style={{ color: t.textDim }}>Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm py-10 text-center" style={{ color: t.textDim }}>Nothing here yet.</p>
        ) : (
          items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => handleClick(item)}
              className="w-full text-left px-5 py-4"
              style={{
                background: item.is_read ? 'transparent' : t.hover,
                borderTop: i > 0 ? `1px solid ${t.border}` : undefined,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: BRAND.violet }}>
                  {CATEGORY_LABELS[item.category] ?? item.category}
                </span>
                <span className="text-xs shrink-0" style={{ color: t.textDim }}>{formatTimestamp(item.created_at)}</span>
              </div>
              <p className="text-sm font-semibold mt-1" style={{ color: t.text }}>{item.title}</p>
              <p className="text-sm mt-0.5" style={{ color: t.textMid }}>{item.body}</p>
            </button>
          ))
        )}
      </ThemedCard>
    </div>
  )
}
