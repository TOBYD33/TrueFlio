'use client'
// reminders/page.tsx
// View, add, edit, archive/restore, stop-recurring, and permanently delete
// reminders — sorted by due date, overdue first.
//
// archived_at is deliberately separate from `status` (which drives whether
// bot/src/reminder-service.ts's fireDueReminders actually fires a
// reminder) — archiving hides a reminder from the Active view without
// stopping a recurring reminder from firing on schedule. See
// bot/sql/step18-reminder-lifecycle.sql for the full reasoning.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Reminder } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { Plus, Bell, Archive, RotateCcw, Trash2, Pencil, CalendarX } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fetchLivePlanConfig } from '@/lib/plans-client'

const RECURRENCE_OPTIONS = [
  { value: 'once', label: 'One time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

const CATEGORIES = [
  { value: 'tax', label: 'Tax' },
  { value: 'salary', label: 'Salary' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'bill', label: 'Bill' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'project_deadline', label: 'Project deadline' },
  { value: 'custom', label: 'Custom' },
]

const CATEGORY_COLORS: Record<string, string> = {
  tax: 'bg-red-100 text-red-700',
  salary: 'bg-[#6C63FF]/10 text-[#6C63FF]',
  supplier: 'bg-orange-100 text-orange-700',
  bill: 'bg-yellow-100 text-yellow-700',
  compliance: 'bg-[#6C63FF]/10 text-[#6C63FF]',
  project_deadline: 'bg-[#6C63FF]/10 text-indigo-700',
  custom: 'bg-gray-100 text-gray-600',
}

function isOverdue(due: string) {
  return new Date(due) < new Date(new Date().toDateString())
}

function isDueToday(due: string) {
  return new Date(due).toDateString() === new Date().toDateString()
}

const emptyForm = { title: '', due_date: '', recurrence: 'once', category: 'custom' }

export default function RemindersPage() {
  const supabase = createClient()

  const { orgId } = useViewingContext()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [archived, setArchived] = useState<Reminder[]>([])
  const [tab, setTab] = useState<'active' | 'archive'>('active')
  const [plan, setPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Reminder | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [confirmDelete, setConfirmDelete] = useState<Reminder | null>(null)
  const [confirmStop, setConfirmStop] = useState<Reminder | null>(null)

  async function load() {
    if (!orgId) return
    const [{ data: activeRows }, { data: archivedRows }, { data: org }] = await Promise.all([
      supabase.from('reminders').select('*').eq('org_id', orgId).eq('status', 'active').is('archived_at', null).order('due_date', { ascending: true }),
      supabase.from('reminders').select('*').eq('org_id', orgId).not('archived_at', 'is', null).order('archived_at', { ascending: false }),
      supabase.from('organizations').select('plan').eq('id', orgId).single(),
    ])
    setReminders((activeRows as Reminder[]) ?? [])
    setArchived((archivedRows as Reminder[]) ?? [])
    setPlan(org?.plan ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(r: Reminder) {
    setEditing(r)
    setForm({ title: r.title, due_date: r.due_date, recurrence: r.recurrence, category: r.category })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!orgId || !form.title.trim() || !form.due_date) return
    if (!editing && !(await fetchLivePlanConfig(plan)).automatedReminder) {
      toast.error('Automated reminders aren\'t available on the Free plan. Upgrade to unlock them.')
      return
    }
    setSaving(true)
    if (editing) {
      const { error } = await supabase.from('reminders').update({
        title: form.title,
        due_date: form.due_date,
        recurrence: form.recurrence,
        category: form.category,
      }).eq('id', editing.id)
      setSaving(false)
      if (error) { toast.error(error.message); return }
      toast.success('Reminder updated')
    } else {
      const { error } = await supabase.from('reminders').insert({
        org_id: orgId,
        title: form.title,
        due_date: form.due_date,
        recurrence: form.recurrence,
        category: form.category,
      })
      setSaving(false)
      if (error) { toast.error(error.message); return }
      toast.success('Reminder added')
    }
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
    await load()
  }

  // Archives ONE occurrence — for a recurring reminder this only hides it
  // until it next fires and its due_date rolls forward (handled entirely
  // server-side in reminder-service.ts), it does NOT end the series.
  async function archiveReminder(id: string) {
    const { error } = await supabase.from('reminders').update({ archived_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Reminder archived')
    await load()
  }

  async function restoreReminder(id: string) {
    const { error } = await supabase.from('reminders').update({ archived_at: null }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Reminder restored')
    await load()
  }

  async function deletePermanently(r: Reminder) {
    const { error } = await supabase.from('reminders').delete().eq('id', r.id)
    setConfirmDelete(null)
    if (error) { toast.error(error.message); return }
    toast.success('Reminder permanently deleted')
    await load()
  }

  // Distinct from Archive — ends the recurring series itself rather than
  // just hiding the next occurrence. Sets recurrence to 'once' so it fires
  // (or not, if also archived) exactly one more time and then terminates,
  // instead of rolling forward forever.
  async function stopRecurring(r: Reminder) {
    const { error } = await supabase.from('reminders').update({ recurrence: 'once' }).eq('id', r.id)
    setConfirmStop(null)
    if (error) { toast.error(error.message); return }
    toast.success('Recurring reminder stopped — won\'t repeat again')
    await load()
  }

  const overdue = reminders.filter(r => isOverdue(r.due_date))
  const upcoming = reminders.filter(r => !isOverdue(r.due_date))

  function ActiveRow({ r }: { r: Reminder }) {
    const overdue = isOverdue(r.due_date)
    const today = isDueToday(r.due_date)
    return (
      <div className={cn('flex items-start gap-3 px-4 py-4', overdue && 'bg-red-50')}>
        <Bell size={16} className={cn('mt-0.5 shrink-0', overdue ? 'text-red-400' : today ? 'text-amber-400' : 'text-gray-300')} />
        <div className="flex-1 min-w-0">
          <p className={cn('font-medium', overdue ? 'text-red-700' : 'text-gray-900')}>{r.title}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
            <span className={cn('text-xs', overdue ? 'text-red-500 font-semibold' : today ? 'text-amber-600 font-semibold' : 'text-gray-400')}>
              {today ? 'Due today' : overdue ? `Overdue · ${formatDate(r.due_date)}` : formatDate(r.due_date)}
            </span>
            {r.recurrence !== 'once' && (
              <span className="text-xs text-gray-400">· {r.recurrence}</span>
            )}
            <Badge variant="outline" className={cn('text-xs sm:hidden', CATEGORY_COLORS[r.category] ?? 'bg-gray-100 text-gray-500')}>
              {CATEGORIES.find(c => c.value === r.category)?.label ?? r.category}
            </Badge>
          </div>
        </div>
        <Badge variant="outline" className={cn('hidden sm:inline-flex shrink-0', CATEGORY_COLORS[r.category] ?? 'bg-gray-100 text-gray-500')}>
          {CATEGORIES.find(c => c.value === r.category)?.label ?? r.category}
        </Badge>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-[#6C63FF]" title="Edit">
            <Pencil size={15} />
          </button>
          {r.recurrence !== 'once' && (
            <button onClick={() => setConfirmStop(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-amber-600" title="Stop this recurring reminder">
              <CalendarX size={15} />
            </button>
          )}
          <button onClick={() => archiveReminder(r.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-[#00A88A]" title="Archive">
            <Archive size={15} />
          </button>
          <button onClick={() => setConfirmDelete(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500" title="Delete permanently">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    )
  }

  function ArchiveRow({ r }: { r: Reminder }) {
    return (
      <div className="flex items-start gap-3 px-4 py-4">
        <Archive size={16} className="mt-0.5 shrink-0 text-gray-300" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-500">{r.title}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
            <span className="text-xs text-gray-400">{formatDate(r.due_date)}</span>
            {r.recurrence !== 'once' && <span className="text-xs text-gray-400">· {r.recurrence}</span>}
          </div>
        </div>
        <Badge variant="outline" className={cn('hidden sm:inline-flex shrink-0', CATEGORY_COLORS[r.category] ?? 'bg-gray-100 text-gray-500')}>
          {CATEGORIES.find(c => c.value === r.category)?.label ?? r.category}
        </Badge>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => restoreReminder(r.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-[#6C63FF]" title="Restore">
            <RotateCcw size={15} />
          </button>
          <button onClick={() => setConfirmDelete(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500" title="Delete permanently">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reminders</h1>
          <p className="text-sm text-gray-500 mt-0.5">{reminders.length} active</p>
        </div>
        <Button className="bg-[#6C63FF] hover:bg-[#5A52E0] gap-2" onClick={openAdd}>
          <Plus size={16} /> Add Reminder
        </Button>
      </div>

      <div className="flex gap-2">
        {(['active', 'archive'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'text-sm px-3 py-1.5 rounded-lg border capitalize',
              tab === t ? 'bg-[#6C63FF] border-[#6C63FF] text-white' : 'border-gray-200 text-gray-500'
            )}
          >
            {t === 'active' ? 'Active' : `Archive${archived.length > 0 ? ` (${archived.length})` : ''}`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-sm text-gray-400">Loading…</div>
      ) : tab === 'active' ? (
        reminders.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-gray-400">
              No active reminders. Add one above, or say "Remind me to pay rent on the 1st" on WhatsApp.
            </CardContent>
          </Card>
        ) : (
          <>
            {overdue.length > 0 && (
              <Card className="border-red-200">
                <div className="px-5 py-3 border-b border-red-100 bg-red-50">
                  <p className="text-sm font-semibold text-red-700">{overdue.length} Overdue</p>
                </div>
                <CardContent className="p-0 divide-y divide-red-100">
                  {overdue.map(r => <ActiveRow key={r.id} r={r} />)}
                </CardContent>
              </Card>
            )}
            {upcoming.length > 0 && (
              <Card>
                <CardContent className="p-0 divide-y divide-gray-100">
                  {upcoming.map(r => <ActiveRow key={r.id} r={r} />)}
                </CardContent>
              </Card>
            )}
          </>
        )
      ) : archived.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-gray-400">
            No archived reminders.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-gray-100">
            {archived.map(r => <ArchiveRow key={r.id} r={r} />)}
          </CardContent>
        </Card>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Reminder' : 'Add Reminder'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Title *</label>
              <Input className="mt-1" placeholder="Pay PAYE to FIRS" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Due date *</label>
                <Input type="date" className="mt-1" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Repeats</label>
                <Select value={form.recurrence} onValueChange={v => v && setForm(f => ({ ...f, recurrence: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Category</label>
              <Select value={form.category} onValueChange={v => v && setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setModalOpen(false); setEditing(null) }}>Cancel</Button>
              <Button
                className="flex-1 bg-[#6C63FF] hover:bg-[#5A52E0]"
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.due_date}
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Reminder'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={open => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete permanently?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">
            "{confirmDelete?.title}" will be permanently deleted. This cannot be undone.
          </p>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={() => confirmDelete && deletePermanently(confirmDelete)}>
              Delete Permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmStop} onOpenChange={open => !open && setConfirmStop(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Stop this recurring reminder?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">
            "{confirmStop?.title}" will stop repeating after its next occurrence. This is different from Archive,
            which only hides the next occurrence but keeps the series going.
          </p>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmStop(null)}>Cancel</Button>
            <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={() => confirmStop && stopRecurring(confirmStop)}>
              Stop Recurring
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
