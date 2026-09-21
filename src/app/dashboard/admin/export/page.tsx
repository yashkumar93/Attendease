'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/ToastProvider'
import { EmptyState } from '@/components/ui/EmptyState'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'
import type { Class, ExportLog } from '@/lib/types/database'

export default function ExportPage() {
  const supabase = createClient()
  const { showToast } = useToast()

  const [classes, setClasses] = useState<Class[]>([])
  const [exportLogs, setExportLogs] = useState<ExportLog[]>([])
  const [loading, setLoading] = useState<'csv' | 'sheets' | null>(null)
  const [logsLoading, setLogsLoading] = useState(true)

  // Export scope
  const [scopeType, setScopeType] = useState<'single_date' | 'date_range'>('single_date')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [classId, setClassId] = useState<number | ''>('')
  const [periodId, setPeriodId] = useState<number | ''>('')
  const [availablePeriods, setAvailablePeriods] = useState<any[]>([])
  const [periodsLoading, setPeriodsLoading] = useState(false)

  useEffect(() => {
    supabase.from('classes').select('*').order('id').then(({ data }) => {
      if (data) setClasses(data)
    })
    fetchLogs()
  }, [supabase])

  useEffect(() => {
    if (scopeType === 'single_date' && date) {
      setPeriodsLoading(true)
      supabase
        .from('periods')
        .select('id, start_time, end_time, period_type, period_number, subjects(subject_name), profiles(full_name)')
        .eq('date', date)
        .order('period_number')
        .then(({ data }) => {
          setAvailablePeriods((data as any[]) || [])
          setPeriodsLoading(false)
        })
    } else {
      setPeriodId('')
      setAvailablePeriods([])
    }
  }, [date, scopeType, supabase])

  const fetchLogs = async () => {
    setLogsLoading(true)
    const { data } = await supabase
      .from('export_logs')
      .select('*')
      .order('exported_at', { ascending: false })
      .limit(20)
    if (data) setExportLogs(data)
    setLogsLoading(false)
  }

  const buildBody = (format: 'csv' | 'sheets') => {
    const body: Record<string, unknown> = { format }
    if (scopeType === 'single_date') {
      body.date = date
      if (periodId) body.periodId = periodId
    } else {
      body.dateFrom = dateFrom
      body.dateTo = dateTo
    }
    if (classId) body.classId = classId
    return body
  }

  const validate = () => {
    if (scopeType === 'date_range' && (!dateFrom || !dateTo)) {
      showToast('Please select both start and end dates', 'error')
      return false
    }
    return true
  }

  const handleCSV = async () => {
    if (!validate()) return
    setLoading('csv')
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody('csv')),
      })
      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Export failed', 'error')
        return
      }
      const blob = await res.blob()
      const filename = periodId
        ? `attendance-period-${periodId}-${date}.csv`
        : scopeType === 'single_date'
        ? `attendance-${date}.csv`
        : `attendance-${dateFrom}-to-${dateTo}.csv`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
      showToast('CSV downloaded successfully! 📁')
      fetchLogs()
    } catch {
      showToast('Export failed', 'error')
    } finally {
      setLoading(null)
    }
  }

  const handleSheets = async () => {
    if (!validate()) return
    setLoading('sheets')
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody('sheets')),
      })
      const json = await res.json()
      if (!res.ok) {
        showToast(json.error || 'Google Sheets export failed', 'error')
        return
      }
      window.open(json.url, '_blank')
      showToast('Google Sheet created and shared with you! 🎉')
      fetchLogs()
    } catch {
      showToast('Google Sheets export failed', 'error')
    } finally {
      setLoading(null)
    }
  }

  const isLoading = loading !== null

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Data Synchronization
            </span>
          </div>
          <h1 className="font-serif text-3xl font-normal text-ink tracking-tight">
            Export Attendance
          </h1>
          <p className="text-sm text-muted mt-1 font-sans">
            Download attendance archives as CSV or publish live to synchronized Google Sheets
          </p>
        </div>
      </div>

      {/* Export form */}
      <div className="card p-6 sm:p-8">
        <h2 className="font-serif text-xl font-normal text-ink mb-4">Export Scope</h2>

        <div className="space-y-6">
          {/* Scope type toggle */}
          <div className="flex gap-1.5 p-1 bg-surface-soft border border-hairline rounded-md w-fit">
            {(['single_date', 'date_range'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setScopeType(t)}
                className={`px-3.5 py-1.5 rounded-sm text-xs font-medium transition-all ${
                  scopeType === t
                    ? 'bg-canvas text-ink shadow-sm border border-hairline'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {t === 'single_date' ? 'Single Date' : 'Date Range'}
              </button>
            ))}
          </div>

          {/* Date inputs */}
          <div className="flex flex-col sm:flex-row gap-4 flex-wrap items-start">
            {scopeType === 'single_date' ? (
              <>
                <div>
                  <label className="label">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="input w-48"
                  />
                </div>
                <div>
                  <label className="label">Period (optional)</label>
                  <select
                    value={periodId}
                    onChange={(e) => setPeriodId(e.target.value ? parseInt(e.target.value) : '')}
                    disabled={periodsLoading}
                    className="input w-72"
                  >
                    <option value="">All Periods (Entire Day)</option>
                    {availablePeriods.map((p) => (
                      <option key={p.id} value={p.id}>
                        P{p.period_number}: {p.subjects?.subject_name || 'Unassigned'} ({p.start_time?.slice(0, 5)} – {p.end_time?.slice(0, 5)})
                      </option>
                    ))}
                  </select>
                  {availablePeriods.length === 0 && !periodsLoading && (
                    <p className="text-[11px] text-accent-amber mt-1">No periods scheduled on this date.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label">From</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input w-48" />
                </div>
                <div>
                  <label className="label">To</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input w-48" />
                </div>
              </>
            )}

            {classes.length > 1 && (
              <div>
                <label className="label">Class (optional)</label>
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value ? parseInt(e.target.value) : '')}
                  className="input w-48"
                >
                  <option value="">All Classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.class_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Export buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            {/* Primary Coral CTA for Google Sheets */}
            <button
              id="export-sheets-btn"
              onClick={handleSheets}
              disabled={isLoading}
              className="btn btn-primary btn-lg"
            >
              {loading === 'sheets' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Publishing Sheet…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export to Google Sheets
                </>
              )}
            </button>

            {/* Secondary CTA for CSV */}
            <button
              id="export-csv-btn"
              onClick={handleCSV}
              disabled={isLoading}
              className="btn btn-secondary btn-lg"
            >
              {loading === 'csv' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Downloading…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download CSV
                </>
              )}
            </button>
          </div>

          {/* Info callout */}
          <div className="rounded-lg border border-hairline bg-surface-soft p-4 text-xs text-muted leading-relaxed flex items-start gap-2.5">
            <AnthropicSpikeMark className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-ink">Google Sheets Export</strong> publishes an organized spreadsheet with styled columns, student rosters, and color-coded status highlights directly shared with your authenticated Google service account.
            </div>
          </div>
        </div>
      </div>

      {/* Export history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-hairline flex items-center justify-between bg-surface-soft">
          <h2 className="font-serif text-lg font-normal text-ink">Export History</h2>
          <span className="text-xs text-muted font-mono">{exportLogs.length} recent exports</span>
        </div>
        {logsLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card h-10 w-full animate-pulse bg-surface-soft/60" />
            ))}
          </div>
        ) : exportLogs.length === 0 ? (
          <EmptyState title="No exports yet" description="Your generated export history will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Format</th>
                  <th>Exported At</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {exportLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-sm text-ink">{log.scope_description}</td>
                    <td>
                      {log.google_sheet_url ? (
                        <span className="badge badge-pill text-[11px] bg-success-light text-success-foreground border border-success/30">
                          Google Sheets
                        </span>
                      ) : (
                        <span className="badge badge-pill text-[11px] bg-surface-card border-hairline">CSV</span>
                      )}
                    </td>
                    <td className="text-xs text-muted font-mono">
                      {new Date(log.exported_at).toLocaleString()}
                    </td>
                    <td>
                      {log.google_sheet_url ? (
                        <a
                          href={log.google_sheet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link text-xs font-medium"
                        >
                          Open Sheet ↗
                        </a>
                      ) : (
                        <span className="text-xs text-muted-soft">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
