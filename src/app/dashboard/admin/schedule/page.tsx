'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createPeriod, deletePeriod } from '@/app/actions/schedule'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/ToastProvider'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'
import type { Class, Subject, Profile } from '@/lib/types/database'

interface PeriodRow {
  id: number
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
    if (periodsRes.data) setPeriods(periodsRes.data as PeriodRow[])
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Academic Timetable
            </span>
          </div>
          <h1 className="font-serif text-3xl font-normal text-ink tracking-tight">
            Daily Schedule
          </h1>
          <p className="text-sm text-muted mt-1 font-sans">
            Configure periods, timings, and faculty assignments for each day
          </p>
        </div>
        <button
          onClick={() => { setShowAddModal(true); setAddForClass(null) }}
          className="btn btn-primary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add period
        </button>
      </div>

      {/* Date + Class filter */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
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
                  <option key={c.id} value={c.id}>{c.class_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex-1" />
          <div className="text-xs font-medium text-muted self-center">
            <span className="font-semibold text-ink font-mono">{periods.length}</span> / 7 periods scheduled
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
                    <h3 className="font-serif text-lg font-normal text-ink">{cls.class_name}</h3>
                    <span className="badge badge-pill text-[11px] bg-surface-card border-hairline">
                      Cohort (50 Students)
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted font-mono">
                      {classPeriods.length} / 7 periods
                    </span>
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
                    <p className="text-sm text-muted">No periods scheduled for this cohort yet.</p>
                    <button
                      onClick={() => { setAddForClass(cls.id); setShowAddModal(true) }}
                      className="btn btn-secondary btn-sm mt-3"
                    >
                      Add period
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-hairline">
                    {classPeriods.map((period, index) => (
                      <div key={period.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-soft/40 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="badge badge-pill text-xs font-mono font-medium bg-surface-cream-strong text-ink">
                            P{index + 1}
                          </span>
                          <span className="text-xs font-mono text-muted">
                            {period.start_time.slice(0, 5)} – {period.end_time.slice(0, 5)}
                          </span>
                          <span className="badge badge-pill text-[10px] sm:hidden">
                            {period.period_type}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 sm:ms-2">
                          <p className="font-medium text-sm text-ink">{period.subjects?.subject_name}</p>
                          <p className="text-xs text-muted">{period.profiles?.full_name}</p>
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

      {/* Add Period Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setAddForClass(null) }}
        title="Add period to schedule"
      >
        <form onSubmit={handleAddPeriod} className="space-y-4">
          {!addForClass && (
            <div>
              <label className="label">Class *</label>
              <select name="class_id" required className="input">
                <option value="">Select class...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.class_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">Subject *</label>
            <select name="subject_id" required className="input">
              <option value="">Select subject...</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.subject_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Instructor *</label>
            <select name="instructor_id" required className="input">
              <option value="">Select instructor...</option>
              {instructors.map((ins) => (
                <option key={ins.id} value={ins.id}>{ins.full_name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Time *</label>
              <input type="time" name="start_time" required className="input" defaultValue="09:20" />
            </div>
            <div>
              <label className="label">End Time *</label>
              <input type="time" name="end_time" required className="input" defaultValue="10:15" />
            </div>
          </div>

          <div>
            <label className="label">Period Type</label>
            <select name="period_type" defaultValue="Lecture" className="input">
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
