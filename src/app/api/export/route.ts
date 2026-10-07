/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createAttendanceSheet,
  createPivotAttendanceSheet,
  createBulkSessionSheets,
  getSessionTitle,
  type AttendanceRow,
  type BulkSessionData,
  type BulkSessionStudent,
} from '@/lib/google/sheets'

/**
 * POST /api/export
 * Body: { date?, dateFrom?, dateTo?, classId?, periodId?, rangePeriodId?,
 *         format?: 'csv' | 'sheets' | 'sheets_bulk' }
 *
 * Returns:
 *   - format=csv         → CSV file download
 *   - format=sheets      → JSON { url } with the Google Sheet URL (single tab)
 *   - format=sheets_bulk → JSON { url, tabCount } — 7 session sub-sheets (1st Session to 7th Session) in date matrix format
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

    // ── Bulk export: 7 session sub-sheets (1st Session to 7th Session) in date matrix format ──
    if (format === 'sheets_bulk') {
      if (!date && !(dateFrom && dateTo)) {
        return NextResponse.json(
          { error: 'A date or date range is required for bulk period export.' },
          { status: 400 }
        )
      }

      // Generate continuous calendar dates for the selected date or range
      const dates: string[] = []
      if (dateFrom && dateTo) {
        const cur = new Date(dateFrom + 'T00:00:00')
        const end = new Date(dateTo + 'T00:00:00')
        while (cur <= end) {
          const y = cur.getFullYear()
          const m = String(cur.getMonth() + 1).padStart(2, '0')
          const d = String(cur.getDate()).padStart(2, '0')
          dates.push(`${y}-${m}-${d}`)
          cur.setDate(cur.getDate() + 1)
        }
      } else if (date) {
        dates.push(date)
      }

      // Query active students for roster
      let studentQuery = supabase
        .from('students')
        .select('id, name, roll_number, class_id, status')
        .eq('status', 'active')

      if (classId) {
        studentQuery = studentQuery.eq('class_id', classId)
      }

      const { data: dbStudents } = await studentQuery

      let sortedStudents: BulkSessionStudent[] = (dbStudents || [])
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          rollNumber: s.roll_number,
        }))
        .sort((a, b) => {
          const numA = parseInt(String(a.rollNumber).replace(/\D/g, ''), 10)
          const numB = parseInt(String(b.rollNumber).replace(/\D/g, ''), 10)
          if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
            return numA - numB
          }
          return String(a.rollNumber).localeCompare(String(b.rollNumber))
        })

      // Fetch all attendance for the date/range
      let bulkQuery = supabase
        .from('attendance')
        .select(`
          status, marked_at, remark, marked_by, student_id,
          students(id, name, roll_number),
          periods!inner(
            id, date, start_time, end_time, period_type, period_number, class_id,
            classes(class_name),
            subjects(subject_name)
          )
        `)

      if (dateFrom && dateTo) {
        bulkQuery = bulkQuery.gte('periods.date', dateFrom).lte('periods.date', dateTo)
      } else {
        bulkQuery = bulkQuery.eq('periods.date', date)
      }

      if (classId) {
        bulkQuery = bulkQuery.eq('periods.class_id', classId)
      }

      const { data: records, error } = await bulkQuery

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Fallback roster from attendance records if student table query was empty
      if (sortedStudents.length === 0 && records && records.length > 0) {
        const studentMap = new Map<number, BulkSessionStudent>()
        for (const r of records as any[]) {
          const s = r.students
          if (s && !studentMap.has(s.id)) {
            studentMap.set(s.id, {
              id: s.id,
              name: s.name,
              rollNumber: s.roll_number,
            })
          }
        }
        sortedStudents = Array.from(studentMap.values()).sort((a, b) => {
          const numA = parseInt(String(a.rollNumber).replace(/\D/g, ''), 10)
          const numB = parseInt(String(b.rollNumber).replace(/\D/g, ''), 10)
          if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
            return numA - numB
          }
          return String(a.rollNumber).localeCompare(String(b.rollNumber))
        })
      }

      if (sortedStudents.length === 0) {
        return NextResponse.json(
          { error: 'No students found for the selected scope.' },
          { status: 404 }
        )
      }

      // Build status lookup: periodNumber (1..7) -> studentId -> date -> 'Present' | 'Absent'
      const periodAttendanceMap = new Map<number, Map<number, Map<string, string>>>()
      for (let p = 1; p <= 7; p++) {
        periodAttendanceMap.set(p, new Map())
      }

      for (const r of (records || []) as any[]) {
        const periodNum = r.periods?.period_number
        if (!periodNum || periodNum < 1 || periodNum > 7) continue
        const studentId = r.student_id || r.students?.id
        const pDate = r.periods?.date
        const status = r.status

        let studentMap = periodAttendanceMap.get(periodNum)!.get(studentId)
        if (!studentMap) {
          studentMap = new Map<string, string>()
          periodAttendanceMap.get(periodNum)!.set(studentId, studentMap)
        }
        studentMap.set(pDate, status)
      }

      // Create 7 session structures: 1st Session, 2nd Session, ... 7th Session
      const sessions: BulkSessionData[] = []
      for (let p = 1; p <= 7; p++) {
        sessions.push({
          sessionTitle: getSessionTitle(p),
          periodNumber: p,
          dates,
          students: sortedStudents,
          attendanceMap: periodAttendanceMap.get(p)!,
        })
      }

      let sheetUrl: string
      try {
        sheetUrl = await createBulkSessionSheets(sessions)
      } catch (sheetsErr: any) {
        console.error('Bulk Google Sheets error:', sheetsErr)
        return NextResponse.json(
          { error: `Bulk export failed: ${sheetsErr.message}` },
          { status: 500 }
        )
      }

      // Log the export
      const scopeLabel = dateFrom && dateTo
        ? `${dateFrom} to ${dateTo}`
        : date
      const scopeDesc = `${scopeLabel} – 7 Sessions Bulk Export (${dates.length} days, ${sortedStudents.length} students)`
      const { error: logErr } = await supabase.from('export_logs').insert({
        scope_description: scopeDesc,
        google_sheet_url: sheetUrl,
        exported_by: user.id,
      } as any)
      if (logErr) {
        console.warn('Could not insert bulk export log:', logErr.message)
      }

      return NextResponse.json({ url: sheetUrl, tabCount: sessions.length })
    }

    // ── Standard single export (csv / sheets) ───────────────────────────────

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
