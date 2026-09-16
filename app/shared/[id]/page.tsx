import { createServiceClient } from '@/lib/supabase/server'
import SharedLinkClient from './SharedLinkClient'

/**
 * Public route — no Supabase auth required.
 *
 * We do a server-side existence check so a bad link ID shows an error
 * immediately rather than a password form that will always fail.
 * We only check that the row EXISTS — we do not read or expose the
 * password hash or any campaign data here.
 */
export default async function SharedLinkPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const db = createServiceClient()
  const { data: link } = await db
    .from('shared_links')
    .select('id')
    .eq('id', id)
    .single()

  if (!link) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-4">
        <div className="w-full max-w-[360px] rounded-2xl border border-[#d2d2d7] bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0f0]">
            <svg className="h-6 w-6 text-[#e0352b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-[18px] font-bold text-[#1d1d1f]">Link not found</h1>
          <p className="mt-2 text-[14px] text-[#6e6e73]">
            This link is invalid or has been removed. Check the URL and try again.
          </p>
        </div>
      </div>
    )
  }

  return <SharedLinkClient linkId={id} />
}
