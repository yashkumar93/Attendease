/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getScheduleForDate(date: string, classId?: number) {
  const supabase = await createClient()

  let query = supabase
    .from('periods')
    .select('*, classes(class_name), subjects(subject_name), profiles(full_name)')
    .eq('date', date)
    .order('start_time')

  if (classId) query = query.eq('class_id', classId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as any[]
}

export async function getInstructorSchedule(date: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('periods')
    .select('*, classes(class_name), subjects(subject_name), profiles(full_name)')
    .eq('date', date)
    .eq('instructor_id', user.id)
    .order('start_time')

  if (error) throw new Error(error.message)
  return data as any[]
}

export async function createPeriod(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const date = formData.get('date') as string
  const class_id = parseInt(formData.get('class_id') as string)
  const subject_id = parseInt(formData.get('subject_id') as string)
  const instructor_id = formData.get('instructor_id') as string
  const start_time = formData.get('start_time') as string
  const end_time = formData.get('end_time') as string
  const period_type = formData.get('period_type') as string

  const { error } = await supabase.from('periods').insert({
    date,
    class_id,
    subject_id,
    instructor_id,
    start_time,
    end_time,
    period_type,
    created_by: user.id,
  } as any)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/schedule')
  return { success: true }
}

export async function updatePeriod(id: number, formData: FormData) {
  const supabase = await createClient()

  const subject_id = parseInt(formData.get('subject_id') as string)
  const instructor_id = formData.get('instructor_id') as string
  const start_time = formData.get('start_time') as string
  const end_time = formData.get('end_time') as string
  const period_type = formData.get('period_type') as string

  const { error } = await supabase
    .from('periods')
    .update({ subject_id, instructor_id, start_time, end_time, period_type } as any)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/schedule')
  return { success: true }
}

export async function deletePeriod(id: number) {
  const supabase = await createClient()

  // Check if attendance exists for this period
  const { count } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', id)

  if (count && count > 0) {
    return { error: 'Cannot delete: attendance has been marked for this period. Please clear attendance first.' }
  }

  const { error } = await supabase.from('periods').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/schedule')
  return { success: true }
}

export async function getPeriodById(id: number) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('periods')
    .select('*, classes(class_name), subjects(subject_name), profiles(full_name)')
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  return data as any
}
