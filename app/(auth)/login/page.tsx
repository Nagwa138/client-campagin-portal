'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ERROR_MESSAGES: Record<string, string> = {
  no_access:   'Your Google account is not linked to any brand. Contact your administrator.',
  oauth_failed: 'Google sign-in failed. Please try again.',
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam) setError(ERROR_MESSAGES[errorParam] ?? 'An error occurred. Please try again.')
  }, [searchParams])

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError('Invalid credentials. Please check your email and password.')
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  async function handleGoogleLogin() {
    setError(null)
    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) setError('Could not start Google sign-in. Please try again.')
  }

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* Left panel — Apple-style dark */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 p-14 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#6366f1]">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-base font-semibold tracking-tight">Campaign Portal</span>
        </div>

        <div className="space-y-5">
          <p className="text-[13px] font-semibold uppercase tracking-widest text-[#64748b]">Built for growth teams</p>
          <h1 className="text-[40px] font-bold leading-tight tracking-tight text-white">
            Campaigns that reach the right people.
          </h1>
          <p className="text-[17px] leading-relaxed text-[#64748b]">
            Manage contacts, launch campaigns, and track every send — across all your brands in one place.
          </p>
        </div>

        <div className="flex gap-8 text-[13px] text-[#64748b]">
          <div>
            <p className="text-2xl font-bold text-white">96k+</p>
            <p className="mt-0.5">Contacts</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">3</p>
            <p className="mt-0.5">Brands</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">100%</p>
            <p className="mt-0.5">Contactable tracking</p>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 bg-white">
        {/* Mobile logo */}
        <div className="mb-10 lg:hidden flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6366f1]">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-base font-semibold text-[#0f172a]">Campaign Portal</span>
        </div>

        <div className="w-full max-w-[360px] mx-auto">
          <div className="mb-8">
            <h2 className="text-[28px] font-bold text-[#0f172a] tracking-tight">Sign in</h2>
            <p className="mt-1.5 text-[15px] text-[#64748b]">Access your brand portal</p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[#0f172a]">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-2.5 text-[15px] text-[#0f172a] placeholder:text-[#64748b] focus:border-[#6366f1] focus:outline-none focus:ring-3 focus:ring-[#6366f1]/20 transition"
                placeholder="you@brand.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[#0f172a]">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-2.5 text-[15px] text-[#0f172a] placeholder:text-[#64748b] focus:border-[#6366f1] focus:outline-none focus:ring-3 focus:ring-[#6366f1]/20 transition"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-xl bg-[#6366f1] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-[#4f46e5] focus:outline-none focus:ring-3 focus:ring-[#6366f1]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 border-t border-[#e2e8f0]" />
            <span className="text-[12px] text-[#64748b]">or</span>
            <div className="flex-1 border-t border-[#e2e8f0]" />
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#e2e8f0] bg-white px-4 py-2.5 text-[15px] font-medium text-[#0f172a] hover:bg-[#f8fafc] focus:outline-none focus:ring-3 focus:ring-[#6366f1]/20 disabled:opacity-50 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  )
}
