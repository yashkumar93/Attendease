export default function AdminAttendanceLoading() {
  return (
    <div className="animate-fade-in space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-hairline">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-surface-soft/80 rounded animate-pulse" />
          <div className="h-4 w-72 bg-surface-soft/60 rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 bg-surface-soft/80 rounded animate-pulse" />
          <div className="h-9 w-36 bg-surface-soft/80 rounded animate-pulse" />
        </div>
      </div>

      {/* Date & class filter bar skeleton */}
      <div className="card p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-10 bg-surface-soft/70 rounded animate-pulse" />
          <div className="h-10 bg-surface-soft/70 rounded animate-pulse" />
        </div>
      </div>

      {/* Period list skeleton */}
      <div className="border border-hairline rounded-lg overflow-hidden divide-y divide-hairline bg-canvas">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="h-5 w-44 bg-surface-soft/80 rounded animate-pulse" />
              <div className="h-3.5 w-60 bg-surface-soft/60 rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-4">
              <div className="h-8 w-14 bg-surface-soft/70 rounded animate-pulse" />
              <div className="h-8 w-14 bg-surface-soft/70 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
