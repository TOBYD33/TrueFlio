'use client'
// components/shared/AdminShell.tsx
// Admin panel chrome in the approved /dashboard-concept design system:
// light-mode base, collapsible icon-rail sidebar, Electric Violet actives,
// light/dark toggle. Nav items are role-gated (Broadcast/Admin Team are
// Super Admin only).

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3, Users, ScrollText, Shield, UserCog, Activity,
  Trophy, LineChart, Megaphone, ChevronLeft, ChevronRight,
  Sun, Moon, ArrowLeft, Radio, Tags,
} from 'lucide-react'
import { ThemeProvider, useTheme, tone, BRAND } from './theme'

const ROLE_LABELS: Record<string, string> = {
  super: 'Super Admin',
  support: 'Support Admin',
  finance: 'Finance Admin',
  readonly: 'Read Only Admin',
}

export function AdminShell(props: { role: string; adminName: string; children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AdminShellInner {...props} />
    </ThemeProvider>
  )
}

function AdminShellInner({ role, adminName, children }: { role: string; adminName: string; children: React.ReactNode }) {
  const { dark, setDark } = useTheme()
  const t = tone(dark)
  const pathname = usePathname()
  const [expanded, setExpanded] = useState(false)

  const nav = [
    { href: '/admin/stats', label: 'Stats', icon: BarChart3 },
    { href: '/admin/live', label: 'Live Now', icon: Radio },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/activity', label: 'Activity', icon: Activity },
    { href: '/admin/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/admin/revenue', label: 'Revenue', icon: LineChart },
    { href: '/admin/audit-log', label: 'Audit Log', icon: ScrollText },
    ...(role === 'super'
      ? [
          { href: '/admin/plans', label: 'Plans & Pricing', icon: Tags },
          { href: '/admin/broadcast', label: 'Broadcast', icon: Megaphone },
          { href: '/admin/team', label: 'Admin Team', icon: UserCog },
        ]
      : []),
  ]

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ background: t.page }}>
      {/* Top bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-3 px-5 h-16 border-b transition-colors duration-300"
        style={{ background: t.chrome, borderColor: t.border }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: BRAND.violet }}>
            <Shield size={17} className="text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight" style={{ color: t.text }}>TrueFlow Admin</span>
          <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ background: 'rgba(108,99,255,0.10)', color: BRAND.violet }}>
            {ROLE_LABELS[role] ?? role}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Theme toggle */}
          <div className="flex gap-1 p-1 rounded-xl border" style={{ borderColor: t.border }}>
            <button onClick={() => setDark(true)} aria-label="Dark mode" className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={dark ? { background: 'rgba(108,99,255,0.22)', color: BRAND.violet } : { color: t.textDim }}>
              <Moon size={15} />
            </button>
            <button onClick={() => setDark(false)} aria-label="Light mode" className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={!dark ? { background: 'rgba(108,99,255,0.10)', color: BRAND.violet } : { color: t.textDim }}>
              <Sun size={15} />
            </button>
          </div>
          <span className="hidden sm:block text-sm" style={{ color: t.textDim }}>{adminName}</span>
        </div>
      </header>

      <div className="flex">
        {/* Collapsible icon rail */}
        <aside
          className="relative hidden md:flex sticky top-16 h-[calc(100vh-4rem)] flex-col justify-between py-4 border-r transition-[width] duration-300 ease-in-out"
          style={{ width: expanded ? 232 : 72, background: t.chrome, borderColor: t.border }}
        >
          <button
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="absolute -right-3 top-2 z-10 w-6 h-6 rounded-full border flex items-center justify-center"
            style={{ background: t.chrome, borderColor: t.border, color: t.textDim }}
          >
            {expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>

          <nav className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden px-4">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className="flex items-center h-10 rounded-xl transition-colors shrink-0"
                  style={active ? { background: BRAND.violet, color: '#FFFFFF' } : { color: t.textDim }}
                >
                  <span className="w-10 shrink-0 flex items-center justify-center"><Icon size={18} /></span>
                  <span
                    className="text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ opacity: expanded ? 1 : 0, transform: expanded ? 'translateX(0)' : 'translateX(-8px)', maxWidth: expanded ? 150 : 0 }}
                  >
                    {label}
                  </span>
                </Link>
              )
            })}
          </nav>

          <div className="px-4 shrink-0">
            <Link
              href="/dashboard"
              title="Back to app"
              className="flex items-center h-10 rounded-xl"
              style={{ color: t.textDim }}
            >
              <span className="w-10 shrink-0 flex items-center justify-center"><ArrowLeft size={16} /></span>
              <span
                className="text-xs whitespace-nowrap overflow-hidden transition-all duration-300"
                style={{ opacity: expanded ? 1 : 0, maxWidth: expanded ? 120 : 0 }}
              >
                Back to app
              </span>
            </Link>
          </div>
        </aside>

        <main className="tf-legacy flex-1 min-w-0 p-4 md:p-6">
          {/* Transitional dark remap for older admin pages still on gray classes */}
          {dark && (
            <style>{`
              main.tf-legacy .bg-gray-900 { background-color: #14141B !important; }
              main.tf-legacy .border-gray-800 { border-color: rgba(245,245,247,0.09) !important; }
            `}</style>
          )}
          {!dark && (
            <style>{`
              /* Legacy admin pages were built dark-first — remap for light mode */
              main.tf-legacy .bg-gray-900 { background-color: #FFFFFF !important; }
              main.tf-legacy .bg-gray-950 { background-color: transparent !important; }
              main.tf-legacy .bg-gray-800\\/50, main.tf-legacy .hover\\:bg-gray-800\\/50:hover { background-color: rgba(10,10,15,0.04) !important; }
              main.tf-legacy .border-gray-800 { border-color: rgba(10,10,15,0.08) !important; }
              main.tf-legacy .divide-gray-800 > :not([hidden]) ~ :not([hidden]) { border-color: rgba(10,10,15,0.07) !important; }
              main.tf-legacy .text-white { color: #0A0A0F !important; }
              main.tf-legacy .text-gray-200, main.tf-legacy .text-gray-300 { color: rgba(10,10,15,0.80) !important; }
              main.tf-legacy .text-gray-400, main.tf-legacy .text-gray-500 { color: rgba(10,10,15,0.50) !important; }
              main.tf-legacy .text-gray-600 { color: rgba(10,10,15,0.40) !important; }
              main.tf-legacy .text-violet-300, main.tf-legacy .text-violet-400 { color: #6C63FF !important; }
              main.tf-legacy .text-emerald-400 { color: #00A88A !important; }
              main.tf-legacy .text-amber-300 { color: #B57A1E !important; }
            `}</style>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}
