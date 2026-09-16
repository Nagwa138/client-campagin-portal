'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Phase = 'form' | 'preview' | 'sending' | 'done' | 'error'

type SendResult = {
  campaignId: string
  sendId: string
  status: string
  providerBatchId: string | null
  recipientCount: number
}

export default function NewCampaignForm() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('form')
  const [name, setName] = useState('')
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [result, setResult] = useState<SendResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const res = await fetch('/api/campaigns/preview', { method: 'POST' })
    const json = await res.json()
    if (!res.ok) { setErrorMsg(json.error ?? 'Failed to compute preview.'); return }
    setRecipientCount(json.contactable_count)
    setPhase('preview')
  }

  async function handleConfirmSend() {
    setPhase('sending')
    setErrorMsg(null)

    const createRes = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const createJson = await createRes.json()
    if (!createRes.ok) { setErrorMsg(createJson.error ?? 'Failed to create campaign.'); setPhase('error'); return }

    const campaignId: string = createJson.id

    const sendRes = await fetch(`/api/campaigns/${campaignId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    })
    const sendJson = await sendRes.json()
    if (!sendRes.ok) { setErrorMsg(sendJson.error ?? 'Failed to send campaign.'); setPhase('error'); return }

    setResult({
      campaignId,
      sendId: sendJson.id,
      status: sendJson.status,
      providerBatchId: sendJson.provider_batch_id ?? null,
      recipientCount: sendJson.recipient_count ?? recipientCount ?? 0,
    })
    setPhase('done')
  }

  if (phase === 'done' && result) {
    return (
      <div className="rounded-2xl border border-[#e2e8f0] bg-white p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e9f9ef]">
            <svg className="h-5 w-5 text-[#1a9e4e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-[#0f172a]">Campaign Launched</h2>
            <p className="text-[13px] text-[#64748b]">Your campaign is on its way</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#f8fafc] px-4 py-3">
            <p className="text-[11px] font-medium text-[#64748b] uppercase tracking-wide">Status</p>
            <p className="mt-0.5 font-semibold text-[#0f172a] capitalize">{result.status}</p>
          </div>
          <div className="rounded-xl bg-[#f8fafc] px-4 py-3">
            <p className="text-[11px] font-medium text-[#64748b] uppercase tracking-wide">Recipients</p>
            <p className="mt-0.5 font-semibold text-[#0f172a]">{result.recipientCount.toLocaleString('en-US')}</p>
          </div>
          {result.providerBatchId && (
            <div className="col-span-2 rounded-xl bg-[#f8fafc] px-4 py-3">
              <p className="text-[11px] font-medium text-[#64748b] uppercase tracking-wide">Batch ID</p>
              <p className="mt-0.5 font-mono text-[12px] text-[#0f172a]">{result.providerBatchId}</p>
            </div>
          )}
        </div>

        <button
          onClick={() => router.push('/campaigns')}
          className="w-full rounded-xl border border-[#e2e8f0] px-4 py-2.5 text-[15px] font-medium text-[#0f172a] hover:bg-[#f8fafc] transition-colors"
        >
          View All Campaigns →
        </button>
      </div>
    )
  }

  if (phase === 'preview') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#e2e8f0] bg-white p-6">
          <p className="text-[11px] font-semibold text-[#6366f1] uppercase tracking-widest">Ready to send</p>
          <p className="mt-3 text-[52px] font-bold tabular-nums tracking-tight text-[#0f172a]">
            {recipientCount?.toLocaleString('en-US') ?? '…'}
          </p>
          <p className="mt-0.5 text-[15px] text-[#64748b]">contactable recipients</p>
          <div className="mt-4 rounded-xl bg-[#f8fafc] px-4 py-3 text-[15px]">
            <span className="font-medium text-[#0f172a]">Campaign: </span>
            <span className="text-[#64748b]">{name}</span>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-[#fff0f0] border border-red-100 px-4 py-3 text-sm text-[#e0352b]">{errorMsg}</div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setPhase('form')}
            className="flex-1 rounded-xl border border-[#e2e8f0] px-4 py-2.5 text-[15px] font-medium text-[#0f172a] hover:bg-[#f8fafc] transition-colors"
          >
            ← Edit
          </button>
          <button
            onClick={handleConfirmSend}
            disabled={recipientCount === 0}
            className="flex-1 rounded-xl bg-[#6366f1] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-[#4f46e5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {recipientCount === 0 ? 'No recipients' : 'Confirm & Send'}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'sending') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-[#64748b]">
        <svg className="h-8 w-8 animate-spin text-[#6366f1]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="text-[15px] font-medium">Launching campaign…</p>
      </div>
    )
  }

  return (
    <form onSubmit={handlePreview} className="space-y-5">
      {(phase === 'error' || errorMsg) && (
        <div className="rounded-xl bg-[#fff0f0] border border-red-100 px-4 py-3 text-sm text-[#e0352b]">
          {errorMsg ?? 'An error occurred.'}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-[#0f172a]">Campaign name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={255}
          className="w-full rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-2.5 text-[15px] text-[#0f172a] placeholder:text-[#64748b] focus:border-[#6366f1] focus:outline-none focus:ring-3 focus:ring-[#6366f1]/20 transition"
          placeholder="Summer Promo 2026"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-[#6366f1] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-[#4f46e5] transition-colors"
      >
        Preview audience →
      </button>
    </form>
  )
}
