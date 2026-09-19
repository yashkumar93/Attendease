/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPeriod } from '@/lib/period-config'

export interface ChatbotResult {
  success: boolean
  message: string
  matched: string[]
  unmatched: string[]
  ambiguous: { input: string; suggestions: string[] }[]
  totalPresent: number
  totalAbsent: number
  periodInfo?: string
  isHelp?: boolean
  detectedPeriodNumber?: number
}

// ── Global Concurrency Lock ────────────────────────────────────────
// Enforces "at one time only one request will be served"
let isProcessingRequest = false
let lockTimestamp = 0
const LOCK_TIMEOUT_MS = 10000 // 10-second safety timeout

function acquireLock(): boolean {
  const now = Date.now()
  if (isProcessingRequest && now - lockTimestamp < LOCK_TIMEOUT_MS) {
    return false
  }
  isProcessingRequest = true
  lockTimestamp = now
  return true
}

function releaseLock() {
  isProcessingRequest = false
  lockTimestamp = 0
}

/**
 * Generates the formatting guide message.
 */
export async function getFormatGuide(currentPeriodNum?: number | null): Promise<string> {
  return (
    `📋 **Quick Mark Attendance Guide**\n\n` +
    `You can mark attendance in any of the following ways:\n\n` +
    `1️⃣ **Click a Period Button:**\n` +
    `Select any period above, then enter absent student names or roll numbers.\n\n` +
    `2️⃣ **Direct Command Format:**\n` +
    `• \`Period 3 - Rahul, Vicky\` _(marks them absent for Period 3)_\n` +
    `• \`3: 101, 104\` _(using roll numbers)_\n` +
    `• \`Period 2 - all present\` _(marks everyone present)_\n` +
    `• \`P5 Mukund, Amit\`\n\n` +
    (currentPeriodNum
      ? `🕒 *Current active period:* **Period ${currentPeriodNum}**.\n\n`
      : '') +
    `💡 *Note:* All instructors have access to mark attendance for any class period. If attendance is already marked for a period, please update it via the dashboard.`
  )
}

/**
 * Check if the input message is a request for help/format.
 */
function isHelpRequest(text: string): boolean {
  const t = text.trim().toLowerCase()
  return (
    t === 'help' ||
    t === 'format' ||
    t === 'how' ||
    t === 'how to mark' ||
    t === 'hi' ||
    t === 'hello' ||
    t === 'hey' ||
    t === 'guide' ||
    t === 'info' ||
    t === 'format?' ||
    t.startsWith('how do i') ||
    t.startsWith('how to') ||
    t.startsWith('what is')
  )
}

/**
 * Process attendance messages with:
 * - Concurrency locking (1 request at a time)
 * - Access for ALL instructors
 * - High-speed response with database update in background via after()
 * - Optional explicit period number (e.g. from UI period button selection)
 */
