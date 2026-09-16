import { requireProfile } from '@/lib/auth'
import NavBar from '@/components/NavBar'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireProfile()

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <NavBar brandName={profile.brand_name} role={profile.role} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
