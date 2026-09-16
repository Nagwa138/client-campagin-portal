import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ErrorBanner from '@/components/ErrorBanner'
import EmptyState from '@/components/EmptyState'
import Link from 'next/link'

const PAGE_SIZE = 50

type SearchParams = Promise<{ page?: string }>

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireProfile()
  const supabase = await createClient()

  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data: customers, error, count } = await supabase
    .from('customers')
    .select('id, external_id, email, phone, contactable, signed_up_at', { count: 'exact' })
    .order('signed_up_at', { ascending: false, nullsFirst: false })
    .range(from, to)

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef2ff]">
            <svg className="h-5 w-5 text-[#6366f1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </span>
          <div>
            <h1 className="text-[28px] font-bold text-[#0f172a] tracking-tight">Contacts</h1>
            {count != null && (
              <p className="mt-0.5 text-[15px] text-[#64748b]">{count.toLocaleString('en-US')} contacts</p>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <ErrorBanner title="Failed to load contacts" detail={error.message} />
      ) : !customers || customers.length === 0 ? (
        <EmptyState message="No contacts found." />
      ) : (
        <>
          <div className="rounded-2xl border border-[#e2e8f0] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#f8fafc] text-sm">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    {[
                      { label: 'ID', icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" /></svg> },
                      { label: 'Email', icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> },
                      { label: 'Phone', icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg> },
                      { label: 'Contactable', icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
                      { label: 'Signed Up', icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg> },
                    ].map(({ label, icon }) => (
                      <th
                        key={label}
                        className="px-6 py-3 text-left"
                      >
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">
                          {icon}
                          {label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f8fafc]">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-6 py-3.5 font-mono text-[12px] text-[#64748b]">{c.external_id ?? '—'}</td>
                      <td className="px-6 py-3.5 text-[#0f172a]">{c.email ?? '—'}</td>
                      <td className="px-6 py-3.5 text-[#64748b]">{c.phone ?? '—'}</td>
                      <td className="px-6 py-3.5">
                        {c.contactable ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#e9f9ef] px-2.5 py-0.5 text-[11px] font-semibold text-[#1a9e4e]">
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[#f8fafc] px-2.5 py-0.5 text-[11px] font-medium text-[#64748b]">
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-[#64748b]">
                        {c.signed_up_at
                          ? new Date(c.signed_up_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  )
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[#64748b]">Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={`/contacts?page=${page - 1}`}
            className="rounded-xl border border-[#e2e8f0] px-4 py-2 text-[#0f172a] hover:bg-[#f8fafc] transition-colors"
          >
            ← Previous
          </Link>
        )}
        {page < totalPages && (
          <Link
            href={`/contacts?page=${page + 1}`}
            className="rounded-xl border border-[#e2e8f0] px-4 py-2 text-[#0f172a] hover:bg-[#f8fafc] transition-colors"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  )
}
