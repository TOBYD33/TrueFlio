// timezone-util.ts
// Shared date/timezone resolution — the ONE place this logic lives.
// Extracted from ai-assistant.ts (where it originally grounded the AI's
// "today"/"tomorrow" date resolution) so every feature that needs to
// compute a real, timezone-correct date reuses it, rather than each
// feature growing its own parallel date math. That drift is exactly the
// class of bug the original reminder date-resolution fix addressed.

// Phone-country-code → IANA timezone, first pass until a per-user timezone
// field exists. Longest codes checked first so e.g. '234' isn't shadowed by
// a shorter, unrelated prefix. Defaults to WAT (the primary market) when a
// number's country code isn't in this list.
const COUNTRY_CODE_TIMEZONES: Record<string, string> = {
  '234': 'Africa/Lagos',        // Nigeria
  '254': 'Africa/Nairobi',      // Kenya
  '233': 'Africa/Accra',        // Ghana
  '27': 'Africa/Johannesburg',  // South Africa
  '44': 'Europe/London',        // UK
  '92': 'Asia/Karachi',         // Pakistan
  '55': 'America/Sao_Paulo',    // Brazil
  '1': 'America/New_York',      // USA/Canada — coarse approximation, no area-code precision
}
const DEFAULT_TIMEZONE = 'Africa/Lagos'
const SORTED_COUNTRY_CODES = Object.keys(COUNTRY_CODE_TIMEZONES).sort((a, b) => b.length - a.length)

export function resolveTimezone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '')
  for (const code of SORTED_COUNTRY_CODES) {
    if (digits.startsWith(code)) return COUNTRY_CODE_TIMEZONES[code]
  }
  return DEFAULT_TIMEZONE
}

export function dateStrInTimezone(tz: string, date: Date): string {
  // en-CA formats as YYYY-MM-DD, exactly what due_date columns expect
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

// 0-23 local hour in the given timezone — used by Daily Brief to fire
// once during each user's own local send window, without hardcoding a
// single global hour the way a naive "send at 7am" cron would.
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
  // Day 0 of the next month = last day of `month` (1-indexed)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Next occurrence of month/day on or after todayStr — clamps Feb 29 to
// Feb 28 in non-leap years rather than erroring or skipping to March.
export function nextOccurrenceOfDate(todayStr: string, month: number, day: number): string {
  const todayYear = Number(todayStr.split('-')[0])
  const build = (year: number) => {
    const safeDay = Math.min(day, daysInMonth(year, month))
    return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
  }
  const thisYear = build(todayYear)
  return thisYear >= todayStr ? thisYear : build(todayYear + 1)
}
