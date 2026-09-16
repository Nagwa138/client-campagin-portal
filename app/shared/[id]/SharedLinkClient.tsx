'use client'

import { useState } from 'react'

type Phase = 'password' | 'loading' | 'ready' | 'error'

type SendRow = { recipient_count: number | null; status: string | null }

type CampaignData = {
  name: string
  status: string | null
  created_at: string
  campaign_sends: SendRow[] | null
}

export default function SharedLinkClient({ linkId }: { linkId: string }) {
  const [phase, setPhase] = useState<Phase>('password')
  const [password, setPassword] = useState('')
  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPhase('loading')

    try {
      const res = await fetch(`/api/shared-links/${linkId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const json = await res.json()

      if (!res.ok) {
        setErrorMsg(json.error ?? 'Incorrect password or invalid link.')
        setPhase('error')
        return
      }

      setCampaign(json.campaign)
      setPhase('ready')
    } catch {
      setErrorMsg('Something went wrong. Please try again.')
      setPhase('error')
    }
  }

  if (phase === 'password' || phase === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-4">
        <div className="w-full max-w-[360px] rounded-2xl border border-[#d2d2d7] bg-white p-8">
          <div className="mb-6">
            <h1 className="text-[22px] font-bold text-[#1d1d1f] tracking-tight">Campaign Report</h1>
            <p className="mt-1 text-[15px] text-[#6e6e73]">Enter the password to view this report.</p>
          </div>

          {phase === 'error' && (
            <div className="mb-4 rounded-xl bg-[#fff0f0] px-4 py-3 text-sm text-[#e0352b]">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[#d2d2d7] bg-white px-3.5 py-2.5 text-[15px] text-[#1d1d1f] placeholder:text-[#6e6e73] focus:border-[#0071e3] focus:outline-none focus:ring-3 focus:ring-[#0071e3]/20 transition"
              placeholder="Password"
              autoFocus
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-[#0071e3] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-[#0077ed] transition-colors"
            >
              View report
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-[#6e6e73]">
        <svg className="h-5 w-5 animate-spin text-[#0071e3]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-[15px]">Verifying…</span>
      </div>
    )
  }

  if (!campaign) return null

  const send = campaign.campaign_sends?.[0] ?? null

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#6e6e73]">
          Shared Campaign Report — read only
        </p>
        <h1 className="mb-6 text-[28px] font-bold text-[#1d1d1f] tracking-tight">{campaign.name}</h1>

        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-[#d2d2d7] bg-white p-6 sm:grid-cols-3">
          <Stat label="Status" value={campaign.status ?? '—'} />
          <Stat
            label="Recipients"
            value={send?.recipient_count != null ? send.recipient_count.toLocaleString('en-US') : '—'}
          />
          <Stat label="Send status" value={send?.status ?? '—'} />
        </div>

        <p className="mt-4 text-[12px] text-[#6e6e73]">
          Campaign date: {new Date(campaign.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#6e6e73]">{label}</dt>
      <dd className="mt-1 text-[24px] font-bold tabular-nums text-[#1d1d1f] capitalize">{value}</dd>
    </div>
  )
}
