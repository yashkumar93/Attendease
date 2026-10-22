export default function DashboardLoading() {
  return (
    <div className="animate-fade-in space-y-8">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-6 border-b border-hairline">
        <div>
          <div className="h-3 w-24 bg-surface-soft/80 rounded animate-pulse mb-3" />
          <div className="h-8 w-64 bg-surface-soft/80 rounded animate-pulse mb-2" />
          <div className="h-4 w-80 bg-surface-soft/60 rounded animate-pulse" />
        </div>
        <div className="h-10 w-36 bg-surface-soft/80 rounded animate-pulse" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border border-hairline rounded-lg overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-hairline">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="px-6 py-6 bg-canvas">
            <div className="h-2.5 w-20 bg-surface-soft/80 rounded animate-pulse mb-3" />
            <div className="h-10 w-16 bg-surface-soft/80 rounded animate-pulse mb-2" />
            <div className="h-3 w-14 bg-surface-soft/60 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Quick actions skeleton */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-28 bg-surface-soft/80 rounded animate-pulse" />
          <div className="h-3 w-24 bg-surface-soft/60 rounded animate-pulse" />
        </div>
        <div className="border border-hairline rounded-lg overflow-hidden divide-y divide-hairline">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 bg-canvas">
              <div className="w-8 h-8 rounded-sm bg-surface-soft/80 animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-surface-soft/80 rounded animate-pulse mb-1.5" />
                <div className="h-3 w-64 bg-surface-soft/60 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
