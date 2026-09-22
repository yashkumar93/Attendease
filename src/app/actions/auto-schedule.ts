/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
// BN-14: Import from the canonical shared config instead of re-declaring locally.
// Previously this file had its own copy of PERIOD_TIMINGS which could silently
// diverge from the source of truth in period-config.ts.
import { PERIOD_TIMINGS, ACTIVE_DAYS } from '@/lib/period-config'

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

  // BN-12: Single query to get ALL class IDs that already have periods for this
  // date — replaces the old per-class SELECT count(*) inside a loop
  // (previously N round-trips, now just 1).
  const { data: existingPeriods, error: existErr } = await adminClient
    .from('periods')
    .select('class_id')
    .eq('date', dateStr)

  if (existErr) {
    return { error: `Failed to check existing periods: ${existErr.message}` }
  }

  const classesWithPeriods = new Set(
    (existingPeriods || []).map((p: any) => p.class_id)
  )

  let totalCreated = 0

  for (const cls of classes) {
    // Skip classes that already have periods today (O(1) Set lookup)
    if (classesWithPeriods.has(cls.id)) {
      continue
    }

    // Create 7 periods for this class
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
