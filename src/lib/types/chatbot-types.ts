/**
 * Chatbot Session & Message Types
 * ================================
 * Shared types for the attendance chatbot's conversational state machine.
 * Used by both the server action (chatbot.ts) and client UI (ChatPanel.tsx).
 */

// ── Session Step (state machine states) ──────────────────────────
export type ChatStep =
  | 'menu'            // Main menu — pick an intent
  | 'select_class'    // Instructor teaches multiple classes — pick one
  | 'detect_period'   // Flow 1: auto-detect current period
  | 'ask_date'        // Flow 2: ask for DD/MM/YYYY
  | 'show_periods'    // Flow 2: show periods for a date
  | 'select_period'   // Flow 2: user picks a period
  | 'ask_absentees'   // Both flows: ask for absent names
  | 'resolve_names'   // Both flows: matching names against roster
  | 'clarify_name'    // Both flows: disambiguate specific names
  | 'confirm'         // Both flows: show summary, ask correct/update
  | 'update_loop'     // Both flows: re-open absentee list
  | 'ask_overwrite'   // Both flows: attendance already exists, overwrite?
  | 'query_intent'    // Flow 3: understanding the query
  | 'query_db'        // Flow 3: running the DB lookup
  | 'done'            // End state

export type ChatIntent = 'mark_today' | 'update_previous' | 'general_query' | null

// ── Session State (passed between client ↔ server each turn) ────
export interface ChatSession {
  sessionId: string
  userId: string
  role: 'admin' | 'instructor' | 'other'
  currentIntent: ChatIntent
  classSectionId: number | null
  className: string | null
  targetDate: string | null           // YYYY-MM-DD
  periodId: number | null
  periodNumber: number | null
  periodLabel: string | null
  rawAbsenteeInput: string | null
  resolvedAbsentStudentIds: number[]
  unresolvedNames: string[]
  ambiguousNames: AmbiguousName[]
  awaitingClarificationFor: string | null
  attendanceWritten: boolean
  step: ChatStep
  lastActivityAt: number              // Date.now() timestamp for idle timeout
  failedAttempts: number              // consecutive bad inputs tracker
}

export interface AmbiguousName {
  input: string
  suggestions: { id: number; name: string; rollNumber: string }[]
}

// ── Chat Response (server → client) ─────────────────────────────
export interface ChatResponse {
  message: string
  session: ChatSession
  messageType: MessageType
  // Optional data payloads for rich UI rendering
  menuOptions?: MenuOption[]
  periodList?: PeriodListItem[]
  confirmationData?: ConfirmationData
  clarificationData?: ClarificationData
  analyticsData?: AnalyticsData
  classList?: ClassOption[]
}

export type MessageType =
  | 'text'              // Plain conversational text
  | 'menu'              // Main menu with 3 intent cards
  | 'class_select'      // Class selection for multi-class instructors
  | 'period_detect'     // Auto-detected period info
  | 'period_list'       // List of periods for a date (Flow 2)
  | 'ask_input'         // Asking for text input (names, date, etc.)
  | 'clarification'     // Name disambiguation with chips
  | 'confirmation'      // Summary with Correct/Update buttons
  | 'overwrite_prompt'  // Attendance already exists — overwrite?
  | 'success'           // Attendance marked successfully
  | 'analytics'         // Analytics query response
  | 'error'             // Error message
  | 'cancelled'         // Flow cancelled
  | 'session_expired'   // Idle timeout

// ── Rich UI Data Payloads ────────────────────────────────────────

export interface MenuOption {
  id: ChatIntent
  label: string
  description: string
  icon: 'mark' | 'update' | 'query'
  disabled?: boolean
  disabledReason?: string
}

export interface PeriodListItem {
  periodId: number
  periodNumber: number
  startTime: string
  endTime: string
  label: string
  isMarked: boolean
  presentCount?: number
  absentCount?: number
  className?: string
  subjectName?: string
}

export interface ClassOption {
  id: number
  className: string
}

export interface ConfirmationData {
  periodLabel: string
  className: string
  date: string
  totalPresent: number
  totalAbsent: number
  totalStudents: number
  absentNames: string[]
  isUpdate: boolean
}

export interface ClarificationData {
  unresolvedNames: string[]
  ambiguousNames: AmbiguousName[]
  resolvedSoFar: string[]
}

export interface AnalyticsData {
  summary: string
  rows?: Record<string, string | number>[]
  columns?: string[]
}

// ── Helper: create a fresh session ───────────────────────────────
export function createFreshSession(userId: string, role: 'admin' | 'instructor' | 'other'): ChatSession {
  return {
    sessionId: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    role,
    currentIntent: null,
    classSectionId: null,
    className: null,
    targetDate: null,
    periodId: null,
    periodNumber: null,
    periodLabel: null,
    rawAbsenteeInput: null,
    resolvedAbsentStudentIds: [],
    unresolvedNames: [],
    ambiguousNames: [],
    awaitingClarificationFor: null,
    attendanceWritten: false,
    step: 'menu',
    lastActivityAt: Date.now(),
    failedAttempts: 0,
  }
}

// ── Constants ────────────────────────────────────────────────────
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
export const MAX_FAILED_ATTEMPTS = 3
export const ACADEMIC_YEAR_START = '2026-07-01' // YYYY-MM-DD

// ── Cancel/exit keywords ─────────────────────────────────────────
const CANCEL_KEYWORDS = [
  'cancel', 'stop', 'exit', 'quit', 'menu', 'start over',
  'main menu', 'go back', 'back', 'nevermind', 'never mind', 'abort',
]

export function isCancelCommand(text: string): boolean {
  const t = text.trim().toLowerCase()
  return CANCEL_KEYWORDS.some(k => t === k || t === `/${k}`)
}
