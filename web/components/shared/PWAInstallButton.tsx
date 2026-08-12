'use client'
// components/shared/PWAInstallButton.tsx
// Header "Install App" button — Chromium browsers get the native
// beforeinstallprompt flow; iOS Safari has no such API, so it gets a
// small dismissible instructions popover instead of a button that does
// nothing. Hides itself entirely once already running standalone
// (installed), and doesn't render at all on browsers with no actionable
// install path (e.g. desktop Firefox) rather than showing a dead button.

import { useEffect, useState, useRef } from 'react'
import { Download, X } from 'lucide-react'
import { useTheme, tone, BRAND } from './theme'
import { subscribeToPush } from '@/lib/push-client'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneNow(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
}

function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !(window as any).MSStream
}

export function PWAInstallButton({ recipientId }: { recipientId: string | null }) {
  const { dark } = useTheme()
  const t = tone(dark)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setStandalone(isStandaloneNow())
    setIsIOS(isIOSDevice())

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setStandalone(true)
      setDeferredPrompt(null)
      // Requirement 4's "sensible moment" — right after a successful
      // install, not on ordinary page load.
      if (recipientId) subscribeToPush('user', recipientId)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [recipientId])

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setShowIOSInstructions(false)
    }
    if (showIOSInstructions) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [showIOSInstructions])

  async function handleClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
      // Consumed either way — Chromium won't refire beforeinstallprompt
      // again until conditions change, so this naturally never nags.
      setDeferredPrompt(null)
      return
    }
    if (isIOS) setShowIOSInstructions(v => !v)
  }

  if (standalone) return null
  if (!deferredPrompt && !isIOS) return null // no actionable install path on this browser

  return (
    <div className="relative hidden sm:block" ref={popoverRef}>
      <button
        onClick={handleClick}
        className="flex items-center gap-2 h-10 px-3.5 rounded-xl border text-sm font-medium"
        style={{ borderColor: t.border, color: t.text }}
      >
        <Download size={14} /> Install App
      </button>

      {showIOSInstructions && (
        <div
          className="absolute right-0 top-full mt-2 w-72 rounded-xl p-4 z-50 border"
          style={{ background: t.surface, borderColor: t.border, boxShadow: '0 8px 24px rgba(10,10,15,0.16)' }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-sm font-semibold" style={{ color: t.text }}>Add TrueFlow to your Home Screen</p>
            <button onClick={() => setShowIOSInstructions(false)} aria-label="Dismiss">
              <X size={15} style={{ color: t.textDim }} />
            </button>
          </div>
          <p className="text-sm" style={{ color: t.textMid }}>
            Tap the <strong style={{ color: BRAND.violet }}>Share</strong> icon in Safari's toolbar, then
            select <strong style={{ color: BRAND.violet }}>Add to Home Screen</strong>.
          </p>
        </div>
      )}
    </div>
  )
}
