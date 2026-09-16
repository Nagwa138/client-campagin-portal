'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  brandName: string | null
  role: 'owner' | 'analyst'
}

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: '/contacts',
    label: 'Contacts',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    href: '/campaigns',
    label: 'Campaigns',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
  },
]

export default function NavBar({ brandName, role }: Props) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-[#e2e8f0] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-12 items-center justify-between">
          {/* Logo / brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6366f1]">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-semibold text-[#0f172a] text-sm tracking-tight truncate max-w-[160px]">
              {brandName ?? 'Campaign Portal'}
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-[#f8fafc] border border-[#e2e8f0] px-2 py-0.5 text-xs font-medium text-[#64748b] capitalize">
              {role}
            </span>
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-0.5">
            {navItems.map(({ href, label, icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#f8fafc] text-[#6366f1]'
                      : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
                  }`}
                >
                  {icon}
                  {label}
                </Link>
              )
            })}

            {role === 'owner' && (
              <Link
                href="/campaigns/new"
                className="ml-2 flex items-center gap-1.5 rounded-lg border border-[#c7d2fe] bg-[#eef2ff] px-3.5 py-1.5 text-sm font-medium text-[#4f46e5] hover:bg-[#e0e7ff] hover:border-[#a5b4fc] transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Campaign
              </Link>
            )}

            <button
              onClick={handleSignOut}
              className="ml-3 flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#0f172a] transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              Sign out
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden rounded-lg p-2 text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a] transition-colors"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden pb-3 pt-2 space-y-0.5 border-t border-[#e2e8f0]">
            {navItems.map(({ href, label, icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#f8fafc] text-[#6366f1]'
                      : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
                  }`}
                >
                  {icon}
                  {label}
                </Link>
              )
            })}
            {role === 'owner' && (
              <Link
                href="/campaigns/new"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg border border-[#c7d2fe] bg-[#eef2ff] px-3 py-2 text-sm font-medium text-[#4f46e5] hover:bg-[#e0e7ff]"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Campaign
              </Link>
            )}
            <div className="flex items-center justify-between px-3 pt-2">
              <span className="text-xs text-[#64748b] capitalize">{role}</span>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#0f172a] transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
