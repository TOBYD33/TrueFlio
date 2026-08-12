// lib/web-push.ts
// Server-side Web Push sender — the new delivery channel wired into the
// EXISTING notification system (lib/notifications.ts calls this from
// notifyUser/notifyOrgMembers/notifyAdmins, so every existing notification
// source automatically gains push delivery with no per-caller changes).
// Bot has its own mirror (bot/src/web-push-service.ts) since bot/web share
// no package — same precedent as notifications.ts itself.

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

let configured = false
function ensureConfigured() {
  if (configured) return
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return // not configured — sends below become no-ops
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function sendPushToRecipient(params: {
  recipientType: 'user' | 'admin'
  recipientId: string
  title: string
  body: string
  link?: string | null
}): Promise<void> {
  ensureConfigured()
  if (!configured) return

  const admin = getAdmin()

  // Same opt-out column as the in-app desktop toggle's precedent
  // (desktop_notifications_enabled) — profiles.push_notifications_enabled.
  const { data: profile } = await admin.from('profiles').select('push_notifications_enabled').eq('id', params.recipientId).maybeSingle()
  if (profile?.push_notifications_enabled === false) return

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('recipient_type', params.recipientType)
    .eq('recipient_id', params.recipientId)

  if (!subs || subs.length === 0) return

  const payload = JSON.stringify({ title: params.title, body: params.body, link: params.link ?? '/home' })

  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    } catch (err: any) {
      // 404/410 = the browser/OS has permanently invalidated this
      // subscription (uninstalled, permission revoked, etc.) — clean it up
      // rather than retrying it forever on every future notification.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        console.error('sendPushToRecipient: send failed for subscription', sub.id, err)
      }
    }
  }))
}
