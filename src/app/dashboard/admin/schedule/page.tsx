'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createPeriod, deletePeriod } from '@/app/actions/schedule'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/ToastProvider'
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

  const periodTypeColors: Record<string, string> = {
    Lecture: 'bg-blue-100 text-blue-700',
    Lab: 'bg-purple-100 text-purple-700',
    Tutorial: 'bg-amber-100 text-amber-700',
    Other: 'bg-gray-100 text-gray-700',
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Daily Schedule</h1>
          <p className="text-sm text-muted-foreground mt-1">Set up class periods for each day</p>
        </div>
        <button
          onClick={() => { setShowAddModal(true); setAddForClass(null) }}
          className="btn btn-primary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Period
        </button>
      </div>

      {/* Date + Class filter */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-foreground whitespace-nowrap">Date:</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input w-44"
            />
          </div>
          {classes.length > 1 && (
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value ? parseInt(e.target.value) : '')}
              className="input w-full sm:w-44"
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          )}
          <div className="flex-1" />
          <div className="text-sm font-medium text-muted-foreground self-center">
            <span className="font-semibold text-foreground">{periods.length}</span> / 7 periods scheduled
          </div>
        </div>
      </div>

      {/* Schedule grid */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-32 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-6 stagger-children">
          {displayClasses.map((cls) => {
            const classPeriods = periodsForClass(cls.id)
            return (
              <div key={cls.id} className="card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-muted/50 border-b border-border">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-foreground">{cls.class_name}</h3>
                    <span className="badge bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Cohort (50 Students)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {classPeriods.length} / 7 periods
                    </span>
                    <button
                      onClick={() => { setAddForClass(cls.id); setShowAddModal(true) }}
                      className="btn btn-ghost btn-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Add Period
                    </button>
                  </div>
                </div>
                {classPeriods.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No periods scheduled for this class yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {classPeriods.map((period, index) => (
                      <div key={period.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2.5 w-52 flex-shrink-0">
                          <span className="px-2 py-0.5 text-xs font-bold rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                            Period {index + 1}
                          </span>
                          <span className="text-sm font-mono text-muted-foreground">
                            {period.start_time.slice(0, 5)} – {period.end_time.slice(0, 5)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">{period.subjects?.subject_name}</p>
                          <p className="text-xs text-muted-foreground">{period.profiles?.full_name}</p>
                        </div>
                        <span className={`badge ${periodTypeColors[period.period_type] || periodTypeColors.Other}`}>
                          {period.period_type}
                        </span>
                        <div className="flex gap-1">
                          <a
                            href={`/dashboard/attendance/${period.id}`}
                            className="btn btn-ghost btn-sm text-success"
                            title="Mark attendance"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </a>
                          <button
                            onClick={() => setDeletingPeriod(period)}
                            className="btn btn-ghost btn-sm text-danger"
                            title="Delete period"
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
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); setAddForClass(null) }} title="Add Period">
        <form onSubmit={handleAddPeriod} className="space-y-4">
          {!addForClass && classes.length > 1 ? (
            <div>
              <label className="label">Class *</label>
              <select name="class_id" required className="input">
                <option value="">Select class</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
            </div>
          ) : (
            <input type="hidden" name="class_id" value={addForClass || classes[0]?.id || ''} />
          )}
          <div>
            <label className="label">Subject *</label>
            <select name="subject_id" required className="input">
              <option value="">Select subject</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Instructor *</label>
            <select name="instructor_id" required className="input">
              <option value="">Select instructor</option>
              {instructors.map((i) => <option key={i.id} value={i.id}>{i.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Time *</label>
              <input name="start_time" type="time" required className="input" />
            </div>
            <div>
              <label className="label">End Time *</label>
              <input name="end_time" type="time" required className="input" />
            </div>
          </div>
          <div>
            <label className="label">Period Type *</label>
            <select name="period_type" required className="input" defaultValue="Lecture">
              <option value="Lecture">Lecture</option>
              <option value="Lab">Lab</option>
              <option value="Tutorial">Tutorial</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowAddModal(false); setAddForClass(null) }} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={isPending} className="btn btn-primary">
              {isPending ? 'Creating...' : 'Create Period'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deletingPeriod}
        onClose={() => setDeletingPeriod(null)}
        onConfirm={handleDelete}
        title="Delete Period"
        message={`Delete ${deletingPeriod?.subjects?.subject_name} (${deletingPeriod?.start_time?.slice(0, 5)} – ${deletingPeriod?.end_time?.slice(0, 5)}) for ${deletingPeriod?.classes?.class_name}?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={isPending}
      />
    </div>
  )
}
