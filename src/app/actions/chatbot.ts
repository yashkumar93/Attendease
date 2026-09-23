/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPeriod, getNextPeriod, getPeriodStatusSummary, PERIOD_TIMINGS, ACTIVE_DAYS } from '@/lib/period-config'
import { ensureDailyPeriods } from '@/app/actions/auto-schedule'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import { matchStudent, parseNameInput, isAllPresent, batchMatchNames, type StudentRecord } from '@/lib/fuzzy-match'
import {
  type ChatSession,
  type ChatResponse,
  type ChatStep,
  type PeriodListItem,
  type ConfirmationData,
  type MenuOption,
  type ClassOption,
  createFreshSession,
  isCancelCommand,
  IDLE_TIMEOUT_MS,
  MAX_FAILED_ATTEMPTS,
  ACADEMIC_YEAR_START,
} from '@/lib/types/chatbot-types'

// Re-export types the UI needs
export type { ChatSession, ChatResponse, ChatStep }
// Legacy type for backward compat during transition
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

// ── AI Client Singletons ────────────────────────────────────────
let _geminiClient: GoogleGenerativeAI | null = null
let _groqClient: Groq | null = null

function getGeminiClient(): GoogleGenerativeAI | null {
  if (!process.env.GEMINI_API_KEY) return null
  if (!_geminiClient) _geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  return _geminiClient
}

function getGroqClient(): Groq | null {
  if (!process.env.GROQ_API_KEY) return null
  if (!_groqClient) _groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return _groqClient
}

// ── Model Configurations ─────────────────────────────────────────
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b'

// ── Concurrency Lock ────────────────────────────────────────────
let isProcessingRequest = false
let lockTimestamp = 0
const LOCK_TIMEOUT_MS = 20000

function acquireLock(): boolean {
  const now = Date.now()
  if (isProcessingRequest && now - lockTimestamp < LOCK_TIMEOUT_MS) return false
  isProcessingRequest = true
  lockTimestamp = now
  return true
}

