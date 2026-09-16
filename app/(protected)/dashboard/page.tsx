import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ErrorBanner from '@/components/ErrorBanner'
import EmptyState from '@/components/EmptyState'

export default async function DashboardPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const [totalResult, contactableResult, signupsResult, campaignsResult] = await Promise.all([
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('contactable', true),
    supabase
      .from('customers')
      .select('signed_up_at')
      .not('signed_up_at', 'is', null)
      .gte('signed_up_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('campaigns')
      .select('id, name, status, created_at, reported_sent, reported_delivered, reported_opens, reported_clicks, campaign_sends(recipient_count, status)')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const dataErrors: string[] = []
  if (totalResult.error) dataErrors.push(`Customer count: ${totalResult.error.message}`)
  if (contactableResult.error) dataErrors.push(`Contactable count: ${contactableResult.error.message}`)
  if (signupsResult.error) dataErrors.push(`Signup chart: ${signupsResult.error.message}`)
  if (campaignsResult.error) dataErrors.push(`Campaign table: ${campaignsResult.error.message}`)

  const signupsByDay = groupSignupsByDay(signupsResult.data ?? [])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-bold text-[#0f172a] tracking-tight">
          {profile.brand_name ?? 'Dashboard'}
        </h1>
        <p className="mt-1 text-[15px] text-[#64748b]">
          {profile.email}
          {' · '}
          <span className="capitalize">{profile.role}</span>
        </p>
      </div>

      {dataErrors.map((err, i) => (
        <ErrorBanner key={i} title="Data failed to load" detail={err} />
      ))}

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          label="Total Contacts"
          value={totalResult.count}
          error={!!totalResult.error}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          }
          color="blue"
        />
        <KpiCard
          label="Contactable Now"
          value={contactableResult.count}
          error={!!contactableResult.error}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="green"
          sub="Active, consented, not suppressed"
        />
      </div>

      {/* Signups chart */}
      <section className="rounded-2xl border border-[#e2e8f0] bg-white p-6">
        <h2 className="mb-5 text-[17px] font-semibold text-[#0f172a]">New Signups — Last 30 Days</h2>
        {signupsResult.error ? (
          <ErrorBanner detail={signupsResult.error.message} />
        ) : signupsByDay.length === 0 ? (
          <EmptyState message="No signups in the last 30 days." />
        ) : (
          <SignupChart data={signupsByDay} />
        )}
      </section>

      {/* Campaigns table */}
      <section className="rounded-2xl border border-[#e2e8f0] bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f8fafc]">
          <h2 className="text-[17px] font-semibold text-[#0f172a]">Recent Campaigns</h2>
        </div>
        {campaignsResult.error ? (
          <div className="p-6"><ErrorBanner detail={campaignsResult.error.message} /></div>
        ) : !campaignsResult.data || campaignsResult.data.length === 0 ? (
          <div className="p-6"><EmptyState message="No campaigns found." /></div>
        ) : (
          <CampaignTable campaigns={campaignsResult.data} />
        )}
      </section>
    </div>
  )
}

function KpiCard({
  label, value, error, icon, color, sub,
}: {
  label: string
  value: number | null
  error: boolean
  icon: React.ReactNode
  color: 'blue' | 'green'
  sub?: string
}) {
  const iconBg = color === 'blue' ? 'bg-[#eef2ff] text-[#6366f1]' : 'bg-[#e9f9ef] text-[#1a9e4e]'
  const numColor = color === 'blue' ? 'text-[#6366f1]' : 'text-[#1a9e4e]'

  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-white p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium text-[#64748b]">{label}</p>
          {error ? (
            <p className="mt-1 text-sm text-red-500">Failed to load</p>
          ) : (
            <p className={`mt-1 text-[32px] font-bold tabular-nums tracking-tight ${numColor}`}>
              {value != null ? value.toLocaleString('en-US') : '—'}
            </p>
          )}
          {sub && <p className="mt-1 text-[12px] text-[#64748b]">{sub}</p>}
        </div>
        <span className={`rounded-xl p-2.5 ${iconBg}`}>{icon}</span>
      </div>
    </div>
  )
}

type DayBucket = { date: string; count: number }

function SignupChart({ data }: { data: DayBucket[] }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div>
      <div className="flex items-end gap-0.5 overflow-x-auto" style={{ height: 96 }}>
        {data.map((d) => (
          <div
            key={d.date}
            className="group relative flex flex-1 flex-col items-center justify-end"
            style={{ minWidth: 6 }}
          >
            <div
              className="w-full rounded-t bg-[#6366f1] group-hover:bg-[#4f46e5] transition-colors"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 2 : 0 }}
            />
            <div className="absolute bottom-full mb-2 hidden whitespace-nowrap rounded-lg bg-[#0f172a] px-2 py-1 text-xs text-white shadow-lg group-hover:block z-10">
              {d.date}: <strong>{d.count}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-[#64748b]">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  sent:     'bg-[#e9f9ef] text-[#1a9e4e]',
  sending:  'bg-[#eef2ff] text-[#6366f1]',
  failed:   'bg-[#fff0f0] text-[#e0352b]',
  draft:    'bg-[#f8fafc] text-[#64748b]',
}

type CampaignRow = {
  id: string
  name: string
  status: string | null
  created_at: string
  reported_sent:      number | null
  reported_delivered: number | null
  reported_opens:     number | null
  reported_clicks:    number | null
  campaign_sends: { recipient_count: number | null; status: string | null }[] | null
}

function pct(num: number | null, denom: number | null): string {
  if (!num || !denom || denom === 0) return '—'
  return (num / denom * 100).toFixed(1) + '%'
}

function CampaignTable({ campaigns }: { campaigns: CampaignRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-[#f8fafc] text-sm">
        <thead>
          <tr className="bg-[#f8fafc]">
            {['Campaign', 'Status', 'Sent', 'Delivered', 'Open rate', 'Click rate', 'Date'].map((h) => (
              <th
                key={h}
                className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#64748b]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc] bg-white">
          {campaigns.map((c) => {
            const send = Array.isArray(c.campaign_sends) ? c.campaign_sends[0] : null
            const statusStyle = STATUS_STYLES[c.status ?? 'draft'] ?? STATUS_STYLES.draft
            // Prefer historical reported_sent over campaign_sends.recipient_count
            const sentCount = c.reported_sent ?? send?.recipient_count ?? null
            return (
              <tr key={c.id} className="hover:bg-[#f8fafc] transition-colors">
                <td className="px-6 py-3.5 font-medium text-[#0f172a] max-w-[200px] truncate">{c.name}</td>
                <td className="px-6 py-3.5">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${statusStyle}`}>
                    {c.status ?? 'draft'}
                  </span>
                </td>
                <td className="px-6 py-3.5 tabular-nums text-[#64748b]">
                  {sentCount != null ? sentCount.toLocaleString('en-US') : '—'}
                </td>
                <td className="px-6 py-3.5 tabular-nums text-[#64748b]">
                  <span>{c.reported_delivered != null ? c.reported_delivered.toLocaleString('en-US') : '—'}</span>
                  {c.reported_delivered != null && sentCount != null && (
                    <span className="ml-1.5 text-[11px] text-[#64748b]">
                      ({pct(c.reported_delivered, sentCount)})
                    </span>
                  )}
                </td>
                <td className="px-6 py-3.5 tabular-nums text-[#64748b]">
                  {pct(c.reported_opens, c.reported_delivered)}
                </td>
                <td className="px-6 py-3.5 tabular-nums text-[#64748b]">
                  {pct(c.reported_clicks, c.reported_opens)}
                </td>
                <td className="px-6 py-3.5 text-[#64748b]">
                  {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function groupSignupsByDay(rows: { signed_up_at: string | null }[]): DayBucket[] {
  const counts: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    counts[toDateStr(new Date(Date.now() - i * 86400000))] = 0
  }
  for (const row of rows) {
    if (!row.signed_up_at) continue
    const day = toDateStr(new Date(row.signed_up_at))
    if (day in counts) counts[day]++
  }
  return Object.entries(counts).map(([date, count]) => ({ date, count }))
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}
