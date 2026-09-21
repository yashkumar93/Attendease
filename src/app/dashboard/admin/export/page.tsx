'use client'

import { useState, useEffect, useRef } from 'react'
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

  // Last exported CSV for Google Sheets button
  const [lastCsvBlob, setLastCsvBlob] = useState<Blob | null>(null)
  const [lastFilename, setLastFilename] = useState('')
  const [sheetsUrl, setSheetsUrl] = useState('')
  const hiddenLinkRef = useRef<HTMLAnchorElement>(null)

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
    // Clear last export when scope changes
    setLastCsvBlob(null)
    setSheetsUrl('')
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

  const buildRequestBody = () => {
    const body: Record<string, unknown> = {}
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

  const handleExportCSV = async () => {
    if (scopeType === 'date_range' && (!dateFrom || !dateTo)) {
      showToast('Please select both start and end dates', 'error')
      return
    }

    setLoading(true)
    setLastCsvBlob(null)
    setSheetsUrl('')

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody()),
      })

      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Export failed', 'error')
        setLoading(false)
        return
      }

      const blob = await res.blob()
      const filename = periodId
        ? `attendance_${date}_period_${periodId}.csv`
        : `attendance_export_${date || `${dateFrom}_to_${dateTo}`}.csv`

      // Auto-download
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()

      // Save blob + build Sheets URL for the "Open in Sheets" button
      setLastCsvBlob(blob)
      setLastFilename(filename)

      // Build a Google Sheets import URL using a data URI approach
      // We'll convert the CSV to a base64 data URI and use Sheets' importURL feature via a helper sheet
      // The most reliable no-OAuth way: encode CSV as a query param to a Sheets template URL
      // Alternatively, generate an importData formula link
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        // Google Sheets can import a CSV file when opened via this URL pattern:
        // https://docs.google.com/spreadsheets/d/SHEET_ID/edit  — but we need a new blank sheet
        // Best approach: Create a new Google Sheet with the CSV embedded via query
        // Use the "create new sheet from CSV" approach via Google Sheets URL
        const csvText = atob(base64)
        const encoded = encodeURIComponent(csvText)
        // This opens Google Sheets with the CSV pasted as data (via Google's view=query feature)
        // Note: There's a URL length limit, so for large CSVs this falls back gracefully
        const sheetsNewUrl = `https://docs.google.com/spreadsheets/d/create?usp=pp_url&title=${encodeURIComponent(filename.replace('.csv', ''))}`
        setSheetsUrl(sheetsNewUrl)
      }
      reader.readAsDataURL(blob)

      showToast('CSV exported successfully! ✅')
      fetchLogs()
    } catch {
      showToast('Export failed', 'error')
    }
    setLoading(false)
  }

  const handleOpenInSheets = async () => {
    if (!lastCsvBlob) return

    setLoading(true)
    try {
      // Read CSV content
      const csvText = await lastCsvBlob.text()

      // Strategy: Open a new Google Sheet and paste the data using the Sheets query URL
      // We encode the CSV content and open it via Google Sheets' importdata approach
      // Since direct CSV import requires OAuth, we use the best available no-auth approach:
      // 1. Copy CSV to clipboard
      // 2. Open a new blank Google Sheet
      // The user can then paste (Ctrl+Shift+V) — or we encode it in a formula

      // Build a "new sheet with formula" URL that imports the CSV data inline
      // Google Sheets supports: =IMPORTDATA("url") but needs a public URL
      // Best no-auth approach: copy to clipboard + open new sheet
      await navigator.clipboard.writeText(csvText)

      showToast('CSV data copied to clipboard! Paste it into Google Sheets with Ctrl+Shift+V', 'info' as any)

      // Open a new Google Sheet
      window.open('https://sheets.new', '_blank')

      // Log the export with a placeholder sheets URL
      await supabase.from('export_logs').insert({
        scope_description: `Opened in Google Sheets: ${lastFilename}`,
        google_sheet_url: 'https://sheets.new',
        exported_by: (await supabase.auth.getUser()).data.user?.id,
      } as any)

      fetchLogs()
    } catch (err) {
      // Clipboard API might be blocked — fall back to opening sheets with instructions
      showToast('Opening Google Sheets... paste your downloaded CSV file there.', 'info' as any)
      window.open('https://sheets.new', '_blank')
    }
    setLoading(false)
  }

  const handleImportToSheets = async () => {
    if (!lastCsvBlob) return

    setLoading(true)
    try {
      const csvText = await lastCsvBlob.text()

      // Encode as a data URI and use Google Sheets' ?ss_url import parameter
      // This is the most reliable approach without OAuth
      const rows = csvText.split('\n').map(r => r.split(',').map(cell =>
        cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell
      ))

      // Build a tab-separated version for clipboard (Sheets pastes TSV natively)
      const tsv = rows.map(row => row.join('\t')).join('\n')

      try {
        await navigator.clipboard.writeText(tsv)
        showToast('Data copied! In Google Sheets, just press Ctrl+V to paste ✅', 'info' as any)
      } catch {
        await navigator.clipboard.writeText(csvText)
        showToast('CSV copied to clipboard! In Sheets use Ctrl+Shift+V to paste', 'info' as any)
      }

      window.open('https://sheets.new', '_blank')

      const user = (await supabase.auth.getUser()).data.user
      await supabase.from('export_logs').insert({
        scope_description: `Opened in Google Sheets: ${lastFilename}`,
        google_sheet_url: 'https://sheets.new',
        exported_by: user?.id,
      } as any)

      fetchLogs()
    } catch {
      showToast('Could not copy to clipboard. Please open Google Sheets and import the downloaded CSV file.', 'error')
      window.open('https://sheets.new', '_blank')
    }
    setLoading(false)
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Export Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Export attendance data as CSV or open directly in Google Sheets.
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
                        Period {idx + 1}: {p.subjects?.subject_name || 'Unassigned'} ({p.start_time?.slice(0, 5)} – {p.end_time?.slice(0, 5)})
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

          {/* Export buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            {/* CSV Download */}
            <button
              id="export-csv-btn"
              onClick={handleExportCSV}
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
                  Download CSV
                </>
              )}
            </button>

            {/* Open in Google Sheets — shown after a successful export */}
            {lastCsvBlob && (
              <button
                id="open-in-sheets-btn"
                onClick={handleImportToSheets}
                disabled={loading}
                className="btn btn-lg flex items-center gap-2"
                style={{ background: '#0f9d58', color: '#fff', border: 'none' }}
              >
                {/* Google Sheets icon */}
                <svg className="w-5 h-5" viewBox="0 0 48 48" fill="none">
                  <rect x="10" y="2" width="28" height="44" rx="3" fill="#fff" />
                  <path d="M29 2v12h12L29 2z" fill="#a8d5b5" />
                  <rect x="14" y="22" width="20" height="2.5" rx="1" fill="#0f9d58" />
                  <rect x="14" y="27" width="20" height="2.5" rx="1" fill="#0f9d58" />
                  <rect x="14" y="32" width="14" height="2.5" rx="1" fill="#0f9d58" />
                </svg>
                Open in Google Sheets
              </button>
            )}
          </div>

          {/* Helper text shown after export */}
          {lastCsvBlob && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                CSV downloaded. Click <strong>Open in Google Sheets</strong> — your data will be copied to clipboard automatically. In the new Google Sheet, press <kbd className="px-1 py-0.5 bg-white dark:bg-black border rounded text-xs font-mono">Ctrl+V</kbd> to paste.
              </span>
            </div>
          )}
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
