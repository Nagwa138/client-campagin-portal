import { redirect } from 'next/navigation'

// Root "/" redirects to /dashboard (middleware will send to /login if unauthenticated)
export default function Home() {
  redirect('/dashboard')
}
