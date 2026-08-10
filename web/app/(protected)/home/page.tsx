'use client'
// home/page.tsx
// The default landing route after login — a softer, faster entry point
// than Dashboard's data-dense view. Gradient greeting banner (time-aware,
// re-checked every minute, real local browser time) + a filterable grid
// of shortcut cards to the app's real features. Same design system as
// /dashboard-concept: light base, ThemedCard, violet/mint accents.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { useTheme, tone, BRAND } from '@/components/shared/theme'
import {
  Sparkles,
  Receipt,
  BarChart3,
  UserCircle2,
  FileText,
  Users,
  MessageSquare,
  Bell,
  Landmark,
  Calendar,
  Clock,
} from 'lucide-react'

type FilterKey = 'All' | 'Money' | 'Clients' | 'Team' | 'Tello'

interface Shortcut {
  key: string
  label: string
  sub: string
  href: string
  icon: React.ComponentType<{ size?: number }>
  category: Exclude<FilterKey, 'All'>
  badgeCount?: number
}

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening' // covers 17:00–4:59
}

export default function HomePage() {
  const supabase = createClient()
  const { orgId, userId } = useViewingContext()
  const { dark } = useTheme()
  const t = tone(dark)

  const [firstName, setFirstName] = useState<string>('')
  const [orgType, setOrgType] = useState<'sme' | 'family' | 'individual' | string>('sme')
  const [taxPendingCount, setTaxPendingCount] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [filter, setFilter] = useState<FilterKey>('All')

  // Re-check the clock every minute — never a one-time calculation.
  // Local browser time throughout, never server time.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!orgId || !userId) return
    async function load() {
      const [{ data: profile }, { data: org }, { count: taxCount }] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
        supabase.from('organizations').select('type').eq('id', orgId).single(),
        supabase.from('reminders').select('id', { count: 'exact', head: true })
          .eq('org_id', orgId).eq('category', 'tax').eq('status', 'active').is('archived_at', null),
      ])

      const name = profile?.full_name?.trim()
      setFirstName(name ? name.split(' ')[0] : '')
      setOrgType(org?.type ?? 'sme')
      setTaxPendingCount(taxCount ?? 0)
    }
    load()
  }, [orgId, userId])

  const teamLabel = orgType === 'family' ? 'Family' : 'Team'

  const shortcuts: Shortcut[] = [
    { key: 'log-receipt', label: 'Log a receipt', sub: 'Scan or upload an expense', href: '/receipts', icon: Receipt, category: 'Money' },
    { key: 'view-reports', label: 'View reports', sub: 'See your spending breakdown', href: '/reports', icon: BarChart3, category: 'Money' },
    {
      key: 'tax-hub', label: 'Tax Hub', sub: 'Track and estimate your liability', href: '/tax', icon: Landmark, category: 'Money',
      badgeCount: taxPendingCount,
    },
    { key: 'add-client', label: 'Add a client', sub: 'Save a new client or lead', href: '/clients', icon: UserCircle2, category: 'Clients' },
    { key: 'create-invoice', label: 'Create an invoice', sub: 'Bill a client', href: '/invoices/new', icon: FileText, category: 'Clients' },
    {
      key: 'invite-team', label: `Invite a ${teamLabel.toLowerCase()} member`, sub: `Add ${teamLabel === 'Family' ? 'household' : 'staff'} access`,
      href: '/settings/team', icon: Users, category: 'Team',
    },
    { key: 'ask-tello', label: 'Ask Tello', sub: 'Jump straight into chat', href: '/whatsapp', icon: MessageSquare, category: 'Tello' },
    { key: 'set-reminder', label: 'Set a reminder', sub: 'Never forget a deadline', href: '/reminders', icon: Bell, category: 'Tello' },
  ]

  const visible = filter === 'All' ? shortcuts : shortcuts.filter(s => s.category === filter)
  // Internal filter keys stay fixed ('Team') — only the pill's displayed
  // text changes to "Family", so clicking it still matches shortcut.category
  const filters: { key: FilterKey; label: string }[] = [
    { key: 'All', label: 'All' },
    { key: 'Money', label: 'Money' },
    { key: 'Clients', label: 'Clients' },
    { key: 'Team', label: teamLabel },
    { key: 'Tello', label: 'Tello' },
  ]

  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const greeting = getGreeting(now.getHours())

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Gradient greeting banner — same gradient language as the Meet Tello promo card.
          Everything left-justified: icon, then a single left-aligned text stack. */}
      <div
        className="rounded-2xl p-6 sm:p-8 relative overflow-hidden"
        style={{ background: 'linear-gradient(120deg, #6C63FF 0%, #3D37A6 45%, #0A0A0F 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        />
        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.16)' }}>
            <Sparkles size={24} className="text-white" />
          </div>
          <div className="text-left min-w-0">
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="flex items-center gap-1.5 text-white/80">
                <Calendar size={14} /> {dateStr}
              </span>
              <span className="flex items-center gap-1.5 text-white/60">
                <Clock size={14} /> {timeStr}
              </span>
              <span
                className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.14)', color: 'rgba(245,245,247,0.85)' }}
              >
                {greeting}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-3">
              Welcome back{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-sm mt-1.5" style={{ color: 'rgba(245,245,247,0.75)' }}>
              Your workspace overview and shortcuts at a glance.
            </p>
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="h-9 px-4 rounded-full text-sm font-medium transition-colors"
            style={
              filter === f.key
                ? { background: BRAND.violet, color: '#FFFFFF' }
                : { background: t.hover, color: t.textMid }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Shortcut cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map(s => {
          const Icon = s.icon
          return (
            <Link key={s.key} href={s.href}>
              <div
                className="rounded-2xl p-5 h-full transition-transform hover:-translate-y-0.5 relative"
                style={{
                  background: t.surface,
                  boxShadow: t.cardShadow,
                  border: `1px solid ${t.border}`,
                }}
              >
                {!!s.badgeCount && (
                  <span
                    className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ background: BRAND.red }}
                  >
                    {s.badgeCount}
                  </span>
                )}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(108,99,255,0.10)', color: BRAND.violet }}
                >
                  <Icon size={18} />
                </div>
                <p className="text-sm font-semibold" style={{ color: t.text }}>{s.label}</p>
                <p className="text-xs mt-0.5" style={{ color: t.textDim }}>{s.sub}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
