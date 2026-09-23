/**
 * Fuzzy Name Matching Engine
 * ===========================
 * Multi-strategy student name matching with Levenshtein distance scoring.
 * Used by the attendance chatbot for resolving comma-separated absent/present names
 * against the class roster.
 *
 * Strategy order (first match wins):
 *   1. Exact match (case-insensitive, whitespace-normalized)
 *   2. Roll number match
 *   3. Single first-name or last-name match
 *   4. Fuzzy match via Levenshtein with confidence threshold
 *
 * If multiple candidates match at the same level → ambiguous (needs disambiguation).
 * If no candidate matches → not_found.
 */

export interface StudentRecord {
  id: number
  name: string
  roll_number: string
}

export interface MatchResult {
  type: 'exact' | 'ambiguous' | 'not_found' | 'multiple'
  student?: StudentRecord
  students?: StudentRecord[]
  suggestions?: StudentRecord[]
  confidence?: number
}

// ── Levenshtein distance ────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const la = a.length
  const lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la

  // Use two rows instead of full matrix for O(min(la,lb)) space
  let prev = new Array(lb + 1)
  let curr = new Array(lb + 1)

  for (let j = 0; j <= lb; j++) prev[j] = j

  for (let i = 1; i <= la; i++) {
    curr[0] = i
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost  // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[lb]
}

/**
 * Similarity score between 0 and 1, where 1 is an exact match.
 */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

// ── Normalize ───────────────────────────────────────────────────
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface MultiMatchResult {
  matchedStudents: StudentRecord[]
  unconsumed: string[]
}

/**
 * Scan an arbitrary string to locate multiple non-overlapping student matches
 * (names or roll numbers) against the class roster.
 */
export function findStudentsInString(
  inputStr: string,
  students: StudentRecord[]
): MultiMatchResult {
  const normInput = normalize(inputStr)
  const sorted = [...students].sort((a, b) => b.name.length - a.name.length)
  const matches: { student: StudentRecord; start: number; end: number }[] = []
  const consumed = new Array(normInput.length).fill(false)

  // 1. Search student names (longer names first to prevent partial substrings from stealing)
  for (const st of sorted) {
    const sName = normalize(st.name)
    if (sName.length < 3) continue
    const regex = new RegExp('\\b' + escapeRegExp(sName) + '\\b', 'gi')
    let match: RegExpExecArray | null
    while ((match = regex.exec(normInput)) !== null) {
      const start = match.index
      const end = start + match[0].length
      let alreadyOverlap = false
      for (let i = start; i < end; i++) {
        if (consumed[i]) {
          alreadyOverlap = true
          break
        }
      }
      if (!alreadyOverlap) {
        for (let i = start; i < end; i++) consumed[i] = true
        if (!matches.some(m => m.student.id === st.id)) {
          matches.push({ student: st, start, end })
        }
      }
    }
  }

  // 2. Also check roll numbers
  for (const st of students) {
    if (!st.roll_number) continue
    const roll = st.roll_number.toLowerCase().trim()
    if (roll.length < 2) continue
    const regex = new RegExp('\\b' + escapeRegExp(roll) + '\\b', 'gi')
    let match: RegExpExecArray | null
    while ((match = regex.exec(normInput)) !== null) {
      const start = match.index
      const end = start + match[0].length
      let alreadyOverlap = false
      for (let i = start; i < end; i++) {
        if (consumed[i]) {
          alreadyOverlap = true
          break
        }
      }
      if (!alreadyOverlap) {
        for (let i = start; i < end; i++) consumed[i] = true
        if (!matches.some(m => m.student.id === st.id)) {
          matches.push({ student: st, start, end })
        }
      }
    }
  }

  // 3. Collect remaining unconsumed substrings
  const unconsumedChunks: string[] = []
  let currentChunk = ''
  for (let i = 0; i < normInput.length; i++) {
    if (!consumed[i]) {
      currentChunk += normInput[i]
    } else {
      if (currentChunk.trim().length >= 2) {
        unconsumedChunks.push(currentChunk.trim())
      }
      currentChunk = ''
    }
  }
  if (currentChunk.trim().length >= 2) {
    unconsumedChunks.push(currentChunk.trim())
  }

  return {
    matchedStudents: matches.sort((a, b) => a.start - b.start).map(m => m.student),
    unconsumed: unconsumedChunks,
  }
}

