'use client'
// settings/business/page.tsx
// Update business name, type, currency, address, and logo.
// Logo upload resizes to max 600×600px client-side before uploading.
// Business name appears on all invoices and outbound emails.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Organization } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ImageUpload } from '@/components/ImageUpload'
import { toast } from 'sonner'

const BUSINESS_TYPES = [
  { value: 'sme', label: 'Small / Medium Business (SME)' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'agency', label: 'Agency' },
  { value: 'individual', label: 'Individual' },
  { value: 'family', label: 'Family' },
]

const CURRENCIES = [
  { value: 'NGN', label: '₦ Nigerian Naira (NGN)' },
  { value: 'USD', label: '$ US Dollar (USD)' },
  { value: 'GBP', label: '£ British Pound (GBP)' },
  { value: 'EUR', label: '€ Euro (EUR)' },
  { value: 'KES', label: 'KSh Kenyan Shilling (KES)' },
  { value: 'GHS', label: '₵ Ghanaian Cedi (GHS)' },
  { value: 'ZAR', label: 'R South African Rand (ZAR)' },
]

export default function BusinessSettingsPage() {
  const supabase = createClient()
  const { orgId } = useViewingContext()
  const [org, setOrg] = useState<Organization | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const { data } = await supabase
        .from('organizations').select('*').eq('id', orgId).single()
      if (data) setOrg(data as Organization)
    }
    load()
  }, [orgId])

  async function handleLogoUpload(resizedFile: File) {
    if (!orgId) return
    setUploading(true)
    const path = `logos/${orgId}/logo.jpg`
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(path, resizedFile, { upsert: true, contentType: 'image/jpeg' })

    if (uploadError) {
      toast.error('Logo upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    const { error } = await supabase.from('organizations').update({ logo_url: publicUrl }).eq('id', orgId)
    setUploading(false)
    if (error) { toast.error(error.message); return }
    setOrg(o => o ? { ...o, logo_url: publicUrl } : o)
    toast.success('Logo updated')
  }

  async function saveOrg() {
    if (!org || !orgId) return
    setSaving(true)
    // .select().single() is required here, not cosmetic — organizations'
    // RLS only allows the owner to update it (owner_id = auth.uid()). A
    // non-owner team member editing this page would previously see
    // "Business profile updated" while RLS silently discarded the write
    // (Supabase reports 0-rows-matched as success, not an error). Now a
    // blocked write surfaces as a real error instead of a false positive.
    const { data, error } = await supabase.from('organizations').update({
      name: org.name,
      type: org.type,
      currency: org.currency,
      address: org.address ?? null,
      bank_account_name: org.bank_account_name ?? null,
      bank_account_number: org.bank_account_number ?? null,
      bank_name: org.bank_name ?? null,
    }).eq('id', orgId).select().single()
    setSaving(false)
    if (error) toast.error("Couldn't save — " + (error.code === 'PGRST116' ? 'you may not have permission to edit this business profile.' : error.message))
    else if (!data) toast.error('Nothing was saved — please refresh and try again.')
    else toast.success('Business profile updated')
  }

  return (
    <div className="space-y-5">
      {/* Logo */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <ImageUpload
              currentUrl={org?.logo_url}
              fallbackText={org?.name ?? 'B'}
              shape="square"
              maxSizePx={600}
              uploading={uploading}
              onUpload={(resizedFile) => handleLogoUpload(resizedFile)}
            />
            <div>
              <p className="font-semibold text-gray-900">{org?.name ?? 'Your Business'}</p>
              <p className="text-sm text-gray-500">Business logo · shown on invoices and reports</p>
              <p className="text-xs text-gray-400 mt-1">PNG or JPG · Max 600×600px (resized automatically)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business details */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Business name</label>
            <Input
              className="mt-1"
              placeholder="Your Business Name"
              value={org?.name ?? ''}
              onChange={e => setOrg(o => o ? { ...o, name: e.target.value } : o)}
            />
            <p className="text-xs text-gray-400 mt-1">This name appears on your invoices and outbound emails.</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Business type</label>
            <Select
              value={org?.type ?? 'sme'}
              onValueChange={v => { if (v) setOrg(o => o ? { ...o, type: v } : o) }}
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Default currency</label>
            <Select
              value={org?.currency ?? 'NGN'}
              onValueChange={v => { if (v) setOrg(o => o ? { ...o, currency: v } : o) }}
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">
              Business address <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#6C63FF] resize-none"
              rows={3}
              placeholder="123 Lagos Island, Lagos, Nigeria"
              value={org?.address ?? ''}
              onChange={e => setOrg(o => o ? { ...o, address: e.target.value } : o)}
            />
            <p className="text-xs text-gray-400 mt-1">Shown below your business name on invoice headers.</p>
          </div>
          <Button className="bg-[#6C63FF] hover:bg-[#5A52E0]" onClick={saveOrg} disabled={saving}>
            {saving ? 'Saving…' : 'Save Business Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* Payment details — the default/fallback payment method shown on
          every invoice, independent of any payment-link integration. Tello
          also asks for these once via WhatsApp the first time an invoice is
          created with none saved yet; either place keeps them in sync. */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <p className="font-semibold text-gray-900">Payment Details</p>
            <p className="text-xs text-gray-400 mt-1">Shown on every invoice as the default payment method.</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Account name</label>
            <Input
              className="mt-1"
              placeholder="Your Business Name"
              value={org?.bank_account_name ?? ''}
              onChange={e => setOrg(o => o ? { ...o, bank_account_name: e.target.value } : o)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Account number</label>
            <Input
              className="mt-1"
              placeholder="0123456789"
              value={org?.bank_account_number ?? ''}
              onChange={e => setOrg(o => o ? { ...o, bank_account_number: e.target.value } : o)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Bank name</label>
            <Input
              className="mt-1"
              placeholder="GTBank"
              value={org?.bank_name ?? ''}
              onChange={e => setOrg(o => o ? { ...o, bank_name: e.target.value } : o)}
            />
          </div>
          <Button className="bg-[#6C63FF] hover:bg-[#5A52E0]" onClick={saveOrg} disabled={saving}>
            {saving ? 'Saving…' : 'Save Business Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