export async function processAttendanceMessage(
  message: string,
  explicitPeriodNumber?: number
): Promise<ChatbotResult> {
  const fail = (msg: string, isHelp = false): ChatbotResult => {
    releaseLock()
    return {
      success: false,
      message: msg,
      matched: [],
      unmatched: [],
      ambiguous: [],
      totalPresent: 0,
      totalAbsent: 0,
      isHelp,
    }
  }

  // ── 0. Concurrency Lock ──────────────────────────────────────
  if (!acquireLock()) {
    return fail(
      '⏳ Another attendance request is currently being processed. Only one request is served at a time. Please wait a moment and try again.'
    )
  }

  try {
    const trimmed = message.trim()

    // ── 1. Help / Format Guide Detection ─────────────────────────
    const currentPeriod = getCurrentPeriod()
    const activePeriodNum = currentPeriod?.period_number || null

    if (!trimmed || isHelpRequest(trimmed)) {
      const guide = await getFormatGuide(activePeriodNum)
      return fail(guide, true)
    }

    // ── 2. Authenticate & Profile Check ──────────────────────────
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return fail('Not authenticated. Please log in again.')

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single()
    if (!profile) return fail('Profile not found.')

    // All instructors and admins are allowed to use Quick Mark
    const role = (profile as any).role
    if (role !== 'admin' && role !== 'instructor') {
      return fail('Only instructors and administrators can mark attendance.')
    }

    // ── 3. Parse Message & Resolve Period ────────────────────────
    const parsed = parseMessage(trimmed, explicitPeriodNumber)

    // If still no period number, fallback to current period if active
    if (!parsed.periodNumber) {
      if (activePeriodNum) {
        parsed.periodNumber = activePeriodNum
      } else {
        const guide = await getFormatGuide(null)
        return fail(
          'Could not determine which period to mark attendance for.\n\n' +
            guide +
            '\n\n👉 **Please select a period button above or type the period number (e.g. `Period 1 - ...`)**',
          true
        )
      }
    }

    if (parsed.periodNumber < 1 || parsed.periodNumber > 7) {
      return fail(`Period number must be between 1 and 7. You entered: ${parsed.periodNumber}`)
    }

    // ── 4. Find Today's Period ───────────────────────────────────
    const adminClient = createAdminClient()
    const today = new Date().toISOString().split('T')[0]

    const { data: periods, error: periodErr } = await adminClient
      .from('periods')
      .select('id, class_id, instructor_id, period_number, start_time, end_time, classes(class_name)')
      .eq('date', today)
      .eq('period_number', parsed.periodNumber)

    if (periodErr || !periods || periods.length === 0) {
      return fail(
        `No Period ${parsed.periodNumber} schedule found for today (${today}).\n` +
          'Please ensure today\'s daily schedule has been generated.'
      )
    }

    // Single class system: use the period for today
    const period: any = periods[0]
    const periodLabel = `Period ${parsed.periodNumber} (${period.start_time?.slice(0, 5)}–${period.end_time?.slice(0, 5)})`
    const className = period.classes?.class_name || 'Class 1'

    // ── 5. Check if Attendance is Already Marked ─────────────────
    const { count: attendanceCount } = await adminClient
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('period_id', period.id)

    if (attendanceCount && attendanceCount > 0) {
      return fail(
        `⚠️ Attendance for **Period ${parsed.periodNumber}** has already been marked today.\n\n` +
          `To prevent accidental overrides, please navigate to the dashboard to manually update or edit it if changes are needed.`
      )
    }

    // ── 6. Fetch Active Students for the Class ───────────────────
    const { data: students, error: studentErr } = await adminClient
      .from('students')
      .select('id, name, roll_number')
      .eq('class_id', period.class_id)
      .eq('status', 'active')
      .order('roll_number')

    if (studentErr || !students || students.length === 0) {
      return fail(`No active students found for ${className}.`)
    }

    // ── 7. Match Absent Students In-Memory ───────────────────────
    const absentIds: number[] = []
    const matched: string[] = []
    const unmatched: string[] = []
    const ambiguous: { input: string; suggestions: string[] }[] = []

    if (parsed.absentNames.length > 0) {
      for (const inputName of parsed.absentNames) {
        const match = matchStudent(inputName, students)

        if (match.type === 'exact') {
          absentIds.push(match.student!.id)
          matched.push(match.student!.name)
        } else if (match.type === 'ambiguous') {
          ambiguous.push({
            input: inputName,
            suggestions: match.suggestions!.map((s) => s.name),
          })
        } else {
          unmatched.push(inputName)
        }
      }
    }

    // If ambiguous matches exist, prompt user for clarification before marking
    if (ambiguous.length > 0) {
      const ambigLines = ambiguous
        .map((a) => `• **"${a.input}"** — did you mean: ${a.suggestions.join(', ')}?`)
        .join('\n')

      return {
        success: false,
        message:
          `Some student names match multiple people. Please use the full name or roll number:\n\n${ambigLines}\n\n` +
          (matched.length > 0 ? `✅ Matched so far: ${matched.join(', ')}` : ''),
        matched,
        unmatched,
        ambiguous,
        totalPresent: 0,
        totalAbsent: 0,
        periodInfo: periodLabel,
      }
    }

    // ── 8. Prepare Attendance Records ───────────────────────────
    const totalAbsent = absentIds.length
    const totalPresent = students.length - totalAbsent

    const records = students.map((s: any) => ({
      period_id: period.id,
      student_id: s.id,
      status: absentIds.includes(s.id) ? 'Absent' : 'Present',
      marked_by: user.id,
    }))

    // ── 9. Execute Database Upsert in Background ─────────────────
    // Using Next.js `after()` for sub-second UI latency while guaranteeing
    // the upsert executes and releases the single-request lock cleanly.
    after(async () => {
      try {
        const { error: upsertErr } = await adminClient
          .from('attendance')
          .upsert(records, { onConflict: 'period_id,student_id' })

        if (upsertErr) {
          console.error('[Quick Mark Background Upsert Error]:', upsertErr.message)
        }
      } catch (err) {
        console.error('[Quick Mark Background Exception]:', err)
      } finally {
        releaseLock()
      }
    })

    // ── 10. Instant Response to User ─────────────────────────────
    let msg = `✅ **${periodLabel}** — ${className}\n\n`
    msg += `👥 **${totalPresent}** present · **${totalAbsent}** absent (out of ${students.length})`

    if (matched.length > 0) {
      msg += `\n\n❌ **Absent:** ${matched.join(', ')}`
    }

    if (unmatched.length > 0) {
      msg += `\n\n⚠️ **Could not find:** ${unmatched.join(', ')}`
    }

    if (totalAbsent === 0) {
      msg += '\n\n🎉 **All students marked present!**'
    }

    return {
      success: true,
      message: msg,
      matched,
      unmatched,
      ambiguous: [],
      totalPresent,
      totalAbsent,
      periodInfo: periodLabel,
      detectedPeriodNumber: parsed.periodNumber,
    }
  } catch (err: any) {
    return fail(`Unexpected error: ${err.message || 'Unknown error'}`)
  }
}

