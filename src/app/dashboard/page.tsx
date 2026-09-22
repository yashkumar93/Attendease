/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ensureDailyPeriods } from '@/app/actions/auto-schedule'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'

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
          <h2 className="font-serif text-2xl font-normal text-ink mb-2">Profile Not Found</h2>
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
      badge: 'Schedule',
      accent: 'border-s-4 border-s-accent-amber',
      show: true,
    },
  ]

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              {isAdmin ? 'Administration Portal' : 'Faculty Portal'}
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-ink tracking-tight">
            Welcome back, {p.full_name}
          </h1>
          <p className="text-muted text-sm mt-1">
            {isAdmin
              ? "Here is an overview of today's academic timetable and attendance activity."
              : "Here are your assigned academic periods for today."}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <a href="/dashboard/admin/attendance" className="btn btn-primary">
              Mark Attendance
            </a>
          </div>
        )}
        {!isAdmin && (
          <div className="flex items-center gap-2">
            <a href="/dashboard/instructor/attendance" className="btn btn-primary">
              Mark Attendance
            </a>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {stats
          .filter((s) => s.show)
          .map((stat) => (
            <div key={stat.label} className={`card p-6 ${stat.accent} transition-colors`}>
              <div className="flex items-center justify-between mb-4">
                <span className="badge badge-pill">{stat.badge}</span>
                <span className="text-xs text-muted-soft">Today</span>
              </div>
              <p className="font-serif text-4xl font-normal text-ink tracking-tight">
                {stat.value}
              </p>
              <p className="text-sm font-medium text-muted mt-1">{stat.label}</p>
            </div>
          ))}
      </div>

      {/* Quick actions for Admin */}
      {isAdmin && (
        <div className="card p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-serif text-2xl font-normal text-ink tracking-tight">
                Quick Actions
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Key workflows for daily schedule and attendance management
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <a
              href="/dashboard/admin/schedule"
              className="flex items-start gap-4 p-5 rounded-lg border border-hairline bg-canvas hover:border-[#d8d0c5] hover:bg-surface-soft/60 transition-all group"
            >
              <div className="w-10 h-10 rounded-md bg-surface-card border border-hairline flex items-center justify-center text-ink flex-shrink-0 group-hover:text-primary transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-ink group-hover:text-primary transition-colors">
                  Set Up Schedule
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Generate or customize daily periods and instructor assignments.
                </p>
              </div>
            </a>

            <a
              href="/dashboard/admin/attendance"
              className="flex items-start gap-4 p-5 rounded-lg border border-hairline bg-canvas hover:border-[#d8d0c5] hover:bg-surface-soft/60 transition-all group"
            >
              <div className="w-10 h-10 rounded-md bg-surface-card border border-hairline flex items-center justify-center text-ink flex-shrink-0 group-hover:text-primary transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-ink group-hover:text-primary transition-colors">
                  Mark Attendance
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Fast default-present verification across all active periods.
                </p>
              </div>
            </a>

            <a
              href="/dashboard/admin/export"
              className="flex items-start gap-4 p-5 rounded-lg border border-hairline bg-canvas hover:border-[#d8d0c5] hover:bg-surface-soft/60 transition-all group"
            >
              <div className="w-10 h-10 rounded-md bg-surface-card border border-hairline flex items-center justify-center text-ink flex-shrink-0 group-hover:text-primary transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-ink group-hover:text-primary transition-colors">
                  Export to Sheets
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Synchronize or download attendance reports directly to CSV or Google Sheets.
                </p>
              </div>
            </a>
          </div>
        </div>
      )}

      {/* Quick actions for Instructor */}
      {!isAdmin && (
        <div className="card p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-serif text-2xl font-normal text-ink tracking-tight">
                Quick Actions
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Key workflows for attendance management
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a
              href="/dashboard/instructor/attendance"
              className="flex items-start gap-4 p-5 rounded-lg border border-hairline bg-canvas hover:border-[#d8d0c5] hover:bg-surface-soft/60 transition-all group card-interactive"
            >
              <div className="w-10 h-10 rounded-md bg-surface-card border border-hairline flex items-center justify-center text-ink flex-shrink-0 group-hover:text-primary transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-ink group-hover:text-primary transition-colors">
                  Attendance Overview
                </p>
                <p className="text-xs text-muted mt-0.5">
                  View, take, and manage attendance for all classes and academic periods.
                </p>
              </div>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
