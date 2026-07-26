'use client'
// ImpersonationBanner.tsx
// Fixed banner shown on every page during an active admin impersonation
// session. Cannot be dismissed — only removed by clicking Exit
// impersonation. Read-only by default; a Super Admin can elevate to write
// access with an explicit confirmation stating what that means.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  userName: string
  sessionId: string
  isWriteEnabled: boolean
  canElevate: boolean
}

export function ImpersonationBanner({ userName, sessionId, isWriteEnabled, canElevate }: Props) {
  const router = useRouter()
  const [enabling, setEnabling] = useState(false)

  async function endSession() {
    await fetch('/api/admin/impersonation/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    window.location.href = '/admin/users'
  }

  async function enableWrite() {
    const confirmed = window.confirm(
      `Enable write access while viewing as ${userName}?\n\n` +
      `Any changes you make from this point on will be saved to their real account data, ` +
      `not just previewed. This is logged to the admin audit trail.`
    )
    if (!confirmed) return

    setEnabling(true)
    const res = await fetch('/api/admin/impersonation/enable-write', { method: 'POST' })
    setEnabling(false)
    if (res.ok) {
      router.refresh()
    } else {
      const json = await res.json().catch(() => ({}))
      alert(json.error ?? 'Could not enable write access.')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: isWriteEnabled ? '#FF6B6B' : '#EF9F27',
        color: '#0A0A0F',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '13px',
        fontWeight: 500,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        gap: '16px',
        flexWrap: 'wrap',
      }}
    >
      <span>
        👁 Viewing as <strong>{userName}</strong> · Your actions here are logged ·{' '}
        {isWriteEnabled ? (
          <strong>Write access enabled — changes are real</strong>
        ) : (
          'Read-only mode active'
        )}
      </span>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        {!isWriteEnabled && canElevate && (
          <button
            onClick={enableWrite}
            disabled={enabling}
            style={{
              background: 'transparent',
              color: '#0A0A0F',
              border: '1.5px solid #0A0A0F',
              borderRadius: '6px',
              padding: '6px 16px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {enabling ? 'Enabling…' : 'Enable write access'}
          </button>
        )}
        <button
          onClick={endSession}
          style={{
            background: '#0A0A0F',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 16px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          Exit impersonation
        </button>
      </div>
    </div>
  )
}
