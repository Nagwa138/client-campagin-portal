export default function EmptyState({ message = 'No data found.' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-[#e2e8f0] py-16 text-[#64748b]">
      <p>{message}</p>
    </div>
  )
}
