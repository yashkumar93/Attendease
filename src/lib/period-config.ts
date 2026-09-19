/**
 * Shared period timing configuration.
 * Used by auto-scheduler, chatbot, and UI components.
 */

export const PERIOD_TIMINGS = [
  { period_number: 1, start_time: '09:20', end_time: '10:10', label: '9:20 – 10:10 AM' },
  { period_number: 2, start_time: '10:10', end_time: '11:00', label: '10:10 – 11:00 AM' },
  { period_number: 3, start_time: '11:00', end_time: '11:50', label: '11:00 – 11:50 AM' },
  { period_number: 4, start_time: '11:50', end_time: '12:40', label: '11:50 AM – 12:40 PM' },
  // Lunch: 12:40 – 1:30 PM
  { period_number: 5, start_time: '13:30', end_time: '14:20', label: '1:30 – 2:20 PM' },
  { period_number: 6, start_time: '14:20', end_time: '15:10', label: '2:20 – 3:10 PM' },
  { period_number: 7, start_time: '15:10', end_time: '16:00', label: '3:10 – 4:00 PM' },
] as const

export type PeriodTiming = (typeof PERIOD_TIMINGS)[number]

/** Days on which periods are created (0=Sun, 1=Mon, ..., 6=Sat) */
export const ACTIVE_DAYS = [1, 2, 3, 4, 5, 6] // Mon–Sat

/**
 * Get current time in IST (UTC+5:30) as HH:MM string.
 */
export function getCurrentISTTime(): { timeString: string; hours: number; minutes: number; displayTime: string } {
  const now = new Date()
  const istOffset = 5.5 * 60 // minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  const istMinutes = utcMinutes + istOffset

  const hours = Math.floor(istMinutes / 60) % 24
  const minutes = Math.floor(istMinutes % 60)
  const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

  // Format 12-hour display time
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  const displayTime = `${displayHours}:${String(minutes).padStart(2, '0')} ${ampm}`

  return { timeString, hours, minutes, displayTime }
}

/**
 * Get the currently active period based on the current time (IST).
 * Returns the period config if one is active, or null if between periods / outside school hours.
 */
export function getCurrentPeriod(): PeriodTiming | null {
  const { timeString } = getCurrentISTTime()

  for (const period of PERIOD_TIMINGS) {
    if (timeString >= period.start_time && timeString < period.end_time) {
      return period
    }
  }
  return null
}

/**
 * Get the next upcoming period (for when we're between periods or before school).
 */
export function getNextPeriod(): PeriodTiming | null {
  const { timeString } = getCurrentISTTime()

  for (const period of PERIOD_TIMINGS) {
    if (timeString < period.start_time) {
      return period
    }
  }
  return null
}

export interface PeriodStatusSummary {
  currentPeriod: PeriodTiming | null
  nextPeriod: PeriodTiming | null
  statusType: 'in_period' | 'lunch_break' | 'before_school' | 'after_school' | 'between_periods'
  displayTime: string
  timeString: string
  allPeriods: typeof PERIOD_TIMINGS
}

/**
 * Detailed status summary of the school day for interactive UI prompts.
 */
export function getPeriodStatusSummary(): PeriodStatusSummary {
  const { timeString, displayTime } = getCurrentISTTime()
  const current = getCurrentPeriod()
  const next = getNextPeriod()

  let statusType: PeriodStatusSummary['statusType'] = 'between_periods'

  if (current) {
    statusType = 'in_period'
  } else if (timeString >= '12:40' && timeString < '13:30') {
    statusType = 'lunch_break'
  } else if (timeString < '09:20') {
    statusType = 'before_school'
  } else if (timeString >= '16:00') {
    statusType = 'after_school'
  }

  return {
    currentPeriod: current,
    nextPeriod: next,
    statusType,
    displayTime,
    timeString,
    allPeriods: PERIOD_TIMINGS,
  }
}
