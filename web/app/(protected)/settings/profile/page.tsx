'use client'
// settings/profile/page.tsx
// Update full name, phone, avatar, and send password reset email.
// Avatar upload resizes to max 400×400px on the client before uploading
// so phone camera photos (3-8MB) stay well under 200KB in Supabase Storage.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Profile } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ImageUpload } from '@/components/ImageUpload'
import { LinkWhatsAppCard } from '@/components/shared/LinkWhatsAppCard'
import { toast } from 'sonner'

export default function ProfileSettingsPage() {
  const supabase = createClient()
  const { userId, isImpersonating } = useViewingContext()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)

  useEffect(() => {
    if (!userId) return
    async function load() {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (data) setProfile(data as Profile)
      // Only set email from real auth session (not impersonated user)
      if (!isImpersonating) {
        const { data: { user } } = await supabase.auth.getUser()
        setEmail(user?.email ?? '')
      }
    }
    load()
  }, [userId])

  async function handleAvatarUpload(resizedFile: File) {
    if (!profile) return
    setUploading(true)
    const path = `avatars/${profile.id}/avatar.jpg`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, resizedFile, { upsert: true, contentType: 'image/jpeg' })

    if (uploadError) {
      toast.error('Avatar upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id)
    setUploading(false)
    if (error) { toast.error(error.message); return }
    setProfile(p => p ? { ...p, avatar_url: publicUrl } : p)
    // Notify AppShell to refresh its avatar without a page reload
    window.dispatchEvent(new CustomEvent('trueflow:avatar-updated', { detail: { url: publicUrl } }))
    toast.success('Avatar updated')
  }

  async function saveProfile() {
    if (!profile) return
    setSaving(true)
    // .select().single() is required here, not cosmetic — a plain
    // .update().eq() call reports success with zero rows changed if RLS
    // silently excludes the row (stale id, permission mismatch, etc), so
    // the toast would say "updated" while nothing was actually written.
    // Only trust the toast to what the DB actually confirms back.
    const { data, error } = await supabase.from('profiles').update({
      full_name: profile.full_name,
      phone: profile.phone,
    }).eq('id', profile.id).select().single()
    setSaving(false)
    if (error) toast.error(error.message)
    else if (!data) toast.error('Nothing was saved — please refresh and try again.')
    else toast.success('Profile updated')
  }

  async function toggleReengagement(enabled: boolean) {
    if (!profile) return
    setProfile(p => p ? { ...p, reengagement_enabled: enabled } : p)
    const { error } = await supabase.from('profiles').update({ reengagement_enabled: enabled }).eq('id', profile.id)
    if (error) toast.error(error.message)
  }

  async function toggleDailyBrief(enabled: boolean) {
    if (!profile) return
    setProfile(p => p ? { ...p, daily_brief_enabled: enabled } : p)
    const { error } = await supabase.from('profiles').update({ daily_brief_enabled: enabled }).eq('id', profile.id)
    if (error) toast.error(error.message)
  }

  async function sendPasswordReset() {
    if (!email) return
    setSendingReset(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })
    setSendingReset(false)
    if (error) toast.error(error.message)
    else toast.success('Password reset email sent')
  }

  return (
    <div className="space-y-5">
      {/* Avatar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <ImageUpload
              currentUrl={profile?.avatar_url}
              fallbackText={profile?.full_name ?? email ?? '?'}
              shape="circle"
              maxSizePx={400}
              uploading={uploading}
              onUpload={(resizedFile) => handleAvatarUpload(resizedFile)}
            />
            <div>
              <p className="font-semibold text-gray-900">{profile?.full_name ?? 'Your name'}</p>
              <p className="text-sm text-gray-500">{email}</p>
              <p className="text-xs text-gray-400 mt-1">Click the camera icon to change your photo</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Name + Phone + Email */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Full name</label>
            <Input
              className="mt-1"
              placeholder="Your full name"
              value={profile?.full_name ?? ''}
              onChange={e => setProfile(p => p ? { ...p, full_name: e.target.value } : p)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Phone number</label>
            <Input
              className="mt-1"
              placeholder="+234 800 000 0000"
              value={profile?.phone ?? ''}
              onChange={e => setProfile(p => p ? { ...p, phone: e.target.value } : p)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Email address</label>
            <Input className="mt-1 bg-gray-50" value={email} disabled />
            <p className="text-xs text-gray-400 mt-1">To change your email, contact support.</p>
          </div>
          <Button className="bg-[#6C63FF] hover:bg-[#5A52E0]" onClick={saveProfile} disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </Button>
        </CardContent>
      </Card>

      {/* Optional WhatsApp link — only for web-first users with no phone on file */}
      {profile && !profile.phone && !isImpersonating && (
        <LinkWhatsAppCard
          onLinked={() => {
            // Re-load the (possibly merged) profile
            supabase.from('profiles').select('*').eq('id', profile.id).single()
              .then(({ data }) => { if (data) setProfile(data as Profile) })
          }}
        />
      )}

      {/* Notification preferences — independent toggles. Neither affects
          real transactional notifications (reminders firing, invoice
          confirmations), which always send regardless. */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-medium text-gray-900">Notifications</h3>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={profile?.reengagement_enabled ?? true}
              onChange={e => toggleReengagement(e.target.checked)}
            />
            <span>
              <span className="text-sm text-gray-900 block">Re-engagement nudges</span>
              <span className="text-xs text-gray-500">A gentle check-in if you've gone quiet for a while, with anything real that's waiting for you.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={profile?.daily_brief_enabled ?? true}
              onChange={e => toggleDailyBrief(e.target.checked)}
            />
            <span>
              <span className="text-sm text-gray-900 block">Daily Brief</span>
              <span className="text-xs text-gray-500">A short daily snapshot of today's reminders, invoices, and tax status.</span>
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-medium text-gray-900 mb-1">Change password</h3>
          <p className="text-sm text-gray-500 mb-4">
            We&apos;ll send a password reset link to <strong>{email}</strong>
          </p>
          <Button variant="outline" onClick={sendPasswordReset} disabled={sendingReset}>
            {sendingReset ? 'Sending…' : 'Send Password Reset Email'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
