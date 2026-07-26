// api/tello/unread/route.ts
// Returns any unread proactive Tello messages (Inactivity Re-Engagement /
// Daily Brief nudges inserted directly into whatsapp_conversations by the
// bot) for the current user's in-app chat thread — GET to check/show the
// unread indicator, POST to mark them read once the user opens the bubble.

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getAdmin()
  const { data } = await admin
    .from('whatsapp_conversations')
    .select('id, content, created_at')
    .eq('phone_number', `web:${user.id}`)
    .eq('is_proactive', true)
    .is('read_at', null)
    .order('created_at', { ascending: true })

  return NextResponse.json({ messages: data ?? [] })
}

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getAdmin()
  await admin
    .from('whatsapp_conversations')
    .update({ read_at: new Date().toISOString() })
    .eq('phone_number', `web:${user.id}`)
    .eq('is_proactive', true)
    .is('read_at', null)

  return NextResponse.json({ ok: true })
}