// ── Confidence thresholds ───────────────────────────────────────
const FUZZY_THRESHOLD = 0.65  // Below this, don't even suggest
const AUTO_RESOLVE_THRESHOLD = 0.85  // Above this with single match → auto-resolve

// ── Main matching function ──────────────────────────────────────
export function matchStudent(
  inputName: string,
  students: StudentRecord[]
): MatchResult {
  const input = normalize(inputName)
  if (!input) return { type: 'not_found' }

  // ── Strategy 1: Exact match (case-insensitive, whitespace-normalized) ──
  const exactMatch = students.find(s => normalize(s.name) === input)
  if (exactMatch) {
    return { type: 'exact', student: exactMatch, confidence: 1.0 }
  }

  // ── Strategy 2: Roll number match ──
  const rollMatch = students.find(s => s.roll_number.toLowerCase().trim() === input)
  if (rollMatch) {
    return { type: 'exact', student: rollMatch, confidence: 1.0 }
  }

  // ── Strategy 3: Multi-student detection in a single token/string ──
  const multi = findStudentsInString(input, students)
  if (multi.matchedStudents.length > 1) {
    return {
      type: 'multiple',
      students: multi.matchedStudents,
      confidence: 1.0,
    }
  }

  // ── Strategy 3: Single part-name match (first name or last name only) ──
  const partialMatches = students.filter(s => {
    const parts = normalize(s.name).split(' ')
    return parts.some(part => part === input)
  })

  if (partialMatches.length === 1) {
    return { type: 'exact', student: partialMatches[0], confidence: 0.9 }
  }
  if (partialMatches.length > 1) {
    return {
      type: 'ambiguous',
      suggestions: partialMatches,
      confidence: 0.9,
    }
  }

  // ── Strategy 4: Substring / contains match ──
  const containsMatches = students.filter(s => {
    const studentName = normalize(s.name)
    return studentName.includes(input) || input.includes(studentName)
  })

  if (containsMatches.length === 1) {
    return { type: 'exact', student: containsMatches[0], confidence: 0.85 }
  }
  if (containsMatches.length > 1) {
    return {
      type: 'ambiguous',
      suggestions: containsMatches,
      confidence: 0.85,
    }
  }

  // ── Strategy 5: Levenshtein fuzzy match ──
  if (input.length >= 3) {
    const scored = students
      .map(s => ({
        student: s,
        score: Math.max(
          similarity(input, normalize(s.name)),
          // Also try matching against individual name parts
          ...normalize(s.name).split(' ').map(part => similarity(input, part))
        ),
      }))
      .filter(s => s.score >= FUZZY_THRESHOLD)
      .sort((a, b) => b.score - a.score)

    if (scored.length === 1 && scored[0].score >= AUTO_RESOLVE_THRESHOLD) {
      return { type: 'exact', student: scored[0].student, confidence: scored[0].score }
    }

    if (scored.length === 1) {
      // Single fuzzy match below auto-resolve threshold → still suggest
      return {
        type: 'ambiguous',
        suggestions: [scored[0].student],
        confidence: scored[0].score,
      }
    }

    if (scored.length > 1) {
      // Multiple fuzzy matches
      // If the top match is much better, auto-resolve
      if (scored[0].score >= AUTO_RESOLVE_THRESHOLD && scored[0].score - scored[1].score >= 0.15) {
        return { type: 'exact', student: scored[0].student, confidence: scored[0].score }
      }

      return {
        type: 'ambiguous',
        suggestions: scored.slice(0, 3).map(s => s.student),
        confidence: scored[0].score,
      }
    }
  }

  return { type: 'not_found' }
}

/**
 * Clean attendance status keywords and phrases like "Marked absent", "Absent", etc.
 * Converts status boundaries into newlines so that concatenated or multi-line names
 * are neatly separated.
 */
