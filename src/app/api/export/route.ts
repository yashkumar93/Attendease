/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Google Sheets export Route Handler
// In production, this uses googleapis with OAuth. For now, it generates a CSV download
// since Google OAuth setup requires Cloud Console configuration.
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
    const { date, dateFrom, dateTo, classId, periodId } = body

    const isAdmin = profile && (profile as any).role === 'admin'

    // Build query
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
      return NextResponse.json({ error: 'No attendance records found for the selected scope' }, { status: 404 })
    }

    // Check authorization: if not admin, must be instructor for this period
    if (!isAdmin) {
      const isInstructorForPeriod = records.every(
        (r: any) => (r.periods as any)?.instructor_id === user.id
      )
      if (!isInstructorForPeriod) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }
    }

    // Format as CSV
    const headers = [
      'Date',
      'Class',
      'Subject',
      'Period Time',
      'Period Type',
      'Instructor',
      'Student Name',
      'Roll Number',
      'Status',
      'Remark',
      'Marked At'
    ]

    const rows = (records as any[]).map((r: any) => {
      const period = r.periods as any
      const student = r.students as any
      const cls = period?.classes as any
      const subject = period?.subjects as any
      const instructor = period?.profiles as any

      return [
        period?.date || '',
        cls?.class_name || '',
        subject?.subject_name || '',
        `${period?.start_time?.slice(0, 5)} - ${period?.end_time?.slice(0, 5)}`,
        period?.period_type || '',
        instructor?.full_name || '',
        student?.name || '',
        student?.roll_number || '',
        r.status,
        r.remark || '',
        new Date(r.marked_at).toLocaleString(),
      ]
    })

    const csv = [headers, ...rows]
      .map((row) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    // Generate scope description for log
    const scopeParts: string[] = []
    const firstPeriod = records[0]?.periods as any
    if (periodId) {
      scopeParts.push(`Date: ${firstPeriod?.date}, Period: ${firstPeriod?.subjects?.subject_name} (${firstPeriod?.start_time?.slice(0, 5)} – ${firstPeriod?.end_time?.slice(0, 5)})`)
    } else if (date) {
      scopeParts.push(`Date: ${date}`)
    } else if (dateFrom && dateTo) {
      scopeParts.push(`${dateFrom} to ${dateTo}`)
    }
    if (classId) scopeParts.push(`Class ID: ${classId}`)
    const scopeDesc = scopeParts.join(', ') || 'All records'

    // Log the export
    await supabase.from('export_logs').insert({
      scope_description: scopeDesc,
      google_sheet_url: null,
      exported_by: user.id,
    } as any)

    const filename = periodId
      ? `attendance_${firstPeriod?.date}_${firstPeriod?.subjects?.subject_name?.replace(/\s+/g, '_')}.csv`
      : `attendance_export_${Date.now()}.csv`

    // Return CSV as downloadable response
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Export error:', err)
    return NextResponse.json(
      { error: 'Export failed' },
      { status: 500 }
    )
  }
}
