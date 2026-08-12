'use client'
// components/shared/AppSidebar.tsx
// The app-wide collapsible sidebar, promoted from the approved
// /dashboard-concept design. Desktop: 72px icon rail <-> 248px labeled rail
// with animated width. Mobile: slide-in drawer (expanded style). Includes
// the Current Plan card at the bottom. Theme-aware via useTheme().
//
// Three-tier nav: 6 pinned top items (by frequency of use), a collapsible
// "More" group for the remaining 9, and Settings pinned separately at the
// very bottom, outside "More" — Settings should never be one click deeper
// than everything else.

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  LayoutDashboard,
  Receipt,
  BarChart3,
  FileText,
  Users,
  Settings,
  UserCircle2,
  FolderKanban,
  TrendingUp,
  Bell,
  Inbox,
  PiggyBank,
  Package,
  Landmark,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  MoreHorizontal,
  X,
} from 'lucide-react'
import { useTheme, tone, BRAND } from './theme'

interface NavItem {
  href: string
  label: string
  icon: typeof Home
}

// Requirement 1 — exact order.
const topItems: NavItem[] = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/whatsapp', label: 'True Assistant', icon: Sparkles },
  { href: '/income', label: 'Income', icon: TrendingUp },
  { href: '/receipts', label: 'Receipts', icon: Receipt },
  { href: '/clients', label: 'Clients', icon: UserCircle2 },
  { href: '/reminders', label: 'Reminders', icon: Bell },
]

// Requirement 2 — the remaining 9, including the new Notifications page.
const moreItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/tax', label: 'Tax Hub', icon: Landmark },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/settings/team', label: 'Team', icon: Users },
  { href: '/notifications', label: 'Notifications', icon: Inbox },
]

// Requirement 3 — pinned at the bottom, never inside "More".
const settingsItem: NavItem = { href: '/settings', label: 'Settings', icon: Settings }

const PLAN_INFO: Record<string, { label: string; desc: string }> = {
  free:        { label: 'Free',        desc: '10 receipts/mo · 1 user' },
  individual:  { label: 'Individual',  desc: 'Unlimited receipts · 1 user' },
  family:      { label: 'Family',      desc: 'Unlimited receipts · 6 members' },
  freelancer:  { label: 'Freelancer',  desc: 'Unlimited receipts · 10 clients' },
  sme_starter: { label: 'SME Starter', desc: 'Unlimited receipts · 5 staff · accountant sharing' },
  agency:      { label: 'Agency',      desc: 'Unlimited receipts · 50 clients · 3 staff' },
  sme_pro:     { label: 'SME Pro',     desc: 'Unlimited receipts · 15 staff · advanced analytics' },
  studio:      { label: 'Studio',      desc: 'Unlimited everything · 10 staff' },
  enterprise:  { label: 'Enterprise',  desc: 'Custom limits · unlimited everything' },
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/settings') {
    // Avoid Settings matching /settings/team (which has its own item)
    return pathname === '/settings' || (pathname.startsWith('/settings/') && !pathname.startsWith('/settings/team'))
  }
  return pathname === href || pathname.startsWith(href + '/')
}

function PlanCard({ plan, expanded }: { plan: string; expanded: boolean }) {
  const { dark } = useTheme()
  const t = tone(dark)
  const info = PLAN_INFO[plan] ?? { label: plan, desc: '' }
  if (!expanded) {
    return (
      <div
        title={`Current plan: ${info.label} · Active`}
        className="w-12 h-12 mx-auto rounded-2xl border flex items-center justify-center text-sm font-bold"
        style={{
          background: dark ? 'rgba(108,99,255,0.10)' : 'rgba(108,99,255,0.06)',
          borderColor: dark ? 'rgba(108,99,255,0.25)' : 'rgba(108,99,255,0.18)',
          color: BRAND.violet,
        }}
      >
        {info.label.charAt(0)}
      </div>
    )
  }
  return (
    <div
      className="rounded-2xl p-4 border"
      style={{
        background: dark ? 'rgba(108,99,255,0.08)' : 'rgba(108,99,255,0.05)',
        borderColor: dark ? 'rgba(108,99,255,0.25)' : 'rgba(108,99,255,0.18)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: BRAND.violet }}>
          Current Plan
        </span>
        <span className="text-xs font-semibold" style={{ color: BRAND.violet }}>Active</span>
      </div>
      <p className="text-lg font-bold mt-1" style={{ color: t.text }}>{info.label}</p>
      {info.desc && (
        <p className="text-xs mt-1 leading-relaxed" style={{ color: t.textDim }}>{info.desc}</p>
      )}
    </div>
  )
}

function NavLink({ item, expanded, active, onNavigate }: { item: NavItem; expanded: boolean; active: boolean; onNavigate?: () => void }) {
  const { dark } = useTheme()
  const t = tone(dark)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      title={item.label}
      onClick={onNavigate}
      className="flex items-center h-10 rounded-xl transition-colors shrink-0"
      style={active ? { background: BRAND.violet, color: '#FFFFFF' } : { color: t.textDim }}
    >
      <span className="w-10 shrink-0 flex items-center justify-center">
        <Icon size={18} />
      </span>
      <span
        className="text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          opacity: expanded ? 1 : 0,
          transform: expanded ? 'translateX(0)' : 'translateX(-8px)',
          maxWidth: expanded ? 160 : 0,
        }}
      >
        {item.label}
      </span>
    </Link>
  )
}