function releaseLock() {
  isProcessingRequest = false
  lockTimestamp = 0
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

/**
 * Process a chatbot message with full session state management.
 * This is the new stateful entry point that replaces the old `processAttendanceMessage`.
 */
export async function processChatMessage(
  message: string,
  session: ChatSession | null
): Promise<ChatResponse> {
  // ── Auth ──
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return makeResponse('Please log in to use the attendance assistant.', session || createFreshSession('', 'other'), 'error')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return makeResponse('Profile not found. Please contact an administrator.', session || createFreshSession(user.id, 'other'), 'error')
  }

  const role = (profile as any).role as 'admin' | 'instructor'

  // ── Session init or restore ──
  let s: ChatSession
  if (!session) {
    s = createFreshSession(user.id, role)
  } else {
    s = { ...session, lastActivityAt: Date.now() }
    // Check idle timeout
    if (Date.now() - session.lastActivityAt > IDLE_TIMEOUT_MS) {
      s = createFreshSession(user.id, role)
      return makeResponse(
        'Your session has expired due to inactivity. Let\'s start fresh!\n\nWhat would you like to do?',
        s,
        'menu',
        { menuOptions: getMenuOptions(role) }
      )
    }
  }

  // Ensure role is always current
  s.userId = user.id
  s.role = role

  const trimmed = message.trim()

  // ── Global Rule 1: Cancel/Exit anywhere ──
  if (trimmed && isCancelCommand(trimmed) && s.step !== 'menu') {
    s = createFreshSession(user.id, role)
    return makeResponse(
      'Cancelled. No changes were saved.\n\nWhat would you like to do?',
      s,
      'menu',
      { menuOptions: getMenuOptions(role) }
    )
  }

  // ── Dispatch by current step ──
  try {
    switch (s.step) {
      case 'menu':
        return handleMenu(trimmed, s)
      case 'select_class':
        return handleClassSelection(trimmed, s)
      case 'detect_period':
        return detectCurrentPeriod(s)
      case 'ask_date':
        return handleAskDate(trimmed, s)
      case 'show_periods':
      case 'select_period':
        return handleSelectPeriod(trimmed, s)
      case 'ask_absentees':
      case 'update_loop':
        return handleAbsentees(trimmed, s)
      case 'clarify_name':
        return handleClarifyName(trimmed, s)
      case 'confirm':
        return handleConfirmation(trimmed, s)
      case 'ask_overwrite':
        return handleOverwrite(trimmed, s)
      case 'query_intent':
      case 'query_db':
        return handleAnalyticsQuery(trimmed, s)
      default:
        s.step = 'menu'
        return handleMenu(trimmed, s)
    }
  } catch (err: any) {
    console.error('[Chatbot Error]:', err)
    return makeResponse(
      `Something went wrong: ${err.message || 'Unknown error'}. Please try again.`,
      { ...s, step: 'menu' },
      'error',
      { menuOptions: getMenuOptions(s.role) }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP HANDLERS
// ═══════════════════════════════════════════════════════════════════

// ── Menu ────────────────────────────────────────────────────────
async function handleMenu(text: string, s: ChatSession): Promise<ChatResponse> {
  if (!text) {
    return makeResponse(
      'Welcome to **AttendEase Assistant**! What would you like to do?',
      s,
      'menu',
      { menuOptions: getMenuOptions(s.role) }
    )
  }

  const intent = detectMenuIntent(text)

  if (intent === 'mark_today' || intent === 'update_previous') {
    // Authorization check (Global Rule 3)
    if (s.role !== 'admin' && s.role !== 'instructor') {
      return makeResponse(
        'Only instructors and administrators can mark or update attendance. You can ask questions about attendance data instead.\n\nWhat would you like to know?',
        { ...s, currentIntent: 'general_query', step: 'query_intent' },
        'text'
      )
    }
  }

  if (intent === 'mark_today') {
    s.currentIntent = 'mark_today'
    s.targetDate = getTodayIST()
    return await startAttendanceFlow(s)
  }

  if (intent === 'update_previous') {
    s.currentIntent = 'update_previous'
    s.step = 'ask_date'
    return makeResponse(
      'What date would you like to update? Please use **DD/MM/YYYY** format (e.g. 21/09/2026).',
      s,
      'ask_input'
    )
  }

  if (intent === 'general_query') {
    s.currentIntent = 'general_query'
    s.step = 'query_intent'
    return makeResponse(
      'What would you like to know? You can ask about attendance statistics, student records, or any other data.\n\n**Examples:**\n• "How many times was Priya absent this month?"\n• "Show me attendance for Period 3 today"\n• "Who are the most absent students this week?"',
      s,
      'ask_input'
    )
  }

  // If we couldn't detect intent from text, check if it's a direct analytics query
  if (text.includes('?') || text.toLowerCase().startsWith('how') || text.toLowerCase().startsWith('show') || text.toLowerCase().startsWith('who') || text.toLowerCase().startsWith('what')) {
    s.currentIntent = 'general_query'
    s.step = 'query_intent'
    return handleAnalyticsQuery(text, s)
  }

  // Unrecognized — show menu again
  return makeResponse(
    'I didn\'t quite understand that. Please choose an option below, or ask me a question about attendance.',
    s,
    'menu',
    { menuOptions: getMenuOptions(s.role) }
  )
}

// ── Start Attendance Flow (shared by Flow 1 entry) ──────────────
async function startAttendanceFlow(s: ChatSession): Promise<ChatResponse> {
  const adminClient = createAdminClient()

  // Ensure daily periods exist for this date
  try {
    await ensureDailyPeriods(s.targetDate!)
  } catch (err) {
    console.error('Failed to ensure daily periods:', err)
  }

  // Fetch classes that have periods today for selection (any instructor can mark any class/period)
  const { data: todayPeriods } = await adminClient
    .from('periods')
    .select('class_id, classes(class_name)')
    .eq('date', s.targetDate!)

  if (!todayPeriods || todayPeriods.length === 0) {
    return makeResponse(
      `No periods found for ${formatDateDisplay(s.targetDate!)}. This may be a non-teaching day (e.g. Sunday).`,
      { ...s, step: 'menu' },
      'error',
      { menuOptions: getMenuOptions(s.role) }
    )
  }

  const uniqueClasses = new Map<number, string>()
  for (const p of todayPeriods as any[]) {
    if (!uniqueClasses.has(p.class_id)) {
      uniqueClasses.set(p.class_id, p.classes?.class_name || `Class ${p.class_id}`)
    }
  }

  if (uniqueClasses.size > 1) {
    s.step = 'select_class'
    const classList: ClassOption[] = Array.from(uniqueClasses.entries()).map(([id, name]) => ({ id, className: name }))
    return makeResponse(
      'Which class would you like to mark attendance for?',
      s,
      'class_select',
      { classList }
    )
  }

  const [classId, className] = [...uniqueClasses.entries()][0]
  s.classSectionId = classId
  s.className = className

  // Continue to period detection/selection
  if (s.currentIntent === 'mark_today') {
    return detectCurrentPeriod(s)
  } else {
    return showPeriodsForDate(s)
  }
}

// ── Class Selection ─────────────────────────────────────────────
async function handleClassSelection(text: string, s: ChatSession): Promise<ChatResponse> {
  const adminClient = createAdminClient()

  // Try to match by class name or number
  const { data: classes } = await adminClient
    .from('classes')
    .select('id, class_name')

  if (!classes) {
    return makeResponse('Failed to fetch classes. Please try again.', { ...s, step: 'menu' }, 'error')
  }

  const input = text.toLowerCase().trim()
  const matched = classes.find((c: any) =>
    c.class_name.toLowerCase() === input ||
    c.class_name.toLowerCase().includes(input) ||
    c.id.toString() === input
  )

  if (!matched) {
    s.failedAttempts++
    if (s.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      s = createFreshSession(s.userId, s.role)
      return makeResponse(
        'Too many invalid entries. Let\'s start over.\n\nWhat would you like to do?',
        s,
        'menu',
        { menuOptions: getMenuOptions(s.role) }
      )
    }
    const classList: ClassOption[] = classes.map((c: any) => ({ id: c.id, className: c.class_name }))
    return makeResponse(
      `I couldn't find that class. Please select from the options below:`,
      s,
      'class_select',
      { classList }
    )
  }

  s.classSectionId = matched.id
  s.className = (matched as any).class_name
  s.failedAttempts = 0

  if (s.currentIntent === 'mark_today') {
    return detectCurrentPeriod(s)
  } else {
    return showPeriodsForDate(s)
  }
}

// ── Detect Current Period (Flow 1) ──────────────────────────────
async function detectCurrentPeriod(s: ChatSession): Promise<ChatResponse> {
  const adminClient = createAdminClient()
  const status = getPeriodStatusSummary()
  const current = getCurrentPeriod()
  const next = getNextPeriod()

  // Fetch today's periods for this class
  let { data: periods } = await adminClient
    .from('periods')
    .select('id, period_number, start_time, end_time, classes(class_name), subjects(subject_name), attendance(id, status)')
    .eq('date', s.targetDate!)
    .eq('class_id', s.classSectionId!)
    .order('period_number')

  if (!periods || periods.length === 0) {
    try {
      await ensureDailyPeriods(s.targetDate!)
      const refetch = await adminClient
        .from('periods')
        .select('id, period_number, start_time, end_time, classes(class_name), subjects(subject_name), attendance(id, status)')
        .eq('date', s.targetDate!)
        .eq('class_id', s.classSectionId!)
        .order('period_number')
      periods = refetch.data
    } catch {}
  }

  if (!periods || periods.length === 0) {
    return makeResponse(
      `No periods found for ${s.className} on ${formatDateDisplay(s.targetDate!)}. This may be a non-teaching day (e.g. Sunday).`,
      { ...s, step: 'menu' },
      'error',
      { menuOptions: getMenuOptions(s.role) }
    )
  }

  if (current) {
    // Find matching DB period
    const dbPeriod = periods.find((p: any) => p.period_number === current.period_number)
    if (dbPeriod) {
      s.periodId = dbPeriod.id
      s.periodNumber = current.period_number
      s.periodLabel = `Period ${current.period_number} (${current.label})`
      s.step = 'ask_absentees'

      const attendance = (dbPeriod as any).attendance || []
      const isAlreadyMarked = attendance.length > 0

      let msg = `It's currently **${s.periodLabel}** for **${s.className}**.`
      if (isAlreadyMarked) {
        const presentCount = attendance.filter((a: any) => a.status === 'Present').length
        const absentCount = attendance.filter((a: any) => a.status === 'Absent').length
        msg += `\n\n⚠️ Attendance is already marked for this period (**${presentCount}** present, **${absentCount}** absent). Submitting again will **update** the existing records.`
      }
      msg += `\n\nPlease list the names of **absent students**, separated by commas.\nIf everyone is present, just say **"none"** or **"all present"**.`
      msg += `\n\n_Reply **"change period"** to pick a different one._`

      return makeResponse(msg, s, 'ask_input')
    }
  }

  // No period currently in session
  let msg = ''
  if (status.statusType === 'before_school') {
    msg = `Classes haven't started yet (current time: **${status.displayTime}**). The first period begins at **9:20 AM**.`
  } else if (status.statusType === 'lunch_break') {
    msg = `It's currently **lunch break** (12:40 – 1:30 PM).`
  } else if (status.statusType === 'after_school') {
    msg = `Classes have ended for the day (current time: **${status.displayTime}**).`
  } else if (next) {
    msg = `No period is currently in session. The next period is **Period ${next.period_number}** (${next.label}).`
  } else {
    msg = `No period is currently in session.`
  }

  msg += `\n\nPlease select a period to mark attendance for:`

  // Build period list
  const periodList: PeriodListItem[] = (periods as any[]).map((p: any) => {
    const attendance = p.attendance || []
    const isMarked = attendance.length > 0
    return {
      periodId: p.id,
      periodNumber: p.period_number,
      startTime: p.start_time?.slice(0, 5) || '',
      endTime: p.end_time?.slice(0, 5) || '',
      label: `Period ${p.period_number}`,
      isMarked,
      presentCount: isMarked ? attendance.filter((a: any) => a.status === 'Present').length : undefined,
      absentCount: isMarked ? attendance.filter((a: any) => a.status === 'Absent').length : undefined,
      className: s.className || undefined,
      subjectName: p.subjects?.subject_name || undefined,
    }
  })

  s.step = 'select_period'
  return makeResponse(msg, s, 'period_list', { periodList })
}

// ── Ask Date (Flow 2) ──────────────────────────────────────────
async function handleAskDate(text: string, s: ChatSession): Promise<ChatResponse> {
  const validation = validateDate(text)

  if (!validation.valid) {
    s.failedAttempts++
    if (s.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      s = createFreshSession(s.userId, s.role)
      return makeResponse(
        'Too many invalid entries. Let\'s start over.\n\nWhat would you like to do?',
        s,
        'menu',
        { menuOptions: getMenuOptions(s.role) }
      )
    }
    return makeResponse(
      `${validation.error}\n\nPlease enter the date in **DD/MM/YYYY** format.`,
      s,
      'ask_input'
    )
  }

  s.targetDate = validation.isoDate!
  s.failedAttempts = 0

  // Start the attendance flow (class selection → period listing)
  return await startAttendanceFlow(s)
}

// ── Show Periods for Date (Flow 2) ──────────────────────────────
async function showPeriodsForDate(s: ChatSession): Promise<ChatResponse> {
  const adminClient = createAdminClient()

  let query = adminClient
    .from('periods')
    .select('id, period_number, start_time, end_time, classes(class_name), subjects(subject_name), attendance(id, status)')
    .eq('date', s.targetDate!)
    .order('period_number')

  if (s.classSectionId) {
    query = query.eq('class_id', s.classSectionId)
  }

  let { data: periods, error } = await query

  if (!periods || periods.length === 0) {
    try {
      await ensureDailyPeriods(s.targetDate!)
      const refetch = await query
      periods = refetch.data
      error = refetch.error
    } catch {}
  }

  if (error || !periods || periods.length === 0) {
    return makeResponse(
      `No periods found for ${s.className || 'this class'} on **${formatDateDisplay(s.targetDate!)}**. This may be a non-teaching day (e.g. Sunday).`,
      { ...s, step: 'ask_date' },
      'ask_input'
    )
  }

  const periodList: PeriodListItem[] = (periods as any[]).map((p: any) => {
    const attendance = p.attendance || []
    const isMarked = attendance.length > 0
    return {
      periodId: p.id,
      periodNumber: p.period_number,
      startTime: p.start_time?.slice(0, 5) || '',
      endTime: p.end_time?.slice(0, 5) || '',
      label: `Period ${p.period_number}`,
      isMarked,
      presentCount: isMarked ? attendance.filter((a: any) => a.status === 'Present').length : undefined,
      absentCount: isMarked ? attendance.filter((a: any) => a.status === 'Absent').length : undefined,
      className: s.className || p.classes?.class_name || undefined,
      subjectName: p.subjects?.subject_name || undefined,
    }
  })

  s.step = 'select_period'
  return makeResponse(
    `Here are the periods for **${s.className}** on **${formatDateDisplay(s.targetDate!)}**:\n\nSelect a period to ${s.currentIntent === 'update_previous' ? 'update' : 'mark'} attendance:`,
    s,
    'period_list',
    { periodList }
  )
}

// ── Select Period ───────────────────────────────────────────────
async function handleSelectPeriod(text: string, s: ChatSession): Promise<ChatResponse> {
  const input = text.trim()

  // Parse period selection: "1", "P1", "Period 1", etc.
  const periodMatch = input.match(/^(?:period\s*|p\s*)?(\d+)$/i)
  if (!periodMatch) {
    s.failedAttempts++
    if (s.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      s = createFreshSession(s.userId, s.role)
      return makeResponse(
        'Too many invalid entries. Let\'s start over.\n\nWhat would you like to do?',
        s,
        'menu',
        { menuOptions: getMenuOptions(s.role) }
      )
    }
    return makeResponse(
      'Please enter a valid period number (e.g. **1**, **P3**, or **Period 5**).',
      s,
      'ask_input'
    )
  }

  const periodNum = parseInt(periodMatch[1])

  // Look up the period in the DB
  const adminClient = createAdminClient()
  let query = adminClient
    .from('periods')
    .select('id, period_number, start_time, end_time, classes(class_name), attendance(id, status)')
    .eq('date', s.targetDate!)
    .eq('period_number', periodNum)

  if (s.classSectionId) {
    query = query.eq('class_id', s.classSectionId)
  }

  const { data: periods } = await query

  if (!periods || periods.length === 0) {
    return makeResponse(
      `Period ${periodNum} doesn't exist for ${formatDateDisplay(s.targetDate!)}. Please select a valid period number from the list.`,
      s,
      'ask_input'
    )
  }

  const period = periods[0] as any
  s.periodId = period.id
  s.periodNumber = periodNum
  s.periodLabel = `Period ${periodNum} (${period.start_time?.slice(0, 5)}–${period.end_time?.slice(0, 5)})`
  s.failedAttempts = 0

  // Check if attendance already exists
  const attendance = period.attendance || []
  const isAlreadyMarked = attendance.length > 0

  s.step = 'ask_absentees'

  let msg = `Selected **${s.periodLabel}** for **${s.className}** on **${formatDateDisplay(s.targetDate!)}**.`

  if (isAlreadyMarked) {
    const presentCount = attendance.filter((a: any) => a.status === 'Present').length
    const absentCount = attendance.filter((a: any) => a.status === 'Absent').length
    msg += `\n\n⚠️ Attendance is already marked (**${presentCount}** present, **${absentCount}** absent). Submitting will **update** the existing records.`
  }

  msg += `\n\nPlease list the names of **absent students**, separated by commas (e.g. Rahul Sharma, Priya Singh).\nIf everyone is present, just say **"none"** or **"all present"**.`

  return makeResponse(msg, s, 'ask_input')
}

// ── Handle Absentees Input ──────────────────────────────────────
async function handleAbsentees(text: string, s: ChatSession): Promise<ChatResponse> {
  if (!text) {
    s.failedAttempts++
    if (s.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      s = createFreshSession(s.userId, s.role)
      return makeResponse(
        'Too many empty inputs. Let\'s start over.\n\nWhat would you like to do?',
        s,
        'menu',
        { menuOptions: getMenuOptions(s.role) }
      )
    }
    return makeResponse(
      'Please enter the names of absent students separated by commas, or say **"all present"** if everyone is here.\n\n_Example: Rahul Sharma, Priya Singh_',
      s,
      'ask_input'
    )
  }

  // Check for "change period" in Flow 1
  if (/^change\s*period$/i.test(text.trim())) {
    s.step = 'select_period'
    return showPeriodsForDate(s)
  }

  // "All present" / zero-absentee path
  if (isAllPresent(text)) {
    s.resolvedAbsentStudentIds = []
    s.rawAbsenteeInput = text
    return await promptConfirmation(s, [])
  }

  // Parse names and match against roster
  const adminClient = createAdminClient()
  const { data: students } = await adminClient
    .from('students')
    .select('id, name, roll_number')
    .eq('class_id', s.classSectionId!)
    .eq('status', 'active')
    .order('roll_number')

  if (!students || students.length === 0) {
    return makeResponse(
      `No active students found for ${s.className}. Please check the student roster.`,
      { ...s, step: 'menu' },
      'error',
      { menuOptions: getMenuOptions(s.role) }
    )
  }

  const names = parseNameInput(text)
  if (names.length === 0) {
    s.failedAttempts++
    if (s.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      s = createFreshSession(s.userId, s.role)
      return makeResponse(
        'Too many invalid entries. Let\'s start over.\n\nWhat would you like to do?',
        s,
        'menu',
        { menuOptions: getMenuOptions(s.role) }
      )
    }
    return makeResponse(
      'I couldn\'t parse any names from your input. Please enter names separated by commas or lines.\n\n_Example: Rahul Sharma, Priya Singh_',
      s,
      'ask_input'
    )
  }

  s.rawAbsenteeInput = text
  s.failedAttempts = 0

  const result = batchMatchNames(names, students as StudentRecord[])

  // All resolved → prompt confirmation before marking
  if (result.ambiguous.length === 0 && result.unmatched.length === 0) {
    const absentIds = result.matched.map(m => m.student.id)
    s.resolvedAbsentStudentIds = absentIds
    return await promptConfirmation(s, absentIds)
  }

  // Some ambiguous/unmatched → ask for clarification
  s.unresolvedNames = result.unmatched
  s.ambiguousNames = result.ambiguous.map(a => ({
    input: a.input,
    suggestions: a.suggestions.map(sug => ({
      id: sug.id,
      name: sug.name,
      rollNumber: sug.roll_number,
    })),
  }))
  // Store matched IDs so far
  s.resolvedAbsentStudentIds = result.matched.map(m => m.student.id)

  s.step = 'clarify_name'

  let msg = ''
  if (result.matched.length > 0) {
    msg += `**Matched so far:** ${result.matched.map(m => m.student.name).join(', ')}\n\n`
  }

  if (result.ambiguous.length > 0) {
    msg += '**Ambiguous names** — please clarify:\n'
    for (const a of result.ambiguous) {
      const options = a.suggestions.map(sug => `${sug.name} (${sug.roll_number})`).join(', ')
      msg += `• **"${a.input}"** — did you mean: ${options}?\n`
    }
    msg += '\n'
  }

  if (result.unmatched.length > 0) {
    msg += `**Not found:** ${result.unmatched.join(', ')}\n`
    msg += '_Please re-enter the correct names or roll numbers for these students._\n'
  }

  msg += '\nPlease provide the correct names for the above, or say **"skip"** to proceed without them.'

  return makeResponse(msg, s, 'clarification', {
    clarificationData: {
      unresolvedNames: result.unmatched,
      ambiguousNames: s.ambiguousNames,
      resolvedSoFar: result.matched.map(m => m.student.name),
    },
  })
}

// ── Affirmative response detection during clarification ─────────
function isAffirmativeConfirmationOnly(text: string): boolean {
  const t = text.trim().toLowerCase()
    .replace(/^(yes|y|yeah|yup|yep|sure|ok|okay)\b[,:\s]*/i, '')
    .trim()

  if (t === '' || /^(all|both|these|all of them|all three|these three|these \d+|all \d+|\d+|correct|confirm|right|fine|please)$/i.test(t)) {
    return true
  }
  return false
}

function isAffirmativeClarification(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (/^(yes|y|yeah|yup|yep|correct|confirm|right|fine|ok|okay|sure)\b/i.test(t)) {
    return isAffirmativeConfirmationOnly(t)
  }
  return /^(all|both|these|all of them|all three|these three|all \d+|these \d+)$/i.test(t)
}

// ── Handle Name Clarification ───────────────────────────────────
async function handleClarifyName(text: string, s: ChatSession): Promise<ChatResponse> {
  const trimmed = text.toLowerCase().trim()

  if (trimmed === 'skip') {
    // Proceed with what we have
    return await promptConfirmation(s, s.resolvedAbsentStudentIds)
  }

  // If user replies with affirmative ("yes these three", "both", "all", "correct", etc.)
  // accept all ambiguous suggestions as intended
  if (isAffirmativeClarification(text) && s.ambiguousNames && s.ambiguousNames.length > 0) {
    for (const amb of s.ambiguousNames) {
      for (const sug of amb.suggestions) {
        if (!s.resolvedAbsentStudentIds.includes(sug.id)) {
          s.resolvedAbsentStudentIds.push(sug.id)
        }
      }
    }
    s.ambiguousNames = []
    s.unresolvedNames = []
    return await promptConfirmation(s, s.resolvedAbsentStudentIds)
  }

  // Fetch roster again
  const adminClient = createAdminClient()
  const { data: students } = await adminClient
    .from('students')
    .select('id, name, roll_number')
    .eq('class_id', s.classSectionId!)
    .eq('status', 'active')
    .order('roll_number')

  if (!students) {
    return makeResponse('Failed to fetch student roster.', { ...s, step: 'menu' }, 'error')
  }

  // Parse the correction input and try to match
  const names = parseNameInput(text)
  const result = batchMatchNames(names, students as StudentRecord[])

  // Add newly resolved names
  for (const m of result.matched) {
    if (!s.resolvedAbsentStudentIds.includes(m.student.id)) {
      s.resolvedAbsentStudentIds.push(m.student.id)
    }
  }

  // If still ambiguous/unmatched, loop
  if (result.ambiguous.length > 0 || result.unmatched.length > 0) {
    s.unresolvedNames = result.unmatched
    s.ambiguousNames = result.ambiguous.map(a => ({
      input: a.input,
      suggestions: a.suggestions.map(sug => ({
        id: sug.id,
        name: sug.name,
        rollNumber: sug.roll_number,
      })),
    }))

    let msg = ''
    if (result.matched.length > 0) {
      msg += `✓ Resolved: ${result.matched.map(m => m.student.name).join(', ')}\n\n`
    }

    if (result.ambiguous.length > 0) {
      msg += 'Still ambiguous:\n'
      for (const a of result.ambiguous) {
        const options = a.suggestions.map(sug => `${sug.name} (${sug.roll_number})`).join(', ')
        msg += `• **"${a.input}"** — ${options}?\n`
      }
      msg += '\n'
    }

    if (result.unmatched.length > 0) {
      msg += `Still not found: ${result.unmatched.join(', ')}\n`
    }

    msg += '\nPlease provide corrections, or say **"skip"** to proceed with the names already matched.'

    return makeResponse(msg, s, 'clarification', {
      clarificationData: {
        unresolvedNames: result.unmatched,
        ambiguousNames: s.ambiguousNames,
        resolvedSoFar: [],
      },
    })
  }

  // All resolved — proceed to prompt confirmation
  return await promptConfirmation(s, s.resolvedAbsentStudentIds)
}

// ── Prompt Confirmation (Ask "Is this correct?" before marking) ───
async function promptConfirmation(s: ChatSession, absentIds: number[]): Promise<ChatResponse> {
  const adminClient = createAdminClient()

  // Fetch all students for the class
  const { data: students, error: studentErr } = await adminClient
    .from('students')
    .select('id, name, roll_number')
    .eq('class_id', s.classSectionId!)
    .eq('status', 'active')
    .order('roll_number')

  if (studentErr || !students || students.length === 0) {
    return makeResponse(
      'Failed to fetch student roster. Please try again.',
      { ...s, step: 'menu' },
      'error',
      { menuOptions: getMenuOptions(s.role) }
    )
  }

  // Check if attendance already exists
  const { count: existingCount } = await adminClient
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', s.periodId!)

  const isUpdate = !!(existingCount && existingCount > 0)
  const totalAbsent = absentIds.length
  const totalPresent = students.length - totalAbsent
  const absentSet = new Set(absentIds)

  const absentNames = (students as any[])
    .filter((st: any) => absentSet.has(st.id))
    .map((st: any) => st.name)

  s.resolvedAbsentStudentIds = absentIds
  s.attendanceWritten = false
  s.step = 'confirm'

  const confirmData: ConfirmationData = {
    periodLabel: s.periodLabel!,
    className: s.className!,
    date: formatDateDisplay(s.targetDate!),
    totalPresent,
    totalAbsent,
    totalStudents: students.length,
    absentNames,
    isUpdate,
  }

  let msg = `I identified the following attendance details for **${s.periodLabel} — ${s.className}** on **${formatDateDisplay(s.targetDate!)}**:\n\n`
  if (absentNames.length > 0) {
    msg += `❌ **Absent students (${totalAbsent}):**\n`
    for (const name of absentNames) {
      msg += `• ${name}\n`
    }
  } else {
    msg += `✅ **All students present!**\n`
  }

  msg += `\n📊 **Summary:** ${totalPresent} Present, ${totalAbsent} Absent (out of ${students.length} students)`
  if (isUpdate) {
    msg += `\n\n⚠️ _Note: Attendance was already marked for this period. Confirming will update the records._`
  }
  msg += `\n\n**Is this correct?** Please reply **"correct"** to save attendance or **"update"** to make changes.`

  return makeResponse(
    msg,
    s,
    'confirmation',
    { confirmationData: confirmData }
  )
}

// Backward-compat alias
const markAttendance = promptConfirmation

// ── Save Attendance to Database (Executed upon confirmation) ─────
async function saveAttendanceToDb(s: ChatSession, absentIds: number[]): Promise<ChatResponse> {
  if (!acquireLock()) {
    return makeResponse(
      '⏳ Another attendance request is being processed. Please wait a moment and try again.',
      s,
      'text'
    )
  }

  try {
    const adminClient = createAdminClient()

    const { data: students, error: studentErr } = await adminClient
      .from('students')
      .select('id, name, roll_number')
      .eq('class_id', s.classSectionId!)
      .eq('status', 'active')
      .order('roll_number')

    if (studentErr || !students || students.length === 0) {
      releaseLock()
      return makeResponse(
        'Failed to fetch student roster. Please try again.',
        { ...s, step: 'menu' },
        'error',
        { menuOptions: getMenuOptions(s.role) }
      )
    }

    const { count: existingCount } = await adminClient
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('period_id', s.periodId!)

    const isUpdate = !!(existingCount && existingCount > 0)
    const totalAbsent = absentIds.length
    const totalPresent = students.length - totalAbsent
    const absentSet = new Set(absentIds)
    const now = new Date().toISOString()

    const records = (students as any[]).map((st: any) => ({
      period_id: s.periodId!,
      student_id: st.id,
      status: absentSet.has(st.id) ? 'Absent' : 'Present',
      marked_by: s.userId,
      ...(isUpdate ? { last_modified_by: s.userId, last_modified_at: now } : {}),
    }))

    // Execute upsert directly and securely
    const { error: upsertErr } = await adminClient
      .from('attendance')
      .upsert(records, { onConflict: 'period_id,student_id' })

    releaseLock()

    if (upsertErr) {
      console.error('[Chatbot Upsert Error]:', upsertErr.message)
      return makeResponse(
        `Failed to save attendance: ${upsertErr.message}. Please try again.`,
        s,
        'error'
      )
    }

    s.attendanceWritten = true
    const nextSession = createFreshSession(s.userId, s.role)

    const absentNames = (students as any[])
      .filter((st: any) => absentSet.has(st.id))
      .map((st: any) => st.name)

    const actionLabel = isUpdate ? 'updated' : 'marked'
    const successMsg = `Great, attendance for **${s.periodLabel} — ${s.className}** on **${formatDateDisplay(s.targetDate!)}** has been **${actionLabel}**! ✓\n\n• **Present:** ${totalPresent}\n• **Absent:** ${totalAbsent} (${absentNames.length > 0 ? absentNames.join(', ') : 'None'})\n\nWhat would you like to do next?`

    return makeResponse(
      successMsg,
      nextSession,
      'menu',
      { menuOptions: getMenuOptions(s.role) }
    )
  } catch (err: any) {
    releaseLock()
    return makeResponse(
      `Failed to save attendance: ${err.message || 'Unknown error'}. Please try again.\n\n⚠️ **No data was written.** Your submission was not saved.`,
      s,
      'error'
    )
  }
}

// ── Handle Confirmation ─────────────────────────────────────────
async function handleConfirmation(text: string, s: ChatSession): Promise<ChatResponse> {
  const t = text.toLowerCase().trim()

  if (t === 'correct' || t === 'yes' || t === 'done' || t === 'ok' || t === 'looks good' || t === 'confirm' || t === 'y') {
    // Actually save to DB and mark attendance now!
    return await saveAttendanceToDb(s, s.resolvedAbsentStudentIds)
  }

  if (t === 'update' || t === 'edit' || t === 'change' || t === 'modify' || t === 'fix' || t === 'no') {
    // Re-open absentee list without re-asking date/period
    s.step = 'update_loop'
    s.attendanceWritten = false
    s.resolvedAbsentStudentIds = []
    s.unresolvedNames = []
    s.ambiguousNames = []
    return makeResponse(
      `Reopening attendance for **${s.periodLabel}** — **${s.className}**.\n\nPlease list the names of **absent students** again, or say **"all present"**.`,
      s,
      'ask_input'
    )
  }

  // Unrecognized response
  return makeResponse(
    'Please reply **"correct"** to confirm and save attendance, or **"update"** to make changes.',
    s,
    'text'
  )
}

// ── Handle Overwrite Prompt ─────────────────────────────────────
async function handleOverwrite(text: string, s: ChatSession): Promise<ChatResponse> {
  const t = text.toLowerCase().trim()

  if (t === 'overwrite' || t === 'yes' || t === 'update' || t === 'replace' || t === 'y') {
    s.step = 'ask_absentees'
    return makeResponse(
      `Alright, updating attendance for **${s.periodLabel}**.\n\nPlease list the names of **absent students**, separated by commas.\nIf everyone is present, say **"none"** or **"all present"**.`,
      s,
      'ask_input'
    )
  }

  if (t === 'cancel' || t === 'no' || t === 'keep' || t === 'n') {
    s = createFreshSession(s.userId, s.role)
    return makeResponse(
      'Keeping the existing attendance unchanged.\n\nWhat would you like to do?',
      s,
      'menu',
      { menuOptions: getMenuOptions(s.role) }
    )
  }

  return makeResponse(
    'Please reply **"overwrite"** to replace the existing attendance, or **"cancel"** to keep it unchanged.',
    s,
    'text'
  )
}

// ── Flow 3: Analytics Query ─────────────────────────────────────
async function handleAnalyticsQuery(text: string, s: ChatSession): Promise<ChatResponse> {
  if (!text) {
    return makeResponse(
      'What would you like to know? Ask me about attendance statistics, student records, or any other data.',
      s,
      'ask_input'
    )
  }

  // Common help/capability questions
  const t = text.toLowerCase().trim()
  if (t === 'help' || t === 'what can you do' || t === 'what can you do?' || t === 'info') {
    return makeResponse(
      '**I can help you with:**\n\n' +
      '• **Attendance statistics** — "How many times was Priya absent this month?"\n' +
      '• **Daily summaries** — "Show attendance for today" or "What\'s the attendance for Period 3?"\n' +
      '• **Student lookups** — "Who was absent on 15/09/2026?"\n' +
      '• **Trends** — "Who are the most absent students this week?"\n\n' +
      'Just ask a question naturally!',
      s,
      'text'
    )
  }

  try {
    // Use AI to understand the query and extract entities
    const queryAnalysis = await analyzeQueryWithAI(text)

    if (!queryAnalysis || queryAnalysis.needsDb === false) {
      // Answer directly without DB
      return makeResponse(
        queryAnalysis?.directAnswer || 'I can help you with attendance data. Could you be more specific about what you\'d like to know?',
        { ...s, step: 'query_intent' },
        'text'
      )
    }

    // Execute the DB query based on analysis
    const adminClient = createAdminClient()
    const result = await executeAnalyticsQuery(adminClient, queryAnalysis, s)

    // Return to query mode for follow-ups
    s.step = 'query_intent'

    return makeResponse(
      result.message,
      s,
      result.hasData ? 'analytics' : 'text',
      result.hasData ? { analyticsData: result.analyticsData } : undefined
    )
  } catch (err: any) {
    console.error('[Analytics Query Error]:', err)
    return makeResponse(
      'Sorry, I had trouble understanding that query. Could you rephrase it?\n\n**Examples:**\n• "How many times was Rahul absent this month?"\n• "Show today\'s attendance"',
      { ...s, step: 'query_intent' },
      'text'
    )
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function makeResponse(
  message: string,
  session: ChatSession,
  messageType: ChatResponse['messageType'],
  extra?: Partial<ChatResponse>
): ChatResponse {
  return {
    message,
    session: { ...session, lastActivityAt: Date.now() },
    messageType,
    ...extra,
  }
}

function getMenuOptions(role: string): MenuOption[] {
  const canMark = role === 'admin' || role === 'instructor'
  return [
    {
      id: 'mark_today',
      label: 'Mark today\'s attendance',
      description: 'Quick mark for the current or selected period',
      icon: 'mark',
      disabled: !canMark,
      disabledReason: canMark ? undefined : 'Only instructors and admins can mark attendance',
    },
    {
      id: 'update_previous',
      label: 'Update previous attendance',
      description: 'Edit attendance for a past date and period',
      icon: 'update',
      disabled: !canMark,
      disabledReason: canMark ? undefined : 'Only instructors and admins can update attendance',
    },
    {
      id: 'general_query',
      label: 'Ask a question',
      description: 'Query attendance data, statistics, and reports',
      icon: 'query',
    },
  ]
}

function detectMenuIntent(text: string): 'mark_today' | 'update_previous' | 'general_query' | null {
  const t = text.toLowerCase().trim()

  // Explicit selections
  if (t === '1' || t === 'mark' || /mark\s*(today|attendance)/i.test(t) || t === 'mark_today') return 'mark_today'
  if (t === '2' || t === 'update' || /update\s*(previous|past|old)/i.test(t) || t === 'update_previous' || /edit\s*(past|previous)/i.test(t)) return 'update_previous'
  if (t === '3' || t === 'query' || t === 'ask' || t === 'question' || t === 'general_query' || t === 'analytics') return 'general_query'

  return null
}

// ── Date Utilities ──────────────────────────────────────────────

function getTodayIST(): string {
  const now = new Date()
  const istOffset = 5.5 * 60 * 60000
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60000)
  return ist.toISOString().split('T')[0]
}

function formatDateDisplay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

interface DateValidation {
  valid: boolean
  isoDate?: string
  error?: string
}

function validateDate(input: string): DateValidation {
  const trimmed = input.trim()

  // Accept DD/MM/YYYY or DD-MM-YYYY
  const dateMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (!dateMatch) {
    return { valid: false, error: `**"${trimmed}"** is not a valid date format. Please use **DD/MM/YYYY** (e.g. 21/09/2026).` }
  }

  const day = parseInt(dateMatch[1])
  const month = parseInt(dateMatch[2])
  const year = parseInt(dateMatch[3])

  // Basic range checks
  if (month < 1 || month > 12) {
    return { valid: false, error: `Month **${month}** is invalid. Must be 1–12.` }
  }
  if (day < 1 || day > 31) {
    return { valid: false, error: `Day **${day}** is invalid.` }
  }

  // Check if it's a real date
  const dateObj = new Date(year, month - 1, day)
  if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
    return { valid: false, error: `**${trimmed}** is not a valid calendar date.` }
  }

  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  // Not in the future
  const today = getTodayIST()
  if (isoDate > today) {
    return { valid: false, error: `**${trimmed}** is in the future. You can only update attendance for past or today's dates.` }
  }

  // Not before academic year start
  if (isoDate < ACADEMIC_YEAR_START) {
    return { valid: false, error: `**${trimmed}** is before the academic year started (${formatDateDisplay(ACADEMIC_YEAR_START)}).` }
  }

  // Check if it's a teaching day (not Sunday)
  const dayOfWeek = dateObj.getDay()
  if (!ACTIVE_DAYS.includes(dayOfWeek)) {
    return { valid: false, error: `**${trimmed}** is a Sunday (non-teaching day). Please enter a Monday–Saturday date.` }
  }

  return { valid: true, isoDate }
}

// ── AI Helpers ──────────────────────────────────────────────────

interface QueryAnalysis {
  needsDb: boolean
  directAnswer?: string
  queryType?: 'student_absence_count' | 'daily_summary' | 'absent_list' | 'most_absent' | 'attendance_percentage' | 'general'
  studentName?: string
  className?: string
  dateRange?: { start: string; end: string }
  specificDate?: string
  periodNumber?: number
}

async function analyzeQueryWithAI(message: string): Promise<QueryAnalysis | null> {
  const today = getTodayIST()
  const prompt = `
You are an AI assistant for a school attendance system. Analyze the user's query and extract structured information.
Today's date: ${today}

User query: "${message}"

Respond with JSON only (no markdown, no code blocks):
{
  "needsDb": true/false,
  "directAnswer": "string if needsDb is false",
  "queryType": "student_absence_count" | "daily_summary" | "absent_list" | "most_absent" | "attendance_percentage" | "general",
  "studentName": "string or null",
  "className": "string or null",
  "dateRange": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"} or null,
  "specificDate": "YYYY-MM-DD" or null,
  "periodNumber": number or null
}

Date range hints:
- "this month" = first day of current month to today
- "this week" = Monday of current week to today
- "today" = just today's date
- "last week" = previous Monday to Sunday
- "yesterday" = yesterday's date
`

  const gemini = getGeminiClient()
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: GEMINI_MODEL })
      const result = await model.generateContent(prompt)
      const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim()
      return JSON.parse(text) as QueryAnalysis
    } catch (e) {
      console.error('Gemini query analysis failed:', e)
    }
  }

  const groq = getGroqClient()
  if (groq) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: GROQ_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
      })
      const text = completion.choices[0]?.message?.content || '{}'
      return JSON.parse(text) as QueryAnalysis
    } catch (e) {
      console.error('Groq query analysis failed:', e)
    }
  }

  // Fallback: basic keyword analysis
  return fallbackQueryAnalysis(message)
}

