import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ErrorBanner from '@/components/ErrorBanner'
import EmptyState from '@/components/EmptyState'
import Link from 'next/link'
import CampaignsTable from './CampaignsTable'

export default async function CampaignsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, name, status, created_at, reported_sent, reported_delivered, reported_opens, reported_clicks, campaign_sends(recipient_count, status)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold text-[#0f172a] tracking-tight">Campaigns</h1>
          <p className="mt-0.5 text-[15px] text-[#64748b]">All campaigns for your brand</p>
        </div>
        {profile.role === 'owner' && (
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#c7d2fe] bg-[#eef2ff] px-4 py-2 text-[15px] font-medium text-[#4f46e5] hover:bg-[#e0e7ff] hover:border-[#a5b4fc] transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Campaign
          </Link>
        )}
      </div>

      {error ? (
        <ErrorBanner title="Failed to load campaigns" detail={error.message} />
      ) : !campaigns || campaigns.length === 0 ? (
        <EmptyState message="No campaigns yet." />
      ) : (
        <CampaignsTable campaigns={campaigns} isOwner={profile.role === 'owner'} />
      )}
    </div>
  )
}
