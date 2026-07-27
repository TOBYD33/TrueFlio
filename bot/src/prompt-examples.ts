// prompt-examples.ts
// Single source of truth for "how to talk to Tello" example templates —
// used by the WhatsApp help/examples command, the reactive fallback when
// a message can't be understood, and mirrored in web/lib/prompt-examples.ts
// for the in-app Tello chat's empty state. Bot and web are separate
// deployments with no shared package (same precedent as timezone-util.ts
// and plan-gates.ts), so this file is intentionally duplicated — keep both
// copies' CATEGORIES array in sync by hand when editing examples.

export type ExampleCategoryId =
  | 'money' | 'reminders' | 'clients' | 'invoicing' | 'tax' | 'scanning' | 'team' | 'birthdays'

export interface ExampleCategory {
  id: ExampleCategoryId
  label: string
  emoji: string
  examples: string[]
  // Scanning has no text example — it's "just send the photo" instead.
  instructionOverride?: string
  // Only shown to orgs whose plan allows team invites (staffLimit !== 0 —
  // see lib/plans.ts / plan-gates.ts's canInviteTeamMembers).
  requiresTeamInvites?: boolean
}

export const CATEGORIES: ExampleCategory[] = [
  {
    id: 'money', label: 'Track Money', emoji: '💰',
    examples: [
      'I spent ₦5,000 on fuel today',
      'Received ₦100,000 from Toby for the logo design',
    ],
  },
  {
    id: 'reminders', label: 'Reminders', emoji: '⏰',
    examples: [
      'Remind me to pay rent on the 1st of every month',
      'Remind me to call Toby tomorrow at 10am',
    ],
  },
  {
    id: 'clients', label: 'Clients & Leads', emoji: '👥',
    examples: [
      'Add a new client called Toby, I met him on Instagram',
      'Mark Toby as a paying client',
    ],
  },
  {
    id: 'invoicing', label: 'Invoices', emoji: '🧾',
    examples: ['Send Toby an invoice for ₦50,000 for the logo design'],
  },
  {
    id: 'tax', label: 'Tax Hub', emoji: '📊',
    examples: ["What's my estimated tax for this month?"],
  },
  {
    id: 'scanning', label: 'Scan a Receipt', emoji: '📷',
    examples: [],
    instructionOverride: 'Just send a photo of the receipt or payment screenshot — no need to type anything.',
  },
  {
    id: 'team', label: 'Team', emoji: '🧑‍💼',
    examples: ['Add Sarah to my team'],
    requiresTeamInvites: true,
  },
  {
    id: 'birthdays', label: 'Client Birthdays', emoji: '🎂',
    examples: ["Toby's birthday is March 5th"],
  },
]

// The 3 most common categories, used when the reactive fallback can't
// guess a specific one (Requirement 2.3) — one example each, not the
// full list, to avoid overwhelming the user.
export const MOST_COMMON_CATEGORY_IDS: ExampleCategoryId[] = ['money', 'reminders', 'clients']

export function getCategory(id: ExampleCategoryId): ExampleCategory {
  return CATEGORIES.find(c => c.id === id)!
}

// Visible categories for a given org — filters out Team for plans that
// can't invite team members. Mirrors web/lib/plans.ts's
// canInviteTeamMembers but takes a plain boolean since bot/plan-gates.ts
// already resolves that per-plan check elsewhere.
export function visibleCategories(canInviteTeam: boolean): ExampleCategory[] {
  return CATEGORIES.filter(c => !c.requiresTeamInvites || canInviteTeam)
}

// Lightweight keyword/pattern guess at which category a failed message was
// likely going for (Requirement 2.1) — deliberately simple, this is a
// fallback aid, not a real classifier. Order matters: more specific
// categories are checked before generic ones so e.g. "invoice for 50k"
// matches Invoicing, not Money.
export function guessCategory(messageText: string): ExampleCategoryId | null {
  const t = messageText.toLowerCase()

  if (/\bbirthday\b/.test(t)) return 'birthdays'
  if (/\binvoice\b|\bbill (him|her|them)\b/.test(t)) return 'invoicing'
  if (/\btax\b|\bvat\b/.test(t)) return 'tax'
  if (/\bteam\b|\bstaff\b|\binvite\b/.test(t)) return 'team'
  if (/\bclient\b|\blead\b|\bcustomer\b|\bpaying client\b/.test(t)) return 'clients'
  if (/\bremind(er|s)?\b|\btomorrow\b|\bevery (day|week|month|year)\b|\bat \d{1,2}(:\d{2})?\s*(am|pm)?\b/.test(t)) return 'reminders'
  if (/[₦$]\s?\d|\bnaira\b|\bspent\b|\breceived\b|\bpaid\b|\bpayment\b|\bbought\b|\bincome\b|\bexpense\b/.test(t)) return 'money'

  return null
}
