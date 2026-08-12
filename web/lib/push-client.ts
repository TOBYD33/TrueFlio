'use client'
// lib/push-client.ts
// Browser-side Web Push helpers — service worker registration and
// subscribe/unsubscribe. Writes push_subscriptions directly via the
// authenticated Supabase browser client rather than a dedicated API route:
// RLS already scopes every row to `recipient_id = auth.uid()` (see
// bot/sql/step20-web-push.sql), so there's nothing a server route would
// add here that the client can't already do safely on its own.

import { createClient } from './supabase-browser'

export async function registerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/sw.js')
  } catch (err) {
    console.error('registerServiceWorker failed:', err)
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

// Requests permission (if not already decided) and stores the resulting
// subscription for this recipient. Called at a deliberate moment — right
// after a successful install (see PWAInstallButton's `appinstalled`
// listener) — never on page load.
export async function subscribeToPush(recipientType: 'user' | 'admin', recipientId: string): Promise<boolean> {
  if (!isPushSupported()) return false
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    console.warn('subscribeToPush: NEXT_PUBLIC_VAPID_PUBLIC_KEY not configured')
    return false
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
      })
    }

    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

    const supabase = createClient()
    const { error } = await supabase.from('push_subscriptions').upsert({
      recipient_type: recipientType,
      recipient_id: recipientId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }, { onConflict: 'endpoint' })

    return !error
  } catch (err) {
    console.error('subscribeToPush failed:', err)
    return false
  }
}