function fallbackQueryAnalysis(text: string): QueryAnalysis {
  const t = text.toLowerCase()
  const today = getTodayIST()

  if (t.includes('today') || t.includes('attendance')) {
    return { needsDb: true, queryType: 'daily_summary', specificDate: today }
  }
  if (t.includes('absent') && (t.includes('most') || t.includes('top'))) {
    return { needsDb: true, queryType: 'most_absent', dateRange: getMonthRange(today) }
  }
  if (t.includes('absent') || t.includes('absence')) {
    // Try to extract a student name (basic)
    return { needsDb: true, queryType: 'student_absence_count', dateRange: getMonthRange(today) }
  }

  return { needsDb: true, queryType: 'general' }
}

function getMonthRange(today: string): { start: string; end: string } {
  const [y, m] = today.split('-')
  return { start: `${y}-${m}-01`, end: today }
}

async function executeAnalyticsQuery(
  adminClient: any,
  analysis: QueryAnalysis,
  s: ChatSession
): Promise<{ message: string; hasData: boolean; analyticsData?: any }> {
  switch (analysis.queryType) {
    case 'student_absence_count': {
      if (!analysis.studentName) {
        return { message: 'Which student are you asking about? Please include the student\'s name in your question.', hasData: false }
      }

      // Find the student
      const { data: students } = await adminClient
        .from('students')
        .select('id, name, roll_number, class_id')
        .ilike('name', `%${analysis.studentName}%`)

      if (!students || students.length === 0) {
        return { message: `I couldn't find a student named "${analysis.studentName}". Please check the spelling.`, hasData: false }
      }

      const student = students[0]
      const dateRange = analysis.dateRange || getMonthRange(getTodayIST())

      const { data: absences } = await adminClient
        .from('attendance')
        .select('id, period_id, status, periods(date, period_number, start_time, end_time)')
        .eq('student_id', student.id)
        .eq('status', 'Absent')
        .gte('periods.date', dateRange.start)
        .lte('periods.date', dateRange.end)

      const validAbsences = (absences || []).filter((a: any) => a.periods !== null)
      const count = validAbsences.length

      if (count === 0) {
        return {
          message: `**${student.name}** has no absences from ${formatDateDisplay(dateRange.start)} to ${formatDateDisplay(dateRange.end)}. 🎉`,
          hasData: false,
        }
      }

      const dateList = validAbsences
        .map((a: any) => `• ${formatDateDisplay(a.periods.date)} — Period ${a.periods.period_number}`)
        .join('\n')

      return {
        message: `**${student.name}** has been absent **${count} time${count !== 1 ? 's' : ''}** from ${formatDateDisplay(dateRange.start)} to ${formatDateDisplay(dateRange.end)}:\n\n${dateList}`,
        hasData: true,
        analyticsData: {
          summary: `${count} absences`,
          rows: validAbsences.map((a: any) => ({
            Date: formatDateDisplay(a.periods.date),
            Period: `P${a.periods.period_number}`,
            Time: `${a.periods.start_time?.slice(0, 5)}–${a.periods.end_time?.slice(0, 5)}`,
          })),
          columns: ['Date', 'Period', 'Time'],
        },
      }
    }

    case 'daily_summary': {
      const date = analysis.specificDate || getTodayIST()

      let query = adminClient
        .from('periods')
        .select('id, period_number, start_time, end_time, classes(class_name), subjects(subject_name), attendance(id, status)')
        .eq('date', date)
        .order('period_number')

      let { data: periods } = await query

      if (!periods || periods.length === 0) {
        try {
          await ensureDailyPeriods(date)
          const refetch = await query
          periods = refetch.data
        } catch {}
      }

      if (!periods || periods.length === 0) {
        return { message: `No periods found for ${formatDateDisplay(date)}.`, hasData: false }
      }

      let msg = `**Attendance Summary for ${formatDateDisplay(date)}:**\n\n`
      const rows: any[] = []

      for (const p of periods as any[]) {
        const att = p.attendance || []
        const present = att.filter((a: any) => a.status === 'Present').length
        const absent = att.filter((a: any) => a.status === 'Absent').length
        const total = att.length
        const marked = total > 0

        const status = marked ? `✅ ${present}P / ${absent}A` : '— not marked'
        msg += `• **Period ${p.period_number}** (${p.start_time?.slice(0, 5)}–${p.end_time?.slice(0, 5)}) — ${p.classes?.class_name || ''} — ${status}\n`

        rows.push({
          Period: `P${p.period_number}`,
          Time: `${p.start_time?.slice(0, 5)}–${p.end_time?.slice(0, 5)}`,
          Class: p.classes?.class_name || '',
          Status: marked ? `${present}P / ${absent}A` : 'Not marked',
        })
      }

      return {
        message: msg,
        hasData: true,
        analyticsData: {
          summary: `${periods.length} periods`,
          rows,
          columns: ['Period', 'Time', 'Class', 'Status'],
        },
      }
    }

    case 'absent_list': {
      const date = analysis.specificDate || getTodayIST()
      let periodFilter = ''

      let query = adminClient
        .from('attendance')
        .select('id, status, students(name, roll_number), periods(date, period_number, start_time, class_id)')
        .eq('status', 'Absent')
        .eq('periods.date', date)

      if (analysis.periodNumber) {
        query = query.eq('periods.period_number', analysis.periodNumber)
        periodFilter = ` for Period ${analysis.periodNumber}`
      }

      const { data: absentRecords } = await query

      const validRecords = (absentRecords || []).filter((r: any) => r.periods !== null && r.students !== null)

      if (validRecords.length === 0) {
        return { message: `No absentees found on ${formatDateDisplay(date)}${periodFilter}. 🎉`, hasData: false }
      }

      const names = validRecords.map((r: any) => `• ${r.students.name} (${r.students.roll_number}) — Period ${r.periods.period_number}`)

      return {
        message: `**Absent students on ${formatDateDisplay(date)}${periodFilter}:**\n\n${names.join('\n')}`,
        hasData: true,
        analyticsData: {
          summary: `${validRecords.length} absences`,
          rows: validRecords.map((r: any) => ({
            Student: r.students.name,
            'Roll No': r.students.roll_number,
            Period: `P${r.periods.period_number}`,
          })),
          columns: ['Student', 'Roll No', 'Period'],
        },
      }
    }

    case 'most_absent': {
      const dateRange = analysis.dateRange || getMonthRange(getTodayIST())

      const { data: absences } = await adminClient
        .from('attendance')
        .select('student_id, status, students(name, roll_number, class_id, classes(class_name)), periods(date)')
        .eq('status', 'Absent')
        .gte('periods.date', dateRange.start)
        .lte('periods.date', dateRange.end)

      const validAbsences = (absences || []).filter((a: any) => a.periods !== null && a.students !== null)

      // Count per student
      const counts = new Map<number, { name: string; roll: string; className: string; count: number }>()
      for (const a of validAbsences as any[]) {
        const existing = counts.get(a.student_id)
        if (existing) {
          existing.count++
        } else {
          counts.set(a.student_id, {
            name: a.students.name,
            roll: a.students.roll_number,
            className: a.students.classes?.class_name || '',
            count: 1,
          })
        }
      }

      const sorted = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10)

      if (sorted.length === 0) {
        return { message: `No absences recorded from ${formatDateDisplay(dateRange.start)} to ${formatDateDisplay(dateRange.end)}.`, hasData: false }
      }

      let msg = `**Most absent students (${formatDateDisplay(dateRange.start)} — ${formatDateDisplay(dateRange.end)}):**\n\n`
      sorted.forEach((s, i) => {
        msg += `${i + 1}. **${s.name}** (${s.roll}) — ${s.className} — **${s.count}** absences\n`
      })

      return {
        message: msg,
        hasData: true,
        analyticsData: {
          summary: `Top ${sorted.length} most absent`,
          rows: sorted.map((s, i) => ({
            '#': i + 1,
            Student: s.name,
            'Roll No': s.roll,
            Class: s.className,
            Absences: s.count,
          })),
          columns: ['#', 'Student', 'Roll No', 'Class', 'Absences'],
        },
      }
    }

    default: {
      // General query — try to give a helpful response
      return {
        message: 'I\'m not sure how to answer that specific question yet. Here are some things I can help with:\n\n' +
          '• **"How many times was [student] absent this month?"**\n' +
          '• **"Show today\'s attendance"**\n' +
          '• **"Who was absent today?"**\n' +
          '• **"Who are the most absent students?"**',
        hasData: false,
      }
    }
  }
}

