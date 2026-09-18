/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ============================================================
// STUDENTS
// ============================================================

export async function getStudents(classId?: number, status?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('students')
    .select('*, classes(class_name)')
    .order('class_id')
    .order('roll_number')

  if (classId) query = query.eq('class_id', classId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as any[]
}

export async function createStudent(formData: FormData) {
  const supabase = await createClient()

  const name = formData.get('name') as string
  const roll_number = formData.get('roll_number') as string
  const class_id = parseInt(formData.get('class_id') as string)
  const contact = (formData.get('contact') as string) || null

  const { error } = await supabase.from('students').insert({
    name,
    roll_number,
    class_id,
    contact,
    status: 'active',
  } as any)

  if (error) {
    if (error.code === '23505') {
      return { error: 'A student with this roll number already exists in this class' }
    }
    return { error: error.message }
  }

  revalidatePath('/dashboard/admin/students')
  return { success: true }
}

export async function updateStudent(id: number, formData: FormData) {
  const supabase = await createClient()

  const name = formData.get('name') as string
  const roll_number = formData.get('roll_number') as string
  const class_id = parseInt(formData.get('class_id') as string)
  const contact = (formData.get('contact') as string) || null

  const { error } = await supabase
    .from('students')
    .update({ name, roll_number, class_id, contact } as any)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/students')
  return { success: true }
}

export async function toggleStudentStatus(id: number, newStatus: 'active' | 'inactive') {
  const supabase = await createClient()

  const { error } = await supabase
    .from('students')
    .update({ status: newStatus } as any)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/students')
  return { success: true }
}

export async function bulkImportStudents(
  students: { name: string; roll_number: string; class_id: number; contact?: string }[]
) {
  const supabase = await createClient()

  const rows = students.map((s) => ({
    name: s.name,
    roll_number: s.roll_number,
    class_id: s.class_id,
    contact: s.contact || null,
    status: 'active',
  }))

  const { error } = await supabase.from('students').insert(rows as any)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/students')
  return { success: true }
}

// ============================================================
// INSTRUCTORS
// ============================================================

export async function getInstructors() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'instructor')
    .order('full_name')

  if (error) throw new Error(error.message)
  return data as any[]
}

export async function createInstructor(formData: FormData) {
  const adminClient = createAdminClient()

  const full_name = formData.get('full_name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const contact = (formData.get('contact') as string) || null

  // Create auth user via admin client
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) return { error: authError.message }

  // Create profile
  const { error: profileError } = await adminClient.from('profiles').insert({
    id: authData.user.id,
    role: 'instructor',
    full_name,
    contact,
    is_active: true,
  } as any)

  if (profileError) {
    // Rollback: delete the auth user if profile creation fails
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return { error: profileError.message }
  }

  revalidatePath('/dashboard/admin/instructors')
  return { success: true }
}

export async function updateInstructor(id: string, formData: FormData) {
  const supabase = await createClient()

  const full_name = formData.get('full_name') as string
  const contact = (formData.get('contact') as string) || null

  const { error } = await supabase
    .from('profiles')
    .update({ full_name, contact } as any)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/instructors')
  return { success: true }
}

export async function toggleInstructorStatus(id: string, isActive: boolean) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive } as any)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/instructors')
  return { success: true }
}

// ============================================================
// SUBJECTS
// ============================================================

export async function getSubjects() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .order('subject_name')

  if (error) throw new Error(error.message)
  return data as any[]
}

export async function createSubject(formData: FormData) {
  const supabase = await createClient()
  const subject_name = formData.get('subject_name') as string

  const { error } = await supabase.from('subjects').insert({ subject_name } as any)

  if (error) {
    if (error.code === '23505') return { error: 'This subject already exists' }
    return { error: error.message }
  }

  revalidatePath('/dashboard/admin/subjects')
  return { success: true }
}

export async function updateSubject(id: number, formData: FormData) {
  const supabase = await createClient()
  const subject_name = formData.get('subject_name') as string

  const { error } = await supabase
    .from('subjects')
    .update({ subject_name } as any)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/subjects')
  return { success: true }
}

export async function deleteSubject(id: number) {
  const supabase = await createClient()

  const { error } = await supabase.from('subjects').delete().eq('id', id)

  if (error) {
    if (error.code === '23503') {
      return { error: 'Cannot delete: this subject is used in existing schedule periods' }
    }
    return { error: error.message }
  }

  revalidatePath('/dashboard/admin/subjects')
  return { success: true }
}

// ============================================================
// CLASSES
// ============================================================

export async function getClasses() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .order('id')

  if (error) throw new Error(error.message)
  return data as any[]
}
