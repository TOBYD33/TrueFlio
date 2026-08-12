// web-push-service.ts
// Bot-side mirror of web/lib/web-push.ts — bot/web share no package, same
// precedent as notifications.ts and plan-gates.ts. Uses the SAME VAPID
// key pair as the web app (subscriptions are created client-side against
// that public key, so the private key that signs pushes must match
// regardless of which runtime is doing the sending).

import webpush from 'web-push'
import { supabase } from './supabase'

let configured = false
function ensureConfigured() {
  if (configured) return
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return // not configured — sends below become no-ops
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
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

  const { data: profile } = await supabase.from('profiles').select('push_notifications_enabled').eq('id', params.recipientId).maybeSingle()
  if (profile?.push_notifications_enabled === false) return

  const { data: subs } = await supabase
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
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        console.error('sendPushToRecipient: send failed for subscription', sub.id, err)
      }
    }
  }))
}