function NavLinks({ expanded, onNavigate }: { expanded: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const { dark } = useTheme()
  const t = tone(dark)
  // Session-only by default per the ticket ("remember during the session
  // at minimum") — defaults open if the active route is already inside
  // "More", so landing on e.g. /invoices via a direct link or refresh
  // doesn't hide the very item that's currently selected.
  const [moreOpen, setMoreOpen] = useState(() => moreItems.some(i => isActive(pathname, i.href)))

  return (
    <nav className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden px-4">
      {topItems.map(item => (
        <NavLink key={item.href} item={item} expanded={expanded} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
      ))}

      <button
        onClick={() => setMoreOpen(v => !v)}
        title="More"
        className="flex items-center h-10 rounded-xl transition-colors shrink-0"
        style={{ color: t.textDim }}
      >
        <span className="w-10 shrink-0 flex items-center justify-center">
          <MoreHorizontal size={18} />
        </span>
        <span
          className="flex-1 flex items-center justify-between text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out"
          style={{
            opacity: expanded ? 1 : 0,
            transform: expanded ? 'translateX(0)' : 'translateX(-8px)',
            maxWidth: expanded ? 160 : 0,
          }}
        >
          More
          <ChevronDown size={14} className="transition-transform duration-200" style={{ transform: moreOpen ? 'rotate(180deg)' : 'none' }} />
        </span>
      </button>

      {moreOpen && (
        <div className="flex flex-col gap-1">
          {moreItems.map(item => (
            <NavLink key={item.href} item={item} expanded={expanded} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      <div className="mt-1 pt-1 border-t" style={{ borderColor: t.border }}>
        <NavLink item={settingsItem} expanded={expanded} active={isActive(pathname, settingsItem.href)} onNavigate={onNavigate} />
      </div>
    </nav>
  )
}

interface AppSidebarProps {
  plan: string
  // Mobile drawer state, controlled by AppShell's hamburger
  mobileOpen: boolean
  onMobileClose: () => void
}

export function AppSidebar({ plan, mobileOpen, onMobileClose }: AppSidebarProps) {
  const { dark } = useTheme()
  const t = tone(dark)
  // Desktop collapse state — session-only, collapsed rail by default
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      {/* Desktop: collapsible rail in normal flex flow */}
      <aside
        className="relative hidden md:flex sticky top-16 h-[calc(100vh-4rem)] flex-col justify-between py-4 border-r transition-[width] duration-300 ease-in-out"
        style={{ width: expanded ? 248 : 72, background: t.chrome, borderColor: t.border }}
      >
        <button
          onClick={() => setExpanded(e => !e)}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          className="absolute -right-3 top-2 z-10 w-6 h-6 rounded-full border flex items-center justify-center"
          style={{ background: t.chrome, borderColor: t.border, color: t.textDim }}
        >
          {expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        <NavLinks expanded={expanded} />

        <div className="px-3 pt-3 shrink-0">
          <PlanCard plan={plan} expanded={expanded} />
        </div>
      </aside>

      {/* Mobile: slide-in drawer, always expanded style */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <aside
            className="absolute inset-y-0 left-0 w-[270px] flex flex-col justify-between py-4 border-r overflow-y-auto"
            style={{ background: t.chrome, borderColor: t.border }}
          >
            <div>
              <div className="flex items-center justify-between px-4 pb-3">
                <span className="font-bold text-lg" style={{ color: t.text }}>TrueFlow</span>
                <button
                  onClick={onMobileClose}
                  aria-label="Close menu"
                  className="p-1.5 rounded-lg"
                  style={{ color: t.textDim }}
                >
                  <X size={18} />
                </button>
              </div>
              <NavLinks expanded onNavigate={onMobileClose} />
            </div>
            <div className="px-3 pt-3 shrink-0">
              <PlanCard plan={plan} expanded />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
