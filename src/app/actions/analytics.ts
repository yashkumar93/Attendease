/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

function getGeminiClient(): GoogleGenerativeAI | null {
  if (!GEMINI_API_KEY) return null
  return new GoogleGenerativeAI(GEMINI_API_KEY)
}

function getGroqClient(): Groq | null {
  if (!GROQ_API_KEY) return null
  return new Groq({ apiKey: GROQ_API_KEY })
}

function getTodayIST(): string {
  const now = new Date()
  const istOffset = 5.5 * 60 * 60000
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60000)
  return ist.toISOString().split('T')[0]
}

export interface AnalyticsSummary {
  totalRecords: number
  totalPresent: number
  totalAbsent: number
  attendanceRate: number
  totalPeriods: number
  totalActiveStudents: number
  atRiskCount: number
  dailyTrend: {
    date: string
    displayDate: string
    total: number
    present: number
    absent: number
    rate: number
  }[]
  subjectBreakdown: {
    subjectName: string
    total: number
    present: number
    absent: number
    rate: number
  }[]
  classBreakdown: {
    className: string
    total: number
    present: number
    absent: number
    rate: number
  }[]
  atRiskStudents: {
    id: number
    name: string
    rollNumber: string
    className: string
    total: number
    present: number
    absent: number
    rate: number
  }[]
}

