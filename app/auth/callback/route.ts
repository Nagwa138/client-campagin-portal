import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * OAuth callback handler. After Google redirects back here, Supabase
 * exchanges the code for a session and sets the auth cookies.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // Something went wrong — send back to login with an error hint
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
}
