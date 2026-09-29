/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getAnalyticsData,
  askAnalyticsAIAction,
  type AnalyticsSummary,
  type AIQueryResult,
} from '@/app/actions/analytics'

export default function AnalyticsPage() {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()

  // Filters
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d' | 'all'>('30d')
  const [classId, setClassId] = useState<number | ''>('')
  const [classList, setClassList] = useState<{ id: number; class_name: string }[]>([])

  // Data
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  // AI Query state
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiResult, setAiResult] = useState<AIQueryResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  // Load classes on mount
  useEffect(() => {
    supabase
      .from('classes')
      .select('id, class_name')
      .order('id')
      .then(({ data: cls }) => {
        if (cls) setClassList(cls)
      })
  }, [supabase])

  // Fetch analytics data when filters change
  useEffect(() => {
    let isCancelled = false
    setLoading(true)

    startTransition(async () => {
      try {
        const res = await getAnalyticsData(timeRange, classId ? Number(classId) : null)
        if (!isCancelled) {
          setData(res)
          setLoading(false)
        }
      } catch (err) {
        console.error('Failed to load analytics:', err)
        if (!isCancelled) setLoading(false)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [timeRange, classId])

  const handleAskAI = async (queryText?: string) => {
    const textToAsk = queryText || aiQuestion
    if (!textToAsk.trim()) return

    setAiLoading(true)
    setAiResult(null)
    if (queryText) setAiQuestion(queryText)

    try {
      const res = await askAnalyticsAIAction(textToAsk)
      setAiResult(res)
    } catch (err) {
      console.error('AI Query failed:', err)
      setAiResult({
        answer: 'Sorry, could not process that question right now. Please try again.',
        queryType: 'error',
      })
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="animate-fade-in space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Real-time Academic Intelligence
            </p>
          </div>
          <h1 className="text-[28px] font-bold text-ink tracking-tight leading-tight">
            Attendance Analytics
          </h1>
          <p className="text-muted text-sm mt-1">
            Comprehensive attendance statistics, daily trends, subject performance, and at-risk student monitoring.
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time range pills */}
          <div className="bg-surface-elevated border border-hairline rounded-lg p-1 flex items-center shadow-xs">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: 'all', label: 'All Time' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTimeRange(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  timeRange === t.id
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-ink hover:bg-surface'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Class Filter */}
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : '')}
            className="input-select text-xs py-2 px-3 rounded-lg border-hairline bg-surface-elevated text-ink font-medium shadow-xs"
          >
            <option value="">All Classes</option>
            {classList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.class_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* AI Analytics Search Bar */}
      <div className="card p-5 border border-primary/20 bg-gradient-to-r from-primary/5 via-surface to-surface shadow-xs">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-primary">
          <svg className="w-4 h-4 text-primary animate-spin-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
          AI Attendance Insights
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAskAI()}
            placeholder="Ask anything (e.g. 'Who are the most absent students?', 'Show today's summary', 'How is CSE-A doing?')"
            className="input-text flex-1 text-sm bg-surface-elevated placeholder:text-muted/70"
          />
          <button
            onClick={() => handleAskAI()}
            disabled={aiLoading || !aiQuestion.trim()}
            className="btn btn-primary text-xs px-4 py-2 flex items-center gap-1.5 flex-shrink-0"
          >
            {aiLoading ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze'
            )}
          </button>
        </div>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-muted">
          <span className="font-medium">Try asking:</span>
          {[
            'Who are the most absent students?',
            "Show today's attendance summary",
            'Which students have lowest attendance?',
          ].map((chip) => (
            <button
              key={chip}
              onClick={() => handleAskAI(chip)}
              className="px-2.5 py-1 rounded-full bg-surface-elevated hover:bg-surface border border-hairline text-muted hover:text-ink transition-colors cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* AI Answer Box */}
        {aiResult && (
          <div className="mt-4 p-4 rounded-lg bg-surface border border-hairline animate-fade-in space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Analysis Result
              </div>
              <button
                onClick={() => setAiResult(null)}
                className="text-xs text-muted hover:text-ink"
              >
                Dismiss
              </button>
            </div>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-line">
              {aiResult.answer.replace(/\*\*(.*?)\*\*/g, '$1')}
            </p>

            {aiResult.rows && aiResult.rows.length > 0 && aiResult.columns && (
              <div className="overflow-x-auto rounded border border-hairline mt-2">
                <table className="w-full text-xs text-start">
                  <thead className="bg-surface-elevated text-muted border-b border-hairline">
                    <tr>
                      {aiResult.columns.map((c) => (
                        <th key={c} className="p-2.5 font-semibold text-start">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {aiResult.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-surface-elevated/40">
                        {aiResult.columns!.map((c) => (
                          <td key={c} className="p-2.5 text-ink font-medium">
                            {row[c] ?? '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Attendance Rate */}
        <div className="card p-5 border-s-4 border-s-primary flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">
              Attendance Rate
            </span>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                (data?.attendanceRate || 0) >= 75
                  ? 'bg-emerald-500/15 text-emerald-600'
                  : 'bg-amber-500/15 text-amber-600'
              }`}
            >
              {(data?.attendanceRate || 0) >= 75 ? 'Target Met (≥75%)' : 'Needs Attention'}
            </span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold text-ink tracking-tight">
              {loading ? '—' : `${data?.attendanceRate || 0}%`}
            </div>
            <p className="text-xs text-muted mt-1">Average across all marked sessions</p>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-surface-elevated rounded-full h-2 overflow-hidden border border-hairline">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                (data?.attendanceRate || 0) >= 75 ? 'bg-primary' : 'bg-accent-amber'
              }`}
              style={{ width: `${Math.min(data?.attendanceRate || 0, 100)}%` }}
            />
          </div>
        </div>

        {/* Total Records */}
        <div className="card p-5 border-s-4 border-s-emerald-500 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">
              Total Student Records
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-muted">
              {data?.totalPeriods || 0} Periods
            </span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold text-ink tracking-tight">
              {loading ? '—' : data?.totalRecords.toLocaleString() || '0'}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs">
              <span className="text-emerald-600 font-medium">
                ✓ {data?.totalPresent || 0} Present
              </span>
              <span className="text-rose-600 font-medium">
                ✕ {data?.totalAbsent || 0} Absent
              </span>
            </div>
          </div>
          <p className="text-[11px] text-muted">Period attendances registered</p>
        </div>

        {/* Active Students Enrolled */}
        <div className="card p-5 border-s-4 border-s-accent-teal flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">
              Enrolled Students
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-muted">
              Active
            </span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold text-ink tracking-tight">
              {loading ? '—' : data?.totalActiveStudents || '0'}
            </div>
            <p className="text-xs text-muted mt-1">Students enrolled in scope</p>
          </div>
          <p className="text-[11px] text-muted">Across all eligible class sections</p>
        </div>

        {/* At-Risk Count */}
        <div className="card p-5 border-s-4 border-s-rose-500 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">
              At-Risk Students
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600">
              {'< 75% Attendance'}
            </span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold text-rose-600 tracking-tight">
              {loading ? '—' : data?.atRiskCount || 0}
            </div>
            <p className="text-xs text-muted mt-1">Short of minimum attendance quota</p>
          </div>
          <p className="text-[11px] text-muted">Requires academic counselor alert</p>
        </div>
      </div>

      {/* Charts Section: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Trend Chart (2 cols) */}
        <div className="lg:col-span-2 card p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-hairline">
            <div>
              <h2 className="text-base font-semibold text-ink">Daily Attendance Trend</h2>
              <p className="text-xs text-muted">Attendance percentage day by day</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-primary" /> Present
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-rose-400" /> Absent
              </span>
            </div>
          </div>

          {loading ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted">
              Loading trends...
            </div>
          ) : !data?.dailyTrend || data.dailyTrend.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted">
              No attendance data recorded for this time frame.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="h-44 flex items-end gap-2 pt-6">
                {data.dailyTrend.map((day) => (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative"
                  >
                    {/* Tooltip */}
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-canvas border border-hairline text-ink text-[11px] px-2 py-1 rounded shadow-md pointer-events-none z-10 whitespace-nowrap">
                      {day.date}: {day.rate}% ({day.present}P / {day.absent}A)
                    </div>

                    {/* Bar container */}
                    <div className="w-full max-w-[32px] bg-surface-elevated rounded-t flex flex-col-reverse overflow-hidden h-full">
                      <div
                        className="w-full bg-primary transition-all duration-300"
                        style={{ height: `${day.rate}%` }}
                      />
                      <div
                        className="w-full bg-rose-400/80 transition-all duration-300"
                        style={{ height: `${100 - day.rate}%` }}
                      />
                    </div>
                    {/* Date label */}
                    <span className="text-[10px] text-muted truncate max-w-full font-medium">
                      {day.displayDate}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Class Breakdown (1 col) */}
        <div className="card p-6 flex flex-col justify-between space-y-4">
          <div className="pb-2 border-b border-hairline">
            <h2 className="text-base font-semibold text-ink">Class Comparison</h2>
            <p className="text-xs text-muted">Attendance rate by class section</p>
          </div>

          {loading ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted">
              Loading classes...
            </div>
          ) : !data?.classBreakdown || data.classBreakdown.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted">
              No classes recorded.
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-56 pr-1">
              {data.classBreakdown.map((c) => (
                <div key={c.className} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-ink truncate">{c.className}</span>
                    <span
                      className={`font-semibold ${
                        c.rate >= 75 ? 'text-primary' : 'text-rose-500'
                      }`}
                    >
                      {c.rate}%
                    </span>
                  </div>
                  <div className="w-full bg-surface-elevated rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        c.rate >= 75 ? 'bg-primary' : 'bg-rose-500'
                      }`}
                      style={{ width: `${c.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Subject Performance & At-Risk Students */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subject Performance Matrix (1 col) */}
        <div className="card p-6 space-y-4">
          <div className="pb-2 border-b border-hairline">
            <h2 className="text-base font-semibold text-ink">Subject Breakdown</h2>
            <p className="text-xs text-muted">Attendance across subjects</p>
          </div>

          {loading ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted">
              Loading subjects...
            </div>
          ) : !data?.subjectBreakdown || data.subjectBreakdown.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted">
              No subject data.
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-64 pr-1">
              {data.subjectBreakdown.map((s) => (
                <div
                  key={s.subjectName}
                  className="p-2.5 rounded-lg bg-surface-elevated/60 border border-hairline flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold text-ink truncate">{s.subjectName}</p>
                    <p className="text-[11px] text-muted">
                      {s.present} Present · {s.absent} Absent
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      s.rate >= 75
                        ? 'bg-primary/10 text-primary'
                        : 'bg-rose-500/10 text-rose-600'
                    }`}
                  >
                    {s.rate}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* At-Risk Students Watchlist (2 cols) */}
        <div className="lg:col-span-2 card p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-hairline">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-ink">
                  At-Risk Students Watchlist
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600">
                  {'Below 75% Threshold'}
                </span>
              </div>
              <p className="text-xs text-muted">
                Students requiring intervention or attendance warning notices
              </p>
            </div>
          </div>

          {loading ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted">
              Checking records...
            </div>
          ) : !data?.atRiskStudents || data.atRiskStudents.length === 0 ? (
            <div className="p-8 text-center bg-surface-elevated/40 rounded-lg border border-hairline">
              <span className="text-2xl">🎉</span>
              <p className="text-sm font-semibold text-ink mt-2">
                All students meet the 75% attendance threshold!
              </p>
              <p className="text-xs text-muted mt-1">
                No students currently flagged for chronic absenteeism in this period.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full text-xs text-start">
                <thead className="bg-surface-elevated text-muted border-b border-hairline">
                  <tr>
                    <th className="p-3 font-semibold text-start">Student Name</th>
                    <th className="p-3 font-semibold text-start">Roll No.</th>
                    <th className="p-3 font-semibold text-start">Class</th>
                    <th className="p-3 font-semibold text-center">Sessions</th>
                    <th className="p-3 font-semibold text-center">Absences</th>
                    <th className="p-3 font-semibold text-end">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {data.atRiskStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-elevated/40">
                      <td className="p-3 font-semibold text-ink">{s.name}</td>
                      <td className="p-3 text-muted">{s.rollNumber}</td>
                      <td className="p-3 text-muted">{s.className}</td>
                      <td className="p-3 text-center text-muted">{s.total}</td>
                      <td className="p-3 text-center font-semibold text-rose-600">
                        {s.absent}
                      </td>
                      <td className="p-3 text-end">
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                            s.rate < 60
                              ? 'bg-rose-500/15 text-rose-600'
                              : 'bg-amber-500/15 text-amber-600'
                          }`}
                        >
                          {s.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
