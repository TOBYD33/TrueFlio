// lib/prompt-examples.ts
// Single source of truth for "how to talk to Tello" example templates —
// mirrors bot/src/prompt-examples.ts exactly. Bot and web are separate
// deployments with no shared package (same precedent as lib/plans.ts /
// timezone.ts), so this file is intentionally duplicated — keep both
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
  // Only shown to orgs whose plan allows team invites — see
  // lib/plans.ts's canInviteTeamMembers.
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
    instructionOverride: 'Upload a photo of the receipt or payment screenshot from the Receipts page — no need to type anything.',
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

export function visibleCategories(canInviteTeam: boolean): ExampleCategory[] {
  return CATEGORIES.filter(c => !c.requiresTeamInvites || canInviteTeam)
}
