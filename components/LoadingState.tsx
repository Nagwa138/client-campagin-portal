export default function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-gray-500">
      <svg
        className="mr-3 h-5 w-5 animate-spin text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12" cy="12" r="10"
          stroke="currentColor" strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v8H4z"
        />
      </svg>
      <span>{message}</span>
    </div>
  )
}
