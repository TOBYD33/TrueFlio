'use client'
// settings/accountant/page.tsx
// Generate and manage read-only share links for accountants

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Copy, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface ShareLink {
  id: string
  token: string
  permission: 'read' | 'export'
  expires_at: string | null
  created_at: string
}

export default function AccountantAccessPage() {
  const supabase = createClient()
  const { orgId } = useViewingContext()
  const [links, setLinks] = useState<ShareLink[]>([])
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const res = await fetch('/api/share-link')
      const json = await res.json()
      setLinks((json.links as ShareLink[]) ?? [])
    }
    load()
  }, [orgId])

  async function generateLink() {
    setGenerating(true)
    const res = await fetch('/api/share-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permission: 'read' }) })
    const json = await res.json()
    setGenerating(false)
    if (!res.ok || !json.link) { toast.error(json.error ?? 'Could not generate link'); return }
    setLinks(prev => [json.link as ShareLink, ...prev])
    toast.success('Share link generated — expires in 30 days')
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/accountant/${token}`)
    toast.success('Link copied to clipboard')
  }

  async function revokeLink(id: string) {
    setRevoking(id)
    const res = await fetch(`/api/share-link?id=${id}`, { method: 'DELETE' })
    setRevoking(null)
    if (!res.ok) { toast.error('Could not revoke link'); return }
    setLinks(prev => prev.filter(l => l.id !== id))
    toast.success('Link revoked')
  }

  function isExpired(expiresAt: string | null) {
    return expiresAt ? new Date(expiresAt) < new Date() : false
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.gettrueflow.com'

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h3 className="font-medium text-gray-900">Share links</h3>
            <p className="text-sm text-gray-500 mt-1">
              Give your accountant read-only access to your financial data. No login required. Links expire after 30 days.
            </p>
          </div>

          <Button
            className="bg-[#6C63FF] hover:bg-[#5A52E0] gap-2"
            onClick={generateLink}
            disabled={generating}
          >
            <RefreshCw size={15} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Generating…' : 'Generate New Link'}
          </Button>

          {links.length === 0 && (
            <p className="text-sm text-gray-400 py-2">No share links yet. Generate one above.</p>
          )}

          {links.length > 0 && (
            <div className="space-y-3 pt-1">
              {links.map(link => {
                const expired = isExpired(link.expires_at)
                const url = `${origin}/accountant/${link.token}`
                return (
                  <div
                    key={link.id}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 border ${
                      expired ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-[#00D4AA]/5 border-[#00D4AA]/30'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-700 truncate">{url}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {expired
                          ? 'Expired'
                          : `Expires ${link.expires_at ? formatDate(link.expires_at) : 'never'}`
                        }
                        {' · '}{link.permission === 'read' ? 'Read only' : 'Read + Export'}
                      </p>
                    </div>
                    {!expired && (
                      <>
                        <button
                          onClick={() => copyLink(link.token)}
                          className="text-gray-400 hover:text-[#00A88A] transition-colors p-1"
                          title="Copy link"
                        >
                          <Copy size={15} />
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-400 hover:text-[#00A88A] transition-colors p-1"
                          title="Open link"
                        >
                          <ExternalLink size={15} />
                        </a>
                      </>
                    )}
                    <button
                      onClick={() => revokeLink(link.id)}
                      disabled={revoking === link.id}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1 disabled:opacity-50"
                      title="Revoke link"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="font-medium text-gray-900 mb-3">How it works</h3>
          <ol className="space-y-2 text-sm text-gray-500 list-decimal list-inside">
            <li>Click &quot;Generate New Link&quot; above</li>
            <li>Copy the link and send it to your accountant or auditor</li>
            <li>They open it in any browser — no TrueFlow account needed</li>
            <li>They can view all your receipts, reports, and financial summaries</li>
            <li>The link automatically expires after 30 days</li>
            <li>Revoke it at any time by clicking the trash icon</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
