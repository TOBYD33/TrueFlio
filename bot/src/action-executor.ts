// action-executor.ts
// Parses and executes action strings Claude includes at the end of its replies.
// e.g. "SET_BUDGET:Transport:120000" → writes budget to Supabase

import { setBudget } from './budget-service'
import {
  setReminder, PastDueReminderError, ReminderNotFoundError,
  archiveReminderByTitle, restoreReminderByTitle, stopRecurringReminderByTitle,
  deleteReminderPermanentlyByTitle, editReminderByTitle,
} from './reminder-service'
import { generateAndSendPDF } from './pdf-generator'
import { getBudgetStatus } from './report-service'
import { getInventoryItems, addInventoryItem, updateStock, getLowStockItems } from './inventory-service'
import { startGuidedClientSetup } from './client-setup-service'
import { findClientByName } from './client-service'
import { setClientBirthday } from './client-birthday-service'
import { recordClientPayment } from './client-payment-service'
import { startInvoiceCreation } from './invoice-setup-service'
import { calculateTaxEstimate, formatEstimateReply, setTaxCountry, TAX_COUNTRIES, DEFAULT_INCOME_TAX_TYPE, TaxCountry, TaxPeriodKey } from './tax-service'
import { supabase } from './supabase'
import { canUseAutomatedReminders } from './plan-gates'

export interface ActionExecutionResult {
  notifications: string[]
  // Honest, user-facing failure messages — one per action that threw.
  // Never empty silently: every catch block below must push here, since a
  // write that fails with no trace is exactly what let the bot confirm
  // reminders that were never saved.
  failures: string[]
}

