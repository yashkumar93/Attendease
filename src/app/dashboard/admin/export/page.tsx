'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/ToastProvider'
import { EmptyState } from '@/components/ui/EmptyState'
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
  }, [])

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
  }, [date, scopeType])

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
        ? `attendance_${date}_period_${periodId}.csv`
        : `attendance_export_${date || `${dateFrom}_to_${dateTo}`}.csv`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
      showToast('CSV downloaded successfully ✅')
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
      // Open the sheet in a new tab
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
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Export Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Download as CSV or export directly to a formatted Google Sheet.
        </p>
      </div>

      {/* Export form */}
      <div className="card p-6 mb-8">
        <h2 className="text-base font-semibold text-foreground mb-4">Export Scope</h2>

        <div className="space-y-5">
          {/* Scope type toggle */}
          <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
            {(['single_date', 'date_range'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setScopeType(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  scopeType === t
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
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
                    <p className="text-[11px] text-amber-600 mt-1">No periods on this date.</p>
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
          <div className="flex flex-wrap gap-3 pt-1">
            {/* CSV */}
            <button
              id="export-csv-btn"
              onClick={handleCSV}
              disabled={isLoading}
              className="btn btn-secondary btn-lg flex items-center gap-2"
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
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download CSV
                </>
              )}
            </button>

            {/* Google Sheets */}
            <button
              id="export-sheets-btn"
              onClick={handleSheets}
              disabled={isLoading}
              className="btn btn-lg flex items-center gap-2 font-medium"
              style={{
                background: loading === 'sheets' ? '#0b7a45' : '#0f9d58',
                color: '#fff',
                border: 'none',
                opacity: isLoading && loading !== 'sheets' ? 0.5 : 1,
              }}
            >
              {loading === 'sheets' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating Sheet…
                </>
              ) : (
                <>
                  {/* Google Sheets logo */}
                  <svg className="w-5 h-5" viewBox="0 0 48 48">
                    <path fill="#fff" d="M29 2H13a3 3 0 0 0-3 3v38a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3V16L29 2z"/>
                    <path fill="#a8d5b5" d="M29 2v14h14z"/>
                    <rect fill="#0f9d58" x="14" y="22" width="20" height="2.5" rx="1"/>
                    <rect fill="#0f9d58" x="14" y="27.5" width="20" height="2.5" rx="1"/>
                    <rect fill="#0f9d58" x="14" y="33" width="14" height="2.5" rx="1"/>
                  </svg>
                  Export to Google Sheets
                </>
              )}
            </button>
          </div>

          {/* Info banner */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              <strong>Google Sheets</strong> creates a formatted sheet with coloured headers, alternating rows, and green/red Present/Absent highlights — shared directly to your Google account. The link is saved in history below.
            </span>
          </div>
        </div>
      </div>

      {/* Export history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Export History</h2>
          <span className="text-xs text-muted-foreground">{exportLogs.length} recent exports</span>
        </div>
        {logsLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}
          </div>
        ) : exportLogs.length === 0 ? (
          <EmptyState title="No exports yet" description="Your export history will appear here" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Type</th>
                  <th>Exported At</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {exportLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-sm">{log.scope_description}</td>
                    <td>
                      {log.google_sheet_url ? (
                        <span className="badge" style={{ background: '#e6f4ea', color: '#0f9d58', border: '1px solid #a8d5b5' }}>
                          Google Sheets
                        </span>
                      ) : (
                        <span className="badge bg-muted text-muted-foreground">CSV</span>
                      )}
                    </td>
                    <td className="text-sm text-muted-foreground">
                      {new Date(log.exported_at).toLocaleString()}
                    </td>
                    <td>
                      {log.google_sheet_url ? (
                        <a
                          href={log.google_sheet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          Open Sheet ↗
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
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
