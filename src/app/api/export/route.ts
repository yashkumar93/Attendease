/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAttendanceSheet, createPivotAttendanceSheet, type AttendanceRow } from '@/lib/google/sheets'

/**
 * POST /api/export
 * Body: { date?, dateFrom?, dateTo?, classId?, periodId?, rangePeriodId?, format?: 'csv' | 'sheets' }
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

    // Verify admin or instructor role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = (profile as any)?.role
    if (!profile || (role !== 'admin' && role !== 'instructor')) {
      return NextResponse.json({ error: 'Admin or instructor access required' }, { status: 403 })
    }

    const body = await request.json()
    const { date, dateFrom, dateTo, classId, periodId, rangePeriodId, format = 'csv' } = body

    // If a representative period slot is selected (rangePeriodId), resolve its details once
    let refPeriodData: any = null
    if (rangePeriodId) {
      const { data: refPeriod } = await supabase
        .from('periods')
        .select('period_number, start_time, end_time, subjects(subject_name)')
        .eq('id', rangePeriodId)
        .single()
      refPeriodData = refPeriod
    }

    // Build attendance query
    let query = supabase
      .from('attendance')
      .select(`
        status, marked_at, remark, marked_by,
        students(name, roll_number),
        periods!inner(
          id, date, start_time, end_time, period_type, period_number,
          classes(class_name)
        )
      `)

    if (periodId) {
      query = query.eq('periods.id', periodId)
    } else if (date) {
      query = query.eq('periods.date', date)
    } else if (dateFrom && dateTo) {
      query = query.gte('periods.date', dateFrom).lte('periods.date', dateTo)
      // Filter by period_number + start_time across the date range
      if (refPeriodData) {
        query = query
          .eq('periods.period_number', refPeriodData.period_number)
          .eq('periods.start_time', refPeriodData.start_time)
      }
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

    // Resolve human names for marked_by
    const markerIds = Array.from(
      new Set((records as any[]).map((r: any) => r.marked_by).filter(Boolean))
    )
    const markerMap = new Map<string, string>()
    if (markerIds.length > 0) {
      const { data: markerProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', markerIds)
      for (const p of markerProfiles || []) {
        markerMap.set(p.id, p.full_name)
      }
    }

    // Map records to a unified row shape (removed Subject and Instructor, added Marked By)
    const rows: AttendanceRow[] = (records as any[]).map((r: any) => {
      const period = r.periods as any
      const student = r.students as any
      const cls = period?.classes as any
      const markerName = markerMap.get(r.marked_by) || (r.marked_by ? 'Staff' : 'System')
      return {
        date: period?.date || '',
        className: cls?.class_name || '',
        periodTime: `${period?.start_time?.slice(0, 5)} - ${period?.end_time?.slice(0, 5)}`,
        periodType: period?.period_type || '',
        studentName: student?.name || '',
        rollNumber: student?.roll_number || '',
        status: r.status,
        markedBy: markerName,
        remark: r.remark || '',
        markedAt: r.marked_at ? new Date(r.marked_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      }
    })

    // Check if this is a pivot export (date range + specific period slot)
    const isPivot = Boolean(dateFrom && dateTo && rangePeriodId)

    // Build scope description + sheet tab name
    const scopeParts: string[] = []
    const firstPeriod = (records[0] as any)?.periods as any
    if (periodId) {
      scopeParts.push(`${firstPeriod?.date} · P${firstPeriod?.period_number} (${firstPeriod?.start_time?.slice(0, 5)}–${firstPeriod?.end_time?.slice(0, 5)})`)
    } else if (date) {
      scopeParts.push(`${date}`)
    } else if (dateFrom && dateTo) {
      let rangeLabel = `${dateFrom} to ${dateTo}`
      if (refPeriodData) {
        const subj = refPeriodData.subjects?.subject_name ? ` ${refPeriodData.subjects.subject_name}` : ''
        rangeLabel += ` · P${refPeriodData.period_number}${subj} (${refPeriodData.start_time?.slice(0, 5)}–${refPeriodData.end_time?.slice(0, 5)})`
      }
      scopeParts.push(rangeLabel)
    }
    if (classId) {
      const { data: cls } = await supabase.from('classes').select('class_name').eq('id', classId).single()
      if (cls) scopeParts.push((cls as any).class_name)
    }
    const scopeDesc = scopeParts.join(', ') || 'All records'

    // Tab title: If date range + specific period, name like: "2026-09-01 to 2026-09-30 (P1)"
    const sheetTitle = isPivot && refPeriodData
      ? `${dateFrom} to ${dateTo} (P${refPeriodData.period_number})`
      : `Attendance – ${scopeDesc}`

    // ── Google Sheets export ───────────────────────────────────────────────
    if (format === 'sheets') {
      let sheetUrl: string
      try {
        if (isPivot) {
          sheetUrl = await createPivotAttendanceSheet(sheetTitle, rows)
        } else {
          sheetUrl = await createAttendanceSheet(sheetTitle, rows)
        }
      } catch (sheetsErr: any) {
        console.error('Google Sheets error:', sheetsErr)
        return NextResponse.json(
          { error: `Google Sheets export failed: ${sheetsErr.message}` },
          { status: 500 }
        )
      }

      // Log the export
      const { error: logErr } = await supabase.from('export_logs').insert({
        scope_description: scopeDesc,
        google_sheet_url: sheetUrl,
        exported_by: user.id,
      } as any)
      if (logErr) {
        console.warn('Could not insert Google Sheets export log:', logErr.message)
      }

      return NextResponse.json({ url: sheetUrl })
    }

    // ── CSV export (default) ───────────────────────────────────────────────
    if (isPivot) {
      // Build pivot CSV: rows = students, columns = dates
      const dateSet = new Set(rows.map((r) => r.date))
      const dates = Array.from(dateSet).sort()

      const studentMap = new Map<string, { name: string; roll: string; className: string; periodTime: string }>()
      for (const r of rows) {
        if (!studentMap.has(r.rollNumber)) {
          studentMap.set(r.rollNumber, {
            name: r.studentName,
            roll: r.rollNumber,
            className: r.className,
            periodTime: r.periodTime,
          })
        }
      }

      const students = Array.from(studentMap.values()).sort((a, b) => {
        const na = parseInt(a.roll, 10)
        const nb = parseInt(b.roll, 10)
        return isNaN(na) || isNaN(nb) ? a.roll.localeCompare(b.roll) : na - nb
      })

      const statusMap = new Map<string, Map<string, string>>()
      for (const r of rows) {
        if (!statusMap.has(r.rollNumber)) statusMap.set(r.rollNumber, new Map())
        statusMap.get(r.rollNumber)!.set(r.date, r.status)
      }

      const fmtDate = (d: string) => {
        const dt = new Date(d + 'T00:00:00')
        return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      }

      const pivotHeaders = [
        'Roll No', 'Student Name', 'Class', 'Period',
        ...dates.map(fmtDate),
        'Present', 'Absent', 'Attendance %',
      ]

      const pivotRows = students.map((s) => {
        const byDate = statusMap.get(s.roll) || new Map()
        const dateCells = dates.map((d) => byDate.get(d) || '—')
        const presentCount = dateCells.filter((c) => c === 'Present').length
        const absentCount = dateCells.filter((c) => c === 'Absent').length
        const total = presentCount + absentCount
        const pct = total > 0 ? `${Math.round((presentCount / total) * 100)}%` : '—'
        return [s.roll, s.name, s.className, s.periodTime, ...dateCells, presentCount, absentCount, pct]
      })

      const csv = [pivotHeaders, ...pivotRows]
        .map((row) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n')

      const filename = `attendance_${dateFrom}_to_${dateTo}_P${refPeriodData?.period_number || 'slot'}.csv`

      // Log CSV export
      const { error: logErr } = await supabase.from('export_logs').insert({
        scope_description: scopeDesc,
        google_sheet_url: null,
        exported_by: user.id,
      } as any)
      if (logErr) {
        console.warn('Could not insert CSV export log:', logErr.message)
      }

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // Standard linear CSV export
    const csvHeaders = [
      'Date', 'Class', 'Period Time', 'Period Type',
      'Student Name', 'Roll Number', 'Status', 'Marked By', 'Remark', 'Marked At',
    ]

    const csvRows = rows.map((r) => [
      r.date, r.className, r.periodTime, r.periodType,
      r.studentName, r.rollNumber, r.status, r.markedBy, r.remark, r.markedAt,
    ])

    const csv = [csvHeaders, ...csvRows]
      .map((row) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const filename = periodId
      ? `attendance_${firstPeriod?.date}_${firstPeriod?.classes?.class_name?.replace(/\s+/g, '_') || 'period'}.csv`
      : `attendance_export_${Date.now()}.csv`

    // Log CSV export
    const { error: logErr } = await supabase.from('export_logs').insert({
      scope_description: scopeDesc,
      google_sheet_url: null,
      exported_by: user.id,
    } as any)
    if (logErr) {
      console.warn('Could not insert CSV export log:', logErr.message)
    }

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
