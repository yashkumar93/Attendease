/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPeriod } from '@/lib/period-config'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

// BN-7: Module-level lazy singletons — clients are stateless and safe to reuse.
// Previously they were constructed on every call (twice per request: once for
// intent analysis and once for conversational response).
let _geminiClient: GoogleGenerativeAI | null = null
let _groqClient: Groq | null = null

function getGeminiClient(): GoogleGenerativeAI | null {
  if (!process.env.GEMINI_API_KEY) return null
  if (!_geminiClient) {
    _geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  }
  return _geminiClient
}

function getGroqClient(): Groq | null {
  if (!process.env.GROQ_API_KEY) return null
  if (!_groqClient) {
    _groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return _groqClient
}

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
const LOCK_TIMEOUT_MS = 15000 // 15-second safety timeout (increased for LLM calls)

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

// BN-5/6: Tracks whether the background after() task has been scheduled.
// When true, the background task owns the lock and releases it in its finally.
// When false, the outer finally block releases it instead.
let _backgroundScheduled = false


/**
 * Generates the formatting guide message.
 */
export async function getFormatGuide(currentPeriodNum?: number | null): Promise<string> {
  return (
    `**Quick Mark Attendance Guide**\n\n` +
    `You can mark attendance in any of the following ways:\n\n` +
    `1. **Select a period button:**\n` +
    `Select any period above, then enter absent student names or roll numbers.\n\n` +
    `2. **Conversational or direct command:**\n` +
    `• \`Period 3 - Rahul, Vicky\` _(marks them absent for Period 3)_\n` +
    `• \`Mark John and Jane present for P2\` _(marks everyone else absent)_\n` +
    `• \`Everyone is present today in period 1\` _(marks everyone present)_\n` +
    `• \`3: 101, 104\` _(using roll numbers)_\n\n` +
    (currentPeriodNum
      ? `*Current active period:* **Period ${currentPeriodNum}**.\n\n`
      : '') +
    `*Note:* You can mark attendance as many times as needed. If attendance is already marked for a period, sending a new command will **update** it and log the change in the audit trail.`
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

interface GeminiIntent {
  intent: 'mark_attendance' | 'help' | 'unknown'
  periodNumber: number | null
  presentNames: string[]
  absentNames: string[]
}

async function analyzeIntentWithAI(message: string, explicitPeriod?: number): Promise<GeminiIntent> {
  const prompt = `
You are an AI assistant for a school attendance system.
Analyze the user's message and extract attendance info.
If the user specifies an explicit period number, use it. Otherwise, extract it from the text (1 to 7).
If the user says "all present" or "none absent", set presentNames to [] and absentNames to [].
If the user lists present students (e.g., "present: John, Jane", "only Rahul was present"), put them in presentNames.
If the user lists absent students (e.g., "absent: Rahul"), put them in absentNames.
If the user just lists names without specifying present/absent (e.g., "Period 3 - John, Jane"), assume they are ABSENT students (this is the default behavior).
Explicit period selected from UI: ${explicitPeriod || 'None'}
User message: "${message}"

Respond strictly with a JSON object (no markdown, no formatting) matching this schema:
{
  "intent": "mark_attendance" | "help" | "unknown",
  "periodNumber": number | null,
  "presentNames": string[],
  "absentNames": string[]
}
`

  // 1. Try Gemini (gemini-1.5-flash-8b) — reuse singleton client (BN-7)
  const gemini = getGeminiClient()
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash-8b' })
      const result = await model.generateContent(prompt)
      const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim()
      return JSON.parse(text) as GeminiIntent
    } catch (error) {
      console.error('Gemini analysis failed, falling back to Groq:', error)
    }
  }

  // 2. Try Groq (llama3-8b-8192) — reuse singleton client (BN-7)
  const groq = getGroqClient()
  if (groq) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama3-8b-8192',
        temperature: 0,
        response_format: { type: 'json_object' },
      })
      const text = completion.choices[0]?.message?.content || '{}'
      return JSON.parse(text) as GeminiIntent
    } catch (error) {
      console.error('Groq analysis failed, falling back to regex:', error)
    }
  }

  // 3. Fallback to Regex
  const parsed = parseMessageFallback(message, explicitPeriod)
  return { intent: isHelpRequest(message) ? 'help' : 'mark_attendance', ...parsed, presentNames: [] }
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
  // BN-5/6: skipRelease flag lets us avoid double-release when the lock was
  // never acquired (e.g., concurrent-rejection fast path).
  const fail = (msg: string, isHelp = false, releaseLockOnReturn = true): ChatbotResult => {
    if (releaseLockOnReturn) releaseLock()
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

  // BN-5/6: Acquire the lock before entering the try block. The finally clause
  // guarantees releaseLock() runs on ALL non-background exit paths, even on
  // unexpected throws from auth/DB calls.
  if (!acquireLock()) {
    return fail(
      '⏳ Another attendance request is currently being processed. Only one request is served at a time. Please wait a moment and try again.',
      false,
      false /* skipRelease — lock was never acquired */
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

    // ── 3. Parse Message & Resolve Period (LLM) ────────────────────────
    const parsed = await analyzeIntentWithAI(trimmed, explicitPeriodNumber)

    if (parsed.intent === 'help' || parsed.intent === 'unknown') {
      const guide = await getFormatGuide(activePeriodNum)
      return fail(guide, true)
    }

    // If still no period number, fallback to current period if active
    if (!parsed.periodNumber) {
      if (activePeriodNum) {
        parsed.periodNumber = activePeriodNum
      } else {
        const guide = await getFormatGuide(null)
        return fail(
          'Could not determine which period to mark attendance for.\n\n' +
          guide +
          '\n\n**Select a period button above or enter the period number (e.g. `Period 1 - ...`).**',
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

    // ── 5. Check if Attendance is Already Marked (for update tracking) ─────
    const { count: attendanceCount } = await adminClient
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('period_id', period.id)

    const isUpdate = !!(attendanceCount && attendanceCount > 0)

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

    // ── 7. Match Students In-Memory ───────────────────────
    const absentIds: number[] = []
    const matchedAbsent: string[] = []
    const matchedPresent: string[] = []
    const unmatched: string[] = []
    const ambiguous: { input: string; suggestions: string[] }[] = []

    // Logic: If user specified present list ONLY, everyone else is absent
    if (parsed.presentNames.length > 0 && parsed.absentNames.length === 0) {
      const presentIdSet = new Set<number>() // BN-10: Set for O(1) lookup below
      for (const inputName of parsed.presentNames) {
        const match = matchStudent(inputName, students)
        if (match.type === 'exact') {
          presentIdSet.add(match.student!.id)
          matchedPresent.push(match.student!.name)
        } else if (match.type === 'ambiguous') {
          ambiguous.push({
            input: inputName,
            suggestions: match.suggestions!.map((s) => s.name),
          })
        } else {
          unmatched.push(inputName)
        }
      }

      // BN-10: O(1) Set.has instead of O(n) Array.includes per student
      for (const s of students) {
        if (!presentIdSet.has(s.id)) {
          absentIds.push(s.id)
        }
      }
    } else {
      // Logic: User specified absent list (and optionally present list, but absent list takes precedence for calculating absences)
      for (const inputName of parsed.absentNames) {
        const match = matchStudent(inputName, students)
        if (match.type === 'exact') {
          absentIds.push(match.student!.id)
          matchedAbsent.push(match.student!.name)
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

      // BN-5/6: Release lock on this early-return path (not background-scheduled)
      releaseLock()
      _backgroundScheduled = true // prevent double-release in finally
      return {
        success: false,
        message:
          `Some student names match multiple people. Please use the full name or roll number:\n\n${ambigLines}\n\n` +
          (matchedAbsent.length > 0 ? `Matched so far: ${matchedAbsent.join(', ')}` : ''),
        matched: matchedAbsent,
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
    const now = new Date().toISOString()
    // BN-9: Set for O(1) membership check inside .map
    const absentIdSet = new Set(absentIds)

    const records = students.map((s: any) => ({
      period_id: period.id,
      student_id: s.id,
      status: absentIdSet.has(s.id) ? 'Absent' : 'Present',
      marked_by: user.id,
      ...(isUpdate
        ? { last_modified_by: user.id, last_modified_at: now }
        : {}),
    }))

    // ── 9. Execute Database Upsert in Background ─────────────────
    // BN-5/6: Mark the flag BEFORE calling after() so the finally block
    // skips its releaseLock() — the background task's own finally owns it.
    _backgroundScheduled = true
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

    // ── 10. Instant Response to User (Conversational) ──────────────
    const actionLabel = isUpdate ? 'Updated' : 'Marked'
    let baseMsg = `${actionLabel} **${periodLabel}** — ${className}\n\n`
    baseMsg += `**${totalPresent}** present · **${totalAbsent}** absent of ${students.length}`
    if (isUpdate) {
      baseMsg += `\n\n_(Attendance updated — changes logged in audit trail)_`
    }

    if (matchedAbsent.length > 0) {
      baseMsg += `\n\n**Absent:** ${matchedAbsent.join(', ')}`
    } else if (matchedPresent.length > 0 && parsed.absentNames.length === 0) {
      baseMsg += `\n\n**Present list marked:** ${matchedPresent.join(', ')}`
    }

    if (unmatched.length > 0) {
      baseMsg += `\n\n**Could not find:** ${unmatched.join(', ')}`
    }

    if (totalAbsent === 0) {
      baseMsg += '\n\n**All students marked present.**'
    }

    let finalMsg = baseMsg;

    // Use AI for a conversational final response if API keys exist and no errors
    if (unmatched.length === 0) {
      const chatPrompt = `
You are a friendly, conversational AI assistant for a school attendance system.
You just ${isUpdate ? 'updated' : 'marked'} attendance. Rewrite the following status message to be warm, natural, and conversational, while keeping all the factual info (Period, Class, Present count, Absent count, and names). Do not add markdown code blocks. Keep it concise.${isUpdate ? ' Mention that this was an update/correction and changes are saved.' : ''}

Status message:
${baseMsg}
`
      let aiResponse = ''

      // BN-7: Reuse singleton clients instead of constructing new instances
      const gemini = getGeminiClient()
      if (gemini) {
        try {
          const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash-8b' })
          const chatResult = await model.generateContent(chatPrompt)
          aiResponse = chatResult.response.text().trim()
        } catch (e) {
          console.error('Gemini conversational generation failed', e)
        }
      }

      if (!aiResponse) {
        const groq = getGroqClient()
        if (groq) {
          try {
            const completion = await groq.chat.completions.create({
              messages: [{ role: 'user', content: chatPrompt }],
              model: 'llama3-8b-8192',
              temperature: 0.7,
            })
            aiResponse = completion.choices[0]?.message?.content?.trim() || ''
          } catch (e) {
            console.error('Groq conversational generation failed', e)
          }
        }
      }

      if (aiResponse) {
        finalMsg = aiResponse
      }
    }

    return {
      success: true,
      message: finalMsg,
      matched: matchedAbsent.length > 0 ? matchedAbsent : matchedPresent,
      unmatched,
      ambiguous: [],
      totalPresent,
      totalAbsent,
      periodInfo: periodLabel,
      detectedPeriodNumber: parsed.periodNumber,
    }
  } catch (err: any) {
    return fail(`Unexpected error: ${err.message || 'Unknown error'}`)
  } finally {
    // BN-5/6: This finally block runs on all non-background paths (help, auth
    // failure, period-not-found, etc.). The background path (after()) releases
    // the lock itself in its own finally block, so we only release here when
    // the background task was NOT scheduled.
    // We track whether after() was invoked via _backgroundScheduled flag.
    if (!_backgroundScheduled) {
      releaseLock()
    }
    _backgroundScheduled = false
  }
}

// ── Helpers ────────────────────────────────────────────────────────

interface ParsedMessageFallback {
  periodNumber: number | null
  absentNames: string[]
}

function parseMessageFallback(raw: string, explicitPeriod?: number): ParsedMessageFallback {
  const trimmed = raw.trim()

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

  remainder = remainder.replace(/^(?:absent(?:ees)?|absent students?)\s*[:\-–]?\s*/i, '').trim()

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

  const exactMatch = students.find((s) => s.name.toLowerCase() === input)
  if (exactMatch) {
    return { type: 'exact', student: exactMatch }
  }

  const rollMatch = students.find((s) => s.roll_number.toLowerCase() === input)
  if (rollMatch) {
    return { type: 'exact', student: rollMatch }
  }

  const partialMatches = students.filter((s) => {
    const studentName = s.name.toLowerCase()
    const nameParts = studentName.split(/\s+/)
    return (
      studentName === input ||
      studentName.includes(input) ||
      nameParts[0] === input ||
      nameParts[nameParts.length - 1] === input
    )
  })

  if (partialMatches.length === 1) {
    return { type: 'exact', student: partialMatches[0] }
  }

  if (partialMatches.length > 1) {
    return { type: 'ambiguous', suggestions: partialMatches }
  }

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
