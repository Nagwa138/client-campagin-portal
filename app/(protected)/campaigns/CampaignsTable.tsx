'use client'

import { useState } from 'react'

type Campaign = {
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

type ShareState =
  | { phase: 'idle' }
  | { phase: 'form';    campaignId: string; campaignName: string }
  | { phase: 'loading'; campaignId: string; campaignName: string }
  | { phase: 'done';    campaignName: string; url: string; password: string }
  | { phase: 'error';   campaignId: string; campaignName: string; message: string }

type StatusKey = 'sent' | 'sending' | 'failed' | 'draft'

const STATUS_CONFIG: Record<StatusKey, { style: string; icon: React.ReactNode }> = {
  sent: {
    style: 'bg-[#e9f9ef] text-[#1a9e4e]',
    icon: (
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ),
  },
  sending: {
    style: 'bg-[#eef2ff] text-[#6366f1]',
    icon: (
      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    ),
  },
  failed: {
    style: 'bg-[#fff0f0] text-[#e0352b]',
    icon: (
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
  draft: {
    style: 'bg-[#f8fafc] text-[#64748b]',
    icon: (
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
      </svg>
    ),
  },
}

const COLUMN_HEADERS: { label: string; icon: React.ReactNode }[] = [
  {
    label: 'Campaign',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
  },
  {
    label: 'Status',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: 'Sent',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    label: 'Delivered',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
      </svg>
    ),
  },
  {
    label: 'Open rate',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: 'Click rate',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" />
      </svg>
    ),
  },
  {
    label: 'Date',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
]

export default function CampaignsTable({
  campaigns,
  isOwner,
}: {
  campaigns: Campaign[]
  isOwner: boolean
}) {
  const [share, setShare] = useState<ShareState>({ phase: 'idle' })
  const [password, setPassword] = useState('')

  function openShare(campaignId: string, campaignName: string) {
    setPassword('')
    setShare({ phase: 'form', campaignId, campaignName })
  }

  function closeShare() {
    setShare({ phase: 'idle' })
    setPassword('')
  }

  async function handleCreateLink() {
    if (share.phase !== 'form' && share.phase !== 'error') return
    if (password.length < 6) return

    const { campaignId, campaignName } = share
    setShare({ phase: 'loading', campaignId, campaignName })

    const res = await fetch('/api/shared-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId, password }),
    })
    const json = await res.json()

    if (!res.ok) {
      setShare({ phase: 'error', campaignId, campaignName, message: json.error ?? 'Failed to create link.' })
      return
    }

    setShare({ phase: 'done', campaignName, url: json.url, password })
    setPassword('')
  }

  const modalOpen = share.phase !== 'idle'

  return (
    <>
      <div className="rounded-2xl border border-[#e2e8f0] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#f8fafc] text-sm">
            <thead className="bg-[#f8fafc]">
              <tr>
                {COLUMN_HEADERS.map(({ label, icon }) => (
                  <th key={label} className="px-6 py-3 text-left">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">
                      {icon}
                      {label}
                    </span>
                  </th>
                ))}
                {isOwner && <th className="px-6 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f8fafc]">
              {campaigns.map((c) => {
                const send = Array.isArray(c.campaign_sends) ? c.campaign_sends[0] : null
                const statusKey = (c.status ?? 'draft') as StatusKey
                const { style, icon } = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.draft
                const sentCount = c.reported_sent ?? send?.recipient_count ?? null
                return (
                  <tr key={c.id} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="px-6 py-3.5 font-medium text-[#0f172a] max-w-[180px] truncate">{c.name}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${style}`}>
                        {icon}
                        {c.status ?? 'draft'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 tabular-nums text-[#64748b]">
                      {sentCount != null ? sentCount.toLocaleString('en-US') : '—'}
                    </td>
                    <td className="px-6 py-3.5 tabular-nums text-[#64748b]">
                      <span>{c.reported_delivered != null ? c.reported_delivered.toLocaleString('en-US') : '—'}</span>
                      {c.reported_delivered != null && sentCount != null && (
                        <span className="ml-1.5 text-[11px]">
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
                    {isOwner && (
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => openShare(c.id, c.name)}
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-[#6366f1] hover:text-[#4f46e5] transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                          </svg>
                          Share
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Share modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && closeShare()}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#f8fafc]">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eef2ff]">
                  <svg className="h-4 w-4 text-[#6366f1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                </span>
                <h2 className="text-[17px] font-semibold text-[#0f172a]">Share Campaign Results</h2>
              </div>
              <button
                onClick={closeShare}
                className="rounded-lg p-1.5 text-[#64748b] hover:bg-[#f8fafc] transition-colors"
                aria-label="Close"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5">
              {(share.phase === 'form' || share.phase === 'error') && (
                <div className="space-y-4">
                  <p className="text-[13px] text-[#64748b]">
                    Create a password-protected link for{' '}
                    <strong className="text-[#0f172a]">{share.campaignName}</strong>.
                    The recipient will need the password to view the report.
                  </p>

                  {share.phase === 'error' && (
                    <div className="flex items-start gap-2 rounded-xl bg-[#fff0f0] border border-red-100 px-4 py-3 text-sm text-[#e0352b]">
                      <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {share.message}
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-[#0f172a]">
                      <svg className="h-3.5 w-3.5 text-[#64748b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                      Password
                    </label>
                    <input
                      type="password"
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateLink()}
                      placeholder="Min. 6 characters"
                      className="w-full rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-2.5 text-[15px] text-[#0f172a] placeholder:text-[#64748b] focus:border-[#6366f1] focus:outline-none focus:ring-3 focus:ring-[#6366f1]/20 transition"
                    />
                  </div>

                  <button
                    onClick={handleCreateLink}
                    disabled={password.length < 6}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6366f1] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-[#4f46e5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                    Create link
                  </button>
                </div>
              )}

              {share.phase === 'loading' && (
                <div className="flex items-center justify-center gap-3 py-8 text-[#64748b]">
                  <svg className="h-5 w-5 animate-spin text-[#6366f1]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span className="text-[15px]">Creating link…</span>
                </div>
              )}

              {share.phase === 'done' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 rounded-xl bg-[#e9f9ef] border border-[#bbf7d0] px-4 py-3">
                    <svg className="h-4 w-4 shrink-0 text-[#1a9e4e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-[13px] text-[#166534]">
                      Link created for <strong>{share.campaignName}</strong>. Share the link and password together — the password is shown once.
                    </p>
                  </div>

                  <CopyField label="Link" value={share.url} />
                  <CopyField label="Password" value={share.password} />

                  <button
                    onClick={closeShare}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e2e8f0] px-4 py-2.5 text-[15px] font-medium text-[#0f172a] hover:bg-[#f8fafc] transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] pl-3.5 pr-2.5 py-2.5">
        <span className="flex-1 truncate font-mono text-[13px] text-[#0f172a]">{value}</span>
        <button
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-white border border-[#e2e8f0] px-2.5 py-1 text-[12px] font-semibold text-[#6366f1] hover:bg-[#f8fafc] transition-colors"
        >
          {copied ? (
            <>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  )
}
