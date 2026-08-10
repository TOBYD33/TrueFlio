// types/index.ts
// Shared TypeScript types for the TrueFlow web app

// lib/plans.ts's PlanId is now the canonical plan definition; this used to
// be a separate, unused enum ('solo'/'pro') that never matched the real
// plan names used by team/invite, admin/change-plan, or the Flutterwave
// routes. Re-exported as `Plan` for existing call sites.
import type { PlanId } from '@/lib/plans'
export type Plan = PlanId
export type Role = 'owner' | 'admin' | 'staff' | 'accountant'
export type UploadedVia = 'whatsapp' | 'app' | 'web'
export type ReceiptCategory =
  | 'Food & Drink'
  | 'Transport'
  | 'Utilities'
  | 'Office Supplies'
  | 'Marketing'
  | 'Rent'
  | 'Salaries'
  | 'Other'

export interface Profile {
  id: string
  full_name: string | null
  phone: string | null
  avatar_url: string | null
  last_active_at?: string | null
  reengagement_enabled?: boolean
  daily_brief_enabled?: boolean
  created_at: string
  updated_at?: string
}

export interface Organization {
  id: string
  name: string
  type: string
  owner_id: string
  plan: Plan
  trial_ends_at?: string | null
  receipt_limit: number
  currency: string
  default_tax_country: string
  logo_url?: string | null
  address?: string | null
  bank_account_name?: string | null
  bank_account_number?: string | null
  bank_name?: string | null
  created_at: string
  updated_at?: string
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: Role
  whatsapp_number: string | null
  whatsapp_active: boolean
  joined_at: string | null
  profiles?: Profile
}

export interface Receipt {
  id: string
  org_id: string
  uploaded_by: string | null
  uploaded_via: UploadedVia
  vendor_name: string | null
  amount: number
  currency: string
  tax_amount: number | null
  date: string
  category: ReceiptCategory
  notes: string | null
  image_url: string | null
  ai_transcript: string | null
  ai_confidence: 'high' | 'medium' | 'low' | null
  is_verified: boolean
  created_at: string
  profiles?: Profile
}

export interface Budget {
  id: string
  org_id: string
  category: ReceiptCategory
  amount: number
  period: 'monthly' | 'weekly'
  month: number | null
  year: number | null
}

export interface Reminder {
  id: string
  org_id: string
  title: string
  due_date: string
  recurrence: string
  category: string
  status: 'active' | 'fired' | 'dismissed'
  archived_at: string | null
}

export interface ShareLink {
  id: string
  org_id: string
  token: string
  permission: 'read' | 'export'
  expires_at: string | null
  created_at: string
}

export interface Client {
  id: string
  org_id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  company: string | null
  role: string | null
  total_earned: number
  outstanding_balance: number
  status: 'active' | 'inactive' | 'archived' | 'lead'
  source: 'manual' | 'business_card' | 'smart_transfer' | 'whatsapp' | 'facebook' | 'instagram' | 'referral' | 'offline' | 'other' | null
  is_paying: boolean
  birthday_month: number | null
  birthday_day: number | null
  birthday_year: number | null
  created_via: string
  created_at: string
}

// Fixed list a user can pick from — 'manual'/'smart_transfer' are system-set
// defaults (never shown as user-selectable options), 'business_card' stays
// exactly as the existing scanning feature already sets it.
export const CLIENT_SOURCE_OPTIONS: { value: NonNullable<Client['source']>; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'referral', label: 'Referral' },
  { value: 'offline', label: 'In person' },
  { value: 'business_card', label: 'Business card' },
  { value: 'other', label: 'Other' },
]

export interface Project {
  id: string
  org_id: string
  client_id: string
  name: string
  description: string | null
  total_fee: number
  amount_received: number
  balance_due: number
  currency: string
  start_date: string
  deadline: string | null
  status: 'in_progress' | 'delivered' | 'completed' | 'cancelled' | 'on_hold'
  delivered_at: string | null
  completed_at: string | null
  notes: string | null
  created_at: string
  clients?: Client
}

export interface ClientPayment {
  id: string
  org_id: string
  client_id: string
  project_id: string | null
  amount: number
  currency: string
  payment_type: 'deposit' | 'part_payment' | 'full_payment' | 'retainer'
  payment_date: string
  payment_reference: string | null
  receipt_image_url: string | null
  notes: string | null
  created_at: string
}

export interface LineItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Invoice {
  id: string
  org_id: string
  client_id: string | null
  project_id: string | null
  invoice_number: string | null
  client_name: string | null
  client_email: string | null
  line_items: LineItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total_amount: number
  currency: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  issue_date: string
  due_date: string | null
  paid_at: string | null
  pdf_url: string | null
  notes: string | null
  created_at: string
  clients?: { name: string; email: string | null } | null
}

export interface ScannedReceipt {
  vendor_name: string | null
  amount: number
  currency: string
  tax_amount: number | null
  date: string
  category: ReceiptCategory
  confidence: 'high' | 'medium' | 'low'
}

export type TaxCountry = 'Nigeria' | 'Kenya' | 'Ghana' | 'USA' | 'UK'

export interface TaxRateReference {
  id: string
  country: TaxCountry
  tax_type: string
  rate: string
  notes: string | null
  last_verified_date: string
}

export interface TaxEstimate {
  id: string
  org_id: string
  period_start: string
  period_end: string
  country: TaxCountry
  estimated_taxable_income: number
  estimated_liability: number | null
  tax_type: string
  calculated_at: string
}
