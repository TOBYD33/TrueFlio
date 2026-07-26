// api/whatsapp/chat/route.ts
// Processes a message sent from the web WhatsApp panel through Claude AI.
// Saves both user message and bot reply to whatsapp_conversations so they
// appear in real-time on the web panel AND in WhatsApp chat history.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are TrueFlow, a friendly and honest WhatsApp financial assistant for small
business owners. You track both money going OUT (expenses) and money coming IN (client payments).

YOUR PERSONALITY:
- Warm and conversational — like a smart friend who happens to be an accountant
- Honest — if they are overspending, say so clearly but kindly
- Concise — keep replies short and clear
- Use *bold* for numbers and key points
- Use • for bullet points, never dashes
- Never say "I cannot" — always find a helpful way to respond

WHAT YOU CAN DO:
• Track expense receipts
• Log client payments
• Set budgets and reminders
• Answer financial questions
• Show spending summaries`

export async function POST(req: NextRequest) {
  try {
    const { message, phoneNumber } = await req.json() as { message: string; phoneNumber: string }
    if (!message?.trim() || !phoneNumber) {
      return NextResponse.json({ error: 'Message and phone number are required.' }, { status: 400 })
    }

    // Verify user is authenticated
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const admin = getAdmin()

    // Load org context
    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    // Load last 20 messages for context
    const { data: history } = await admin
      .from('whatsapp_conversations')
      .select('role, content')
      .eq('phone_number', phoneNumber)
      .order('created_at', { ascending: false })
      .limit(20)

    const messages = (history ?? []).reverse().map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // Load spending context if org exists
    let contextNote = ''
    if (member?.org_id) {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const { data: receipts } = await admin
        .from('receipts')
        .select('amount, category')
        .eq('org_id', member.org_id)
        .gte('date', monthStart.split('T')[0])

      if (receipts && receipts.length > 0) {
        const total = receipts.reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0)
        contextNote = `\n[This month's spending: ₦${total.toLocaleString()} across ${receipts.length} receipts]`
      }
    }

    // Save user message to DB
    await admin.from('whatsapp_conversations').insert({
      phone_number: phoneNumber,
      role: 'user',
      content: message,
    })

    // Call Claude
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT + contextNote,
      messages: [...messages, { role: 'user', content: message }],
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : 'Sorry, I could not process that.'

    // Save bot reply to DB
    await admin.from('whatsapp_conversations').insert({
      phone_number: phoneNumber,
      role: 'assistant',
      content: reply,
    })

    // Update whatsapp_sessions last_active_at
    await admin
      .from('whatsapp_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('phone_number', phoneNumber)

    // Feed the Inactivity Re-Engagement / Daily Brief activity tracker.
    // Resetting reengagement_stage here (not a separate detection step) is
    // what implements "becoming active resets the cycle back to the start."
    await admin.from('profiles').update({
      last_active_at: new Date().toISOString(),
      reengagement_stage: 0,
      reengagement_stage_at: null,
    }).eq('id', user.id)

    return NextResponse.json({ success: true, reply })
  } catch (err) {
    console.error('whatsapp/chat: error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
