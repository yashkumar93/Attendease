/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { matchStudent, type StudentRecord } from '@/lib/fuzzy-match'
import { PERIOD_TIMINGS, getCurrentPeriod } from '@/lib/period-config'
import { ensureDailyPeriods } from '@/app/actions/auto-schedule'

/**
 * POST /api/extension/submit
 *
 * Called by the Attendease Chrome Extension to submit attendance scraped
 * from the CCBP instructor platform.
 *
 * Headers:
 *   x-extension-key: <SUPABASE_SERVICE_ROLE_KEY> (shared secret)
 *
 * Body: {
 *   absentNames: string[],       // names scraped from the Absent tab
 *   periodNumber: number,        // 1–7
 *   date: string,                // YYYY-MM-DD
 *   classId: number,             // class ID in Attendease
 *   instructorEmail?: string     // optional: for audit trail
 * }
 *
 * Returns: {
 *   success: boolean,
 *   periodId: number,
 *   totalStudents: number,
 *   absentCount: number,
 *   presentCount: number,
 *   matched: { scraped: string, matched: string, rollNumber?: string, id: number }[],
 *   unmatched: string[]
 * }
 */
export async function POST(request: Request) {
  try {
    // ── Auth: verify shared secret ────────────────────────────────
    const extensionKey = request.headers.get('x-extension-key')
    if (!extensionKey || extensionKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { absentNames, periodNumber, date, classId, instructorEmail } = body

    if (!absentNames || !Array.isArray(absentNames)) {
      return NextResponse.json({ error: 'absentNames must be an array' }, { status: 400 })
    }
    if (!periodNumber || !date || !classId) {
      return NextResponse.json(
        { error: 'periodNumber, date, and classId are required' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // ── Determine who marked it ────────────────────────────────────
    let markedBy = 'extension-bot'
    if (instructorEmail) {
      const { data: authUsers } = await adminClient.auth.admin.listUsers()
      const matchedUser = authUsers?.users?.find(
        (u: any) => u.email?.toLowerCase() === instructorEmail.toLowerCase()
      )
      if (matchedUser) {
        markedBy = matchedUser.id
      }
    }

    // ── Find or auto-create the period ────────────────────────────
    const { data: periods, error: periodErr } = await adminClient
      .from('periods')
      .select('id, instructor_id')
      .eq('date', date)
      .eq('class_id', classId)
      .eq('period_number', periodNumber)

    if (periodErr) {
      return NextResponse.json({ error: `DB error: ${periodErr.message}` }, { status: 500 })
    }

    let periodId: number

    if (periods && periods.length > 0) {
      periodId = periods[0].id
      if (markedBy === 'extension-bot' && periods[0].instructor_id) {
        markedBy = periods[0].instructor_id
      }
    } else {
      // Auto-create period for today if not already scheduled
      const timing = PERIOD_TIMINGS.find((p) => p.period_number === periodNumber) || {
        start_time: '09:20',
        end_time: '10:10',
      }

      const { data: newPeriod, error: createPeriodErr } = await adminClient
        .from('periods')
        .insert({
          date,
          class_id: classId,
          period_number: periodNumber,
          start_time: timing.start_time,
          end_time: timing.end_time,
          period_type: 'Regular',
          instructor_id: markedBy !== 'extension-bot' ? markedBy : null,
          created_by: markedBy !== 'extension-bot' ? markedBy : '0ccc9dfe-283e-49cf-a960-f3e0c3ecf404',
        } as any)
        .select('id')
        .single()

      if (createPeriodErr || !newPeriod) {
        return NextResponse.json(
          { error: `Could not auto-create period: ${createPeriodErr?.message || 'Unknown database error'}` },
          { status: 500 }
        )
      }
      periodId = newPeriod.id

      // Auto-schedule all remaining classes and periods for this date
      try {
        await ensureDailyPeriods(date)
      } catch (autoErr) {
        console.error('Failed to auto-schedule remaining periods:', autoErr)
      }
    }

    // ── Fetch all active students for this class ───────────────────
    const { data: students, error: studentErr } = await adminClient
      .from('students')
      .select('id, name, roll_number')
      .eq('class_id', classId)
      .eq('status', 'active')
      .order('roll_number')

    if (studentErr || !students || students.length === 0) {
      return NextResponse.json(
        { error: 'No active students found for this class in Attendease' },
        { status: 404 }
      )
    }

    const roster: StudentRecord[] = students.map((s: any) => ({
      id: s.id,
      name: s.name,
      roll_number: s.roll_number,
    }))

    // ── Fuzzy-match scraped names against the roster ───────────────
    const matched: { name: string; studentId: number; matchedName: string; rollNumber?: string }[] = []
    const unmatched: string[] = []

    for (const rawName of absentNames) {
      const trimmed = typeof rawName === 'string' ? rawName.trim() : ''
      if (!trimmed) continue

      const result = matchStudent(trimmed, roster)

      if (result.type === 'exact' && result.student) {
        matched.push({
          name: trimmed,
          studentId: result.student.id,
          matchedName: result.student.name,
          rollNumber: result.student.roll_number,
        })
      } else if (result.type === 'ambiguous' && result.suggestions && result.suggestions.length === 1) {
        // High confidence single suggestion
        matched.push({
          name: trimmed,
          studentId: result.suggestions[0].id,
          matchedName: result.suggestions[0].name,
          rollNumber: result.suggestions[0].roll_number,
        })
      } else {
        unmatched.push(trimmed)
      }
    }

    const absentStudentIds = matched.map((m) => m.studentId)

    // ── Create attendance records ──────────────────────────────────
    const absentSet = new Set(absentStudentIds)
    const now = new Date().toISOString()

    const records = students.map((student: any) => ({
      period_id: periodId,
      student_id: student.id,
      status: absentSet.has(student.id) ? 'Absent' : 'Present',
      marked_by: markedBy,
      marked_at: now,
      remark: absentSet.has(student.id) ? 'Marked via CCBP Extension' : null,
    }))

    // Use upsert to handle re-submission gracefully
    const { error: upsertErr } = await adminClient
      .from('attendance')
      .upsert(records as any, { onConflict: 'period_id,student_id' })

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      periodId,
      totalStudents: students.length,
      absentCount: absentStudentIds.length,
      presentCount: students.length - absentStudentIds.length,
      matched: matched.map((m) => ({
        scraped: m.name,
        matched: m.matchedName,
        rollNumber: m.rollNumber,
        id: m.studentId,
      })),
      unmatched,
    })
  } catch (err: any) {
    console.error('Extension submit error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

/**
 * GET /api/extension/submit
 * Returns available classes, today's scheduled periods, standard period slots,
 * and current period indicator for the extension dropdown.
 */
export async function GET(request: Request) {
  try {
    const extensionKey = request.headers.get('x-extension-key')
    if (!extensionKey || extensionKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()

    // Get all classes
    const { data: classes } = await adminClient
      .from('classes')
      .select('id, class_name')
      .order('id')

    // Get today's date in IST
    const now = new Date()
    const istOffset = 5.5 * 60 * 60 * 1000
    const istDate = new Date(now.getTime() + istOffset)
    const today = istDate.toISOString().split('T')[0]

    // Automatically ensure all classes are scheduled for today
    try {
      await ensureDailyPeriods(today)
    } catch (schedErr) {
      console.error('Failed to auto-schedule classes on extension GET:', schedErr)
    }

    // Get today's scheduled periods
    const { data: periods } = await adminClient
      .from('periods')
      .select('id, period_number, class_id, start_time, end_time, classes(class_name), subjects(subject_name)')
      .eq('date', today)
      .order('class_id')
      .order('period_number')

    const currentPeriod = getCurrentPeriod()

    return NextResponse.json({
      classes: classes || [],
      periods: (periods || []).map((p: any) => ({
        id: p.id,
        periodNumber: p.period_number,
        classId: p.class_id,
        className: p.classes?.class_name,
        subjectName: p.subjects?.subject_name,
        startTime: p.start_time?.slice(0, 5),
        endTime: p.end_time?.slice(0, 5),
      })),
      standardPeriods: PERIOD_TIMINGS.map((t) => ({
        periodNumber: t.period_number,
        startTime: t.start_time,
        endTime: t.end_time,
        label: `Period ${t.period_number} (${t.label})`,
      })),
      currentPeriodNumber: currentPeriod?.period_number || null,
      today,
    })
  } catch (err: any) {
    console.error('Extension GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
