'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Class } from '@/lib/types/database'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'

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
  }, [supabase])

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
  }, [date, selectedClass, supabase])

  const getSummary = (attendance: { id: number; status: string }[]) => {
    const present = attendance.filter((a) => a.status === 'Present').length
    const absent = attendance.filter((a) => a.status === 'Absent').length
    const total = attendance.length
    return { present, absent, total, marked: total > 0 }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Verification & Records
            </span>
          </div>
          <h1 className="font-serif text-3xl font-normal text-ink tracking-tight">
            Attendance Overview
          </h1>
          <p className="text-sm text-muted mt-1 font-sans">
            View and manage class attendance across academic periods
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-xs font-medium text-muted uppercase tracking-wider whitespace-nowrap">
              Date:
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input w-full sm:w-44"
            />
          </div>
          {classes.length > 1 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs font-medium text-muted uppercase tracking-wider whitespace-nowrap">
                Class:
              </label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value ? parseInt(e.target.value) : '')}
                className="input w-full sm:w-48"
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.class_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Periods list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6 h-24 animate-pulse bg-surface-soft/60" />
          ))}
        </div>
      ) : periods.length === 0 ? (
        <EmptyState
          title="No periods found"
          description={`No periods scheduled for ${date}${selectedClass ? '' : ' across any class'}.`}
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
                className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-[#d8d0c5] transition-all group block"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-serif text-lg font-normal text-ink">
                      {period.classes?.class_name}
                    </span>
                    <span className="text-muted-soft">·</span>
                    <span className="text-sm font-medium text-body-strong">
                      {period.subjects?.subject_name}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span className="font-mono">
                      {period.start_time?.slice(0, 5)} – {period.end_time?.slice(0, 5)}
                    </span>
                    <span>·</span>
                    <span>{period.profiles?.full_name}</span>
                    <span className="badge badge-pill text-[10px]">
                      {period.period_type}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  {summary.marked ? (
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-[48px]">
                        <p className="font-serif text-xl font-normal text-success-foreground">
                          {summary.present}
                        </p>
                        <p className="text-[10px] text-muted uppercase tracking-wider">Present</p>
                      </div>
                      <div className="text-center min-w-[48px]">
                        <p className="font-serif text-xl font-normal text-danger-foreground">
                          {summary.absent}
                        </p>
                        <p className="text-[10px] text-muted uppercase tracking-wider">Absent</p>
                      </div>
                    </div>
                  ) : (
                    <span className="badge bg-warning-light text-warning-foreground border border-warning/25">
                      Not marked
                    </span>
                  )}
                  <svg
                    className="w-5 h-5 text-muted-soft group-hover:text-primary transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
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
