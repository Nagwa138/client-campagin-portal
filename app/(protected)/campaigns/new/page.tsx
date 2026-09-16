import { requireProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NewCampaignForm from './NewCampaignForm'

/**
 * Server component wrapper that enforces the owner-only rule before the
 * client form ever renders. An analyst navigating to /campaigns/new
 * is redirected to /campaigns rather than seeing a form they can't use.
 *
 * Even with this redirect, the API route (/api/campaigns/[id]/send) performs
 * its own role check. UI-level protection is never the real safeguard.
 */
export default async function NewCampaignPage() {
  const profile = await requireProfile()

  if (profile.role !== 'owner') {
    redirect('/campaigns')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Campaign</h1>
        <p className="mt-1 text-sm text-gray-500">Launch a campaign to your contactable audience</p>
      </div>
      <div className="max-w-xl">
        <NewCampaignForm />
      </div>
    </div>
  )
}
