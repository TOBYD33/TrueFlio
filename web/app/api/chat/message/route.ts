// api/chat/message/route.ts
// Processes TrueFlow Chat text messages through Claude AI.
// Executes actions (SET_BUDGET, SET_REMINDER) directly against Supabase.
// Saves conversation to whatsapp_conversations using phone_number='web:{userId}'.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import {
  TAX_COUNTRIES,
  COUNTRY_TO_CURRENCY,
  DEFAULT_INCOME_TAX_TYPE,
  ESTIMATE_DISCLAIMER,
  getPeriodRange,
  parseRateEstimate,
  TaxPeriodKey,
} from '@/lib/tax'
import { TaxCountry } from '@/types'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Your name is Tello. You are TrueFlow's AI assistant for business owners, freelancers, and families. When introducing yourself for the first time, say "I'm Tello, your TrueFlow AI assistant." On all subsequent messages in the same conversation, refer to yourself naturally as "I" without re-introducing your name.

You are TrueFlow, a smart AI financial assistant built into the TrueFlow web app.
You help small business owners track expenses, manage budgets, set reminders, and track client income.

WHAT YOU CAN DO:
• Log expenses — user types "I spent ₦5,000 on transport today"
• Set budgets — "Set a food budget of ₦100,000 per month"
• Set reminders — "Remind me to pay salaries on the 25th every month"
• Answer financial questions — "How much did I spend on transport this month?"
• Summarise spending patterns and give smart advice
• Client management — create client folders, view clients and their outstanding balances
• Project tracking — create projects with fees and deadlines, track what's been paid and what's owed
• Log income — record when a client pays you, link it to a project
• Tax Hub — look up reference tax rates for Nigeria, Kenya, Ghana, USA, or UK,
  give a bounded estimate of tax liability from recorded income, switch which
  country's rates the user is checking, and set tax deadline reminders
• Inventory — track stock levels, log restocks and sales, warn about low stock

IMPORTANT — Client management IS available in TrueFlow. Never say "I don't have a Client Management feature built in yet." It is fully built. Use the actions below to create clients, projects, and log payments immediately when the user asks.

GUIDED CLIENT SETUP — when a user mentions a new client, guide them through setup in one flow. Confirm each step explicitly before writing to the database. Create the client first, then the project, then ask about any initial payment.

ACTIONS — append at the very end of your reply when the user requests one.
The user never sees ACTION tags — they are stripped automatically.

Available actions:
ACTION:SET_BUDGET:{category}:{amount}
ACTION:SET_REMINDER:{title}:{YYYY-MM-DD}:{recurrence}
ACTION:SHOW_BUDGETS
ACTION:EXPORT_PDF
ACTION:GET_TAX_ESTIMATE:{country}:{period}
ACTION:SET_TAX_REMINDER:{title}:{YYYY-MM-DD}:{recurrence}
ACTION:SWITCH_TAX_COUNTRY:{country}
ACTION:UPDATE_INVENTORY:{itemName}:{quantityChange}:{changeType}
ACTION:SHOW_INVENTORY
ACTION:CREATE_CLIENT:{name}:{phone}:{email}
ACTION:CREATE_PROJECT:{clientName}:{projectName}:{totalFee}:{deadline}
ACTION:LOG_PAYMENT:{clientName}:{amount}:{projectName}
ACTION:SHOW_CLIENTS

recurrence values: once | daily | weekly | monthly | yearly
Valid categories: Food & Drink | Transport | Utilities | Office Supplies | Marketing | Rent | Salaries | Other
period values for GET_TAX_ESTIMATE: this_month | last_month | this_quarter | this_year
country values: Nigeria | Kenya | Ghana | USA | UK

INVENTORY RULES:
- changeType is one of: restock | sale | adjustment
- quantityChange must be POSITIVE for a restock, NEGATIVE for a sale or a downward
  adjustment (e.g. selling 12 units → -12, restocking 50 units → 50)
