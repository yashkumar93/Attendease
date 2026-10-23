'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createPeriod, deletePeriod } from '@/app/actions/schedule'
import { ensureDailyPeriods, ensureDateRangePeriods } from '@/app/actions/auto-schedule'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/ToastProvider'
import type { Class, Subject, Profile } from '@/lib/types/database'

interface PeriodRow {
  id: number
  period_number?: number | null
  date: string
  class_id: number
  subject_id: number
  instructor_id: string
  start_time: string
  end_time: string
  period_type: string
  classes: { class_name: string }
  subjects: { subject_name: string }
  profiles: { full_name: string }
}

export default function SchedulePage() {
  const supabase = createClient()
  const { showToast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedClass, setSelectedClass] = useState<number | ''>('')
  const [periods, setPeriods] = useState<PeriodRow[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [instructors, setInstructors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [isScheduling, setIsScheduling] = useState(false)
  const [showAutoScheduleModal, setShowAutoScheduleModal] = useState(false)

  const [showAddModal, setShowAddModal] = useState(false)
  const [addForClass, setAddForClass] = useState<number | null>(null)
  const [deletingPeriod, setDeletingPeriod] = useState<PeriodRow | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    const [periodsRes, classesRes, subjectsRes, instructorsRes] = await Promise.all([
      supabase.from('periods').select('*, classes(class_name), subjects(subject_name), profiles(full_name)').eq('date', date).order('class_id').order('start_time'),
      supabase.from('classes').select('*').order('id'),
      supabase.from('subjects').select('*').order('subject_name'),
      supabase.from('profiles').select('*').eq('role', 'instructor').eq('is_active', true).order('full_name'),
    ])

    const classesList = classesRes.data || []
    let periodsList = (periodsRes.data as PeriodRow[]) || []

    // Automatically ensure all classes have their 7 daily periods if not fully scheduled
    const expectedTotal = classesList.length * 7
    if (classesList.length > 0 && periodsList.length < expectedTotal && date) {
      try {
        const autoRes = await ensureDailyPeriods(date)
        if (autoRes?.totalCreated && autoRes.totalCreated > 0) {
          const refetch = await supabase
            .from('periods')
            .select('*, classes(class_name), subjects(subject_name), profiles(full_name)')
            .eq('date', date)
            .order('class_id')
            .order('start_time')
          if (refetch.data) periodsList = refetch.data as PeriodRow[]
        }
      } catch (err) {
        console.error('Auto-schedule on fetch failed:', err)
      }
    }

    setPeriods(periodsList)
    if (classesRes.data) setClasses(classesRes.data)
    if (subjectsRes.data) setSubjects(subjectsRes.data)
    if (instructorsRes.data) setInstructors(instructorsRes.data)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [date])

  const periodsForClass = (classId: number) =>
    periods.filter((p) => p.class_id === classId)

  const displayClasses = selectedClass
    ? classes.filter((c) => c.id === selectedClass)
    : classes

  const handleAutoSchedule = async (mode: 'selected' | 'next7' | 'force') => {
    setIsScheduling(true)
    startTransition(async () => {
      try {
        if (mode === 'selected' || mode === 'force') {
          const res = await ensureDailyPeriods(date, { forceActiveDay: mode === 'force' })
          if (res.error) {
            showToast(res.error, 'error')
          } else if (res.skipped) {
            showToast(`Skipped: ${res.reason}. Use Force Schedule to override.`, 'info')
          } else {
            showToast(res.message || 'Classes scheduled successfully', 'success')
            await fetchAll()
          }
        } else if (mode === 'next7') {
          const res = await ensureDateRangePeriods(date, 7)
          showToast(`Auto-scheduled next 7 days (${res.totalCreated} total period slots created)`, 'success')
          await fetchAll()
        }
      } catch (err: any) {
        showToast(err.message || 'Auto-scheduling failed', 'error')
      } finally {
        setIsScheduling(false)
        setShowAutoScheduleModal(false)
      }
    })
  }

  const handleAddPeriod = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set('date', date)
    if (addForClass) formData.set('class_id', addForClass.toString())

    startTransition(async () => {
      const result = await createPeriod(formData)
      if (result.error) showToast(result.error, 'error')
      else { showToast('Period added'); setShowAddModal(false); setAddForClass(null); fetchAll() }
    })
  }

  const handleDelete = async () => {
    if (!deletingPeriod) return
    startTransition(async () => {
      const result = await deletePeriod(deletingPeriod.id)
      if (result.error) showToast(result.error, 'error')
      else { showToast('Period deleted'); setDeletingPeriod(null); fetchAll() }
    })
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <p className="text-xs font-medium text-muted mb-2">
            Academic timetable
          </p>
          <h1 className="text-[28px] font-semibold text-ink tracking-tight leading-tight text-balance">
            Daily schedule
          </h1>
          <p className="text-muted text-sm mt-1 max-w-prose text-pretty">
            Configure periods, timings, and faculty assignments for each day
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowAutoScheduleModal(true)}
            disabled={isScheduling || isPending}
            className="btn btn-secondary btn-has-leading-icon inline-flex items-center gap-2 border-[#0066cc]/30 text-[#0066cc] bg-[#f0f6ff] hover:bg-[#e0edff] enabled:active:scale-[0.96] transition-[background-color,border-color,transform] duration-150 ease-out font-medium text-sm"
            title="Automatically schedule all classes"
          >
            {isScheduling ? (
              <span className="w-4 h-4 border-2 border-[#0066cc] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 text-[#0066cc]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            )}
            <span>Auto-schedule all classes</span>
          </button>
          <button
            onClick={() => { setShowAddModal(true); setAddForClass(null) }}
            className="btn btn-primary btn-has-leading-icon"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add period
          </button>
        </div>
      </div>

      {/* Date + Class filter */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label htmlFor="schedule-filter-date" className="text-xs font-medium text-muted uppercase tracking-wider whitespace-nowrap">
              Date:
            </label>
            <input
              id="schedule-filter-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input w-full sm:w-44"
            />
          </div>
          {classes.length > 1 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="schedule-filter-class" className="text-xs font-medium text-muted uppercase tracking-wider whitespace-nowrap">
                Class:
              </label>
              <select
                id="schedule-filter-class"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value ? parseInt(e.target.value) : '')}
                className="input w-full sm:w-48"
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.class_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex-1" />
          <div className="text-xs font-medium text-muted self-center">
            <span className="font-semibold text-ink font-mono tabular-nums">{periods.length}</span> / 7 periods scheduled
          </div>
        </div>
      </div>

      {/* Schedule grid */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-6 h-32 animate-pulse bg-surface-soft/60" />
          ))}
        </div>
      ) : (
        <div className="space-y-6 stagger-children">
          {displayClasses.map((cls) => {
            const classPeriods = periodsForClass(cls.id)
            return (
              <div key={cls.id} className="card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 bg-surface-soft border-b border-hairline">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-ink">{cls.class_name}</h3>
                    <span className="badge badge-pill text-[11px] bg-surface-card border-hairline">
                      Cohort (50 Students)
                    </span>
                  </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted font-mono tabular-nums">
                        {classPeriods.length} / 7 periods
                      </span>
                      {classPeriods.length === 7 ? (
                        <span className="badge badge-pill text-[11px] bg-[#f0f6ff] text-[#0066cc] border border-[#0066cc]/20 hidden sm:inline-flex items-center gap-1">
                          <svg className="w-3 h-3 text-[#0066cc]" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          Fully scheduled
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAutoSchedule('selected')}
                          disabled={isScheduling || isPending}
                          className="btn btn-secondary btn-sm text-[11px] py-1 px-2.5 text-[#0066cc] bg-[#f0f6ff] hover:bg-[#e0edff] border-[#0066cc]/30"
                          title="Schedule missing periods for all classes"
                        >
                          ⚡ Auto-fill slots
                        </button>
                      )}
                      <button
                        onClick={() => { setAddForClass(cls.id); setShowAddModal(true) }}
                        className="btn btn-secondary btn-sm"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Add period
                      </button>
                    </div>
                  </div>
                {classPeriods.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm text-muted">No periods scheduled for this cohort on {date}.</p>
                    <div className="flex justify-center gap-3 mt-3">
                      <button
                        onClick={() => handleAutoSchedule('selected')}
                        disabled={isScheduling || isPending}
                        className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                      >
                        <span>⚡ Auto-schedule 7 periods</span>
                      </button>
                      <button
                        onClick={() => { setAddForClass(cls.id); setShowAddModal(true) }}
                        className="btn btn-secondary btn-sm"
                      >
                        Add period manually
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-hairline">
                    {classPeriods.map((period, index) => (
                      <div key={period.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-soft/40 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="badge badge-pill text-xs font-mono font-medium bg-surface-cream-strong text-ink">
                            P{period.period_number ?? (index + 1)}
                          </span>
                          <span className="text-xs font-mono text-muted">
                            {period.start_time.slice(0, 5)} – {period.end_time.slice(0, 5)}
                          </span>
                          <span className="badge badge-pill text-[10px] sm:hidden">
                            {period.period_type}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 sm:ms-2">
                          <p className="font-medium text-sm text-ink">{period.subjects?.subject_name || <span className="text-muted-soft italic font-normal">Unassigned subject</span>}</p>
                          <p className="text-xs text-muted">{period.profiles?.full_name || <span className="text-muted-soft italic">No faculty assigned</span>}</p>
                        </div>
                        <div className="flex items-center gap-3 self-end sm:self-center">
                          <span className="badge badge-pill text-[10px] hidden sm:inline-flex">
                            {period.period_type}
                          </span>
                          <button
                            onClick={() => setDeletingPeriod(period)}
                            className="p-1.5 rounded-md text-muted-soft hover:text-danger hover:bg-danger-light transition-colors"
                            title="Delete period"
                            aria-label="Delete period"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Auto-schedule Modal */}
      <Modal
        isOpen={showAutoScheduleModal}
        onClose={() => setShowAutoScheduleModal(false)}
        title="Automatically schedule all classes"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Automatically generate all 7 standard period slots (9:20 AM – 4:00 PM) for all cohorts. Existing periods and attendance records will be preserved.
          </p>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => handleAutoSchedule('selected')}
              disabled={isScheduling || isPending}
              className="w-full card p-4 flex items-center justify-between text-start hover:border-[#0066cc]/40 hover:bg-[#f0f6ff]/30 transition-colors group cursor-pointer"
            >
              <div>
                <p className="text-sm font-semibold text-ink group-hover:text-[#0066cc]">
                  Schedule Selected Date ({date})
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Fills all missing slots for all cohorts on the currently selected day.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-[#0066cc] border border-[#0066cc]/30 bg-[#f0f6ff] group-hover:bg-[#0066cc] group-hover:text-white transition-colors flex-shrink-0 ms-3">
                Run now →
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleAutoSchedule('next7')}
              disabled={isScheduling || isPending}
              className="w-full card p-4 flex items-center justify-between text-start hover:border-[#0066cc]/40 hover:bg-[#f0f6ff]/30 transition-colors group cursor-pointer"
            >
              <div>
                <p className="text-sm font-semibold text-ink group-hover:text-[#0066cc]">
                  Pre-Schedule Next 7 Days
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Ensures all cohorts are fully scheduled for the upcoming week (skips Sundays).
                </p>
              </div>
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-[#0066cc] border border-[#0066cc]/30 bg-[#f0f6ff] group-hover:bg-[#0066cc] group-hover:text-white transition-colors flex-shrink-0 ms-3">
                7 Days →
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleAutoSchedule('force')}
              disabled={isScheduling || isPending}
              className="w-full card p-4 flex items-center justify-between text-start hover:border-hairline hover:bg-surface-soft/60 transition-colors group cursor-pointer"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  Force Schedule (Including Sundays)
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Overrides Sunday restriction to schedule special weekend sessions.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-ink border border-hairline bg-surface-card group-hover:border-ink/30 transition-colors flex-shrink-0 ms-3">
                Force →
              </span>
            </button>
          </div>

          <div className="flex justify-end pt-3 border-t border-hairline">
            <button
              type="button"
              onClick={() => setShowAutoScheduleModal(false)}
              className="btn btn-secondary text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Period Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setAddForClass(null) }}
        title="Add period to schedule"
      >
        <form onSubmit={handleAddPeriod} className="space-y-4">
          {!addForClass && (
            <div>
              <label htmlFor="schedule-modal-class" className="label">Class *</label>
              <select id="schedule-modal-class" name="class_id" required className="input">
                <option value="">Select class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.class_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="schedule-modal-subject" className="label">Subject *</label>
            <select id="schedule-modal-subject" name="subject_id" required className="input">
              <option value="">Select subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.subject_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="schedule-modal-instructor" className="label">Instructor *</label>
            <select id="schedule-modal-instructor" name="instructor_id" required className="input">
              <option value="">Select instructor…</option>
              {instructors.map((ins) => (
                <option key={ins.id} value={ins.id}>{ins.full_name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="schedule-modal-start-time" className="label">Start Time *</label>
              <input id="schedule-modal-start-time" type="time" name="start_time" required className="input" defaultValue="09:20" />
            </div>
            <div>
              <label htmlFor="schedule-modal-end-time" className="label">End Time *</label>
              <input id="schedule-modal-end-time" type="time" name="end_time" required className="input" defaultValue="10:15" />
            </div>
          </div>

          <div>
            <label htmlFor="schedule-modal-type" className="label">Period Type</label>
            <select id="schedule-modal-type" name="period_type" defaultValue="Lecture" className="input">
              <option value="Lecture">Lecture</option>
              <option value="Lab">Lab</option>
              <option value="Tutorial">Tutorial</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-hairline">
            <button
              type="button"
              onClick={() => { setShowAddModal(false); setAddForClass(null) }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="btn btn-primary">
              {isPending ? 'Adding period…' : 'Add period'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deletingPeriod}
        onClose={() => setDeletingPeriod(null)}
        onConfirm={handleDelete}
        title="Delete period"
        message={`Delete this period (${deletingPeriod?.subjects?.subject_name} at ${deletingPeriod?.start_time.slice(0, 5)})? Any attendance marked for this period will also be deleted.`}
        confirmLabel="Delete period"
        loading={isPending}
      />
    </div>
  )
}
