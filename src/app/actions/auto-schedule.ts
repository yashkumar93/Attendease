/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { PERIOD_TIMINGS, ACTIVE_DAYS } from '@/lib/period-config'

/**
 * Ensures all 7 period slots exist for a given date across all classes in the database.
 * If a class already has some periods (e.g., period 2 was created on the fly),
 * this function detects and fills only the missing periods (1–7) so all classes are fully scheduled.
 * Skips Sundays unless forceActiveDay is true.
 */
export async function ensureDailyPeriods(
  targetDate?: string,
  options?: { forceActiveDay?: boolean }
) {
  const dateStr = targetDate || new Date().toISOString().split('T')[0]

  // Check day of week (use UTC to avoid timezone issues)
  const dayOfWeek = new Date(dateStr + 'T00:00:00Z').getUTCDay()
  if (!options?.forceActiveDay && !ACTIVE_DAYS.includes(dayOfWeek)) {
    return { skipped: true, reason: 'Not an active day (Sunday)', date: dateStr }
  }

  const adminClient = createAdminClient()

  // Fetch all active classes
  const { data: classes, error: classErr } = await adminClient
    .from('classes')
    .select('id, class_name')
    .order('id')

  if (classErr || !classes || classes.length === 0) {
    return { error: 'No classes found' }
  }

  // Fetch first admin as default created_by user with fallback
  let creatorId = '0ccc9dfe-283e-49cf-a960-f3e0c3ecf404' // Ujjwal (default admin)
  const { data: defaultAdmin } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (defaultAdmin?.id) {
    creatorId = defaultAdmin.id
  }

  // Fetch ALL existing periods for this date
  const { data: existingPeriods, error: existErr } = await adminClient
    .from('periods')
    .select('id, class_id, period_number')
    .eq('date', dateStr)

  if (existErr) {
    return { error: `Failed to check existing periods: ${existErr.message}` }
  }

  // Build a Set of existing "classId_periodNumber" slots for O(1) existence checks
  const existingSlots = new Set<string>()
  for (const p of existingPeriods || []) {
    if (p.period_number != null) {
      existingSlots.add(`${p.class_id}_${p.period_number}`)
    }
  }

  // Build the list of missing periods to insert
  const periodsToInsert: any[] = []

  for (const cls of classes) {
    for (const timing of PERIOD_TIMINGS) {
      const slotKey = `${cls.id}_${timing.period_number}`
      if (existingSlots.has(slotKey)) {
        continue
      }

      periodsToInsert.push({
        date: dateStr,
        class_id: cls.id,
        subject_id: null,
        instructor_id: null,
        start_time: timing.start_time,
        end_time: timing.end_time,
        period_type: 'Lecture',
        period_number: timing.period_number,
        created_by: creatorId,
      })
    }
  }

  let totalCreated = 0

  if (periodsToInsert.length > 0) {
    const { error: insertErr } = await adminClient
      .from('periods')
      .insert(periodsToInsert)

    if (insertErr) {
      console.error(`Failed to create periods on ${dateStr}:`, insertErr)
      return { error: `Failed to create periods: ${insertErr.message}` }
    }

    totalCreated = periodsToInsert.length
  }

  return {
    success: true,
    date: dateStr,
    totalCreated,
    totalClasses: classes.length,
    message:
      totalCreated > 0
        ? `Successfully scheduled ${totalCreated} missing period slots for ${classes.length} class(es) on ${dateStr}`
        : `All ${classes.length} class(es) are already fully scheduled for ${dateStr}`,
  }
}

/**
 * Automatically schedules all classes for a range of upcoming days.
 * E.g., next 7 days or next 30 days. Skips Sundays automatically.
 */
export async function ensureDateRangePeriods(
  startDateStr?: string,
  daysCount = 7,
  options?: { forceActiveDay?: boolean }
) {
  const start = startDateStr
    ? new Date(startDateStr + 'T00:00:00Z')
    : new Date()

  let totalCreatedOverall = 0
  let daysScheduled = 0
  const summaryByDate: { date: string; created: number; skipped?: boolean }[] = []

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const dateStr = d.toISOString().split('T')[0]

    const result = await ensureDailyPeriods(dateStr, options)
    if (result.success && (result.totalCreated || 0) > 0) {
      totalCreatedOverall += result.totalCreated || 0
      daysScheduled++
      summaryByDate.push({ date: dateStr, created: result.totalCreated || 0 })
    } else if (result.skipped) {
      summaryByDate.push({ date: dateStr, created: 0, skipped: true })
    } else {
      summaryByDate.push({ date: dateStr, created: 0 })
    }
  }

  return {
    success: true,
    totalCreated: totalCreatedOverall,
    daysScheduled,
    daysCount,
    summary: summaryByDate,
    message: `Scheduled ${totalCreatedOverall} period slots across ${daysCount} days`,
  }
}