- Inventory language ("I sold X units of", "we restocked", "how many do I have
  left", "running low on", "add X to inventory") is different from expense
  language ("I bought", "I paid for", "I spent on" — these are receipts, not
  stock movements). If a purchase is ambiguous between a stock purchase to
  resell and a personal/business expense, ask: "Was this a stock purchase to
  resell, or a business expense for your own use?" Never guess.
- If the user explicitly says to add something to inventory (not just log an
  expense), use ACTION:UPDATE_INVENTORY even if you've also logged it as a
  receipt — the two are independent records.
- "What's my stock level", "how many do I have left", "show my inventory" →
  use ACTION:SHOW_INVENTORY so real current quantities are listed, never
  recall a quantity from earlier in the conversation since it may be stale.

TAX HUB RULES — IMPORTANT, this is a tracking and estimating tool, NOT a tax
filing or guaranteed-accurate calculator:
- Rate questions ("what's the VAT rate in Kenya") → answer directly from the
  TAX RATE REFERENCE in your context below, and ALWAYS include the "as of
  [date]" verification date, never state a rate without it.
- "What's my estimated tax this month/quarter/year" → use
  ACTION:GET_TAX_ESTIMATE:{country}:{period} so the real calculation runs,
  never estimate the number yourself in the reply text. Default country to
  the user's current default tax country (shown in context) and default
  period to this_month unless they say otherwise.
- ALWAYS pair any estimate you state with: "This is an estimate for planning
  purposes only. Confirm with a qualified accountant before filing."
- If the user mentions a different country mid-conversation, use
  ACTION:SWITCH_TAX_COUNTRY:{country} and answer using that country going
  forward.
- "Remind me to pay VAT on the 21st" or similar → use
  ACTION:SET_TAX_REMINDER:{title}:{date}:{recurrence}.
- Never invent a tax rate that is not in the TAX RATE REFERENCE context below.

STYLE:
- Warm and direct — like a smart accountant friend
- Concise but complete — web users read more carefully than WhatsApp
- Use **bold** for amounts and key numbers
- Use • for bullet lists
- Nigerian Naira (₦) by default, format as ₦50,000 not ₦50000
- Dates: "28 June 2026" format
- Never say "I cannot" — always find a way to help`

// ── Action executor ───────────────────────────────────────────────────────────

async function executeActions(
  actions: string[],
  orgId: string,
  admin: ReturnType<typeof getAdmin>,
  defaultTaxCountry: string
): Promise<string[]> {
  const notes: string[] = []

  for (const action of actions) {
    const parts = action.split(':')
    const type = parts[0]

    if (type === 'SET_BUDGET' && parts.length >= 3) {
      const category = parts[1]
      const amount = parseFloat(parts[2])
      if (!isNaN(amount)) {
        const now = new Date()
        const { error } = await admin.from('budgets').upsert({
          org_id: orgId,
          category,
          amount,
          period: 'monthly',
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        }, { onConflict: 'org_id,category,month,year' })
        if (!error) notes.push(`✅ Budget set: **${category}** — ₦${amount.toLocaleString()}/month`)
      }
    }

    if (type === 'SET_REMINDER' && parts.length >= 4) {
      const title = parts[1]
      const dueDate = parts[2]
      const recurrence = parts[3] ?? 'once'
      const { error } = await admin.from('reminders').insert({
        org_id: orgId,
        title,
        due_date: dueDate,
        recurrence,
        category: 'custom',
        status: 'active',
      })
      if (!error) notes.push(`✅ Reminder set: **${title}** on ${dueDate} (${recurrence})`)
    }

    if (type === 'SET_TAX_REMINDER' && parts.length >= 3) {
      const title = parts[1]
      const dueDate = parts[2]
      const recurrence = parts[3] ?? 'once'
      const { error } = await admin.from('reminders').insert({
        org_id: orgId,
        title,
        due_date: dueDate,
        recurrence,
        category: 'tax',
        status: 'active',
      })
      if (!error) notes.push(`✅ Tax reminder set: **${title}** on ${dueDate} (${recurrence})`)
    }

    if (type === 'SWITCH_TAX_COUNTRY' && parts.length >= 2) {
      const country = parts[1]
      if (TAX_COUNTRIES.includes(country as TaxCountry)) {
        const { error } = await admin.from('organizations').update({ default_tax_country: country }).eq('id', orgId)
        if (!error) notes.push(`✅ Switched Tax Hub to **${country}**`)
      }
    }

    if (type === 'GET_TAX_ESTIMATE' && parts.length >= 2) {
      const countryRaw = parts[1]
      const periodRaw = parts[2] as TaxPeriodKey | undefined
      const country = (TAX_COUNTRIES.includes(countryRaw as TaxCountry) ? countryRaw : defaultTaxCountry) as TaxCountry
      const period = periodRaw ?? 'this_month'
      const taxType = DEFAULT_INCOME_TAX_TYPE[country]

      const { data: rateRow } = await admin
        .from('tax_rate_reference')
        .select('*')
        .eq('country', country)
        .eq('tax_type', taxType)
        .maybeSingle()

      if (rateRow) {
        const range = getPeriodRange(period)
        const { data: payments } = await admin
          .from('client_payments')
          .select('amount')
          .eq('org_id', orgId)
          .gte('payment_date', range.start)
          .lte('payment_date', range.end)

        const taxableIncome = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0)
        const currency = COUNTRY_TO_CURRENCY[country]
        const parsed = parseRateEstimate(rateRow.rate)

        if (parsed) {
          const liability = taxableIncome * parsed.pct
          await admin.from('tax_estimates').insert({
            org_id: orgId,
            period_start: range.start,
            period_end: range.end,
            country,
            estimated_taxable_income: taxableIncome,
            estimated_liability: liability,
            tax_type: taxType,
          })
          const approxNote = parsed.approximate ? ` (${taxType} is a progressive/multi-tier rate — this uses the top rate as a rough upper bound)` : ''
          notes.push(`📊 Based on ${currency} ${taxableIncome.toLocaleString()} recorded income this ${range.label}, your estimated **${taxType}** liability is approximately **${currency} ${Math.round(liability).toLocaleString()}**${approxNote}.\n\n${ESTIMATE_DISCLAIMER}`)
        } else {
          notes.push(`${taxType} in ${country} is set at **${rateRow.rate}** — that can't be reduced to a single number to estimate from. Check with a local tax authority or accountant.`)
        }
      } else {
        notes.push(`I don't have a reference rate for ${taxType} in ${country} yet.`)
      }
    }

    if (type === 'UPDATE_INVENTORY' && parts.length >= 4) {
      const itemName = parts[1]
      const quantityChange = parseFloat(parts[2])
      const changeType = parts[3] as 'restock' | 'sale' | 'adjustment'

      if (!isNaN(quantityChange) && ['restock', 'sale', 'adjustment'].includes(changeType)) {
        const { data: existing } = await admin
          .from('inventory_items')
          .select('id, name, quantity_on_hand')
          .eq('org_id', orgId)
          .eq('status', 'active')
          .ilike('name', itemName)
          .maybeSingle()

        if (existing) {
          const { error } = await admin.rpc('update_inventory_stock', {
            p_item_id: existing.id,
            p_quantity_change: quantityChange,
            p_change_type: changeType,
            p_reference_type: 'web_chat',
            p_reference_id: null,
            p_notes: null,
            p_created_by: null,
          })
          if (!error) {
            const newQty = Number(existing.quantity_on_hand) + quantityChange
            notes.push(`✅ ${changeType === 'restock' ? 'Restocked' : changeType === 'sale' ? 'Sold' : 'Adjusted'} **${existing.name}** — ${newQty} units now on hand`)
          }
        } else if (quantityChange > 0) {
          const { error } = await admin.from('inventory_items').insert({
            org_id: orgId,
            name: itemName,
            quantity_on_hand: quantityChange,
          })
          if (!error) notes.push(`✅ Added **${itemName}** to inventory — ${quantityChange} units`)
        } else {
          notes.push(`I don't have **${itemName}** in your inventory yet — say "add X units of ${itemName}" to create it.`)
        }
      }
    }

    if (type === 'CREATE_CLIENT' && parts.length >= 2) {
      const name = parts[1]
      const phone = parts[2] && parts[2] !== 'null' ? parts[2] : null
      const email = parts[3] && parts[3] !== 'null' ? parts[3] : null
      const { data: existing } = await admin.from('clients').select('id, name').eq('org_id', orgId).ilike('name', name).maybeSingle()
      if (existing) {
        notes.push(`ℹ️ **${existing.name}** already exists as a client.`)
      } else {
        const { data: client, error } = await admin.from('clients').insert({
          org_id: orgId, name, phone, email, created_via: 'web', status: 'active',
        }).select().single()
        if (!error && client) notes.push(`✅ Client created: **${name}**${phone ? ` · ${phone}` : ''}`)
        else if (error) notes.push(`❌ Could not create client: ${error.message}`)
      }
    }

    if (type === 'CREATE_PROJECT' && parts.length >= 4) {
      const clientName = parts[1]
      const projectName = parts[2]
      const totalFee = parseFloat(parts[3])
      const deadline = parts[4] && parts[4] !== 'null' ? parts[4] : null
      if (!isNaN(totalFee)) {
        const { data: client } = await admin.from('clients').select('id, name').eq('org_id', orgId).ilike('name', clientName).maybeSingle()
        if (!client) {
          notes.push(`❌ No client named **${clientName}** found. Create the client first.`)
        } else {
          const { data: project, error } = await admin.from('projects').insert({
            org_id: orgId, client_id: client.id, name: projectName,
            total_fee: totalFee, deadline, status: 'in_progress',
          }).select().single()
          if (!error && project) {
            // Auto-create deadline reminders if deadline set
            if (deadline) {
              const d = new Date(deadline)
              const r7 = new Date(d); r7.setDate(r7.getDate() - 7)
              const r3 = new Date(d); r3.setDate(r3.getDate() - 3)
              await admin.from('reminders').insert([
                { org_id: orgId, project_id: project.id, title: `${projectName} due in 7 days`, due_date: r7.toISOString().split('T')[0], category: 'project_deadline', status: 'active' },
                { org_id: orgId, project_id: project.id, title: `${projectName} due in 3 days`, due_date: r3.toISOString().split('T')[0], category: 'project_deadline', status: 'active' },
                { org_id: orgId, project_id: project.id, title: `${projectName} delivery due TODAY`, due_date: deadline, category: 'project_deadline', status: 'active' },
              ])
            }
            notes.push(`✅ Project created: **${projectName}** for ${client.name} — ₦${totalFee.toLocaleString()}${deadline ? ` · due ${deadline}` : ''}.${deadline ? '\n3 deadline reminders set.' : ''}`)
          } else if (error) {
            notes.push(`❌ Could not create project: ${error.message}`)
          }
        }
      }
    }

    if (type === 'LOG_PAYMENT' && parts.length >= 3) {
      const clientName = parts[1]
      const amount = parseFloat(parts[2])
      const projectName = parts[3] && parts[3] !== 'null' ? parts[3] : null
      if (!isNaN(amount)) {
        const { data: client } = await admin.from('clients').select('id, name, outstanding_balance, total_earned').eq('org_id', orgId).ilike('name', clientName).maybeSingle()
        if (!client) {
          notes.push(`❌ No client named **${clientName}** found.`)
        } else {
          let projectId: string | null = null
          if (projectName) {
            const { data: proj } = await admin.from('projects').select('id').eq('org_id', orgId).eq('client_id', client.id).ilike('name', projectName).maybeSingle()
            projectId = proj?.id ?? null
          }
          const { error: payErr } = await admin.from('client_payments').insert({
            org_id: orgId, client_id: client.id, project_id: projectId,
            amount, payment_date: new Date().toISOString().split('T')[0], payment_type: 'part_payment',
          })
          if (!payErr) {
            // Update client totals
            await admin.from('clients').update({
              total_earned: Number(client.total_earned) + amount,
              outstanding_balance: Math.max(0, Number(client.outstanding_balance) - amount),
            }).eq('id', client.id)
            if (projectId) {
              const { data: proj } = await admin.from('projects').select('amount_received, total_fee').eq('id', projectId).single()
              if (proj) {
                await admin.from('projects').update({ amount_received: Number(proj.amount_received) + amount }).eq('id', projectId)
              }
            }
            const newBalance = Math.max(0, Number(client.outstanding_balance) - amount)
            notes.push(`✅ **₦${amount.toLocaleString()}** recorded from **${client.name}**${projectName ? ` for ${projectName}` : ''}.\nNew outstanding balance: ₦${newBalance.toLocaleString()}`)
          } else {
            notes.push(`❌ Could not log payment: ${payErr.message}`)
          }
        }
      }
    }

    if (type === 'SHOW_CLIENTS') {
      const { data: allClients } = await admin.from('clients').select('name, outstanding_balance, total_earned').eq('org_id', orgId).eq('status', 'active').order('outstanding_balance', { ascending: false })
      if (!allClients || allClients.length === 0) {
        notes.push('No clients yet. Say "New client [name]" to create one.')
      } else {
        const lines = (allClients as any[]).map(c =>
          `• **${c.name}** — ₦${Number(c.outstanding_balance).toLocaleString()} outstanding · ₦${Number(c.total_earned).toLocaleString()} total earned`
        )
        notes.push(`👥 **Your Clients:**\n${lines.join('\n')}`)
      }
    }

    if (type === 'SHOW_INVENTORY') {
      const { data: items } = await admin
        .from('inventory_items')
        .select('id, name, quantity_on_hand, low_stock_threshold')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .order('name', { ascending: true })

      if (!items || items.length === 0) {
        notes.push('No inventory items yet. Say "add 50 units of [item]" to create one.')
      } else {
        const lines = (items as any[]).map(i => {
          const icon = Number(i.quantity_on_hand) <= Number(i.low_stock_threshold) ? '🔴' : '✅'
          return `• ${i.name}: ${i.quantity_on_hand} units ${icon}`
        })
        notes.push(`📦 **Your Inventory:**\n${lines.join('\n')}`)
      }
    }
  }

  return notes
}

