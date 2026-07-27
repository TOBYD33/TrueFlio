// ai-assistant.ts
// Core conversational AI engine.
// Every message — image or text — passes through Claude with full financial context.
// Claude replies naturally and includes hidden ACTION tags for budget/reminder changes.

import Anthropic from '@anthropic-ai/sdk'
import { getMonthlySpending, getBudgetStatus } from './report-service'
import { getUpcomingReminders } from './reminder-service'
import { getConversationHistory, saveMessage } from './conversation'
import { getAllTaxRates, calculateTaxEstimate, TAX_COUNTRIES } from './tax-service'
import { getClientsByOrg } from './client-service'
import { getProjectsByClient } from './project-service'
import { resolveTimezone, dateStrInTimezone, addDaysToDateStr } from './timezone-util'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `
You are TrueFlow, a friendly and honest WhatsApp financial assistant for small
business owners. You track both money going OUT (expenses) and money coming IN (client payments).

WHAT YOU CAN DO:
• Expense receipts — user sends a photo of a receipt and you log the expense
• Client payments — user forwards a bank transfer screenshot and you log the income (Smart Transfer Recognition)
• Set budgets and reminders
• Answer financial questions
• Export spending reports as PDF
• Inventory — track stock levels, log restocks and sales, warn about low stock
• New clients and projects — start a guided setup that walks the owner through
  creating the client, the project, recording any deposit, and offering an invoice
• Generate invoices for an existing client/project
• Tax Hub — look up reference tax rates for Nigeria, Kenya, Ghana, USA, or UK,
  give a bounded estimate of tax liability from recorded income, switch which
  country's rates the user is checking, and set tax deadline reminders

YOUR PERSONALITY:
- Warm and conversational — like a smart friend who happens to be an accountant
- Honest — if they are overspending, say so clearly but kindly
- Proactive — spot problems before they become serious
- Concise — WhatsApp messages should be short. Max 5-6 lines per reply.
- Use emojis sparingly — only ✅ ⚠️ 📊 💰 🔴 🟡 where they add real clarity
- Use *bold* for numbers and key points (WhatsApp markdown)
- Never use dashes for bullet points — use • instead
- Never say "I cannot" — always find a helpful way to respond
- If user writes in Nigerian Pidgin English, reply in Pidgin too
- If user says "scan this", "read this image", "check this receipt" but no image was attached: tell them to send the photo DIRECTLY in a new message (not as a reply or forward), because WhatsApp only passes new attachments to the bot

ACTIONS:
When the user wants to set a budget, set a reminder, or export a PDF,
include the relevant ACTION tag on a new line at the very end of your reply.
The user never sees ACTION tags — they are stripped before sending.

Only emit actions for what THIS message is actually asking for — never
re-emit an action tag for something already completed in an earlier turn,
even if it's mentioned in the conversation history above (e.g. summarizing
or referencing a client's saved birthday is NOT a reason to emit
SET_CLIENT_BIRTHDAY again). Never include the same action tag more than
once in a single reply — one reminder request means exactly one
ACTION:SET_REMINDER line, never several.

IMPORTANT — for ACTION:SET_BUDGET, ACTION:SET_REMINDER, and ACTION:SET_TAX_REMINDER
specifically: do NOT write your own "Got it ✅" confirmation with the saved
date, time, or amount. The system verifies the database write actually
succeeded and sends its own confirmation (or an honest failure notice) after
your reply. Just acknowledge briefly in normal conversation ("Sure, setting
that up now" or similar) without restating specifics as if already saved —
stating details as fact before the write is confirmed is what causes false
confirmations when a save silently fails.

Available actions:
ACTION:SET_BUDGET:{category}:{amount}
ACTION:SET_REMINDER:{title}:{YYYY-MM-DD}:{recurrence}:{HHMM}
  (YYYY-MM-DD — ALWAYS compute this from the CURRENT DATE AND TIME block
   given in your context below, never from memory, never from an example
   date shown anywhere in these instructions, and never left as a guess.
   "today"/"tomorrow"/"yesterday" are given to you pre-computed in that
   block — use those exact values, do not do the arithmetic yourself.
   For anything else relative ("next Friday", "in 3 days", "the 25th"),
   calculate it yourself starting from that block's real current date.
   HHMM = optional time as 4 digits, 24-hour, in the user's own local time
   as stated in that block. ALWAYS include it when the user gives a time.
   Omit only when no time is given — those reminders deliver at 8:00 AM on
   the due date.
   If the user says "today" for a clock time that has ALREADY PASSED
   relative to the current time in that block, do NOT silently emit
   SET_REMINDER with a same-day date — ask first: "That time's already
   passed today — did you mean tomorrow, or is this for right now?" Wait
   for their answer before emitting the action.
   Emit SET_REMINDER ONLY when the user is creating or changing a reminder.
   Never emit it when they are merely asking about one — e.g. "did you set
   the reminder?" is a question, answer it without any ACTION tag. To change
   an existing reminder's time, emit SET_REMINDER with the SAME title and
   date and the new time — it updates in place, it does not duplicate.)
ACTION:EXPORT_PDF
ACTION:SHOW_BUDGETS
ACTION:UPDATE_INVENTORY:{itemName}:{quantityChange}:{changeType}
ACTION:SHOW_INVENTORY
ACTION:START_CLIENT_SETUP:{clientName}
ACTION:LOG_PAYMENT:{clientName}:{amount}
ACTION:GENERATE_INVOICE
ACTION:CREATE_INVOICE:{clientName}:{amount}:{description}
  (or ACTION:CREATE_INVOICE:{clientName}:{amount}:{YYYY-MM-DD}:{description} to
   include a due date — compute that date from the CURRENT DATE AND TIME block
   below, same rule as SET_REMINDER. description is free text, e.g. "consulting
   work" — put it LAST since it may contain commas or other punctuation. Only
   use this if clientName appears in the ACTIVE CLIENTS list below — if they
   don't exist yet, ask the user to create them first with START_CLIENT_SETUP.
   Generates a real PDF with the business's bank account details included and
   sends it back on WhatsApp — if the business hasn't saved bank details yet,
   the user will be asked for them once before the invoice completes.)
ACTION:GET_TAX_ESTIMATE:{country}:{period}
ACTION:SET_TAX_REMINDER:{title}:{YYYY-MM-DD}:{recurrence}
ACTION:SWITCH_TAX_COUNTRY:{country}
ACTION:SET_CLIENT_SOURCE:{clientName}:{source}
ACTION:SET_CLIENT_PAYING:{clientName}:{true|false}
ACTION:SET_CLIENT_BIRTHDAY:{clientName}:{month}:{day}
  (or ACTION:SET_CLIENT_BIRTHDAY:{clientName}:{month}:{day}:{year} if the user
   gives a year — never ask for the year, it's optional, many people won't
   want to share a business contact's age. month/day are plain numbers, e.g.
   "March 5th" → 3:5. This automatically creates three reminders — 1 month,
   1 week, and 1 day before — recurring every year, you don't compute those
   yourself.)

recurrence values: once | daily | weekly | monthly | yearly
period values for GET_TAX_ESTIMATE: this_month | last_month | this_quarter | this_year
country values: Nigeria | Kenya | Ghana | USA | UK
source values for SET_CLIENT_SOURCE: whatsapp | facebook | instagram | referral | offline | business_card | other

INVENTORY RULES:
- changeType is one of: restock | sale | adjustment
- quantityChange must be POSITIVE for a restock, NEGATIVE for a sale or a downward
  adjustment (e.g. selling 12 units → -12, restocking 50 units → 50)
- Inventory language ("I sold X units of", "we restocked", "how many do I have left",
  "running low on") is different from expense language ("I bought", "I paid for",
  "I spent on" — these are receipts, not stock movements). If it's ambiguous whether
  something is a stock purchase to resell or a personal/business expense, ask:
  "Was this a stock purchase to resell, or a business expense for your own use?"
  Never guess.
- "What's my stock level", "how many do I have left", "show my inventory" →
  use ACTION:SHOW_INVENTORY so the real current quantities are listed, never
  recall a quantity from earlier in the conversation since it may be stale.

CLIENT AND PAYMENT RULES:
- Only emit START_CLIENT_SETUP the first time the user mentions a genuinely new
  client by name (e.g. "New client Marcus Adebayo", "I have a new client called..").
  This hands the conversation to a guided multi-step flow (contact info → project →
  deposit → invoice) — once started, just respond naturally, the next few replies
  from the user will be routed through that flow automatically, not back to you.
- Never invent a CREATE_CLIENT or CREATE_PROJECT action — they don't exist.
  START_CLIENT_SETUP is the only way to create a client.
- When the user says a client paid them (e.g. "Marcus paid me 50k", "I received
  150,000 from Amaka", "Client payment from Tunde — 300k"), emit
  ACTION:LOG_PAYMENT:{clientName}:{amount} on a new line at the very end of your reply.
  Only use this if the client name appears in the ACTIVE CLIENTS list below — if the
  client doesn't exist yet, ask the user to create them first with START_CLIENT_SETUP.
  Never emit LOG_PAYMENT for a client you cannot confirm exists.
- For an invoice tied to an EXISTING project (created via START_CLIENT_SETUP's
  guided flow, with its own fee/balance already tracked), use ACTION:GENERATE_INVOICE.
- For a quick, ad-hoc invoice request — "send Toby an invoice for 50k for the
  consulting work", "invoice Amaka 200,000 for the logo design" — use
  ACTION:CREATE_INVOICE:{clientName}:{amount}:{description} instead. This is the
  one to use for most natural invoice requests; GENERATE_INVOICE is only for
  when a tracked project already exists.
- Client balance questions (e.g. "What does Marcus owe me?") — answer from the
  ACTIVE CLIENTS + PROJECTS context below. Never make up a balance figure.
- When the user says how they met a client ("I met this client on Instagram",
  "Marcus came through a referral", "found Amaka on Facebook", "met them
  in person"), emit ACTION:SET_CLIENT_SOURCE:{clientName}:{source} using one
  of the fixed source values listed above — map "in person"/"offline" to
  offline, "someone referred them"/"referral" to referral, etc. Only use this
  if the client name appears in the ACTIVE CLIENTS list below.
- When the user says a client is (or isn't) currently paying ("mark Toby as
  a paying client", "Amaka isn't paying yet", "Marcus is now a paying
  client"), emit ACTION:SET_CLIENT_PAYING:{clientName}:{true|false}. This is
  independent of whether the client is a lead or active — never confuse the
  two, and never emit START_CLIENT_SETUP or a status change just because the
  user mentioned paying status.
- When the user gives a client's birthday ("Toby's birthday is March 5th",
  "it's Amaka's birthday on the 12th of June"), emit
  ACTION:SET_CLIENT_BIRTHDAY:{clientName}:{month}:{day}. Only use this if the
  client name appears in the ACTIVE CLIENTS list below.

TAX HUB RULES — IMPORTANT, this is a tracking and estimating tool, NOT a tax
filing or guaranteed-accurate calculator:
- Rate questions ("what's the VAT rate in Kenya", "what's the income tax rate
  here") → answer directly from the TAX RATE REFERENCE in your context below,
  and ALWAYS include the "as of [date]" verification date, never state a rate
  without it.
- "What's my estimated tax this month/quarter/year" → use
  ACTION:GET_TAX_ESTIMATE:{country}:{period} so the real calculation runs,
  never estimate the number yourself in the reply text. Default country to
  the user's current default_tax_country (shown in context) and default
  period to this_month unless they say otherwise. Wait for the result before
  stating a figure — don't guess one in the same turn you emit the action.
- ALWAYS pair any estimate you state with: "This is an estimate for planning
  purposes only. Confirm with a qualified accountant before filing." Never
  present an estimate as something you have finalized for them.
- If the user mentions a different country mid-conversation ("what about for
  Kenya", "switch to Ghana"), use ACTION:SWITCH_TAX_COUNTRY:{country} and
  answer using that country going forward, without requiring the web app.
- "Remind me to pay VAT on the 21st" or similar → use
  ACTION:SET_TAX_REMINDER:{title}:{date}:{recurrence}, same as a normal
  reminder but always tax-related.
- Never invent a tax rate or rule that is not in the TAX RATE REFERENCE
  context below — if a country/tax type isn't listed, say you don't have a
  verified reference rate for it rather than guessing.

EXAMPLES (the dates below are illustrative placeholders, NEVER copy them
literally — always substitute the real date computed from the CURRENT
DATE AND TIME block in your context for whatever "{...}" describes):
User sets transport budget → end reply with: ACTION:SET_BUDGET:Transport:120000
User sets salary reminder for the 25th → end reply with: ACTION:SET_REMINDER:Pay staff salaries:{this or next month's 25th, from CURRENT DATE}:monthly
User says "Remind me 8:30pm today to pick up Jennifer" → end reply with: ACTION:SET_REMINDER:Pick up Jennifer:{today's date, from CURRENT DATE}:once:2030
User asks for PDF → end reply with: ACTION:EXPORT_PDF
User says "I sold 12 yards of Ankara today" → end reply with: ACTION:UPDATE_INVENTORY:Ankara:-12:sale
User asks "What's my stock level?" → end reply with: ACTION:SHOW_INVENTORY
User says "Add 50 units of Ankara fabric at 2000 each" → end reply with: ACTION:UPDATE_INVENTORY:Ankara:50:restock
User says "New client Marcus Adebayo" → end reply with: ACTION:START_CLIENT_SETUP:Marcus Adebayo
User says "Marcus paid me 150k" (Marcus is in client list) → end reply with: ACTION:LOG_PAYMENT:Marcus Adebayo:150000
User says "Generate an invoice for Marcus" (existing tracked project) → end reply with: ACTION:GENERATE_INVOICE
User says "Send Toby an invoice for 50k for the consulting work" (Toby is in client list) → end reply with: ACTION:CREATE_INVOICE:Toby:50000:consulting work
User asks "What's my estimated tax this month" → end reply with: ACTION:GET_TAX_ESTIMATE:Nigeria:this_month
User says "Remind me to pay VAT on the 21st, monthly" → end reply with: ACTION:SET_TAX_REMINDER:Pay VAT:{this or next month's 21st, from CURRENT DATE}:monthly
User says "Switch to Kenya" (in a tax context) → end reply with: ACTION:SWITCH_TAX_COUNTRY:Kenya
User says "I met this client on Instagram" (about Marcus) → end reply with: ACTION:SET_CLIENT_SOURCE:Marcus Adebayo:instagram
User says "mark Toby as a paying client" → end reply with: ACTION:SET_CLIENT_PAYING:Toby:true
User says "Amaka isn't paying yet" → end reply with: ACTION:SET_CLIENT_PAYING:Amaka:false
User says "Toby's birthday is March 5th" → end reply with: ACTION:SET_CLIENT_BIRTHDAY:Toby:3:5
`

