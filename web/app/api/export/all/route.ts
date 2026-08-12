// api/export/all/route.ts
// "Export All My Data" — generates a single ZIP with transactions.csv,
// clients.csv, invoices.csv, reminders.csv, and account_info.csv for the
// CALLER'S OWN org only (org_id is always resolved server-side from the
// authenticated session below, never accepted from the request body — this
// is what guarantees a Business Pro team member can never pull another
// org's data through this route).
//
// Runs synchronously within this request today (realistic data volumes for
// one SME finish well inside a serverless function's timeout), but the
// client-facing contract is already fire-and-forget-with-notification: the
// page doesn't wait for this response, it just shows a toast and moves on,
// then the notification bell tells the user when the download is ready.
// If data volumes ever justify a real background job runner, only this
// route's internals need to change — the contract stays the same.

import { NextRequest, NextResponse, after } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { generateFullExportZip } from '@/lib/export-service'
import { notifyUser } from '@/lib/notifications'

const EXPIRY_HOURS = 48

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(_req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = getAdmin()

  // Prefer the org this user OWNS — staff can belong to other orgs too,
  // but an export request should default to their own business, same
  // resolution pattern used by the Flutterwave checkout routes.
  const { data: members } = await admin
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .is('removed_at', null)

  if (!members || members.length === 0) {
    return NextResponse.json({ error: 'No organisation found' }, { status: 404 })
  }
  const orgId = (members.find(m => m.role === 'owner') ?? members[0]).org_id

  const { data: job, error: insertError } = await admin
    .from('data_exports')
    .insert({ org_id: orgId, requested_by: user.id, status: 'processing' })
    .select('id')
    .single()

  if (insertError || !job) {
    console.error('export/all: failed to create job row:', insertError)
    return NextResponse.json({ error: 'Could not start export' }, { status: 500 })
  }

  // after() keeps this work running post-response on Vercel — an
  // unawaited async IIFE here would NOT be safe, the serverless function
  // can be frozen the instant the response above is sent. The client
  // doesn't wait for any of this either way: it gets the 200 immediately,
  // shows a toast, and relies on the notification bell for completion.
  after(async () => {
    try {
      const zipBuffer = await generateFullExportZip(orgId)
      const path = `${orgId}/${job.id}.zip`

      const { error: uploadError } = await admin.storage
        .from('exports')
        .upload(path, zipBuffer, { contentType: 'application/zip' })
      if (uploadError) throw new Error(uploadError.message)

      const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000)
      const { data: signed, error: signError } = await admin.storage
        .from('exports')
        .createSignedUrl(path, EXPIRY_HOURS * 60 * 60)
      if (signError || !signed) throw new Error(signError?.message ?? 'Could not create signed URL')

      await admin.from('data_exports').update({
        status: 'ready',
        file_path: path,
        expires_at: expiresAt.toISOString(),
      }).eq('id', job.id)

      await notifyUser({
        recipientId: user.id,
        orgId,
        category: 'system',
        title: 'Your data export is ready',
        body: `Download your full account export — this link expires in ${EXPIRY_HOURS} hours.`,
        link: signed.signedUrl,
      })
    } catch (err) {
      console.error('export/all: generation failed for job', job.id, err)
      await admin.from('data_exports').update({
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      }).eq('id', job.id)
      await notifyUser({
        recipientId: user.id,
        orgId,
        category: 'system',
        title: 'Data export failed',
        body: 'Something went wrong generating your export. Please try again or contact support@gettrueflow.com.',
      })
    }
  })

  return NextResponse.json({ success: true, jobId: job.id })
}