// ── Helpers ────────────────────────────────────────────────────────

interface ParsedMessage {
  periodNumber: number | null
  absentNames: string[]
}

function parseMessage(raw: string, explicitPeriod?: number): ParsedMessage {
  const trimmed = raw.trim()

  // 1. Try to extract period number from the beginning
  // Patterns: "3 - names", "Period 3 - names", "P3 - names", "3: names", "Period 3 all present", just "3"
  const periodRegex = /^(?:period\s*|p\s*)?(\d)\s*[-–:.]?\s*/i
  const match = trimmed.match(periodRegex)

  let periodNumber: number | null = explicitPeriod || null
  let remainder = trimmed

  if (match) {
    const extractedNum = parseInt(match[1])
    if (extractedNum >= 1 && extractedNum <= 7) {
      periodNumber = extractedNum
      remainder = trimmed.slice(match[0].length).trim()
    }
  }

  // 2. Check for "all present", "none absent", "all", "0", or empty
  if (
    !remainder ||
    /^all\s+present$/i.test(remainder) ||
    /^none\s+(absent)?$/i.test(remainder) ||
    /^no\s+(one|absent|absentees)/i.test(remainder) ||
    /^all$/i.test(remainder) ||
    remainder === '0'
  ) {
    return { periodNumber, absentNames: [] }
  }

  // Strip prefix words like "absent:", "absentees:", "absent students:"
  remainder = remainder.replace(/^(?:absent(?:ees)?|absent students?)\s*[:\-–]?\s*/i, '').trim()

  // 3. Split by comma, newline, semicolon, or "and"
  const names = remainder
    .split(/[,\n;]+|\band\b/i)
    .map((n) => n.trim())
    .filter((n) => n.length > 0 && !/^(absent|students?|names?|all|none)$/i.test(n))

  return { periodNumber, absentNames: names }
}

interface MatchResult {
  type: 'exact' | 'ambiguous' | 'not_found'
  student?: { id: number; name: string }
  suggestions?: { id: number; name: string }[]
}

function matchStudent(
  inputName: string,
  students: { id: number; name: string; roll_number: string }[]
): MatchResult {
  const input = inputName.toLowerCase().trim()

  // 1. Try exact match (case-insensitive name)
  const exactMatch = students.find((s) => s.name.toLowerCase() === input)
  if (exactMatch) {
    return { type: 'exact', student: exactMatch }
  }

  // 2. Try roll number match
  const rollMatch = students.find((s) => s.roll_number.toLowerCase() === input)
  if (rollMatch) {
    return { type: 'exact', student: rollMatch }
  }

  // 3. Try partial / substring / first name match
  const partialMatches = students.filter((s) => {
    const studentName = s.name.toLowerCase()
    const nameParts = studentName.split(/\s+/)
    return (
      studentName === input ||
      studentName.includes(input) ||
      nameParts[0] === input || // First name match
      nameParts[nameParts.length - 1] === input // Last name match
    )
  })

  if (partialMatches.length === 1) {
    return { type: 'exact', student: partialMatches[0] }
  }

  if (partialMatches.length > 1) {
    return { type: 'ambiguous', suggestions: partialMatches }
  }

  // 4. Fuzzy match: first 3 characters
  if (input.length >= 3) {
    const fuzzyMatches = students.filter((s) =>
      s.name.toLowerCase().startsWith(input.substring(0, 3))
    )
    if (fuzzyMatches.length === 1) {
      return { type: 'exact', student: fuzzyMatches[0] }
    }
    if (fuzzyMatches.length > 1) {
      return { type: 'ambiguous', suggestions: fuzzyMatches }
    }
  }

  return { type: 'not_found' }
}