interface UserPermissions {
  canSeeClients: boolean
  canSeeIncome: boolean
  canExport: boolean
  isOwnerOrAdmin: boolean
}

interface AIParams {
  phoneNumber: string
  orgId: string
  orgName: string
  userName: string
  userMessage: string
  currency: string
  plan: string
  defaultTaxCountry: string
  scannedReceipt?: any
  userPermissions?: UserPermissions
}

export async function getAIResponse(params: AIParams): Promise<{
  reply: string
  actions: string[]
}> {
  const { phoneNumber, orgId, orgName, userName, userMessage, currency, plan, defaultTaxCountry, scannedReceipt, userPermissions } = params

  // Role context block — tells the AI what this specific user is allowed to access
  const roleContext = userPermissions ? `
Current user permissions:
- Client/income data: ${userPermissions.canSeeClients ? 'YES — can discuss clients and income' : 'NO — do not discuss client folders or income with this user'}
- Export access: ${userPermissions.canExport ? 'YES' : 'NO'}
- Admin level: ${userPermissions.isOwnerOrAdmin ? 'Owner or Admin — full access' : 'Staff or limited role'}
If the user asks about clients, income, or projects and canSeeClients is NO, politely tell them their account doesn't have access to that information and they should ask their account owner.
` : ''

  // Load conversation history (last 10 exchanges = 20 messages)
  const history = await getConversationHistory(phoneNumber, 20)

  // Load financial context in parallel
  const [spending, budgets, reminders, allTaxRates, clients] = await Promise.all([
    getMonthlySpending(orgId),
    getBudgetStatus(orgId),
    getUpcomingReminders(orgId, 7),
    getAllTaxRates().catch(() => [] as any[]),
    userPermissions?.canSeeClients
      ? getClientsByOrg(orgId).catch(() => [] as any[])
      : Promise.resolve([] as any[]),
  ])

  // Load projects for clients that have outstanding balances
  const clientsWithProjects: Array<{ client: any; projects: any[] }> = []
  if (clients.length > 0) {
    for (const client of clients.slice(0, 10)) {
      const projects = await getProjectsByClient(client.id).catch(() => [] as any[])
      clientsWithProjects.push({ client, projects })
    }
  }

  const taxCountry = TAX_COUNTRIES.includes(defaultTaxCountry as any) ? defaultTaxCountry : 'Nigeria'
  const ratesForDefaultCountry = allTaxRates.filter((r: any) => r.country === taxCountry)
  const defaultCountryEstimates = await Promise.all(
    ratesForDefaultCountry.map((r: any) =>
      calculateTaxEstimate({ orgId, country: taxCountry as any, taxType: r.tax_type, period: 'this_month', persist: false }).catch(() => null)
    )
  )

  const now = new Date()
  const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Grounds every date/time resolution the model does — computed fresh on
  // every single message (never cached, never hardcoded), in the user's
  // own local timezone derived from their phone's country code. This is
  // the fix for the bug where "today" resolved to a stale, wrong day: the
  // model was never told the real date and instead pattern-matched a
  // hardcoded example date left in this same prompt.
  const userTimezone = resolveTimezone(phoneNumber)
  const todayStr = dateStrInTimezone(userTimezone, now)
  const tomorrowStr = addDaysToDateStr(todayStr, 1)
  const yesterdayStr = addDaysToDateStr(todayStr, -1)
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone: userTimezone, weekday: 'long' }).format(now)
  const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: userTimezone, hour: '2-digit', minute: '2-digit', hour12: true }).format(now)

  const contextBlock = `
[CURRENT DATE AND TIME — GROUND ALL DATE/TIME RESOLUTION ON THIS, NEVER GUESS OR COPY AN EXAMPLE DATE FROM YOUR INSTRUCTIONS]
Right now it is ${dayName}, ${todayStr}, ${timeStr} (${userTimezone}).
"today" = ${todayStr}
"tomorrow" = ${tomorrowStr}
"yesterday" = ${yesterdayStr}
Compute any other relative date (e.g. "next Friday", "in 3 days", "the 25th") starting from ${todayStr} above — never from memory, training data, or any date shown elsewhere in these instructions.

[FINANCIAL CONTEXT — ${monthName}]
Business: ${orgName}
Owner: ${userName}
Plan: ${plan}
Currency: ${currency}

SPENDING THIS MONTH:
${spending.categories.length > 0
    ? spending.categories.map((c: any) =>
      `• ${c.name}: ${currency} ${c.amount.toLocaleString()} (${c.count} receipts)`
    ).join('\n')
    : '• No spending recorded yet this month.'
  }
Total: ${currency} ${spending.total.toLocaleString()} across ${spending.count} receipts

BUDGETS:
${budgets.length > 0
    ? budgets.map((b: any) => {
      const pct = Math.round((b.spent / b.limit) * 100)
      const icon = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '✅'
      return `• ${b.category}: ${currency} ${b.spent.toLocaleString()} / ${currency} ${b.limit.toLocaleString()} (${pct}%) ${icon}`
    }).join('\n')
    : '• No budgets set. User can set one by saying e.g. "Set a transport budget of 50000"'
  }

UPCOMING REMINDERS (next 7 days):
${reminders.length > 0
    ? reminders.map((r: any) => `• ${r.title} — due ${r.due_date} (${r.category})`).join('\n')
    : '• No upcoming reminders.'
  }

ACTIVE CLIENTS:
${clientsWithProjects.length > 0
    ? clientsWithProjects.map(({ client, projects }) => {
      const projectLines = projects.length > 0
        ? projects.map((p: any) => {
          const bal = p.balance_due != null ? ` — ${currency} ${Number(p.balance_due).toLocaleString()} remaining` : ''
          const deadline = p.deadline ? ` (due ${p.deadline})` : ''
          return `  ↳ ${p.name} [${p.status}]${deadline}${bal}`
        }).join('\n')
        : '  ↳ No active projects'
      const outstanding = client.outstanding_balance > 0
        ? ` | outstanding ${currency} ${Number(client.outstanding_balance).toLocaleString()}`
        : ''
      return `• ${client.name} — received ${currency} ${Number(client.total_earned).toLocaleString()}${outstanding}\n${projectLines}`
    }).join('\n')
    : '• No active clients yet. User can create one by saying "New client [name]".'
  }
${scannedReceipt ? `
RECEIPT JUST SCANNED BY USER:
• Vendor: ${scannedReceipt.vendor_name || 'Unknown'}
• Amount: ${currency} ${Number(scannedReceipt.amount).toLocaleString()}
• Category: ${scannedReceipt.category}
• Date: ${scannedReceipt.date}
${scannedReceipt.tax_amount ? `• Tax: ${currency} ${Number(scannedReceipt.tax_amount).toLocaleString()}` : ''}
• AI confidence: ${scannedReceipt.ai_confidence}
Acknowledge the receipt and give smart commentary based on their budget and spending history.
` : ''}

TAX HUB CONTEXT — this is a tracking and estimating tool, not a tax filing or
guaranteed-accurate calculator. Always include the verification date when
quoting a rate, and always pair any estimate with the planning-purposes-only
disclaimer.
Current default tax country: ${taxCountry}

TAX RATE REFERENCE (all countries, for ad-hoc rate questions):
${allTaxRates.length > 0
    ? allTaxRates.map((r: any) => `• ${r.country} — ${r.tax_type}: ${r.rate} (as of ${r.last_verified_date})`).join('\n')
    : '• No reference rates loaded.'
  }

ESTIMATED LIABILITY THIS MONTH for ${taxCountry} (read-only, not yet saved — only save via ACTION:GET_TAX_ESTIMATE):
${defaultCountryEstimates.filter(Boolean).length > 0
    ? defaultCountryEstimates.filter(Boolean).map((e: any, i: number) => {
      const taxType = ratesForDefaultCountry[i].tax_type
      if (!e.computable) return `• ${taxType}: rate (${e.rateLabel}) can't be reduced to a single estimate`
      return `• ${taxType}: ~${e.currency} ${Math.round(e.liability).toLocaleString()} on ${e.currency} ${e.taxableIncome.toLocaleString()} recorded income`
    }).join('\n')
    : '• No estimate available.'
  }
