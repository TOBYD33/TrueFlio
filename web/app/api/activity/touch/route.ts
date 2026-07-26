// api/activity/touch/route.ts
// Records a meaningful dashboard action for the Inactivity Re-Engagement /
// Daily Brief activity tracker (see lib/activity.ts for the client-side
// helper that calls this). Deliberately NOT called on every page load —
// only from actions that represent real engagement (viewing an invoice,
// saving a client, logging a transaction), per the feature spec's
// distinction between "loaded a page" and "did something."

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resetting reengagement_stage here (not a separate detection step) is
  // what implements "becoming active resets the cycle back to the start."
  await supabase.from('profiles').update({
    last_active_at: new Date().toISOString(),
    reengagement_stage: 0,
    reengagement_stage_at: null,
  }).eq('id', user.id)
  return NextResponse.json({ ok: true })
}
