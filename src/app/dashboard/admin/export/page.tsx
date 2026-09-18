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
  const [loading, setLoading] = useState(false)
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

  // Dynamically load periods when single date is selected
  useEffect(() => {
    if (scopeType === 'single_date' && date) {
      setPeriodsLoading(true)
      supabase
        .from('periods')
        .select('id, start_time, end_time, period_type, subjects(subject_name), profiles(full_name)')
        .eq('date', date)
        .order('start_time')
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

  const handleExport = async () => {
    setLoading(true)
    try {
      const body: Record<string, unknown> = {}

      if (scopeType === 'single_date') {
        body.date = date
        if (periodId) body.periodId = periodId
      } else {
        if (!dateFrom || !dateTo) {
          showToast('Please select both start and end dates', 'error')
          setLoading(false)
          return
        }
        body.dateFrom = dateFrom
        body.dateTo = dateTo
      }

      if (classId) body.classId = classId

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Export failed', 'error')
        setLoading(false)
        return
      }

      // Download the CSV
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = periodId
        ? `attendance_${date}_period_${periodId}.csv`
        : `attendance_export_${date || `${dateFrom}_to_${dateTo}`}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()

      showToast('Export downloaded successfully! 📁')
      fetchLogs()
    } catch {
      showToast('Export failed', 'error')
    }
    setLoading(false)
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Export Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Export attendance data as CSV for a single date, specific period, or date range.
        </p>
      </div>

      {/* Export form */}
      <div className="card p-6 mb-8">
        <h2 className="text-base font-semibold text-foreground mb-4">Export Scope</h2>

        <div className="space-y-4">
          {/* Scope type */}
          <div className="flex gap-3">
            <button
              onClick={() => setScopeType('single_date')}
              className={`btn ${scopeType === 'single_date' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Single Date
            </button>
            <button
              onClick={() => setScopeType('date_range')}
              className={`btn ${scopeType === 'date_range' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Date Range
            </button>
          </div>

          {/* Date & Period inputs */}
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
                  <label className="label">Select Period</label>
                  <select
                    value={periodId}
                    onChange={(e) => setPeriodId(e.target.value ? parseInt(e.target.value) : '')}
                    disabled={periodsLoading}
                    className="input w-64"
                  >
                    <option value="">All Periods (Entire Day)</option>
                    {availablePeriods.map((p, idx) => (
                      <option key={p.id} value={p.id}>
                        Period {idx + 1}: {p.subjects?.subject_name} ({p.start_time?.slice(0, 5)} – {p.end_time?.slice(0, 5)})
                      </option>
                    ))}
                  </select>
                  {availablePeriods.length === 0 && !periodsLoading && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                      No periods scheduled on this date.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="input w-48"
                  />
                </div>
                <div>
                  <label className="label">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="input w-48"
                  />
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

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={loading}
            className="btn btn-primary btn-lg"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Exporting...
              </span>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Export as CSV
              </>
            )}
          </button>
        </div>
      </div>

      {/* Export history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-semibold text-foreground">Export History</h2>
        </div>
        {logsLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}
          </div>
        ) : exportLogs.length === 0 ? (
          <EmptyState
            title="No exports yet"
            description="Your export history will appear here"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Exported At</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {exportLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-sm">{log.scope_description}</td>
                    <td className="text-sm text-muted-foreground">
                      {new Date(log.exported_at).toLocaleString()}
                    </td>
                    <td>
                      {log.google_sheet_url ? (
                        <a
                          href={log.google_sheet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-sm"
                        >
                          Open Sheet ↗
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">CSV download</span>
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
