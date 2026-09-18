'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Class } from '@/lib/types/database'

interface PeriodSummary {
  id: number
  date: string
  start_time: string
  end_time: string
  period_type: string
  class_id: number
  classes: { class_name: string }
  subjects: { subject_name: string }
  profiles: { full_name: string }
  attendance: { id: number; status: string }[]
}

export default function AdminAttendancePage() {
  const supabase = createClient()

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedClass, setSelectedClass] = useState<number | ''>('')
  const [classes, setClasses] = useState<Class[]>([])
  const [periods, setPeriods] = useState<PeriodSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('classes').select('*').order('id').then(({ data }) => {
      if (data) setClasses(data)
    })
  }, [])

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      let query = supabase
        .from('periods')
        .select('*, classes(class_name), subjects(subject_name), profiles(full_name), attendance(id, status)')
        .eq('date', date)
        .order('class_id')
        .order('start_time')

      if (selectedClass) query = query.eq('class_id', selectedClass)

      const { data } = await query
      if (data) setPeriods(data as PeriodSummary[])
      setLoading(false)
    }
    fetch()
  }, [date, selectedClass])

  const getSummary = (attendance: { id: number; status: string }[]) => {
    const present = attendance.filter((a) => a.status === 'Present').length
    const absent = attendance.filter((a) => a.status === 'Absent').length
    const total = attendance.length
    return { present, absent, total, marked: total > 0 }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Attendance Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View and manage attendance across all classes
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Date:</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-44" />
          </div>
          {classes.length > 1 && (
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value ? parseInt(e.target.value) : '')}
              className="input w-full sm:w-44"
            >
              <option value="">All Classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Periods list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : periods.length === 0 ? (
        <EmptyState
          title="No periods found"
          description={`No periods scheduled for ${date}${selectedClass ? '' : ' across any class'}`}
          action={
            <a href="/dashboard/admin/schedule" className="btn btn-primary">
              Set Up Schedule
            </a>
          }
        />
      ) : (
        <div className="space-y-3 stagger-children">
          {periods.map((period) => {
            const summary = getSummary(period.attendance || [])
            return (
              <a
                key={period.id}
                href={`/dashboard/attendance/${period.id}`}
                className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:border-primary/30 transition-all group block"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground">
                      {period.classes?.class_name}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-foreground">{period.subjects?.subject_name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>🕐 {period.start_time?.slice(0, 5)} – {period.end_time?.slice(0, 5)}</span>
                    <span>👨‍🏫 {period.profiles?.full_name}</span>
                    <span className={`badge text-[10px] ${
                      period.period_type === 'Lecture' ? 'bg-blue-100 text-blue-700' :
                      period.period_type === 'Lab' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{period.period_type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {summary.marked ? (
                    <>
                      <div className="text-center">
                        <p className="text-lg font-bold text-success">{summary.present}</p>
                        <p className="text-[10px] text-muted-foreground">Present</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-danger">{summary.absent}</p>
                        <p className="text-[10px] text-muted-foreground">Absent</p>
                      </div>
                    </>
                  ) : (
                    <span className="badge bg-warning-light text-warning-foreground">
                      Not marked
                    </span>
                  )}
                  <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
