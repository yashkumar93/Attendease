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
  type: 'exact' | 'ambiguous' | 'not_found'
  student?: StudentRecord
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
 */
export function cleanAttendanceStatusKeywords(text: string): string {
  return text
    // Remove phrases like "- Marked absent", "(Marked absent)", "(Absent)", ": Absent", "Marked as absent"
    .replace(/[\(\[\-–—:]*\s*\b(marked\s+(as\s+)?absent|marked\s+(as\s+)?present|absentees?|absent|present)\b[\)\]]*/gi, ' ')
    // Remove leftover empty parentheses or brackets
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    // Remove bullet points and leading numbering like "1. ", "2) ", "• ", "- "
    .replace(/^[\s*•\-–—\d\.\)\]]+/gm, '')
}

// ── Parse comma-separated name input ────────────────────────────
export function parseNameInput(raw: string): string[] {
  const cleaned = cleanAttendanceStatusKeywords(raw)

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
    const match = matchStudent(name, students)
    switch (match.type) {
      case 'exact':
        result.matched.push({ input: name, student: match.student! })
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