async function generateConversationalResponse(baseInfo: string, isUpdate: boolean): Promise<string> {
  const prompt = `
You are a friendly, concise AI assistant for a school attendance system.
You just ${isUpdate ? 'updated' : 'marked'} attendance. Rewrite the following into a warm, natural response.
Keep all factual data (period, class, present/absent counts, names). Be concise — max 3-4 lines.
Do not use markdown code blocks. Use bold (**text**) for emphasis.${isUpdate ? ' Mention this was an update and changes are saved.' : ''}

Info: ${baseInfo}
`

  const gemini = getGeminiClient()
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: GEMINI_MODEL })
      const result = await model.generateContent(prompt)
      const text = result.response.text().trim()
      if (text) return text
    } catch (e) {
      console.error('Gemini conversational gen failed:', e)
    }
  }

  const groq = getGroqClient()
  if (groq) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: GROQ_MODEL,
        temperature: 0.7,
      })
      return completion.choices[0]?.message?.content?.trim() || ''
    } catch (e) {
      console.error('Groq conversational gen failed:', e)
    }
  }

  return ''
}

// ═══════════════════════════════════════════════════════════════════
// LEGACY COMPAT: Keep old processAttendanceMessage for transition
// ═══════════════════════════════════════════════════════════════════

export async function processAttendanceMessage(
  message: string,
  explicitPeriodNumber?: number
): Promise<ChatbotResult> {
  // Legacy wrapper — create a temporary session and route through the new engine
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, message: 'Not authenticated', matched: [], unmatched: [], ambiguous: [], totalPresent: 0, totalAbsent: 0 }
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = ((profile as any)?.role || 'instructor') as 'admin' | 'instructor'

  // Build a session that's pre-configured for marking today
  const s = createFreshSession(user.id, role)
  s.currentIntent = 'mark_today'
  s.targetDate = getTodayIST()
  s.periodNumber = explicitPeriodNumber || null

  if (explicitPeriodNumber) {
    // The old flow had an explicit period selected via chip
    const adminClient = createAdminClient()
    const { data: periods } = await adminClient
      .from('periods')
      .select('id, class_id, period_number, start_time, end_time, classes(class_name)')
      .eq('date', s.targetDate)
      .eq('period_number', explicitPeriodNumber)

    if (periods && periods.length > 0) {
      const period = periods[0] as any
      s.periodId = period.id
      s.classSectionId = period.class_id
      s.className = period.classes?.class_name || 'Class 1'
      s.periodLabel = `Period ${explicitPeriodNumber} (${period.start_time?.slice(0, 5)}–${period.end_time?.slice(0, 5)})`
      s.step = 'ask_absentees'

      // Process the message as absentee input
      const response = await handleAbsentees(message, s)
      return chatResponseToLegacy(response)
    }
  }

  // Fallback: route through the new engine
  const response = await processChatMessage(message, s)
  return chatResponseToLegacy(response)
}

