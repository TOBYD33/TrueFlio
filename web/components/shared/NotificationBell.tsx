'use client'
// components/shared/NotificationBell.tsx
// ONE shared bell component for both the user dashboard and the Super
// Admin panel — parameterized by recipientType/recipientId/historyHref
// rather than built twice. Reads the shared `notifications` table (see
// bot/sql/step17-notifications.sql), live via Supabase Realtime.
//
// Realtime filters on recipient_id only (Supabase's postgres_changes
// filter supports one column match) — recipient_type is checked client-side
// in the callback, since the same person (an org owner who's also a Super
// Admin) can hold rows in both streams under one profile id.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { useTheme, tone, BRAND } from './theme'
import { playNotificationChime } from '@/lib/notification-sound'
import {
  Bell, Check, Clock, Receipt, UserPlus, CreditCard, Settings as SettingsIcon,
  Briefcase, Shield, Monitor, MonitorOff,
} from 'lucide-react'

export interface NotificationRow {
  id: string
  category: string
  title: string
  body: string
  link: string | null
  is_read: boolean
  created_at: string
}

const CATEGORY_META: Record<string, { icon: typeof Bell; label: string; color: string }> = {
  reminder: { icon: Clock, label: 'Reminder', color: BRAND.violet },
  invoice: { icon: Receipt, label: 'Invoice', color: BRAND.mintDeep },
  client: { icon: UserPlus, label: 'Client', color: BRAND.violet },
  billing: { icon: CreditCard, label: 'Billing', color: BRAND.amber },
  project: { icon: Briefcase, label: 'Project', color: BRAND.amber },
  admin: { icon: Shield, label: 'Admin', color: BRAND.violet },
  system: { icon: SettingsIcon, label: 'System', color: '#8B8B96' },
}

function categoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.system
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day}-${month}-${d.getFullYear()} ${hh}:${mm}`
}

interface NotificationBellProps {
  recipientType: 'user' | 'admin'
  recipientId: string
  historyHref: string
}

export function NotificationBell({ recipientType, recipientId, historyHref }: NotificationBellProps) {
  const supabase = createClient()
  const router = useRouter()
  const { dark } = useTheme()
  const t = tone(dark)

  const [items, setItems] = useState<NotificationRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [desktopEnabled, setDesktopEnabled] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [{ data: recent }, { count }] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, category, title, body, link, is_read, created_at')
        .eq('recipient_type', recipientType)
        .eq('recipient_id', recipientId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_type', recipientType)
        .eq('recipient_id', recipientId)
        .eq('is_read', false),
    ])
    setItems((recent as NotificationRow[]) ?? [])
    setUnreadCount(count ?? 0)
  }, [recipientType, recipientId])

  useEffect(() => {
    load()
    supabase.from('profiles').select('desktop_notifications_enabled').eq('id', recipientId).maybeSingle()
      .then(({ data }) => { if (data) setDesktopEnabled(data.desktop_notifications_enabled !== false) })
  }, [load, recipientId])

  // Realtime: new + updated notifications for this recipient
  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${recipientType}:${recipientId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${recipientId}` },
        payload => {
          const row = payload.new as NotificationRow & { recipient_type: string }
          if (row.recipient_type !== recipientType) return

          setItems(prev => [row, ...prev].slice(0, 20))
          setUnreadCount(prev => prev + 1)
          playNotificationChime()

          if (document.hidden && desktopEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              const n = new Notification(row.title, { body: row.body })
              n.onclick = () => {
                window.focus()
                if (row.link) router.push(row.link)
                n.close()
              }
            } catch {
              // Desktop push is a nice-to-have — never break the rest of the flow.
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${recipientId}` },
        payload => {
          const row = payload.new as NotificationRow & { recipient_type: string }
          if (row.recipient_type !== recipientType) return
          setItems(prev => prev.map(i => (i.id === row.id ? { ...i, is_read: row.is_read } : i)))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientType, recipientId, desktopEnabled])

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  async function markAllAsRead() {
    setItems(prev => prev.map(i => ({ ...i, is_read: true })))
    setUnreadCount(0)
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId)
      .eq('is_read', false)
  }

  async function handleItemClick(item: NotificationRow) {
    if (!item.is_read) {
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, is_read: true } : i)))
      setUnreadCount(prev => Math.max(0, prev - 1))
      await supabase.from('notifications').update({ is_read: true }).eq('id', item.id)
    }
    setOpen(false)
    if (item.link) router.push(item.link)
  }

  async function toggleDesktop() {
    const next = !desktopEnabled
    // Turning ON is the explicit opt-in moment to request OS permission —
    // never requested on page load, only on this deliberate action.
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    setDesktopEnabled(next)
    await supabase.from('profiles').update({ desktop_notifications_enabled: next }).eq('id', recipientId)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
        style={{ color: t.textMid }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: BRAND.red }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border z-50 overflow-hidden"
          style={{ background: t.surface, borderColor: t.border, boxShadow: '0 8px 24px rgba(10,10,15,0.16)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: t.border }}>
            <span className="font-semibold text-sm" style={{ color: t.text }}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-xs font-medium flex items-center gap-1" style={{ color: BRAND.mintDeep }}>
                <Check size={12} /> Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: t.textDim }}>You're all caught up.</p>
            ) : (
              items.map(item => {
                const meta = categoryMeta(item.category)
                const Icon = meta.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="w-full text-left px-4 py-3 border-b transition-colors"
                    style={{ borderColor: t.border, background: item.is_read ? 'transparent' : t.hover }}
                  >
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full mb-1.5"
                      style={{ background: `${meta.color}1A`, color: meta.color }}
                    >
                      <Icon size={11} /> {meta.label}
                    </span>
                    <p className="text-sm font-semibold" style={{ color: t.text }}>{item.title}</p>
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: t.textMid }}>{item.body}</p>
                    <p className="text-[11px] mt-1" style={{ color: t.textDim }}>{formatTimestamp(item.created_at)}</p>
                  </button>
                )
              })
            )}
          </div>

          <Link
            href={historyHref}
            onClick={() => setOpen(false)}
            className="block text-center text-sm font-medium py-2.5 border-b"
            style={{ color: t.text, borderColor: t.border }}
          >
            View all notifications
          </Link>

          <button
            onClick={toggleDesktop}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm"
            style={{ color: t.textMid }}
          >
            {desktopEnabled ? <Monitor size={15} /> : <MonitorOff size={15} />}
            {desktopEnabled ? 'Turn off desktop notifications' : 'Turn on desktop notifications'}
          </button>
        </div>
      )}
    </div>
  )
}
