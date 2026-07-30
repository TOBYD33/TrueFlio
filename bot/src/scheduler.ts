// scheduler.ts
// All cron jobs. Call startScheduler() from index.ts on server startup.

import cron from 'node-cron'
import { fireDueReminders, fireAdvanceReminders } from './reminder-service'
import { sendWeeklySummaries, sendMonthlyReports } from './report-service'
import { checkBudgetAlerts } from './budget-service'
import { nudgeMissingBusinessNames } from './onboarding-service'
import { runInactivityReengagement } from './reengagement-service'
import { runDailyBrief } from './daily-brief-service'
import { checkOverdueInvoices } from './invoice-overdue-service'

export function startScheduler() {
  // Fire due reminders — every minute, so timed reminders (e.g. 8:30 PM)
  // deliver on time. fireDueReminders only sends what is actually due.
  cron.schedule('* * * * *', () => fireDueReminders(), { timezone: 'UTC' })

  // Fire 3-day advance warnings — every day 8am WAT
  cron.schedule('0 7 * * *', () => fireAdvanceReminders(), { timezone: 'UTC' })

  // Weekly summary — every Sunday 8am WAT
  cron.schedule('0 7 * * 0', () => sendWeeklySummaries(), { timezone: 'UTC' })

  // Monthly report — 1st of month 9am WAT (8am UTC)
  cron.schedule('0 8 1 * *', () => sendMonthlyReports(), { timezone: 'UTC' })

  // Budget alert check — every hour
  cron.schedule('0 * * * *', () => checkBudgetAlerts(), { timezone: 'UTC' })

  // Backfill nudge for orgs still stuck on the placeholder business name —
  // once daily, 10am WAT (9am UTC)
  cron.schedule('0 9 * * *', () => nudgeMissingBusinessNames(), { timezone: 'UTC' })

  // Inactivity Re-Engagement — hourly, for tighter precision on the 24h
  // threshold than a once-daily check would give (each run is a cheap
  // no-op for anyone not yet due).
  cron.schedule('0 * * * *', () => runInactivityReengagement(), { timezone: 'UTC' })

  // Daily Brief — hourly, checks each user's own local hour and only acts
  // during their configured send window (see DAILY_BRIEF_LOCAL_HOUR).
  cron.schedule('0 * * * *', () => runDailyBrief(), { timezone: 'UTC' })

  // Overdue invoice check — once daily, 9am WAT (8am UTC). Only acts on
  // invoices whose due_date was exactly yesterday, so each one only ever
  // transitions to 'overdue' and notifies once.
  cron.schedule('0 8 * * *', () => checkOverdueInvoices(), { timezone: 'UTC' })

  console.log('TrueFlow scheduler running ✅')
}
