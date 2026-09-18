'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EmptyState } from '@/components/ui/EmptyState'

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
  }, [])

  const getStatus = (attendance: { id: number; status: string }[]) => {
    if (attendance.length === 0) return 'not_marked'
    return 'marked'
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">My Periods</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your assigned periods for today ({new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })})
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
      ) : periods.length === 0 ? (
        <EmptyState
          title="No periods assigned today"
          description="You don't have any classes scheduled for today"
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
                className="card p-5 block hover:border-primary/30 transition-all group card-interactive"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {period.subjects?.subject_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{period.classes?.class_name}</p>
                  </div>
                  <span className={`badge ${
                    period.period_type === 'Lecture' ? 'bg-blue-100 text-blue-700' :
                    period.period_type === 'Lab' ? 'bg-purple-100 text-purple-700' :
                    period.period_type === 'Tutorial' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{period.period_type}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {period.start_time?.slice(0, 5)} – {period.end_time?.slice(0, 5)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {status === 'marked' ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-success">{present}P</span>
                        <span className="text-sm font-medium text-danger">{absent}A</span>
                        <span className="badge badge-active">Marked ✓</span>
                      </div>
                    ) : (
                      <span className="badge bg-warning-light text-warning-foreground">
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
