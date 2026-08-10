// api/tello/welcome/route.ts
// Pre-generates Tello's opening welcome message during the login redirect,
// before the dashboard renders. Returns a ready-to-play string stored in
// session state on the client — never in Supabase.
// For first-time users: fixed intro script.
// For returning users: personalised message built from real Supabase data.
// Never returns an error state — always falls back to a safe default.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const FIRST_TIME_MESSAGE =
  `Hi there! I'm Tello, your TrueFlow AI assistant. 👋\n\nI'm here to help you track your money, manage your clients, and stay on top of your finances — all just by chatting with me.\n\nHere's what we can do together:\n\n📷 Scan receipts — upload any receipt photo and I'll read it\n💰 Track client payments — forward payment proof and I'll log it\n📊 Set budgets — tell me how much to allocate per category\n⏰ Set reminders — I'll nudge you before bills and deadlines\n🗂️ Manage clients — create folders, track projects and income\n\nWant to start with something specific, or should I walk you through it step by step?`

const FALLBACK_MESSAGE = `Welcome back! What can I help you with today?`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { userId, orgId, isFirstTime } = body as {
      userId?: string
      orgId?: string
      isFirstTime?: boolean
    }

    if (isFirstTime) {
      return NextResponse.json({ message: FIRST_TIME_MESSAGE, isFirstTime: true })
    }

    if (!userId || !orgId) {
      return NextResponse.json({ message: FALLBACK_MESSAGE, isFirstTime: false })
    }

    const admin = getAdmin()

    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [profileRes, unreviewedRes, outstandingRes, remindersRes] = await Promise.all([
      admin.from('profiles').select('full_name').eq('id', userId).single(),
      admin.from('receipts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('is_verified', false)
        .gte('created_at', sevenDaysAgo),
      admin.from('clients')
        .select('name, outstanding_balance')
        .eq('org_id', orgId)
        .gt('outstanding_balance', 0)
        .order('outstanding_balance', { ascending: false })
        .limit(1),
      admin.from('reminders')
        .select('title, due_date')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .is('archived_at', null)
        .gte('due_date', new Date().toISOString().split('T')[0])
        .lte('due_date', threeDaysFromNow)
        .order('due_date', { ascending: true })
        .limit(1),
    ])

    const firstName = profileRes.data?.full_name?.split(' ')[0] || 'there'
    const urgentPoints: string[] = []

    const unreviewedCount = unreviewedRes.count ?? 0
    if (unreviewedCount >= 3) {
      urgentPoints.push(`You have ${unreviewedCount} unreviewed receipts from this week.`)
    }

    const topClient = outstandingRes.data?.[0]
    if (topClient) {
      urgentPoints.push(
        `${topClient.name} still owes you ₦${Number(topClient.outstanding_balance).toLocaleString()}.`
      )
    }

    const nextReminder = remindersRes.data?.[0]
    if (nextReminder && urgentPoints.length < 2) {
      urgentPoints.push(`Reminder: "${nextReminder.title}" is due ${nextReminder.due_date}.`)
    }

    const dataLine = urgentPoints.length > 0
      ? '\n\n' + urgentPoints.slice(0, 2).join(' ')
      : '\n\nEverything looks on track this week.'

    const message = `Welcome back, ${firstName}! 👋${dataLine}\n\nWant me to pull up your full summary, or is there something specific on your mind?`

    return NextResponse.json({ message, isFirstTime: false })
  } catch (err) {
    console.error('tello/welcome failed:', err)
    return NextResponse.json({ message: FALLBACK_MESSAGE, isFirstTime: false })
  }
}
