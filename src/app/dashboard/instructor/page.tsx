'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EmptyState } from '@/components/ui/EmptyState'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'

interface InstructorPeriod {
  id: number
  date: string
  start_time: string
  end_time: string
  period_type: string
  classes: { class_name: string }
  subjects: { subject_name: string }
  attendance: { id: number; status: string }[]
}

export default function InstructorPage() {
  const supabase = createClient()
  const [periods, setPeriods] = useState<InstructorPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('periods')
        .select('*, classes(class_name), subjects(subject_name), attendance(id, status)')
        .eq('date', today)
        .eq('instructor_id', user.id)
        .order('start_time')

      if (data) setPeriods(data as InstructorPeriod[])
      setLoading(false)
    }
    load()
  }, [supabase, today])

  const getStatus = (attendance: { id: number; status: string }[]) => {
    if (attendance.length === 0) return 'not_marked'
    return 'marked'
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Faculty Schedule
            </span>
          </div>
          <h1 className="font-serif text-3xl font-normal text-ink tracking-tight">
            My Periods
          </h1>
          <p className="text-sm text-muted mt-1 font-sans">
            Your assigned academic periods for today ({new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })})
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card h-28 animate-pulse bg-surface-soft/60" />
          ))}
        </div>
      ) : periods.length === 0 ? (
        <EmptyState
          title="No periods assigned today"
          description="You do not have any teaching sessions scheduled for today."
        />
      ) : (
        <div className="space-y-4 stagger-children">
          {periods.map((period) => {
            const status = getStatus(period.attendance || [])
            const present = (period.attendance || []).filter((a) => a.status === 'Present').length
            const absent = (period.attendance || []).filter((a) => a.status === 'Absent').length

            return (
              <a
                key={period.id}
                href={`/dashboard/attendance/${period.id}`}
                className="card p-5 block hover:border-[#d8d0c5] transition-all group card-interactive"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-serif text-xl font-normal text-ink">
                      {period.subjects?.subject_name}
                    </h3>
                    <p className="text-xs text-muted mt-0.5">{period.classes?.class_name}</p>
                  </div>
                  <span className="badge badge-pill text-[10px]">
                    {period.period_type}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-hairline-soft">
                  <div className="flex items-center gap-2 text-xs text-muted font-mono">
                    <svg className="w-4 h-4 text-muted-soft" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{period.start_time?.slice(0, 5)} – {period.end_time?.slice(0, 5)}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    {status === 'marked' ? (
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-medium text-success-foreground">{present} Present</span>
                        <span className="text-xs font-mono font-medium text-danger-foreground">{absent} Absent</span>
                        <span className="badge badge-present text-[11px]">Marked ✓</span>
                      </div>
                    ) : (
                      <span className="badge bg-warning-light text-warning-foreground border border-warning/25 text-[11px]">
                        Mark Attendance →
                      </span>
                    )}
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
