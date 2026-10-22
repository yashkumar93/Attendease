export default function PeriodAttendanceLoading() {
  return (
    <div className="animate-fade-in space-y-6">
      {/* Header card skeleton */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-surface-soft/80 rounded animate-pulse" />
              <div className="h-7 w-64 bg-surface-soft/80 rounded animate-pulse" />
              <div className="h-5 w-16 bg-surface-soft/60 rounded-full animate-pulse" />
            </div>
            <div className="flex items-center gap-3 ms-11">
              <div className="h-3.5 w-24 bg-surface-soft/60 rounded animate-pulse" />
              <div className="h-3.5 w-28 bg-surface-soft/60 rounded animate-pulse" />
              <div className="h-3.5 w-24 bg-surface-soft/60 rounded animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-20 bg-surface-soft/70 rounded animate-pulse" />
            <div className="h-9 w-20 bg-surface-soft/70 rounded animate-pulse" />
            <div className="h-9 w-24 bg-surface-soft/70 rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* Roster rows skeleton */}
      <div className="card divide-y divide-hairline overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-soft/80 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-4 w-36 bg-surface-soft/80 rounded animate-pulse" />
                <div className="h-3 w-20 bg-surface-soft/60 rounded animate-pulse" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-20 bg-surface-soft/70 rounded animate-pulse" />
              <div className="h-8 w-20 bg-surface-soft/70 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
