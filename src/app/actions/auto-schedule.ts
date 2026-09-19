/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// Fixed daily period timings (Mon–Sat)
const PERIOD_TIMINGS = [
  { period_number: 1, start_time: '09:20', end_time: '10:10' },
  { period_number: 2, start_time: '10:10', end_time: '11:00' },
  { period_number: 3, start_time: '11:00', end_time: '11:50' },
  { period_number: 4, start_time: '11:50', end_time: '12:40' },
  { period_number: 5, start_time: '13:30', end_time: '14:20' },
  { period_number: 6, start_time: '14:20', end_time: '15:10' },
  { period_number: 7, start_time: '15:10', end_time: '16:00' },
]

// Days on which to auto-create (0=Sun, 1=Mon, ..., 6=Sat)
const ACTIVE_DAYS = [1, 2, 3, 4, 5, 6] // Mon–Sat

/**
 * Ensures 7 period slots exist for a given date and all classes.
 * Skips Sundays. Uses admin client to bypass RLS.
 */
export async function ensureDailyPeriods(targetDate?: string) {
  const dateStr = targetDate || new Date().toISOString().split('T')[0]

  // Check day of week (use UTC to avoid timezone issues)
  const dayOfWeek = new Date(dateStr + 'T00:00:00Z').getUTCDay()
  if (!ACTIVE_DAYS.includes(dayOfWeek)) {
    return { skipped: true, reason: 'Not an active day (Sunday)' }
  }

  const adminClient = createAdminClient()

  // Fetch all classes
  const { data: classes, error: classErr } = await adminClient
    .from('classes')
    .select('id')

  if (classErr || !classes || classes.length === 0) {
    return { error: 'No classes found' }
  }

  // Fetch first admin as default created_by user
  const { data: defaultAdmin } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!defaultAdmin) {
    return { error: 'No active admin found to set as created_by' }
  }

  let totalCreated = 0

  for (const cls of classes) {
    // Check if periods already exist for this date + class
    const { count } = await adminClient
      .from('periods')
      .select('*', { count: 'exact', head: true })
      .eq('date', dateStr)
      .eq('class_id', cls.id)

    if (count && count > 0) {
      // Periods already exist for this class on this date, skip
      continue
    }

    // Create 7 periods
    const periods = PERIOD_TIMINGS.map((timing) => ({
      date: dateStr,
      class_id: cls.id,
      subject_id: null,
      instructor_id: null,
      start_time: timing.start_time,
      end_time: timing.end_time,
      period_type: 'Lecture' as const,
      period_number: timing.period_number,
      created_by: defaultAdmin.id,
    }))

    const { error: insertErr } = await adminClient
      .from('periods')
      .insert(periods as any)

    if (insertErr) {
      console.error(`Failed to create periods for class ${cls.id} on ${dateStr}:`, insertErr)
      return { error: `Failed to create periods: ${insertErr.message}` }
    }

    totalCreated += 7
  }

  return {
    success: true,
    date: dateStr,
    totalCreated,
    message: totalCreated > 0
      ? `Created ${totalCreated} periods for ${dateStr}`
      : `Periods already exist for ${dateStr}`,
  }
}
