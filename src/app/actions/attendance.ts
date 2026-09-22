/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function submitAttendance(
  periodId: number,
  absentStudentIds: number[]
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Get the period to find the class
  const { data: period, error: periodError } = await supabase
    .from('periods')
    .select('class_id')
    .eq('id', periodId)
    .single()

  if (periodError || !period) return { error: 'Period not found' }

  // Get all active students for this class
  const { data: students, error: studentError } = await supabase
    .from('students')
    .select('id')
    .eq('class_id', (period as any).class_id)
    .eq('status', 'active')

  if (studentError || !students) return { error: 'Failed to fetch students' }

  // BN-9: Set lookup is O(1) vs Array.includes which is O(n) per student
  const absentSet = new Set(absentStudentIds)

  // Create attendance records — all present by default, absent for flagged ones
  const records = (students as any[]).map((student: any) => ({
    period_id: periodId,
    student_id: student.id,
    status: absentSet.has(student.id) ? 'Absent' : 'Present',
    marked_by: user.id,
  }))

  // Use upsert to handle re-submission gracefully
  const { error } = await supabase
    .from('attendance')
    .upsert(records as any, { onConflict: 'period_id,student_id' })

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/attendance/${periodId}`)
  revalidatePath('/dashboard/admin/attendance')
  revalidatePath('/dashboard/instructor')
  return { success: true }
}

export async function updateAttendanceStatus(
  attendanceId: number,
  newStatus: 'Present' | 'Absent',
  remark?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Check user role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminClient = createAdminClient()

  // Fetch record to verify period authorization and track previous state
  const { data: record, error: recordErr } = await adminClient
    .from('attendance')
    .select('id, period_id, student_id, status, remark, periods(instructor_id)')
    .eq('id', attendanceId)
    .single()

  if (recordErr || !record) return { error: 'Attendance record not found' }

  const isAdmin = profile?.role === 'admin'
  const isInstructor = profile?.role === 'instructor'

  if (!isAdmin && !isInstructor) {
    return { error: 'Unauthorized to edit attendance for this period' }
  }

  const trimmedRemark = remark !== undefined ? (remark.trim() || null) : (record as any).remark
  const now = new Date().toISOString()

  const { error } = await adminClient
    .from('attendance')
    .update({
      status: newStatus,
      last_modified_by: user.id,
      last_modified_at: now,
      remark: trimmedRemark,
    } as any)
    .eq('id', attendanceId)

  if (error) return { error: error.message }

  // Ensure an audit entry exists in attendance_history even if status didn't change but remark changed
  const statusChanged = (record as any).status !== newStatus
  const remarkChanged = ((record as any).remark || null) !== trimmedRemark
  if (!statusChanged && remarkChanged) {
    await adminClient.from('attendance_history').insert({
      attendance_id: attendanceId,
      period_id: (record as any).period_id,
      student_id: (record as any).student_id,
      previous_status: (record as any).status,
      new_status: newStatus,
      changed_by: user.id,
      changed_at: now,
      remark: trimmedRemark,
    } as any)
  }

  revalidatePath(`/dashboard/attendance/${(record as any).period_id}`)
  revalidatePath('/dashboard/admin/attendance')
  revalidatePath('/dashboard/instructor/attendance')
  revalidatePath('/dashboard/audit')
  return { success: true }
}

export async function updateStudentRemark(
  attendanceId: number,
  remark: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'
  const isInstructor = profile?.role === 'instructor'
  if (!isAdmin && !isInstructor) {
    return { error: 'Unauthorized to edit attendance remarks' }
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminClient = createAdminClient()

  const { data: record, error: recordErr } = await adminClient
    .from('attendance')
    .select('id, period_id, student_id, status, remark')
    .eq('id', attendanceId)
    .single()

  if (recordErr || !record) return { error: 'Attendance record not found' }

  const trimmedRemark = remark.trim() || null
  const now = new Date().toISOString()

  const { error } = await adminClient
    .from('attendance')
    .update({
      remark: trimmedRemark,
      last_modified_by: user.id,
      last_modified_at: now,
    } as any)
    .eq('id', attendanceId)

  if (error) return { error: error.message }

  // Log in attendance_history
  await adminClient.from('attendance_history').insert({
    attendance_id: attendanceId,
    period_id: (record as any).period_id,
    student_id: (record as any).student_id,
    previous_status: (record as any).status,
    new_status: (record as any).status,
    changed_by: user.id,
    changed_at: now,
    remark: trimmedRemark,
  } as any)

  revalidatePath(`/dashboard/attendance/${(record as any).period_id}`)
  revalidatePath('/dashboard/admin/attendance')
  revalidatePath('/dashboard/instructor/attendance')
  revalidatePath('/dashboard/audit')
  return { success: true }
}

export async function savePeriodAttendanceEdit(
  periodId: number,
  absentStudentIds: number[],
  batchRemark?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminClient = createAdminClient()

  const { data: period, error: periodErr } = await adminClient
    .from('periods')
    .select('id, instructor_id, class_id')
    .eq('id', periodId)
    .single()

  if (periodErr || !period) return { error: 'Period not found' }

  const isAdmin = profile?.role === 'admin'
  const isInstructor = profile?.role === 'instructor'

  if (!isAdmin && !isInstructor) {
    return { error: 'Unauthorized to edit attendance for this period' }
  }

  const { data: students } = await adminClient
    .from('students')
    .select('id')
    .eq('class_id', period.class_id)
    .eq('status', 'active')

  if (!students) return { error: 'Failed to fetch students' }

  const { data: existing } = await adminClient
    .from('attendance')
    .select('id, student_id, status, marked_by, marked_at')
    .eq('period_id', periodId)

  const existingMap = new Map((existing || []).map((e: any) => [e.student_id, e]))

  // BN-9: O(1) Set lookup instead of O(n) Array.includes per student
  const absentSet = new Set(absentStudentIds)
  const now = new Date().toISOString()
  const remarkText = batchRemark?.trim() || null
  const defaultRemark = isAdmin ? 'Updated by admin' : 'Updated by instructor'

  // BN-1: Build one unified upsert payload instead of N individual UPDATE awaits.
  // Supabase upsert with onConflict handles both inserts and updates in a single
  // round-trip, eliminating the previous O(n) sequential UPDATE loop.
  const upsertRows: any[] = []
  let changedCount = 0

  for (const s of students) {
    const targetStatus = absentSet.has(s.id) ? 'Absent' : 'Present'
    const cur = existingMap.get(s.id)

    if (cur) {
      // Only include rows that actually changed to minimise write amplification
      if (cur.status !== targetStatus) {
        upsertRows.push({
          id: cur.id,
          period_id: periodId,
          student_id: s.id,
          status: targetStatus,
          marked_by: cur.marked_by || user.id,
          marked_at: cur.marked_at || now,
          last_modified_by: user.id,
          last_modified_at: now,
          remark: remarkText ?? defaultRemark,
        })
        changedCount++
      }
    } else {
      upsertRows.push({
        period_id: periodId,
        student_id: s.id,
        status: targetStatus,
        marked_by: user.id,
        marked_at: now,
        last_modified_by: user.id,
        last_modified_at: now,
        remark: remarkText ?? defaultRemark,
      })
      changedCount++
    }
  }

  if (upsertRows.length > 0) {
    const { error: upsertErr } = await adminClient
      .from('attendance')
      .upsert(upsertRows as any, { onConflict: 'period_id,student_id' })
    if (upsertErr) return { error: upsertErr.message }
  }

  revalidatePath(`/dashboard/attendance/${periodId}`)
  revalidatePath('/dashboard/admin/attendance')
  revalidatePath('/dashboard/instructor')
  return { success: true, updatedCount: changedCount }
}

export async function getAttendanceForPeriod(periodId: number) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('attendance')
    .select('*, students(id, name, roll_number, status)')
    .eq('period_id', periodId)

  if (error) throw new Error(error.message)
  return data as any[]
}

export async function getAttendanceHistory(attendanceId: number) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('attendance_history')
    .select('*, profiles:changed_by(full_name)')
    .eq('attendance_id', attendanceId)
    .order('changed_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data as any[]
}

export async function getAttendanceSummary(date: string, classId?: number) {
  const supabase = await createClient()

  let query = supabase
    .from('periods')
    .select(`
      *,
      classes(class_name),
      subjects(subject_name),
      profiles(full_name),
      attendance(id, status)
    `)
    .eq('date', date)
    .order('class_id')
    .order('start_time')

  if (classId) query = query.eq('class_id', classId)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  // Compute summaries
  return ((data || []) as any[]).map((period: any) => {
    const attendance = (period.attendance || []) as any[]
    const present = attendance.filter((a: any) => a.status === 'Present').length
    const absent = attendance.filter((a: any) => a.status === 'Absent').length
    const total = attendance.length
    const { attendance: _, ...rest } = period
    return {
      ...rest,
      summary: { present, absent, total, marked: total > 0 },
    }
  })
}

export async function getStudentsForPeriod(periodId: number) {
  const supabase = await createClient()

  // Get the period's class
  const { data: period } = await supabase
    .from('periods')
    .select('class_id')
    .eq('id', periodId)
    .single()

  if (!period) throw new Error('Period not found')

  // BN-2: Select only the columns callers need — avoids over-fetching all columns
  const { data: students, error } = await supabase
    .from('students')
    .select('id, name, roll_number, status, class_id, contact')
    .eq('class_id', (period as any).class_id)
    .eq('status', 'active')
    .order('roll_number')

  if (error) throw new Error(error.message)
  return students as any[]
}

export async function getPeriodAuditTrail(periodId: number) {
  const supabase = await createClient()

  const { data: historyData, error } = await supabase
    .from('attendance_history')
    .select('*')
    .eq('period_id', periodId)
    .order('changed_at', { ascending: false })

  if (error || !historyData) return []

  const studentIds = new Set<number>()
  const userIds = new Set<string>()

  for (const h of historyData) {
    if (h.student_id) studentIds.add(h.student_id)
    if (h.changed_by) userIds.add(h.changed_by)
  }

  const [studentsRes, profilesRes] = await Promise.all([
    studentIds.size > 0
      ? supabase.from('students').select('id, name, roll_number').in('id', Array.from(studentIds))
      : Promise.resolve({ data: [] }),
    userIds.size > 0
      ? supabase.from('profiles').select('id, full_name, role').in('id', Array.from(userIds))
      : Promise.resolve({ data: [] }),
  ])

  const studentMap = new Map((studentsRes.data || []).map((s: any) => [s.id, s]))
  const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]))

  return historyData.map((h: any) => ({
    ...h,
    student: studentMap.get(h.student_id),
    changedByProfile: profileMap.get(h.changed_by),
  }))
}

export async function getAuditTrail(filters?: {
  limit?: number
  classId?: number
  date?: string
  hasRemarkOnly?: boolean
  search?: string
}) {
  const supabase = await createClient()
  const limit = filters?.limit || 150

  let query = supabase
    .from('attendance_history')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (filters?.hasRemarkOnly) {
    query = query.not('remark', 'is', null)
  }

  const { data: historyData, error } = await query
  if (error || !historyData) return []

  const studentIds = new Set<number>()
  const periodIds = new Set<number>()
  const userIds = new Set<string>()

  for (const h of historyData) {
    if (h.student_id) studentIds.add(h.student_id)
    if (h.period_id) periodIds.add(h.period_id)
    if (h.changed_by) userIds.add(h.changed_by)
  }

  const [studentsRes, periodsRes, profilesRes] = await Promise.all([
    studentIds.size > 0
      ? supabase
          .from('students')
          .select('id, name, roll_number, class_id, classes(class_name)')
          .in('id', Array.from(studentIds))
      : Promise.resolve({ data: [] }),
    periodIds.size > 0
      ? supabase
          .from('periods')
          .select('id, date, period_number, start_time, end_time, class_id, classes(class_name), subjects(subject_name)')
          .in('id', Array.from(periodIds))
      : Promise.resolve({ data: [] }),
    userIds.size > 0
      ? supabase.from('profiles').select('id, full_name, role').in('id', Array.from(userIds))
      : Promise.resolve({ data: [] }),
  ])

  const studentMap = new Map((studentsRes.data || []).map((s: any) => [s.id, {
    id: s.id,
    name: s.name,
    roll_number: s.roll_number,
    class_id: s.class_id,
    class_name: s.classes?.class_name,
  }]))

  const periodMap = new Map((periodsRes.data || []).map((p: any) => [p.id, {
    id: p.id,
    date: p.date,
    period_number: p.period_number,
    start_time: p.start_time,
    end_time: p.end_time,
    class_id: p.class_id,
    class_name: p.classes?.class_name,
    subject_name: p.subjects?.subject_name,
  }]))

  const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]))

  let results = historyData.map((h: any) => ({
    ...h,
    student: studentMap.get(h.student_id),
    period: periodMap.get(h.period_id),
    changedByProfile: profileMap.get(h.changed_by),
  }))

  if (filters?.classId) {
    results = results.filter((r) => r.student?.class_id === filters.classId || r.period?.class_id === filters.classId)
  }

  if (filters?.date) {
    results = results.filter((r) => r.period?.date === filters.date)
  }

  if (filters?.search) {
    const q = filters.search.toLowerCase().trim()
    results = results.filter((r) => {
      const sName = r.student?.name?.toLowerCase() || ''
      const sRoll = r.student?.roll_number?.toLowerCase() || ''
      const remark = r.remark?.toLowerCase() || ''
      const changer = r.changedByProfile?.full_name?.toLowerCase() || ''
      return sName.includes(q) || sRoll.includes(q) || remark.includes(q) || changer.includes(q)
    })
  }

  return results
}
