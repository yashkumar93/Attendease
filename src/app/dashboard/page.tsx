/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="card max-w-md p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Profile Not Found</h2>
          <p className="text-sm text-muted-foreground mb-6">
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

  const { count: totalStudents } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  const { count: totalInstructors } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'instructor')
    .eq('is_active', true)

  const { count: todayPeriods } = await supabase
    .from('periods')
    .select('*', { count: 'exact', head: true })
    .eq('date', today)

  const isAdmin = p.role === 'admin'

  const stats = [
    {
      label: 'Active Students',
      value: totalStudents || 0,
      icon: '🎓',
      color: 'from-blue-500 to-cyan-500',
      show: isAdmin,
    },
    {
      label: 'Instructors',
      value: totalInstructors || 0,
      icon: '👨‍🏫',
      color: 'from-violet-500 to-purple-500',
      show: isAdmin,
    },
    {
      label: "Today's Periods",
      value: todayPeriods || 0,
      icon: '📅',
      color: 'from-amber-500 to-orange-500',
      show: true,
    },
  ]

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {p.full_name} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin
            ? "Here's an overview of today's activity"
            : "Here are your assigned periods for today"}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 stagger-children">
        {stats
          .filter((s) => s.show)
          .map((stat) => (
            <div key={stat.label} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{stat.icon}</span>
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} opacity-10`}
                />
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
      </div>

      {/* Quick actions */}
      {isAdmin && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href="/dashboard/admin/schedule"
              className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary-light/50 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Set Up Schedule</p>
                <p className="text-xs text-muted-foreground">Create today&apos;s timetable</p>
              </div>
            </a>
            <a
              href="/dashboard/admin/attendance"
              className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-emerald-300 hover:bg-success-light/50 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Mark Attendance</p>
                <p className="text-xs text-muted-foreground">Record today&apos;s attendance</p>
              </div>
            </a>
            <a
              href="/dashboard/admin/export"
              className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-amber-300 hover:bg-warning-light/50 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Export Data</p>
                <p className="text-xs text-muted-foreground">Export to CSV / Sheets</p>
              </div>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
