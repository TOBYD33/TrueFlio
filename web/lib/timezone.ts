// timezone.ts
// Web-side mirror of bot/src/timezone-util.ts — same logic, duplicated
// deliberately because the bot and web app are separate deployments with
// no shared package (same precedent as the duplicated plan-limit check
// between bot/client-service.ts and web/api/clients/convert-lead). Any
// change to the date/timezone math must be applied to BOTH copies.

const COUNTRY_CODE_TIMEZONES: Record<string, string> = {
  '234': 'Africa/Lagos',
  '254': 'Africa/Nairobi',
  '233': 'Africa/Accra',
  '27': 'Africa/Johannesburg',
  '44': 'Europe/London',
  '92': 'Asia/Karachi',
  '55': 'America/Sao_Paulo',
  '1': 'America/New_York',
}
const DEFAULT_TIMEZONE = 'Africa/Lagos'
const SORTED_COUNTRY_CODES = Object.keys(COUNTRY_CODE_TIMEZONES).sort((a, b) => b.length - a.length)

export function resolveTimezone(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) return DEFAULT_TIMEZONE
  const digits = phoneNumber.replace(/\D/g, '')
  for (const code of SORTED_COUNTRY_CODES) {
    if (digits.startsWith(code)) return COUNTRY_CODE_TIMEZONES[code]
  }
  return DEFAULT_TIMEZONE
}

export function dateStrInTimezone(tz: string, date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

// 0-23 local hour in the given timezone — used by Daily Brief to fire
// once during each user's own local send window.
export function localHour(tz: string, date: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(date))
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export function addMonthsToDateStr(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().split('T')[0]
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function nextOccurrenceOfDate(todayStr: string, month: number, day: number): string {
  const todayYear = Number(todayStr.split('-')[0])
  const build = (year: number) => {
    const safeDay = Math.min(day, daysInMonth(year, month))
    return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
  }
  const thisYear = build(todayYear)
  return thisYear >= todayStr ? thisYear : build(todayYear + 1)
}