export async function executeActions(actions: string[], user: any): Promise<ActionExecutionResult> {
  const notifications: string[] = []
  const failures: string[] = []

  for (const action of actions) {
    const parts = action.split(':')
    const type = parts[0]

    try {
      switch (type) {
        case 'SET_BUDGET': {
          // SET_BUDGET:Transport:120000
          const [, category, amount] = parts
          await setBudget({ orgId: user.org_id, category, amount: parseFloat(amount) })
          const currency = user.currency || 'NGN'
          notifications.push(`✅ *Budget set!* ${category} — ${currency} ${parseFloat(amount).toLocaleString()}`)
          break
        }
        case 'SET_REMINDER': {
          if (!(await canUseAutomatedReminders(user.plan))) {
            notifications.push('⏰ Automated reminders aren\'t available on the Free plan. Upgrade at app.gettrueflow.com/settings/subscription to unlock them.')
            break
          }
          // SET_REMINDER:Pay VAT:2025-06-21:monthly:2030
          // Last part is an optional time as HHMM digits (24h WAT)
          const [, title, date, recurrence, timeRaw] = parts
          let dueTime: string | undefined
          if (timeRaw) {
            const digits = timeRaw.replace(/\D/g, '').padStart(4, '0')
            const hh = parseInt(digits.slice(0, 2)), mm = parseInt(digits.slice(2, 4))
            if (digits.length === 4 && hh < 24 && mm < 60) {
              dueTime = `${digits.slice(0, 2)}:${digits.slice(2, 4)}`
            }
          }
          // If a business card was just scanned and this reply looks like
          // the follow-up ("remind me in 3 days"), link the reminder to
          // that lead's client record instead of leaving it standalone.
          const { data: sessionRow } = await supabase
            .from('whatsapp_sessions')
            .select('pending_lead_id')
            .eq('phone_number', user.whatsapp_number)
            .maybeSingle()
          const clientId = sessionRow?.pending_lead_id ?? undefined

          const saved = await setReminder({ orgId: user.org_id, title, dueDate: date, recurrence: recurrence || 'once', dueTime, clientId })

          if (clientId) {
            await supabase.from('whatsapp_sessions').update({ pending_lead_id: null }).eq('phone_number', user.whatsapp_number)
          }

          // Confirmation is built from the row Supabase actually returned,
          // not from the AI's own text — this is the fix: the bot can now
          // only claim a reminder was set once the write is verified.
          const timeLabel = saved?.due_time ? ` at ${saved.due_time.slice(0, 5)}` : ''
          notifications.push(`✅ *Reminder set!* ${title} — ${date}${timeLabel}`)
          break
        }
        case 'ARCHIVE_REMINDER': {
          // ARCHIVE_REMINDER:Call my Lawyer
          // Hides ONE occurrence — for a recurring reminder this does NOT
          // end the series, see STOP_RECURRING_REMINDER for that.
          const [, title] = parts
          const reminder = await archiveReminderByTitle(user.org_id, title)
          notifications.push(`✅ Archived "${reminder.title}". ${reminder.recurrence !== 'once' ? "It'll show up again for its next occurrence." : 'You can restore it anytime from the Reminders page.'}`)
          break
        }
        case 'RESTORE_REMINDER': {
          // RESTORE_REMINDER:Call my Lawyer
          const [, title] = parts
          const reminder = await restoreReminderByTitle(user.org_id, title)
          notifications.push(`✅ Restored "${reminder.title}" to your active reminders.`)
          break
        }
        case 'STOP_RECURRING_REMINDER': {
          // STOP_RECURRING_REMINDER:Call my Lawyer
          // Ends the recurring series itself — distinct from
          // ARCHIVE_REMINDER, which only hides the next occurrence.
          const [, title] = parts
          const reminder = await stopRecurringReminderByTitle(user.org_id, title)
          notifications.push(`✅ "${reminder.title}" will no longer repeat.`)
          break
        }
        case 'DELETE_REMINDER_PERMANENTLY': {
          // DELETE_REMINDER_PERMANENTLY:Call my Lawyer
          const [, title] = parts
          const reminder = await deleteReminderPermanentlyByTitle(user.org_id, title)
          notifications.push(`✅ Permanently deleted "${reminder.title}". This can't be undone.`)
          break
        }
        case 'EDIT_REMINDER': {
          // EDIT_REMINDER:Call my Lawyer:2026-08-15:once
          const [, title, newDate, newRecurrence] = parts
          const updated = await editReminderByTitle(user.org_id, title, { dueDate: newDate, recurrence: newRecurrence })
          notifications.push(`✅ Updated "${updated.title}" — now due ${updated.due_date}${updated.recurrence !== 'once' ? ` (${updated.recurrence})` : ''}.`)
          break
        }
        case 'EXPORT_PDF': {
          await generateAndSendPDF(user.org_id, user.whatsapp_number)
          break
        }
        case 'SHOW_BUDGETS': {
          const budgets = await getBudgetStatus(user.org_id)
          if (budgets.length === 0) {
            notifications.push('No budgets set yet. Say "Set a [category] budget of [amount]" to create one.')
          } else {
            const lines = budgets.map(b => {
              const pct = Math.round((b.spent / b.limit) * 100)
              const icon = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '✅'
              return `• ${b.category}: ${user.currency} ${b.spent.toLocaleString()} / ${user.currency} ${b.limit.toLocaleString()} (${pct}%) ${icon}`
            })
            notifications.push(`📊 *Your Budgets:*\n${lines.join('\n')}`)
          }
          break
        }
        case 'UPDATE_INVENTORY': {
          // UPDATE_INVENTORY:{itemName}:{quantityChange}:{changeType}
          const [, itemName, quantityChangeStr, changeType] = parts
          const items = await getInventoryItems(user.org_id)
          const item = items.find(
            (i: any) => i.name.toLowerCase() === itemName.toLowerCase()
          )
          const qty = parseFloat(quantityChangeStr)
          if (item) {
            await updateStock({
              orgId: user.org_id,
              itemId: item.id,
              quantityChange: qty,
              changeType: changeType as 'restock' | 'sale' | 'adjustment',
              createdBy: user.user_id
            })
          } else if (qty > 0) {
            await addInventoryItem({
              orgId: user.org_id,
              name: itemName,
              quantity: qty
            })
          }
          break
        }

        case 'SHOW_INVENTORY': {
          const items = await getInventoryItems(user.org_id)
          if (items.length === 0) {
            notifications.push('No inventory items yet. Say "Add 50 units of [item] at [cost] each" to create one.')
          } else {
            const lowStock = await getLowStockItems(user.org_id)
            const lowStockIds = new Set(lowStock.map((i: any) => i.id))
            const lines = items.map((i: any) => {
              const icon = lowStockIds.has(i.id) ? '🔴' : '✅'
              return `• ${i.name}: ${i.quantity_on_hand} units ${icon}`
            })
            notifications.push(`📦 *Your Inventory:*\n${lines.join('\n')}`)
          }
          break
        }

        case 'LOG_PAYMENT': {
          // LOG_PAYMENT:{clientName}:{amount}
          // clientName may contain spaces; amount is always the last colon-separated segment
          const paymentParts = parts.slice(1)
          const amountStr = paymentParts[paymentParts.length - 1]
          const clientName = paymentParts.slice(0, -1).join(':').trim()
          const amount = parseFloat(amountStr)

          if (!clientName || isNaN(amount) || amount <= 0) break

          const client = await findClientByName(user.org_id, clientName)
          if (!client) {
            notifications.push(
              `I couldn't find a client matching "${clientName}". Create them first by saying "New client ${clientName}".`
            )
            break
          }

          await recordClientPayment({
            orgId: user.org_id,
            clientId: client.id,
            amount,
            currency: user.currency || 'NGN',
          })

          const currency = user.currency || 'NGN'
          notifications.push(
            `✅ *Payment logged!*\n\n` +
            `${currency} ${amount.toLocaleString()} from *${client.name}*\n` +
            `Open your dashboard to link it to a specific project: app.gettrueflow.com/income`
          )
          break
        }

        case 'GENERATE_INVOICE': {
          // GENERATE_INVOICE:{clientId}:{projectId}
          // Invoice generation is handled in the web app — acknowledge only
          notifications.push(
            'Invoice generation is available on your web dashboard: app.gettrueflow.com/invoices'
          )
          break
        }

        case 'CREATE_INVOICE': {
          // CREATE_INVOICE:{clientName}:{amount}:{description}
          // CREATE_INVOICE:{clientName}:{amount}:{YYYY-MM-DD}:{description}  (with a due date)
          const invParts = parts.slice(1)
          const clientName = invParts[0]?.trim()
          const amount = parseFloat(invParts[1])
          const rest = invParts.slice(2)

          let dueDate: string | undefined
          let description: string
          if (rest[0] && /^\d{4}-\d{2}-\d{2}$/.test(rest[0])) {
            dueDate = rest[0]
            description = rest.slice(1).join(':').trim()
          } else {
            description = rest.join(':').trim()
          }

          if (!clientName || isNaN(amount) || amount <= 0 || !description) break

          const invoiceClient = await findClientByName(user.org_id, clientName)
          if (!invoiceClient) {
            notifications.push(
              `I couldn't find a client matching "${clientName}". Create them first by saying "New client ${clientName}".`
            )
            break
          }

          const invoiceReply = await startInvoiceCreation({
            orgId: user.org_id,
            phoneNumber: user.whatsapp_number,
            clientId: invoiceClient.id,
            clientName: invoiceClient.name,
            amount,
            currency: user.currency || 'NGN',
            description,
            dueDate,
          })
          notifications.push(invoiceReply)
          break
        }

        case 'START_CLIENT_SETUP': {
          // START_CLIENT_SETUP:{clientName}
          const clientName = parts.slice(1).join(':').trim()
          if (clientName) {
            const blocked = await startGuidedClientSetup(user.org_id, user.whatsapp_number, clientName)
            if (blocked) notifications.push(blocked)
          }
          break
        }

        case 'GET_TAX_ESTIMATE': {
          // GET_TAX_ESTIMATE:{country}:{period}
          const [, countryRaw, periodRaw] = parts
          const country = (TAX_COUNTRIES.includes(countryRaw as TaxCountry) ? countryRaw : user.default_tax_country) as TaxCountry
          const period = (periodRaw || 'this_month') as TaxPeriodKey
          const taxType = DEFAULT_INCOME_TAX_TYPE[country]

          const estimateResult = await calculateTaxEstimate({ orgId: user.org_id, country, taxType, period, persist: true })
            .catch(() => null)

          if (estimateResult) {
            notifications.push(formatEstimateReply(taxType, country, estimateResult as any))
          } else {
            notifications.push(`I don't have a reference rate for ${taxType} in ${country} yet.`)
          }
          break
        }

        case 'SET_TAX_REMINDER': {
          // SET_TAX_REMINDER:{title}:{date}:{recurrence}
          const [, title, date, recurrence] = parts
          await setReminder({ orgId: user.org_id, title, dueDate: date, recurrence: recurrence || 'once', category: 'tax' })
          notifications.push(`✅ *Reminder set!* ${title} — ${date}`)
          break
        }

        case 'SWITCH_TAX_COUNTRY': {
          // SWITCH_TAX_COUNTRY:{country}
          const [, country] = parts
          if (TAX_COUNTRIES.includes(country as TaxCountry)) {
            await setTaxCountry(user.org_id, country as TaxCountry)
          }
          break
        }

        case 'SET_CLIENT_SOURCE': {
          // SET_CLIENT_SOURCE:{clientName}:{source}
          const [, clientName, source] = parts
          const validSources = ['whatsapp', 'facebook', 'instagram', 'referral', 'offline', 'business_card', 'other']
          if (!clientName || !validSources.includes(source)) break

          const sourceClient = await findClientByName(user.org_id, clientName)
          if (!sourceClient) {
            notifications.push(`I couldn't find a client matching "${clientName}".`)
            break
          }
          await supabase.from('clients').update({ source }).eq('id', sourceClient.id)
          notifications.push(`✅ Got it — noted ${sourceClient.name} came through ${source.replace('_', ' ')}.`)
          break
        }

        case 'SET_CLIENT_PAYING': {
          // SET_CLIENT_PAYING:{clientName}:{true|false}
          const [, clientName, flagRaw] = parts
          if (!clientName || (flagRaw !== 'true' && flagRaw !== 'false')) break

          const payingClient = await findClientByName(user.org_id, clientName)
          if (!payingClient) {
            notifications.push(`I couldn't find a client matching "${clientName}".`)
            break
          }
          const isPaying = flagRaw === 'true'
          await supabase.from('clients').update({ is_paying: isPaying }).eq('id', payingClient.id)
          notifications.push(
            isPaying
              ? `✅ Marked *${payingClient.name}* as a paying client.`
              : `✅ Noted — *${payingClient.name}* isn't a paying client right now.`
          )
          break
        }

        case 'SET_CLIENT_BIRTHDAY': {
          // SET_CLIENT_BIRTHDAY:{clientName}:{month}:{day}[:{year}]
          const [, clientName, monthRaw, dayRaw, yearRaw] = parts
          const month = parseInt(monthRaw, 10)
          const day = parseInt(dayRaw, 10)
          const year = yearRaw ? parseInt(yearRaw, 10) : undefined
          if (!clientName || !month || month < 1 || month > 12 || !day || day < 1 || day > 31) break

          const birthdayClient = await findClientByName(user.org_id, clientName)
          if (!birthdayClient) {
            notifications.push(`I couldn't find a client matching "${clientName}".`)
            break
          }
          await setClientBirthday({
            orgId: user.org_id,
            clientId: birthdayClient.id,
            clientName: birthdayClient.name,
            phoneNumber: user.whatsapp_number,
            month,
            day,
            year,
          })
          notifications.push(
            `✅ Got it — saved *${birthdayClient.name}*'s birthday. I'll remind you 1 month, 1 week, and 1 day before, every year.`
          )
          break
        }

        default:
          break
      }
    } catch (err: any) {
      console.error(`executeAction ${type} failed:`, err)
      if (err instanceof PastDueReminderError) {
        failures.push("⏰ That time's already passed — did you mean tomorrow, or right now? Let me know and I'll set it.")
      } else if (err instanceof ReminderNotFoundError) {
        failures.push("🤔 I couldn't find a reminder matching that. Check the exact title on the Reminders page and try again.")
      } else {
        failures.push(actionFailureMessage(type))
      }
    }
  }

  return { notifications, failures }
}

