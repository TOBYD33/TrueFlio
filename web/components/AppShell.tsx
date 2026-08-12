'use client'
// AppShell.tsx
// App-wide chrome in the approved concept design: top bar (logo, theme
// toggle, plan badge, avatar menu) + collapsible AppSidebar. Mounts the
// ThemeProvider so light/dark state persists across page navigation.
// All prior behavior preserved: avatar fetch + live refresh, dropdown,
// sign out, mobile drawer.

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { Menu, Settings, User, LogOut, Sun, Moon, Download, ChevronDown, FileArchive, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ThemeProvider, useTheme, tone, BRAND } from './shared/theme'
import { AppSidebar } from './shared/AppSidebar'
import { PageToolsProvider, usePageToolsHeader } from './shared/PageTools'
import { GlobalSearch } from './shared/GlobalSearch'
import { NotificationBell } from './shared/NotificationBell'

interface AppShellProps {
  children: React.ReactNode
  orgName: string
  plan: string
}

export function AppShell(props: AppShellProps) {
  return (
    <ThemeProvider>
      <PageToolsProvider>
        <AppShellInner {...props} />
      </PageToolsProvider>
    </ThemeProvider>
  )
}

function AppShellInner({ children, orgName, plan }: AppShellProps) {
  const supabase = createClient()
  const router = useRouter()
  const { dark, setDark } = useTheme()
  const t = tone(dark)
  const { exportEnabled, runExport } = usePageToolsHeader()
  const searchRef = useRef<HTMLInputElement>(null)

  // Cmd/Ctrl+F focuses the global search from any page
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [initials, setInitials] = useState('?')
  const [userId, setUserId] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // Fetch current user's avatar + initials once
  useEffect(() => {
    async function loadAvatar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single()
      if (data?.avatar_url) setAvatarUrl(data.avatar_url)
      if (data?.full_name) {
        const parts = data.full_name.trim().split(/\s+/)
        setInitials(parts.map((p: string) => p[0]).slice(0, 2).join('').toUpperCase())
      } else if (user.email) {
        setInitials(user.email[0].toUpperCase())
      }
    }
    loadAvatar()
  }, [])

  // Live-refresh avatar when profile page saves a new one
  useEffect(() => {
    function onAvatarUpdated(e: Event) {
      const url = (e as CustomEvent<{ url: string }>).detail?.url
      if (url) setAvatarUrl(url)
    }
    window.addEventListener('trueflow:avatar-updated', onAvatarUpdated)
    return () => window.removeEventListener('trueflow:avatar-updated', onAvatarUpdated)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    if (exportMenuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportMenuOpen])

  async function exportAllData() {
    setExportMenuOpen(false)
    setExportingAll(true)
    try {
      const res = await fetch('/api/export/all', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not start export'); return }
      toast.success("We're preparing your export — you'll get a notification here when it's ready.")
    } catch {
      toast.error('Network error — could not start export')
    } finally {
      setExportingAll(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const planLabel = plan.replace('_', ' ')

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ background: t.page }}>
      {/* Transitional dark-mode mapping for pages not yet converted to the
          new design system: remaps legacy gray/white utility classes so
          every page stays readable in dark mode during the rollout.
          Removed once all pages use the shared themed components. */}
      {dark && (
        <style>{`
          main.tf-legacy .text-gray-900, main.tf-legacy .text-gray-800 { color: #F5F5F7 !important; }
          main.tf-legacy .text-gray-700, main.tf-legacy .text-gray-600 { color: rgba(245,245,247,0.75) !important; }
          main.tf-legacy .text-gray-500, main.tf-legacy .text-gray-400 { color: rgba(245,245,247,0.50) !important; }
          main.tf-legacy .text-gray-300 { color: rgba(245,245,247,0.35) !important; }
          main.tf-legacy .bg-white { background-color: #14141B !important; }
          main.tf-legacy .bg-gray-50 { background-color: #101017 !important; }
          main.tf-legacy .bg-gray-100 { background-color: rgba(245,245,247,0.07) !important; }
          main.tf-legacy .border-gray-100, main.tf-legacy .border-gray-200 { border-color: rgba(245,245,247,0.09) !important; }
          main.tf-legacy .divide-gray-100 > :not([hidden]) ~ :not([hidden]) { border-color: rgba(245,245,247,0.09) !important; }
          main.tf-legacy .hover\\:bg-gray-50:hover { background-color: rgba(245,245,247,0.05) !important; }
          main.tf-legacy .hover\\:bg-gray-100:hover { background-color: rgba(245,245,247,0.08) !important; }
        `}</style>
      )}

      {/* Top bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 md:px-5 h-16 border-b transition-colors duration-300"
        style={{ background: t.chrome, borderColor: t.border }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-2 rounded-lg -ml-1 shrink-0"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            style={{ color: t.textMid }}
          >
            <Menu size={20} />
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dashboard-concept/TFLogo.png" alt="TrueFlow" className="w-9 h-9 rounded-full object-cover shrink-0" />
          <span className="font-bold text-lg tracking-tight hidden sm:inline" style={{ color: t.text }}>
            TrueFlow
          </span>
          <span className="text-sm truncate" style={{ color: t.textDim }}>{orgName}</span>
        </div>

        {/* Global cross-app search — identical on every page */}
        <GlobalSearch ref={searchRef} />

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Light/dark toggle pill — before Export CSV, matching the approved concept order */}
          <div className="flex gap-1 p-1 rounded-xl border" style={{ borderColor: t.border }}>
            <button
              onClick={() => setDark(true)}
              aria-label="Dark mode"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={dark ? { background: 'rgba(108,99,255,0.22)', color: BRAND.violet } : { color: t.textDim }}
            >
              <Moon size={15} />
            </button>
            <button
              onClick={() => setDark(false)}
              aria-label="Light mode"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={!dark ? { background: 'rgba(108,99,255,0.10)', color: BRAND.violet } : { color: t.textDim }}
            >
              <Sun size={15} />
            </button>
          </div>

          {/* Export dropdown — Quick Export (page-contextual, same
              convention as the old single button) + Export All My Data
              (new, account-wide, generated as a ZIP and delivered via the
              notification bell). */}
          <div className="relative hidden sm:block" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen(v => !v)}
              className="flex items-center gap-2 h-10 px-3.5 rounded-xl border text-sm font-medium"
              style={{ borderColor: t.border, color: t.text }}
            >
              <Download size={14} /> Export <ChevronDown size={13} />
            </button>

            {exportMenuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-64 rounded-xl py-1 z-50 border"
                style={{ background: t.surface, borderColor: t.border, boxShadow: '0 8px 24px rgba(10,10,15,0.16)' }}
              >
                <button
                  onClick={() => { setExportMenuOpen(false); runExport() }}
                  disabled={!exportEnabled}
                  title={exportEnabled ? 'Export this page as CSV' : 'Nothing to export here yet'}
                  className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download size={15} className="mt-0.5 shrink-0" style={{ color: t.textDim }} />
                  <span>
                    <span className="block text-sm font-medium" style={{ color: t.text }}>Quick Export</span>
                    <span className="block text-xs" style={{ color: t.textDim }}>
                      {exportEnabled ? 'This page\'s data as one CSV, instantly' : 'Nothing to export on this page'}
                    </span>
                  </span>
                </button>
                <div className="my-1 border-t" style={{ borderColor: t.border }} />
                <button
                  onClick={exportAllData}
                  disabled={exportingAll}
                  className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left disabled:opacity-60"
                >
                  {exportingAll
                    ? <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin" style={{ color: t.textDim }} />
                    : <FileArchive size={15} className="mt-0.5 shrink-0" style={{ color: t.textDim }} />}
                  <span>
                    <span className="block text-sm font-medium" style={{ color: t.text }}>Export All My Data</span>
                    <span className="block text-xs" style={{ color: t.textDim }}>
                      Every CSV — transactions, clients, invoices, reminders, account info
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>

          <span
            className="hidden sm:inline text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(108,99,255,0.10)', color: BRAND.violet }}
          >
            {planLabel}
          </span>

          {userId && <NotificationBell recipientType="user" recipientId={userId} historyHref="/notifications" />}

          {/* User avatar + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white"
              aria-label="User menu"
              style={{ background: BRAND.mint }}
            >
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : initials
              }
            </button>

            {dropdownOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-44 rounded-xl py-1 z-50 border"
                style={{ background: t.surface, borderColor: t.border, boxShadow: '0 8px 24px rgba(10,10,15,0.16)' }}
              >
                <Link
                  href="/settings/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm"
                  style={{ color: t.text }}
                >
                  <User size={15} style={{ color: t.textDim }} /> Profile
                </Link>
                <Link
                  href="/settings/business"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm"
                  style={{ color: t.text }}
                >
                  <Settings size={15} style={{ color: t.textDim }} /> Settings
                </Link>
                <div className="my-1 border-t" style={{ borderColor: t.border }} />
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm"
                  style={{ color: BRAND.red }}
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        <AppSidebar plan={plan} mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
        <main className="tf-legacy flex-1 min-w-0 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
