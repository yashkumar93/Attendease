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

  // Create attendance records — all present by default, absent for flagged ones
  const records = (students as any[]).map((student: any) => ({
    period_id: periodId,
    student_id: student.id,
    status: absentStudentIds.includes(student.id) ? 'Absent' : 'Present',
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

  // Fetch record to verify period authorization
  const { data: record, error: recordErr } = await adminClient
    .from('attendance')
    .select('id, period_id, status, periods(instructor_id)')
    .eq('id', attendanceId)
    .single()

  if (recordErr || !record) return { error: 'Attendance record not found' }

  const isAdmin = profile?.role === 'admin'
  const isInstructor = (record as any)?.periods?.instructor_id === user.id

  if (!isAdmin && !isInstructor) {
    return { error: 'Unauthorized to edit attendance for this period' }
  }

  const { error } = await adminClient
    .from('attendance')
    .update({
      status: newStatus,
      last_modified_by: user.id,
      last_modified_at: new Date().toISOString(),
      remark: remark?.trim() || null,
    } as any)
    .eq('id', attendanceId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/attendance/${(record as any).period_id}`)
  revalidatePath('/dashboard/admin/attendance')
  revalidatePath('/dashboard/instructor')
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
  const isInstructor = period.instructor_id === user.id

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
    .select('id, student_id, status')
    .eq('period_id', periodId)

  const existingMap = new Map((existing || []).map((e: any) => [e.student_id, e]))

  const updates = []
  const inserts = []

  for (const s of students) {
    const targetStatus = absentStudentIds.includes(s.id) ? 'Absent' : 'Present'
    const cur = existingMap.get(s.id)
    if (cur) {
      if (cur.status !== targetStatus) {
        updates.push({
          id: cur.id,
          status: targetStatus,
          last_modified_by: user.id,
          last_modified_at: new Date().toISOString(),
          remark: batchRemark?.trim() || 'Updated by admin',
        })
      }
    } else {
      inserts.push({
        period_id: periodId,
        student_id: s.id,
        status: targetStatus,
        marked_by: user.id,
        remark: batchRemark?.trim() || null,
      })
    }
  }

  for (const u of updates) {
    await adminClient.from('attendance').update(u).eq('id', u.id)
  }

  if (inserts.length > 0) {
    await adminClient.from('attendance').insert(inserts)
  }

  revalidatePath(`/dashboard/attendance/${periodId}`)
  revalidatePath('/dashboard/admin/attendance')
  revalidatePath('/dashboard/instructor')
  return { success: true, updatedCount: updates.length + inserts.length }
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
    .select('*')
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

  // Get active students for that class
  const { data: students, error } = await supabase
    .from('students')
    .select('*')
    .eq('class_id', (period as any).class_id)
    .eq('status', 'active')
    .order('roll_number')

  if (error) throw new Error(error.message)
  return students as any[]
}