// User-facing failure text per action type — never expose the raw error,
// but always tell the truth that the write did not happen.
function actionFailureMessage(type: string): string {
  switch (type) {
    case 'SET_BUDGET':
      return "⚠️ I couldn't save that budget — please try again in a moment."
    case 'SET_REMINDER':
    case 'SET_TAX_REMINDER':
      return "⚠️ I couldn't save that reminder — please try again in a moment."
    case 'UPDATE_INVENTORY':
      return "⚠️ I couldn't update your inventory — please try again in a moment."
    case 'LOG_PAYMENT':
      return "⚠️ I couldn't log that payment — please try again in a moment."
    case 'START_CLIENT_SETUP':
      return "⚠️ I couldn't start that client setup — please try again in a moment."
    case 'CREATE_INVOICE':
      return "⚠️ I couldn't create that invoice — please try again in a moment."
    case 'SET_CLIENT_SOURCE':
      return "⚠️ I couldn't save that — please try again in a moment."
    case 'SET_CLIENT_PAYING':
      return "⚠️ I couldn't update that client — please try again in a moment."
    case 'SET_CLIENT_BIRTHDAY':
      return "⚠️ I couldn't save that birthday — please try again in a moment."
    default:
      return "⚠️ Something went wrong completing that action — please try again in a moment."
  }
}
