/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useEffect, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  submitAttendance,
  updateAttendanceStatus,
  savePeriodAttendanceEdit,
  getAttendanceHistory,
} from '@/app/actions/attendance'
import { useToast } from '@/components/ui/ToastProvider'
import { Modal } from '@/components/ui/Modal'
import type { Student } from '@/lib/types/database'

interface PeriodDetail {
  id: number
  date: string
  start_time: string
  end_time: string
  period_type: string
  classes: { class_name: string }
  subjects: { subject_name: string }
  profiles: { full_name: string }
}

interface AttendanceRow {
  id: number
  student_id: number
  status: string
  marked_by: string
  marked_at: string
  last_modified_by: string | null
  last_modified_at: string | null
  remark: string | null
  students: { id: number; name: string; roll_number: string; status: string }
  markedByProfile?: { full_name: string } | null
  lastModifiedByProfile?: { full_name: string } | null
}

interface HistoryRow {
  id: number
  previous_status: string | null
  new_status: string
  changed_at: string
  remark: string | null
  profiles: { full_name: string }
}

export default function AttendancePage() {
  const params = useParams()
  const router = useRouter()
  const periodId = parseInt(params.periodId as string)
  const supabase = createClient()
  const { showToast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [userRole, setUserRole] = useState<'admin' | 'instructor' | null>(null)
  const [period, setPeriod] = useState<PeriodDetail | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [existingAttendance, setExistingAttendance] = useState<AttendanceRow[]>([])
  const [absentIds, setAbsentIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [profileNames, setProfileNames] = useState<Map<string, string>>(new Map())

  // Single student edit modal
  const [studentEditModal, setStudentEditModal] = useState<{
    record: AttendanceRow
    targetStatus: 'Present' | 'Absent'
    remark: string
  } | null>(null)

  // History modal
  const [historyModal, setHistoryModal] = useState<{ attendanceId: number; studentName: string } | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchAttendanceData = async () => {
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('*, students(id, name, roll_number, status)')
      .eq('period_id', periodId)

    if (attendanceData && attendanceData.length > 0) {
      setExistingAttendance(attendanceData as AttendanceRow[])
      setSubmitted(true)
      const absent = new Set(
        (attendanceData as any[]).filter((a: any) => a.status === 'Absent').map((a: any) => a.student_id)
      )
      setAbsentIds(absent)

      // Fetch profile names for marked_by and last_modified_by UUIDs
      const userIds = new Set<string>()
      for (const record of attendanceData as any[]) {
        if (record.marked_by) userIds.add(record.marked_by)
        if (record.last_modified_by) userIds.add(record.last_modified_by)
      }
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(userIds))
        if (profiles) {
          const nameMap = new Map<string, string>()
          for (const p of profiles as any[]) {
            nameMap.set(p.id, p.full_name)
          }
          setProfileNames(nameMap)
        }
      }
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)

      // Get user & role
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        if (profile) setUserRole(profile.role as 'admin' | 'instructor')
      }

      // Load period details
      const { data: periodData } = await supabase
        .from('periods')
        .select('*, classes(class_name), subjects(subject_name), profiles(full_name)')
        .eq('id', periodId)
        .single()

      if (!periodData) {
        showToast('Period not found', 'error')
        router.push('/dashboard')
        return
      }

      setPeriod(periodData as PeriodDetail)

      // Load students for this class
      const { data: studentsData } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', (periodData as any).class_id)
        .eq('status', 'active')
        .order('roll_number')

      if (studentsData) setStudents(studentsData as any)

      // Check existing attendance
      await fetchAttendanceData()

      setLoading(false)
    }
    load()
  }, [periodId])

  const toggleAbsent = (studentId: number) => {
    setAbsentIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  // Initial Submit
  const handleSubmit = () => {
    startTransition(async () => {
      const result = await submitAttendance(periodId, Array.from(absentIds))
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast('Attendance submitted successfully! ✅')
        await fetchAttendanceData()
      }
    })
  }

  // Save full batch edit mode
  const handleSaveBatchEdit = () => {
    startTransition(async () => {
      const result = await savePeriodAttendanceEdit(
        periodId,
        Array.from(absentIds),
        userRole === 'admin' ? 'Corrected by Admin' : 'Corrected by Instructor'
      )
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast('Attendance changes saved! ✅')
        setIsEditing(false)
        await fetchAttendanceData()
      }
    })
  }

  // Save single student correction with reason
  const handleSaveSingleCorrection = () => {
    if (!studentEditModal) return
    startTransition(async () => {
      const result = await updateAttendanceStatus(
        studentEditModal.record.id,
        studentEditModal.targetStatus,
        studentEditModal.remark
      )
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast(`Marked ${studentEditModal.record.students.name} as ${studentEditModal.targetStatus} ✅`)
        setStudentEditModal(null)
        await fetchAttendanceData()
      }
    })
  }

  const openStudentCorrection = (record: AttendanceRow) => {
    setStudentEditModal({
      record,
      targetStatus: record.status === 'Present' ? 'Absent' : 'Present',
      remark: '',
    })
  }

  const viewHistory = async (attendanceId: number, studentName: string) => {
    setHistoryModal({ attendanceId, studentName })
    setHistoryLoading(true)
    try {
      const data = await getAttendanceHistory(attendanceId)
      setHistory(data as HistoryRow[])
    } catch {
      showToast('Failed to load history', 'error')
    }
    setHistoryLoading(false)
  }

  const handleExportThisPeriod = async () => {
    try {
      showToast('Preparing export... 📁')
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId }),
      })
      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Export failed', 'error')
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance_${period?.date}_period_${periodId}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
      showToast('Period attendance exported! 📁')
    } catch {
      showToast('Export failed', 'error')
    }
  }

  const filteredStudents = students.filter((s) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q)
  })

  const presentCount = students.length - absentIds.size
  const absentCount = absentIds.size

  if (loading) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="skeleton h-20 rounded-xl" />
        <div className="skeleton h-12 rounded-xl" />
        {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Period header */}
      <div className="card p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <button onClick={() => router.back()} className="btn btn-ghost btn-icon btn-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              <h1 className="font-serif text-2xl sm:text-3xl font-normal text-ink tracking-tight">
                {period?.subjects?.subject_name} — {period?.classes?.class_name}
              </h1>
              {userRole === 'admin' && (
                <span className="badge badge-pill text-[11px] bg-surface-cream-strong text-ink">
                  Admin Mode
                </span>
              )}
              {userRole === 'instructor' && (
                <span className="badge badge-pill text-[11px] bg-accent-teal/15 text-accent-teal border border-accent-teal/30">
                  Instructor Mode
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted ml-8 sm:ml-10 font-sans">
              <span>📅 {period?.date}</span>
              <span className="font-mono">🕐 {period?.start_time?.slice(0, 5)} – {period?.end_time?.slice(0, 5)}</span>
              <span>👨‍🏫 {period?.profiles?.full_name}</span>
              <span className="badge badge-pill text-[10px]">{period?.period_type}</span>
            </div>
          </div>
          <div className="flex items-center gap-6 ml-8 sm:ml-0">
            <div className="text-center min-w-[50px]">
              <p className="font-serif text-3xl font-normal text-success-foreground">{presentCount}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider">Present</p>
            </div>
            <div className="text-center min-w-[50px]">
              <p className="font-serif text-3xl font-normal text-danger-foreground">{absentCount}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider">Absent</p>
            </div>
            <div className="text-center min-w-[50px]">
              <p className="font-serif text-3xl font-normal text-ink">{students.length}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider">Total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Editing Mode Banner */}
      {isEditing && (
        <div className="mb-5 p-4 rounded-lg bg-surface-card border-l-4 border-l-accent-amber border border-hairline flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5 text-ink">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-amber animate-pulse" />
            <div>
              <p className="font-medium text-sm text-ink">Attendance Edit Mode Active</p>
              <p className="text-xs text-muted">
                Click any student card to toggle between Present & Absent. Changes will be saved to the audit trail.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => {
                setIsEditing(false)
                // Revert absentIds to existingAttendance
                const absent = new Set(
                  (existingAttendance as any[]).filter((a: any) => a.status === 'Absent').map((a: any) => a.student_id)
                )
                setAbsentIds(absent)
              }}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveBatchEdit}
              disabled={isPending}
              className="btn btn-primary btn-sm"
            >
              {isPending ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Action bar (Search + Edit / Submit) */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch sm:items-center">
        <input
          type="text"
          placeholder="Search students by name or roll number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input flex-1"
        />

        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="btn btn-primary btn-lg"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting...
              </span>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Submit Attendance
              </>
            )}
          </button>
        ) : !isEditing ? (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-success-foreground font-medium px-3 py-1.5 bg-success-light border border-success/30 rounded-md">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Submitted
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
              title="Edit all attendance statuses"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              Edit Attendance
            </button>
            <button
              onClick={handleExportThisPeriod}
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              title="Export this period's attendance as CSV"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export CSV
            </button>
          </div>
        ) : null}
      </div>

      {/* Student roster */}
      <div className="space-y-2">
        {filteredStudents.map((student) => {
          const isAbsent = absentIds.has(student.id)
          const attendanceRecord = existingAttendance.find((a) => a.student_id === student.id)
          const wasModified = attendanceRecord?.last_modified_at

          return (
            <div
              key={student.id}
              onClick={() => {
                // If in edit mode or initial marking, clicking toggles status
                if (isEditing || !submitted) {
                  toggleAbsent(student.id)
                } else if (submitted && attendanceRecord) {
                  openStudentCorrection(attendanceRecord)
                }
              }}
              className={`card p-4 transition-all duration-200 select-none cursor-pointer ${
                isAbsent
                  ? 'border-danger/40 bg-danger-light/50 hover:border-danger/60'
                  : 'border-success/20 bg-success-light/30 hover:border-success/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      isAbsent
                        ? 'bg-danger/10 text-danger'
                        : 'bg-success/10 text-success'
                    }`}
                  >
                    {isAbsent ? '✗' : '✓'}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{student.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{student.roll_number}</p>
                    {/* Show who marked/modified this record */}
                    {submitted && attendanceRecord && (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-[10px] text-muted-foreground">
                          Marked by <span className="font-medium text-foreground/70">{profileNames.get(attendanceRecord.marked_by) || 'Unknown'}</span>
                          {attendanceRecord.marked_at && (
                            <span> · {new Date(attendanceRecord.marked_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                        </p>
                        {attendanceRecord.last_modified_by && (
                          <p className="text-[10px] text-amber-700 dark:text-amber-300">
                            Last edited by <span className="font-medium">{profileNames.get(attendanceRecord.last_modified_by) || 'Unknown'}</span>
                            {attendanceRecord.last_modified_at && (
                              <span> · {new Date(attendanceRecord.last_modified_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {wasModified && (
                    <span className="text-[10px] text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">
                      Edited
                    </span>
                  )}
                  
                  <span className={`badge ${isAbsent ? 'badge-absent' : 'badge-present'}`}>
                    {isAbsent ? 'Absent' : 'Present'}
                  </span>

                  {/* Individual edit button (always accessible once submitted) */}
                  {submitted && attendanceRecord && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openStudentCorrection(attendanceRecord)
                      }}
                      className="btn btn-ghost btn-sm btn-icon text-foreground hover:bg-muted"
                      title="Edit this student's attendance & reason"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                  )}

                  {/* History button */}
                  {submitted && attendanceRecord && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        viewHistory(attendanceRecord.id, student.name)
                      }}
                      className="btn btn-ghost btn-sm btn-icon text-muted-foreground hover:text-foreground"
                      title="View audit history"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredStudents.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {searchQuery ? 'No students match your search' : 'No active students in this class'}
        </div>
      )}

      {/* Individual Student Edit Modal */}
      <Modal
        isOpen={!!studentEditModal}
        onClose={() => setStudentEditModal(null)}
        title={`Edit Attendance — ${studentEditModal?.record.students.name || ''}`}
      >
        {studentEditModal && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-sm flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{studentEditModal.record.students.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{studentEditModal.record.students.roll_number}</p>
              </div>
              <div className="text-right text-xs">
                <p className="text-muted-foreground">Current Status</p>
                <span className={`badge mt-1 ${studentEditModal.record.status === 'Present' ? 'badge-present' : 'badge-absent'}`}>
                  {studentEditModal.record.status}
                </span>
              </div>
            </div>

            <div>
              <label className="label font-medium mb-1.5 block">Select New Status *</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStudentEditModal({ ...studentEditModal, targetStatus: 'Present' })}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all font-semibold ${
                    studentEditModal.targetStatus === 'Present'
                      ? 'bg-success/20 border-success text-success ring-2 ring-success/30'
                      : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className="text-base">✓</span> Present
                </button>
                <button
                  type="button"
                  onClick={() => setStudentEditModal({ ...studentEditModal, targetStatus: 'Absent' })}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all font-semibold ${
                    studentEditModal.targetStatus === 'Absent'
                      ? 'bg-danger/20 border-danger text-danger ring-2 ring-danger/30'
                      : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className="text-base">✗</span> Absent
                </button>
              </div>
            </div>

            <div>
              <label className="label font-medium mb-1.5 block">Reason / Remark (Optional)</label>
              <textarea
                value={studentEditModal.remark}
                onChange={(e) => setStudentEditModal({ ...studentEditModal, remark: e.target.value })}
                placeholder="e.g. Medical leave approved, Marked absent by mistake, Late entry"
                className="input min-h-[85px]"
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This remark will be permanently logged in the audit trail.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStudentEditModal(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSingleCorrection}
                disabled={isPending}
                className="btn btn-primary"
              >
                {isPending ? 'Saving...' : 'Save Correction'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* History Modal */}
      <Modal
        isOpen={!!historyModal}
        onClose={() => setHistoryModal(null)}
        title={`Audit History — ${historyModal?.studentName || ''}`}
      >
        {historyLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No modification history recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    {entry.previous_status ? (
                      <>
                        <span className={`badge ${entry.previous_status === 'Present' ? 'badge-present' : 'badge-absent'}`}>
                          {entry.previous_status}
                        </span>
                        <span className="text-muted-foreground">→</span>
                      </>
                    ) : null}
                    <span className={`badge ${entry.new_status === 'Present' ? 'badge-present' : 'badge-absent'}`}>
                      {entry.new_status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Changed by {entry.profiles?.full_name || 'Admin'} · {new Date(entry.changed_at).toLocaleString()}
                  </p>
                  {entry.remark && (
                    <p className="text-xs text-foreground mt-1 italic">&quot;{entry.remark}&quot;</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