export function cleanAttendanceStatusKeywords(text: string): string {
  return text
    // Replace sequences of status keywords/phrases (possibly repeated like "Marked absent Absent") with a newline
    .replace(/(?:[\(\[\-–—:]*\s*\b(?:marked\s+(?:as\s+)?absent|marked\s+(?:as\s+)?present|absentees?|absent|present)\b[\)\]]*\s*)+/gi, '\n')
    // Remove leftover empty parentheses or brackets
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    // Remove bullet points and leading numbering like "1. ", "2) ", "• ", "- "
    .replace(/^[\s*•\-–—\d\.\)\]]+/gm, '')
}

// ── Parse comma-separated name input ────────────────────────────
export function parseNameInput(raw: string): string[] {
  let cleaned = cleanAttendanceStatusKeywords(raw)
  // Strip leading affirmative prefix if user said e.g. "Yes, Mohit and Nikhil"
  cleaned = cleaned.replace(/^(yes|yeah|yup|yep|ok|okay)\b[,:\s]*/i, '')

  return cleaned
    .split(/[,;\n\r]+|\band\b/i)
    .map(n => n.trim().replace(/^[\s*•\-–—\d\.\(\)\[\],:]+|[\s*•\-–—\d\.\(\)\[\],:]+$/g, '').trim())
    .filter(n => {
      if (n.length < 2) return false
      const lower = n.toLowerCase()
      if (/^(marked\s+)?(absent|present)s?$/i.test(lower)) return false
      if (/^(status|attendance|roll\s*no|name|student)$/i.test(lower)) return false
      return true
    })
    // De-duplicate exact repeats (case-insensitive)
    .filter((name, idx, arr) =>
      arr.findIndex(n => n.toLowerCase() === name.toLowerCase()) === idx
    )
}

// ── "All present" / zero-absentee detection ─────────────────────
export function isAllPresent(text: string): boolean {
  const t = text.trim().toLowerCase()
  return (
    t === 'none' ||
    t === '0' ||
    t === 'all' ||
    /^all\s+present$/i.test(t) ||
    /^none\s*(absent)?$/i.test(t) ||
    /^no\s+(one|absent|absentees?)/i.test(t) ||
    /^everyone\s*(is\s*)?(here|present)/i.test(t) ||
    /^nobody\s*(is\s*)?(absent|missing)/i.test(t) ||
    t === 'all here' ||
    t === 'full attendance' ||
    t === 'no absentees'
  )
}

// ── Batch match all names against roster ────────────────────────
export interface BatchMatchResult {
  matched: { input: string; student: StudentRecord }[]
  ambiguous: { input: string; suggestions: StudentRecord[] }[]
  unmatched: string[]
}

export function batchMatchNames(
  names: string[],
  students: StudentRecord[]
): BatchMatchResult {
  const result: BatchMatchResult = {
    matched: [],
    ambiguous: [],
    unmatched: [],
  }

  for (const name of names) {
    // 1. Check if this single entry contains multiple students from the roster
    const multi = findStudentsInString(name, students)
    if (multi.matchedStudents.length > 1) {
      for (const st of multi.matchedStudents) {
        if (!result.matched.some(m => m.student.id === st.id)) {
          result.matched.push({ input: st.name, student: st })
        }
      }
      for (const unconsumed of multi.unconsumed) {
        const sub = matchStudent(unconsumed, students)
        const matchedSubStudent = sub.student
        if (sub.type === 'exact' && matchedSubStudent) {
          if (!result.matched.some(m => m.student.id === matchedSubStudent.id)) {
            result.matched.push({ input: unconsumed, student: matchedSubStudent })
          }
        } else if (sub.type === 'ambiguous' && sub.suggestions) {
          result.ambiguous.push({ input: unconsumed, suggestions: sub.suggestions })
        } else if (sub.type === 'not_found') {
          result.unmatched.push(unconsumed)
        }
      }
      continue
    }

    // 2. Standard matching
    const match = matchStudent(name, students)
    switch (match.type) {
      case 'exact':
        result.matched.push({ input: name, student: match.student! })
        break
      case 'multiple':
        if (match.students) {
          for (const st of match.students) {
            if (!result.matched.some(m => m.student.id === st.id)) {
              result.matched.push({ input: st.name, student: st })
            }
          }
        }
        break
      case 'ambiguous':
        result.ambiguous.push({ input: name, suggestions: match.suggestions! })
        break
      case 'not_found':
        result.unmatched.push(name)
        break
    }
  }

  return result
}
