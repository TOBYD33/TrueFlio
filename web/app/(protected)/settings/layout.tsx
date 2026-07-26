'use client'
// settings/layout.tsx
// Tab navigation wrapper for all settings sub-pages

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/business', label: 'Business' },
  { href: '/settings/subscription', label: 'Subscription' },
  { href: '/settings/accountant', label: 'Accountant Access' },
  { href: '/settings/team', label: 'Team' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    // No max-width here — it used to be max-w-2xl on this shared wrapper,
    // which is right for the narrow form pages (Profile/Business/
    // Accountant/Team, which now set their own max-w-2xl individually)
    // but was also squeezing the Subscription page's 4-card grid into a
    // ~672px column regardless of actual viewport width, leaving a large
    // dead-space block on the right at any wider screen.
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and business</p>
      </div>
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'pb-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                pathname === tab.href
                  ? 'border-emerald-500 text-[#00A88A]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  )
}