export async function getAnalyticsData(
  timeRange: 'today' | '7d' | '30d' | 'all' = '30d',
  classId?: number | null
): Promise<AnalyticsSummary> {
  const supabase = await createClient()
  const today = getTodayIST()

  let startDate: string | null = null
  if (timeRange === 'today') {
    startDate = today
  } else if (timeRange === '7d') {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    startDate = d.toISOString().split('T')[0]
  } else if (timeRange === '30d') {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    startDate = d.toISOString().split('T')[0]
  }

  // 1. Fetch Periods in range
  let periodsQuery = supabase
    .from('periods')
    .select(`
      id, date, period_number,
      classes(id, class_name),
      subjects(id, subject_name)
    `)
    .order('date', { ascending: true })

  if (startDate) {
    periodsQuery = periodsQuery.gte('date', startDate).lte('date', today)
  }
  if (classId) {
    periodsQuery = periodsQuery.eq('class_id', classId)
  }

  const { data: periods, error: periodsError } = await periodsQuery

  if (periodsError || !periods || periods.length === 0) {
    return {
      totalRecords: 0,
      totalPresent: 0,
      totalAbsent: 0,
      attendanceRate: 0,
      totalPeriods: 0,
      totalActiveStudents: 0,
      atRiskCount: 0,
      dailyTrend: [],
      subjectBreakdown: [],
      classBreakdown: [],
      atRiskStudents: [],
    }
  }

  const periodIds = periods.map((p) => p.id)
  const periodMap = new Map<number, any>()
  periods.forEach((p) => periodMap.set(p.id, p))

  // 2. Fetch Attendance Records for these periods
  // Fetch in batches if necessary
  const { data: attendanceRecords } = await supabase
    .from('attendance')
    .select(`
      id, period_id, student_id, status,
      students(id, name, roll_number, class_id, classes(class_name))
    `)
    .in('period_id', periodIds)

  // 3. Count total active students
  let studentsQuery = supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  if (classId) {
    studentsQuery = studentsQuery.eq('class_id', classId)
  }
  const { count: totalActiveStudents } = await studentsQuery

  const records = attendanceRecords || []
  const totalRecords = records.length
  let totalPresent = 0
  let totalAbsent = 0

  const dailyMap = new Map<string, { present: number; absent: number }>()
  const subjectMap = new Map<string, { present: number; absent: number }>()
  const classMap = new Map<string, { present: number; absent: number }>()
  const studentMap = new Map<
    number,
    { name: string; rollNumber: string; className: string; present: number; absent: number }
  >()

  for (const r of records) {
    const isPresent = r.status === 'Present'
    if (isPresent) totalPresent++
    else totalAbsent++

    const period = periodMap.get(r.period_id)
    const dateStr = period?.date || 'Unknown'
    const subjectName = (period?.subjects as any)?.subject_name || 'General'
    const className = (period?.classes as any)?.class_name || 'General'

    // Daily
    if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, { present: 0, absent: 0 })
    const dStat = dailyMap.get(dateStr)!
    if (isPresent) dStat.present++
    else dStat.absent++

    // Subject
    if (!subjectMap.has(subjectName)) subjectMap.set(subjectName, { present: 0, absent: 0 })
    const subStat = subjectMap.get(subjectName)!
    if (isPresent) subStat.present++
    else subStat.absent++

    // Class
    if (!classMap.has(className)) classMap.set(className, { present: 0, absent: 0 })
    const cStat = classMap.get(className)!
    if (isPresent) cStat.present++
    else cStat.absent++

    // Student
    const student = r.students as any
    if (student) {
      if (!studentMap.has(student.id)) {
        studentMap.set(student.id, {
          name: student.name,
          rollNumber: student.roll_number,
          className: student.classes?.class_name || className,
          present: 0,
          absent: 0,
        })
      }
      const sStat = studentMap.get(student.id)!
      if (isPresent) sStat.present++
      else sStat.absent++
    }
  }

  const attendanceRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 1000) / 10 : 0

  // Format Daily Trend (sorted chronologically)
  const dailyTrend = Array.from(dailyMap.entries())
    .map(([date, counts]) => {
      const tot = counts.present + counts.absent
      const [y, m, d] = date.split('-')
      return {
        date,
        displayDate: `${d}/${m}`,
        total: tot,
        present: counts.present,
        absent: counts.absent,
        rate: tot > 0 ? Math.round((counts.present / tot) * 100) : 0,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  // Format Subject Breakdown (sorted by total descending)
  const subjectBreakdown = Array.from(subjectMap.entries())
    .map(([subjectName, counts]) => {
      const tot = counts.present + counts.absent
      return {
        subjectName,
        total: tot,
        present: counts.present,
        absent: counts.absent,
        rate: tot > 0 ? Math.round((counts.present / tot) * 100) : 0,
      }
    })
    .sort((a, b) => b.total - a.total)

  // Format Class Breakdown
  const classBreakdown = Array.from(classMap.entries())
    .map(([className, counts]) => {
      const tot = counts.present + counts.absent
      return {
        className,
        total: tot,
        present: counts.present,
        absent: counts.absent,
        rate: tot > 0 ? Math.round((counts.present / tot) * 100) : 0,
      }
    })
    .sort((a, b) => b.rate - a.rate)

  // Identify At-Risk Students (< 75% attendance)
  const studentList = Array.from(studentMap.entries()).map(([id, info]) => {
    const tot = info.present + info.absent
    const rate = tot > 0 ? Math.round((info.present / tot) * 1000) / 10 : 100
    return {
      id,
      name: info.name,
      rollNumber: info.rollNumber,
      className: info.className,
      total: tot,
      present: info.present,
      absent: info.absent,
      rate,
    }
  })

  // Students with attendance < 75%, sorted by lowest rate first
  const atRiskStudents = studentList
    .filter((s) => s.rate < 75 && s.total >= 2)
    .sort((a, b) => a.rate - b.rate)

  return {
    totalRecords,
    totalPresent,
    totalAbsent,
    attendanceRate,
    totalPeriods: periods.length,
    totalActiveStudents: totalActiveStudents || 0,
    atRiskCount: atRiskStudents.length,
    dailyTrend,
    subjectBreakdown,
    classBreakdown,
    atRiskStudents,
  }
}

// ── Ask AI Analytics Query ──────────────────────────────────────────
export interface AIQueryResult {
  answer: string
  queryType: string
  rows?: Record<string, any>[]
  columns?: string[]
}

export async function askAnalyticsAIAction(question: string): Promise<AIQueryResult> {
  const adminClient = createAdminClient()
  const today = getTodayIST()
  const trimmed = question.trim()

  if (!trimmed) {
    return {
      answer: 'Please enter an attendance question to analyze.',
      queryType: 'empty',
    }
  }

  const prompt = `
You are an analytics assistant for an attendance management system. Analyze the user's question and categorize it.
Today's date: ${today}
Question: "${trimmed}"

Respond strictly with a JSON object:
{
  "queryType": "student_lookup" | "daily_summary" | "most_absent" | "class_summary" | "general",
  "studentName": string or null,
  "className": string or null,
  "date": "YYYY-MM-DD" or null
}
`

  let parsed: any = null
  const gemini = getGeminiClient()
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: GEMINI_MODEL })
      const res = await model.generateContent(prompt)
      const text = res.response.text().replace(/```json/g, '').replace(/```/g, '').trim()
      parsed = JSON.parse(text)
    } catch {
      // fallback
    }
  }

  if (!parsed) {
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
        parsed = JSON.parse(text)
      } catch {
        // fallback
      }
    }
  }

  if (!parsed) {
    // Keyword fallback
    const qLower = trimmed.toLowerCase()
    if (qLower.includes('most absent') || qLower.includes('chronic') || qLower.includes('lowest')) {
      parsed = { queryType: 'most_absent' }
    } else if (qLower.includes('today')) {
      parsed = { queryType: 'daily_summary', date: today }
    } else {
      parsed = { queryType: 'general' }
    }
  }

  // Execute database lookup based on intent
  if (parsed.queryType === 'most_absent') {
    const { data: absences } = await adminClient
      .from('attendance')
      .select('student_id, students(name, roll_number, classes(class_name))')
      .eq('status', 'Absent')

    const counts = new Map<number, { name: string; roll: string; cls: string; count: number }>()
    for (const a of absences || []) {
      const s = a.students as any
      if (s) {
        if (!counts.has(a.student_id)) {
          counts.set(a.student_id, {
            name: s.name,
            roll: s.roll_number,
            cls: s.classes?.class_name || 'N/A',
            count: 0,
          })
        }
        counts.get(a.student_id)!.count++
      }
    }

    const topAbsent = Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    if (topAbsent.length === 0) {
      return {
        answer: 'Great news! There are currently no recorded absences in the system.',
        queryType: 'most_absent',
      }
    }

    return {
      answer: `Found **${topAbsent.length} students** with the highest recorded absences:`,
      queryType: 'most_absent',
      columns: ['Student Name', 'Roll Number', 'Class', 'Absences'],
      rows: topAbsent.map((s) => ({
        'Student Name': s.name,
        'Roll Number': s.roll,
        Class: s.cls,
        Absences: s.count,
      })),
    }
  }

  if (parsed.queryType === 'student_lookup' && parsed.studentName) {
    const { data: students } = await adminClient
      .from('students')
      .select('id, name, roll_number, classes(class_name)')
      .ilike('name', `%${parsed.studentName}%`)
      .limit(1)

    if (!students || students.length === 0) {
      return {
        answer: `Could not find any student matching "${parsed.studentName}". Please verify the spelling.`,
        queryType: 'student_lookup',
      }
    }

    const student = students[0]
    const { data: records } = await adminClient
      .from('attendance')
      .select('status, marked_at, periods(date, period_number, subjects(subject_name))')
      .eq('student_id', student.id)
      .order('marked_at', { ascending: false })
      .limit(20)

    const list = records || []
    const total = list.length
    const present = list.filter((r: any) => r.status === 'Present').length
    const rate = total > 0 ? Math.round((present / total) * 100) : 100

    return {
      answer: `**${student.name}** (${student.roll_number}) has an overall attendance rate of **${rate}%** across **${total}** tracked sessions.`,
      queryType: 'student_lookup',
      columns: ['Date', 'Period', 'Subject', 'Status'],
      rows: list.slice(0, 8).map((r: any) => ({
        Date: r.periods?.date || '-',
        Period: `P${r.periods?.period_number || '-'}`,
        Subject: r.periods?.subjects?.subject_name || 'General',
        Status: r.status,
      })),
    }
  }

  // Default: Today's summary
  const targetDate = parsed.date || today
  const { data: todayPeriods } = await adminClient
    .from('periods')
    .select('id, period_number, subjects(subject_name), classes(class_name)')
    .eq('date', targetDate)

  if (!todayPeriods || todayPeriods.length === 0) {
    return {
      answer: `No academic periods are scheduled or recorded for ${targetDate}.`,
      queryType: 'daily_summary',
    }
  }

  const pIds = todayPeriods.map((p) => p.id)
  const { data: att } = await adminClient
    .from('attendance')
    .select('status')
    .in('period_id', pIds)

  const tot = att?.length || 0
  const pres = att?.filter((a: any) => a.status === 'Present').length || 0
  const rate = tot > 0 ? Math.round((pres / tot) * 100) : 0

  return {
    answer: `On **${targetDate}**, **${todayPeriods.length} periods** were conducted with **${tot} attendance records**. Overall attendance rate was **${rate}%** (${pres} present, ${tot - pres} absent).`,
    queryType: 'daily_summary',
    columns: ['Period', 'Class', 'Subject'],
    rows: todayPeriods.map((p: any) => ({
      Period: `Period ${p.period_number}`,
      Class: p.classes?.class_name || '-',
      Subject: p.subjects?.subject_name || '-',
    })),
  }
}
