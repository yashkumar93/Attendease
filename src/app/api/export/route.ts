/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAttendanceSheet, type AttendanceRow } from '@/lib/google/sheets'

/**
 * POST /api/export
 * Body: { date?, dateFrom?, dateTo?, classId?, periodId?, format?: 'csv' | 'sheets' }
 *
 * Returns:
 *   - format=csv  → CSV file download
 *   - format=sheets → JSON { url: '...' } with the Google Sheet URL
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile as any).role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { date, dateFrom, dateTo, classId, periodId, format = 'csv' } = body

    // Build attendance query
    let query = supabase
      .from('attendance')
      .select(`
        status, marked_at, remark,
        students(name, roll_number),
        periods!inner(
          id, date, start_time, end_time, period_type, instructor_id,
          classes(class_name),
          subjects(subject_name),
          profiles(full_name)
        )
      `)

    if (periodId) {
      query = query.eq('periods.id', periodId)
    } else if (date) {
      query = query.eq('periods.date', date)
    } else if (dateFrom && dateTo) {
      query = query.gte('periods.date', dateFrom).lte('periods.date', dateTo)
    }

    if (classId) {
      query = query.eq('periods.class_id', classId)
    }

    const { data: records, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!records || records.length === 0) {
      return NextResponse.json(
        { error: 'No attendance records found for the selected scope' },
        { status: 404 }
      )
    }

    // Map records to a unified row shape
    const rows: AttendanceRow[] = (records as any[]).map((r: any) => {
      const period = r.periods as any
      const student = r.students as any
      const cls = period?.classes as any
      const subject = period?.subjects as any
      const instructor = period?.profiles as any
      return {
        date: period?.date || '',
        className: cls?.class_name || '',
        subjectName: subject?.subject_name || '',
        periodTime: `${period?.start_time?.slice(0, 5)} - ${period?.end_time?.slice(0, 5)}`,
        periodType: period?.period_type || '',
        instructor: instructor?.full_name || '',
        studentName: student?.name || '',
        rollNumber: student?.roll_number || '',
        status: r.status,
        remark: r.remark || '',
        markedAt: r.marked_at ? new Date(r.marked_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      }
    })

    // Build scope description for the log
    const scopeParts: string[] = []
    const firstPeriod = (records[0] as any)?.periods as any
    if (periodId) {
      scopeParts.push(`Period: ${firstPeriod?.subjects?.subject_name || 'Unassigned'} (${firstPeriod?.start_time?.slice(0, 5)} – ${firstPeriod?.end_time?.slice(0, 5)}) on ${firstPeriod?.date}`)
    } else if (date) {
      scopeParts.push(`Date: ${date}`)
    } else if (dateFrom && dateTo) {
      scopeParts.push(`${dateFrom} to ${dateTo}`)
    }
    if (classId) scopeParts.push(`Class ID: ${classId}`)
    const scopeDesc = scopeParts.join(', ') || 'All records'

    // ── Google Sheets export ───────────────────────────────────────────────
    if (format === 'sheets') {
      const title = `Attendance – ${scopeDesc}`

      let sheetUrl: string
      try {
        sheetUrl = await createAttendanceSheet(title, rows)
      } catch (sheetsErr: any) {
        console.error('Google Sheets error:', sheetsErr)
        return NextResponse.json(
          { error: `Google Sheets export failed: ${sheetsErr.message}` },
          { status: 500 }
        )
      }

      // Log the export
      await supabase.from('export_logs').insert({
        scope_description: scopeDesc,
        google_sheet_url: sheetUrl,
        exported_by: user.id,
      } as any)

      return NextResponse.json({ url: sheetUrl })
    }

    // ── CSV export (default) ───────────────────────────────────────────────
    const csvHeaders = [
      'Date', 'Class', 'Subject', 'Period Time', 'Period Type',
      'Instructor', 'Student Name', 'Roll Number', 'Status', 'Remark', 'Marked At',
    ]

    const csvRows = rows.map((r) => [
      r.date, r.className, r.subjectName, r.periodTime, r.periodType,
      r.instructor, r.studentName, r.rollNumber, r.status, r.remark, r.markedAt,
    ])

    const csv = [csvHeaders, ...csvRows]
      .map((row) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const filename = periodId
      ? `attendance_${firstPeriod?.date}_${firstPeriod?.subjects?.subject_name?.replace(/\s+/g, '_') || 'period'}.csv`
      : `attendance_export_${Date.now()}.csv`

    // Log CSV export
    await supabase.from('export_logs').insert({
      scope_description: scopeDesc,
      google_sheet_url: null,
      exported_by: user.id,
    } as any)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Export error:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