function chatResponseToLegacy(r: ChatResponse): ChatbotResult {
  return {
    success: r.messageType === 'success' || r.messageType === 'confirmation',
    message: r.message,
    matched: r.confirmationData?.absentNames || [],
    unmatched: r.clarificationData?.unresolvedNames || [],
    ambiguous: r.clarificationData?.ambiguousNames?.map(a => ({
      input: a.input,
      suggestions: a.suggestions.map(s => s.name),
    })) || [],
    totalPresent: r.confirmationData?.totalPresent || 0,
    totalAbsent: r.confirmationData?.totalAbsent || 0,
    periodInfo: r.confirmationData?.periodLabel || undefined,
    isHelp: r.messageType === 'menu',
  }
}

export async function getFormatGuide(currentPeriodNum?: number | null): Promise<string> {
  return (
    `**AttendEase Assistant Guide**\n\n` +
    `I can help you with:\n\n` +
    `1. **Mark today's attendance** — Quick mark for the current or selected period\n` +
    `2. **Update previous attendance** — Edit attendance for a past date\n` +
    `3. **Ask a question** — Query attendance statistics and reports\n\n` +
    (currentPeriodNum
      ? `*Current active period:* **Period ${currentPeriodNum}**.\n\n`
      : '') +
    `Just type your choice or ask me anything!`
  )
}
