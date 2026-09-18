/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createClient } from '@/lib/supabase/server'

export async function getExportLogs() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('export_logs')
    .select('*')
    .order('exported_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return data as any[]
}

export async function getExportData(params: {
  date?: string
  dateFrom?: string
  dateTo?: string
  classId?: number
  periodId?: number
}) {
  const supabase = await createClient()

  let query = supabase
    .from('attendance')
    .select(`
      *,
      students(name, roll_number),
      periods!inner(
        id,
        date, start_time, end_time, period_type,
        classes(class_name),
        subjects(subject_name),
        profiles(full_name)
      )
    `)

  if (params.periodId) {
    query = query.eq('periods.id', params.periodId)
  } else if (params.date) {
    query = query.eq('periods.date', params.date)
  } else if (params.dateFrom && params.dateTo) {
    query = query.gte('periods.date', params.dateFrom).lte('periods.date', params.dateTo)
  }

  if (params.classId) {
    query = query.eq('periods.class_id', params.classId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as any[]
}

export async function saveExportLog(scopeDescription: string, sheetUrl: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('export_logs').insert({
    scope_description: scopeDescription,
    google_sheet_url: sheetUrl,
    exported_by: user.id,
  } as any)

  if (error) throw new Error(error.message)
}
