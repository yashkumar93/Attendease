/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ensureDailyPeriods } from '@/app/actions/auto-schedule'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Auto-create today's periods if they don't exist yet
  try {
    await ensureDailyPeriods()
  } catch (e) {
    console.error('Auto-schedule fallback failed:', e)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="card max-w-md p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-accent-amber/15 text-accent-amber flex items-center justify-center mx-auto mb-4 border border-accent-amber/30">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-ink mb-2">Profile not found</h2>
          <p className="text-sm text-muted mb-6">
            Your account ({user.email}) is authenticated, but does not have a linked profile record. Please ensure your Supabase database migrations and seed scripts have run.
          </p>
          <a href="/login" className="btn btn-primary w-full">
            Back to Sign In
          </a>
        </div>
      </div>
    )
  }

  const p = profile as any

  // Fetch summary stats
  const today = new Date().toISOString().split('T')[0]

  // BN-11: Fire all three count queries concurrently with Promise.all.
  // Previously these were three sequential awaits (3 serial DB round-trips).
  // Now they run in parallel, reducing dashboard load time by ~2 RTT.
  const [
    { count: totalStudents },
    { count: totalInstructors },
    { count: todayPeriods },
  ] = await Promise.all([
    supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'instructor')
      .eq('is_active', true),
    supabase
      .from('periods')
      .select('*', { count: 'exact', head: true })
      .eq('date', today),
  ])

  const isAdmin = p.role === 'admin'

  const stats = [
    {
      label: 'Active Students',
      value: totalStudents || 0,
      badge: 'Enrolled',
      accent: 'border-s-4 border-s-primary',
      show: isAdmin,
    },
    {
      label: 'Instructors',
      value: totalInstructors || 0,
      badge: 'Faculty',
      accent: 'border-s-4 border-s-accent-teal',
      show: isAdmin,
    },
    {
      label: "Today's Periods",
      value: todayPeriods || 0,
      badge: 'Active',
      accent: 'border-s-4 border-s-accent-amber',
      show: true,
    },
  ]

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <p className="text-xs font-medium text-muted mb-2">
            {isAdmin ? 'Administration' : 'Faculty'}
          </p>
          <h1 className="text-[28px] font-semibold text-ink tracking-tight leading-tight">
            Welcome back, {p.full_name}
          </h1>
          <p className="text-muted text-sm mt-1">
            {isAdmin
              ? "Here is an overview of today's academic periods and attendance activity."
              : "Here is today's academic periods and attendance overview."}
          </p>
        </div>

        {isAdmin && (
          <a href="/dashboard/admin/attendance" className="btn btn-primary flex-shrink-0">
            Mark attendance
          </a>
        )}
        {!isAdmin && (
          <a href="/dashboard/instructor/attendance" className="btn btn-primary flex-shrink-0">
            Mark attendance
          </a>
        )}
      </div>

      {/* Stats — ledger row: plain numbers, rules above/below, not SaaS cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border border-hairline rounded-lg overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-hairline stagger-children">
        {stats
          .filter((s) => s.show)
          .map((stat) => (
            <div key={stat.label} className="px-6 py-5 bg-canvas">
              <p className="text-xs font-medium text-muted mb-2">{stat.label}</p>
              <p className="font-mono text-4xl font-medium text-ink tracking-tight">
                {stat.value}
              </p>
              <p className="text-xs text-muted-soft mt-2">{stat.badge}</p>
            </div>
          ))}
      </div>

      {/* Quick actions for Admin */}
      {isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink">Quick actions</h2>
            <p className="text-xs text-muted">Daily workflows</p>
          </div>

          <div className="border border-hairline rounded-lg overflow-hidden divide-y divide-hairline">

            <a
              href="/dashboard/admin/attendance"
              className="flex items-center gap-4 px-5 py-4 bg-canvas hover:bg-surface-soft transition-colors group"
            >
              <div className="w-8 h-8 rounded bg-surface-card border border-hairline flex items-center justify-center text-muted group-hover:text-ink transition-colors flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">Mark attendance</p>
                <p className="text-xs text-muted mt-0.5">Fast default-present verification across all active periods.</p>
              </div>
              <svg className="w-4 h-4 text-muted-soft flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </a>

            <a
              href="/dashboard/export"
              className="flex items-center gap-4 px-5 py-4 bg-canvas hover:bg-surface-soft transition-colors group"
            >
              <div className="w-8 h-8 rounded bg-surface-card border border-hairline flex items-center justify-center text-muted group-hover:text-ink transition-colors flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">Export to Sheets</p>
                <p className="text-xs text-muted mt-0.5">Synchronize or download attendance reports directly to CSV or Google Sheets.</p>
              </div>
              <svg className="w-4 h-4 text-muted-soft flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </a>
          </div>
        </div>
      )}

      {/* Quick actions for Instructor */}
      {!isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink">Quick actions</h2>
          </div>
          <div className="border border-hairline rounded-lg overflow-hidden divide-y divide-hairline">
            <a
              href="/dashboard/instructor/attendance"
              className="flex items-center gap-4 px-5 py-4 bg-canvas hover:bg-surface-soft transition-colors group"
            >
              <div className="w-8 h-8 rounded bg-surface-card border border-hairline flex items-center justify-center text-muted group-hover:text-ink transition-colors flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">Attendance overview</p>
                <p className="text-xs text-muted mt-0.5">View, take, and manage attendance for all classes and academic periods.</p>
              </div>
              <svg className="w-4 h-4 text-muted-soft flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </a>

            <a
              href="/dashboard/export"
              className="flex items-center gap-4 px-5 py-4 bg-canvas hover:bg-surface-soft transition-colors group"
            >
              <div className="w-8 h-8 rounded bg-surface-card border border-hairline flex items-center justify-center text-muted group-hover:text-ink transition-colors flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">Export attendance</p>
                <p className="text-xs text-muted mt-0.5">Download attendance records as CSV or export live to Google Sheets.</p>
              </div>
              <svg className="w-4 h-4 text-muted-soft flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
