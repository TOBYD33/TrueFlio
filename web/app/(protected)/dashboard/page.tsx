'use client'
// dashboard/page.tsx
// Main dashboard — the approved concept design on live data:
// stat row (spent, receipts, outstanding, reminders), spending donut,
// recent activity feed, income vs expenses, budget gauge, client balance
// bars, Tello promo, team leaderboard. Realtime receipt updates preserved.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { Receipt } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { ThemedCard, ThemedStatCard, PageHeader } from '@/components/shared/Cards'
import {
  SpendDonut,
  IncomeExpenseLines,
  BudgetGauge,
  ClientBalanceBars,
  TelloPromoCard,
  TeamLeaderboard,
  ActivityFeed,
  LeaderboardMember,
  ActivityItem,
} from '@/components/shared/DashboardWidgets'
import { useTheme, tone } from '@/components/shared/theme'
import { Button } from '@/components/ui/button'
import { Wallet, Receipt as ReceiptIcon, UserCircle2, Bell, Upload } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface ReceiptRow {
  amount: number
  date: string
  category: string
  uploaded_by: string | null
  vendor_name: string | null
  uploaded_via: string | null
  created_at: string
}

export default function DashboardPage() {
  const supabase = createClient()
  const { orgId } = useViewingContext()
  const { dark } = useTheme()
  const t = tone(dark)

  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [payments, setPayments] = useState<{ amount: number; payment_date: string }[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [budgetTotal, setBudgetTotal] = useState(0)
  const [clients, setClients] = useState<{ name: string; balance: number }[]>([])
  const [outstandingTotal, setOutstandingTotal] = useState(0)
  const [activeReminders, setActiveReminders] = useState(0)
  const [members, setMembers] = useState<LeaderboardMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const since = new Date()
      since.setMonth(since.getMonth() - 6)
      const sinceStr = since.toISOString().split('T')[0]
      const now = new Date()

      const [receiptsRes, paymentsRes, budgetsRes, clientsRes, remindersRes, membersRes] = await Promise.all([
        supabase.from('receipts').select('amount, date, category, uploaded_by, vendor_name, uploaded_via, created_at').eq('org_id', orgId).gte('date', sinceStr),
        supabase.from('client_payments').select('amount, payment_date, created_at, notes, clients(name)').eq('org_id', orgId).gte('payment_date', sinceStr),
        supabase.from('budgets').select('amount, month, year').eq('org_id', orgId),
        supabase.from('clients').select('name, outstanding_balance').eq('org_id', orgId).eq('status', 'active').order('outstanding_balance', { ascending: false }),
        supabase.from('reminders').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active').is('archived_at', null),
        supabase.from('org_members').select('role, user_id, profiles(full_name)').eq('org_id', orgId),
      ])

      const receiptRows = (receiptsRes.data ?? []) as ReceiptRow[]
      setReceipts(receiptRows)

      const paymentRows = ((paymentsRes.data ?? []) as unknown) as {
        amount: number
        payment_date: string
        created_at: string
        notes: string | null
        clients: { name: string } | { name: string }[] | null
      }[]
      setPayments(paymentRows)

      // Merged money in/out activity feed, newest first
      const activityIn: ActivityItem[] = paymentRows.map(p => {
        const client = Array.isArray(p.clients) ? p.clients[0] : p.clients
        return {
          direction: 'in',
          title: client?.name ? `${client.name}${p.notes ? ` · ${p.notes}` : ''}` : 'Client payment',
          subtitle: 'Payment received',
          channel: 'transfer',
          amount: Number(p.amount),
          createdAt: p.created_at,
        }
      })
      const activityOut: ActivityItem[] = receiptRows.map(r => ({
        direction: 'out',
        title: `${r.vendor_name ?? 'Receipt'} · ${r.category}`,
        subtitle: r.uploaded_via === 'whatsapp' ? 'Receipt forwarded' : 'Receipt scanned',
        channel: (r.uploaded_via === 'whatsapp' || r.uploaded_via === 'mobile' ? r.uploaded_via : 'web') as ActivityItem['channel'],
        amount: Number(r.amount),
        createdAt: r.created_at,
      }))
      setActivity(
        [...activityIn, ...activityOut]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 6)
      )

      const budgets = (budgetsRes.data ?? []) as { amount: number; month: number | null; year: number | null }[]
      const monthBudgets = budgets.filter(
        b => (b.month === now.getMonth() + 1 && b.year === now.getFullYear()) || b.month == null
      )
      setBudgetTotal(monthBudgets.reduce((s, b) => s + Number(b.amount), 0))

      const clientRows = ((clientsRes.data ?? []) as { name: string; outstanding_balance: number }[])
        .map(c => ({ name: c.name, balance: Number(c.outstanding_balance) }))
      setOutstandingTotal(clientRows.reduce((s, c) => s + c.balance, 0))
      setClients(clientRows.filter(c => c.balance > 0).slice(0, 5))

      setActiveReminders(remindersRes.count ?? 0)

      const memberRows = ((membersRes.data ?? []) as unknown) as { role: string; user_id: string; profiles: { full_name: string | null } | { full_name: string | null }[] | null }[]
      const totalLogged = receiptRows.reduce((s, r) => s + Number(r.amount), 0)
      const board: LeaderboardMember[] = memberRows.map(m => {
        const mine = receiptRows.filter(r => r.uploaded_by === m.user_id)
        const mineTotal = mine.reduce((s, r) => s + Number(r.amount), 0)
        const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
        return {
          name: profile?.full_name ?? 'Member',
          role: m.role,
          receipts: mine.length,
          total: mineTotal,
          sharePct: totalLogged > 0 ? Math.round((mineTotal / totalLogged) * 100) : 0,
        }
      })
      board.sort((a, b) => b.total - a.total)
      setMembers(board.slice(0, 4))

      setLoading(false)
    }
    load()
  }, [orgId])

  // Real-time: new receipt scanned via WhatsApp appears instantly
  useEffect(() => {
    if (!orgId) return
    const channel = supabase
      .channel(`receipts:${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'receipts', filter: `org_id=eq.${orgId}` },
        payload => {
          const receipt = payload.new as Receipt
          setReceipts(prev => [{
            amount: Number(receipt.amount),
            date: receipt.date,
            category: receipt.category,
            uploaded_by: receipt.uploaded_by ?? null,
            vendor_name: receipt.vendor_name ?? null,
            uploaded_via: receipt.uploaded_via,
            created_at: receipt.created_at,
          }, ...prev])
          toast.success(`New receipt via WhatsApp — ${formatCurrency(receipt.amount)} ${receipt.category}`)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orgId])

  // ── Derived metrics ──────────────────────────────────────────────────
  const now = new Date()
  const inMonth = (dateStr: string, monthOffset = 0) => {
    const d = new Date(dateStr)
    const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    return d.getMonth() === target.getMonth() && d.getFullYear() === target.getFullYear()
  }

  const spentThisMonth = receipts.filter(r => inMonth(r.date)).reduce((s, r) => s + Number(r.amount), 0)
  const spentLastMonth = receipts.filter(r => inMonth(r.date, -1)).reduce((s, r) => s + Number(r.amount), 0)
  const receiptsThisMonth = receipts.filter(r => inMonth(r.date)).length
  const receiptsLastMonth = receipts.filter(r => inMonth(r.date, -1)).length

  const pctChange = (cur: number, prev: number): number | null =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { m: d.getMonth(), y: d.getFullYear(), label: d.toLocaleString('default', { month: 'short' }) }
  })

  const donutData = Object.entries(
    receipts.filter(r => inMonth(r.date)).reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + Number(r.amount)
      return acc
    }, {})
  ).map(([category, total]) => ({ category, total }))
  const monthLabel = now.toLocaleString('default', { month: 'long' })

  const lineData = months.map(({ m, y, label }) => {
    const expenses = receipts.filter(r => { const d = new Date(r.date); return d.getMonth() === m && d.getFullYear() === y }).reduce((s, r) => s + Number(r.amount), 0)
    const income = payments.filter(p => { const d = new Date(p.payment_date); return d.getMonth() === m && d.getFullYear() === y }).reduce((s, p) => s + Number(p.amount), 0)
    return { month: label, income, expenses }
  })

  const budgetPctUsed = budgetTotal > 0 ? (spentThisMonth / budgetTotal) * 100 : 0

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={now.toLocaleString('en-NG', { month: 'long', year: 'numeric' })}
        action={
          <Link href="/receipts">
            <Button className="bg-[#6C63FF] hover:bg-[#5A52E0] gap-2">
              <Upload size={16} /> Upload Receipt
            </Button>
          </Link>
        }
      />

      {loading ? (
        <div className="h-64 flex items-center justify-center text-sm" style={{ color: t.textDim }}>
          Loading dashboard…
        </div>
      ) : (
        <div className="space-y-5">
          {/* Top stat row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <ThemedStatCard
              label="Total Spent This Month"
              value={formatCurrency(spentThisMonth)}
              change={pctChange(spentThisMonth, spentLastMonth)}
              icon={<Wallet size={17} />}
            />
            <ThemedStatCard
              label="Receipts Scanned"
              value={String(receiptsThisMonth)}
              change={pctChange(receiptsThisMonth, receiptsLastMonth)}
              icon={<ReceiptIcon size={17} />}
            />
            <ThemedStatCard
              label="Outstanding Client Balance"
              value={formatCurrency(outstandingTotal)}
              change={null}
              icon={<UserCircle2 size={17} />}
            />
            <ThemedStatCard
              label="Active Reminders"
              value={String(activeReminders)}
              change={null}
              icon={<Bell size={17} />}
            />
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <ThemedCard title="Spending by Category" className="lg:col-span-2">
                  <SpendDonut data={donutData} monthLabel={monthLabel} />
                </ThemedCard>
                <ThemedCard
                  title="Recent Activity"
                  className="lg:col-span-3"
                  action={<span className="text-xs" style={{ color: t.textDim }}>money in &amp; out · all channels</span>}
                >
                  <ActivityFeed items={activity} />
                </ThemedCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ThemedCard title="Income vs Expenses">
                  <IncomeExpenseLines data={lineData} />
                </ThemedCard>
                <ThemedCard title="Budget Health">
                  {budgetTotal > 0 ? (
                    <BudgetGauge pctUsed={budgetPctUsed} target={budgetTotal} />
                  ) : (
                    <div className="h-48 flex flex-col items-center justify-center gap-1 text-sm" style={{ color: t.textDim }}>
                      <p>No budgets set for this month.</p>
                      <Link href="/budgets" className="text-xs" style={{ color: '#6C63FF' }}>
                        Set one in Budgets to activate this gauge →
                      </Link>
                    </div>
                  )}
                </ThemedCard>
              </div>

              <ThemedCard title="Top Clients by Outstanding Balance">
                <ClientBalanceBars clients={clients} />
              </ThemedCard>
            </div>

            <div className="space-y-5">
              <TelloPromoCard />
              <ThemedCard
                title="Team Leaderboard"
                action={
                  <Link href="/team" className="text-xs font-medium" style={{ color: '#6C63FF' }}>
                    View All
                  </Link>
                }
              >
                <TeamLeaderboard members={members} />
              </ThemedCard>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
