/**
 * Shown when data failed to load, or when the import script logged warnings.
 * Always renders something visible — never hides errors silently.
 */
export default function ErrorBanner({
  title = 'Something went wrong',
  detail,
}: {
  title?: string
  detail?: string
}) {
  return (
    <div className="rounded-xl border border-red-100 bg-[#fff0f0] px-4 py-3 text-sm text-[#e0352b]">
      <p className="font-semibold">{title}</p>
      {detail && <p className="mt-1 opacity-80">{detail}</p>}
    </div>
  )
}