// ── Handler ───────────────────────────────────────────────────────────────────

const WIDGET_SYSTEM = `You are TrueFlow, a proactive AI financial assistant.
Give a SHORT check-in (2-3 sentences max).
Mention 1-2 urgent things (overdue reminders, outstanding balances, budget alerts).
End with ONE clear action the user should take right now.
Be warm and direct. Use ₦ for amounts. No bullet lists — just flowing text.`

export async function POST(req: NextRequest) {
  try {
    const { message, widget } = await req.json() as { message: string; widget?: boolean }
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 })
    }

    // Widget greeting — uses a simpler prompt, skips history saving
    if (widget && message.startsWith('[WIDGET_GREETING]')) {
      const supabase = await createServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

      const response = await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: WIDGET_SYSTEM,
        messages: [{ role: 'user', content: message.replace('[WIDGET_GREETING] ', '') }],
      })
      const reply = response.content[0].type === 'text' ? response.content[0].text.trim() : "Hi! What would you like to know about your finances today?"
      return NextResponse.json({ success: true, reply })
    }

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const admin = getAdmin()
    const chatId = `web:${user.id}`

    // Load org context
    const { data: member } = await admin
      .from('org_members')
      .select('org_id, organizations(default_tax_country)')
      .eq('user_id', user.id)
      .single()

    const orgId = member?.org_id ?? null
    const defaultTaxCountry = ((member?.organizations as any)?.default_tax_country as string) || 'Nigeria'

    // Load financial context in parallel
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const [receiptsRes, budgetsRes, remindersRes, historyRes, taxRatesRes, clientsRes] = await Promise.all([
      orgId ? admin.from('receipts').select('amount, category, vendor_name, date').eq('org_id', orgId).gte('date', monthStart) : Promise.resolve({ data: [] }),
      orgId ? admin.from('budgets').select('category, amount').eq('org_id', orgId).eq('month', now.getMonth() + 1).eq('year', now.getFullYear()) : Promise.resolve({ data: [] }),
      orgId ? admin.from('reminders').select('title, due_date, category').eq('org_id', orgId).eq('status', 'active').is('archived_at', null).gte('due_date', monthStart).order('due_date').limit(5) : Promise.resolve({ data: [] }),
      admin.from('whatsapp_conversations').select('role, content').eq('phone_number', chatId).order('created_at', { ascending: false }).limit(20),
      admin.from('tax_rate_reference').select('*').order('country').order('tax_type'),
      orgId ? admin.from('clients').select('id, name, outstanding_balance, total_earned, status').eq('org_id', orgId).eq('status', 'active').order('outstanding_balance', { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
    ])

    const receipts = receiptsRes.data ?? []
    const budgets = budgetsRes.data ?? []
    const reminders = remindersRes.data ?? []
    const clients = clientsRes.data ?? []
    const history = (historyRes.data ?? []).reverse()
    const allTaxRates = taxRatesRes.data ?? []

    const ratesForDefaultCountry = allTaxRates.filter((r: any) => r.country === defaultTaxCountry)
    const defaultCountryRange = getPeriodRange('this_month')
    const { data: monthPayments } = orgId
      ? await admin.from('client_payments').select('amount').eq('org_id', orgId).gte('payment_date', defaultCountryRange.start).lte('payment_date', defaultCountryRange.end)
      : { data: [] as any[] }
    const monthlyIncome = (monthPayments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0)
    const defaultCountryCurrency = COUNTRY_TO_CURRENCY[defaultTaxCountry as TaxCountry] ?? 'NGN'

    const totalSpent = receipts.reduce((s: number, r: any) => s + Number(r.amount), 0)
    const categoryBreakdown = receipts.reduce<Record<string, number>>((acc, r: any) => {
      acc[r.category] = (acc[r.category] ?? 0) + Number(r.amount)
      return acc
    }, {})

    const contextBlock = `
[FINANCIAL CONTEXT — ${now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}]
Total spent this month: ₦${totalSpent.toLocaleString()} (${receipts.length} receipts)

SPENDING BY CATEGORY:
${Object.entries(categoryBreakdown).map(([cat, amt]) => `• ${cat}: ₦${amt.toLocaleString()}`).join('\n') || '• No spending recorded yet'}

BUDGETS:
${budgets.length > 0
  ? (budgets as any[]).map(b => {
    const spent = categoryBreakdown[b.category] ?? 0
    const pct = Math.round((spent / b.amount) * 100)
    const icon = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '✅'
    return `• ${b.category}: ₦${spent.toLocaleString()} / ₦${Number(b.amount).toLocaleString()} (${pct}%) ${icon}`
  }).join('\n')
  : '• No budgets set'}

UPCOMING REMINDERS:
${reminders.length > 0
  ? (reminders as any[]).map(r => `• ${r.title} — ${r.due_date}`).join('\n')
  : '• No upcoming reminders'}

CLIENTS (active, sorted by outstanding balance):
${clients.length > 0
  ? (clients as any[]).map(c => `• ${c.name}: ₦${Number(c.outstanding_balance).toLocaleString()} outstanding, ₦${Number(c.total_earned).toLocaleString()} total earned`).join('\n')
  : '• No clients yet'}

TAX HUB CONTEXT — this is a tracking and estimating tool, not a tax filing or
guaranteed-accurate calculator. Always include the verification date when
quoting a rate, and always pair any estimate with the planning-purposes-only
disclaimer.
Current default tax country: ${defaultTaxCountry}

TAX RATE REFERENCE (all countries, for ad-hoc rate questions):
${allTaxRates.length > 0
  ? allTaxRates.map((r: any) => `• ${r.country} — ${r.tax_type}: ${r.rate} (as of ${r.last_verified_date})`).join('\n')
  : '• No reference rates loaded.'}

RECORDED INCOME THIS MONTH for ${defaultTaxCountry}: ${defaultCountryCurrency} ${monthlyIncome.toLocaleString()}
${ratesForDefaultCountry.length > 0
  ? `Tax types available for ${defaultTaxCountry}: ${ratesForDefaultCountry.map((r: any) => r.tax_type).join(', ')}`
  : ''}
[END CONTEXT]`

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: contextBlock },
      { role: 'assistant', content: 'Financial context loaded. Ready to help.' },
      ...history.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ]

    // Call Claude
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages,
    })

    const fullReply = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse and strip ACTION tags
    const lines = fullReply.split('\n')
    const actionLines = lines.filter(l => l.trim().startsWith('ACTION:'))
    const actions = actionLines.map(l => l.trim().replace(/^ACTION:/, ''))
    const cleanReply = lines.filter(l => !l.trim().startsWith('ACTION:')).join('\n').trim()

    // Execute actions
    let actionNotes: string[] = []
    if (orgId && actions.length > 0) {
      actionNotes = await executeActions(actions, orgId, admin, defaultTaxCountry)
    }

    const finalReply = actionNotes.length > 0
      ? `${cleanReply}\n\n${actionNotes.join('\n')}`
      : cleanReply

    // Save both messages to DB
    await admin.from('whatsapp_conversations').insert([
      { phone_number: chatId, role: 'user', content: message },
      { phone_number: chatId, role: 'assistant', content: finalReply },
    ])

    // Feed the Inactivity Re-Engagement / Daily Brief activity tracker —
    // a real in-app Tello message counts as activity, same as a WhatsApp one.
    // Resetting reengagement_stage here (not a separate detection step) is
    // what implements "becoming active resets the cycle back to the start."
    await admin.from('profiles').update({
      last_active_at: new Date().toISOString(),
      reengagement_stage: 0,
      reengagement_stage_at: null,
    }).eq('id', user.id)

    return NextResponse.json({ success: true, reply: finalReply })
  } catch (err) {
    console.error('chat/message: error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