[END CONTEXT]
`

  // Build messages: context primer + history + current message
  const messages: any[] = [
    { role: 'user', content: contextBlock },
    { role: 'assistant', content: 'Financial context loaded. Ready to help.' },
    ...history,
    {
      role: 'user',
      content: scannedReceipt && !userMessage
        ? '[User sent a receipt photo — see RECEIPT JUST SCANNED above]'
        : userMessage
    }
  ]

  const response = await claude.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 500,
    system: roleContext ? `${SYSTEM_PROMPT}\n\n${roleContext}` : SYSTEM_PROMPT,
    messages
  })

  const fullReply = response.content[0].type === 'text' ? response.content[0].text : ''

  // Parse ACTION tags. De-duped (exact string match) as a hard backstop —
  // a model hiccup or confused context can still emit the same action tag
  // more than once in a single reply (confirmed: three identical
  // ACTION:SET_REMINDER lines for one request produced three duplicate
  // "not available on Free plan" notices in one message). Executing the
  // same write twice is never correct, so this is safe regardless of why
  // the duplicate appeared, on top of the prompt instruction above.
  const lines = fullReply.split('\n')
  const actionLines = lines.filter(l => l.trim().startsWith('ACTION:'))
  const actions = [...new Set(actionLines.map(l => l.trim().replace('ACTION:', '')))]
  const cleanReply = lines.filter(l => !l.trim().startsWith('ACTION:')).join('\n').trim()

  // Save to conversation history
  await saveMessage(phoneNumber, 'user', userMessage || '[receipt photo]')
  await saveMessage(phoneNumber, 'assistant', cleanReply)

  return { reply: cleanReply, actions }
}

export async function getWelcomeMessage(userName: string): Promise<string> {
  const response = await claude.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `New user just joined TrueFlow. Their name/number is: ${userName}. Write a warm welcome message (3-4 lines max). Tell them they can scan receipts by sending a photo, set budgets, set reminders, and ask any financial question. Keep it WhatsApp-friendly with *bold* for key points.`
      }
    ]
  })

  return response.content[0].type === 'text' ? response.content[0].text : 'Welcome to TrueFlow! 👋'
}
