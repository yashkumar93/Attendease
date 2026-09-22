/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getAuditTrail } from '@/app/actions/attendance'
import { useToast } from '@/components/ui/ToastProvider'
import type { Class } from '@/lib/types/database'

interface AuditItem {
  id: number
  attendance_id: number
  period_id: number
  student_id: number
  previous_status: string | null
  new_status: string
  changed_by: string
  changed_at: string
  remark: string | null
  student?: {
    id: number
    name: string
    roll_number: string
    class_id: number
    class_name?: string
  }
  period?: {
    id: number
    date: string
    period_number?: number | null
    start_time: string
    end_time: string
    class_id: number
    class_name?: string
    subject_name?: string
  }
  changedByProfile?: {
    full_name: string
    role: string
  }
}

export default function AuditTrailPage() {
  const supabase = createClient()
  const { showToast } = useToast()

  const [logs, setLogs] = useState<AuditItem[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClass, setSelectedClass] = useState<number | ''>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [filterMode, setFilterMode] = useState<'all' | 'remarks' | 'status_changes'>('all')

  const fetchAuditData = useCallback(async (showNotice = false) => {
    try {
      if (showNotice) setRefreshing(true)
      const data = await getAuditTrail({
        limit: 200,
        classId: selectedClass ? Number(selectedClass) : undefined,
        date: selectedDate || undefined,
        hasRemarkOnly: filterMode === 'remarks',
        search: searchQuery || undefined,
      })
      setLogs(data as AuditItem[])
      if (showNotice) {
        showToast('Audit trail refreshed', 'info')
      }
    } catch {
      showToast('Unable to load audit logs', 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedClass, selectedDate, filterMode, searchQuery, showToast])

  // Initial load classes and audit data
  useEffect(() => {
    supabase.from('classes').select('*').order('id').then(({ data }) => {
      if (data) setClasses(data)
    })
  }, [supabase])

  useEffect(() => {
    fetchAuditData()
  }, [fetchAuditData])

  // Real-time synchronization
  useEffect(() => {
    const channel = supabase
      .channel('global-audit-trail')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_history' },
        () => {
          fetchAuditData()
        }
      )
      .on(
        'broadcast',
        { event: 'audit-sync' },
        (msg: any) => {
          fetchAuditData()
          if (msg?.payload?.actorName) {
            showToast(`New audit entry from ${msg.payload.actorName}`, 'info')
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchAuditData, showToast])

  // Client-side filtering for status changes
  const displayLogs = logs.filter((log) => {
    if (filterMode === 'status_changes') {
      return log.previous_status && log.previous_status !== log.new_status
    }
    return true
  })

  // Metrics calculation
  const totalRemarks = logs.filter((l) => Boolean(l.remark && l.remark.trim())).length
  const totalStatusChanges = logs.filter((l) => l.previous_status && l.previous_status !== l.new_status).length
  const uniqueContributors = new Set(logs.map((l) => l.changed_by)).size

  const formatRelativeTime = (isoString: string) => {
    const now = new Date().getTime()
    const past = new Date(isoString).getTime()
    const diffSecs = Math.floor((now - past) / 1000)

    if (diffSecs < 60) return 'Just now'
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`
    if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Governance & Verification
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-grove-pale text-grove border border-grove/20">
              <span className="w-1.5 h-1.5 rounded-full bg-grove animate-pulse" />
              Live Sync Active
            </span>
          </div>
          <h1 className="text-[28px] font-semibold text-ink tracking-tight leading-tight">
            Audit Trail
          </h1>
          <p className="text-muted text-sm mt-1">
            Real-time record of remarks, status updates, and attendance logs across all classes and faculty
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => fetchAuditData(true)}
            disabled={refreshing}
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            title="Refresh logs from database"
          >
            <svg
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-muted">Total Events</p>
          <p className="font-mono text-2xl font-semibold text-ink mt-1">{logs.length}</p>
          <p className="text-[11px] text-muted mt-0.5">Recorded historical actions</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-muted">Remarks Logged</p>
          <p className="font-mono text-2xl font-semibold text-grove mt-1">{totalRemarks}</p>
          <p className="text-[11px] text-muted mt-0.5">With remarks from faculty</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-muted">Status Overrides</p>
          <p className="font-mono text-2xl font-semibold text-danger mt-1">{totalStatusChanges}</p>
          <p className="text-[11px] text-muted mt-0.5">Attendance flips recorded</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-muted">Active Contributors</p>
          <p className="font-mono text-2xl font-semibold text-ink mt-1">{uniqueContributors}</p>
          <p className="text-[11px] text-muted mt-0.5">Admins & instructors</p>
        </div>
      </div>

      {/* Search and Filters Card */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Filter Mode Pills */}
          <div className="inline-flex p-1 bg-surface-soft border border-hairline rounded-lg self-start sm:self-auto flex-wrap">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-canvas text-ink shadow-xs font-semibold'
                  : 'text-muted hover:text-ink'
              }`}
            >
              All Events ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('remarks')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                filterMode === 'remarks'
                  ? 'bg-canvas text-ink shadow-xs font-semibold'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <span>💬</span>
              <span>Only Remarks ({totalRemarks})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('status_changes')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                filterMode === 'status_changes'
                  ? 'bg-canvas text-ink shadow-xs font-semibold'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <span>⇄</span>
              <span>Status Changes ({totalStatusChanges})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by student, roll number, remark, or staff…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pe-8 text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs p-1"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Secondary Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-hairline/60">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted whitespace-nowrap">Class:</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value ? Number(e.target.value) : '')}
              className="input text-xs py-1 px-2.5 h-8 min-w-[140px]"
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.class_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted whitespace-nowrap">Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input text-xs py-1 px-2.5 h-8 font-mono"
            />
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate('')}
                className="text-xs text-muted hover:text-ink underline cursor-pointer"
              >
                Clear date
              </button>
            )}
          </div>

          {(selectedClass !== '' || selectedDate || searchQuery || filterMode !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSelectedClass('')
                setSelectedDate('')
                setSearchQuery('')
                setFilterMode('all')
              }}
              className="ms-auto text-xs text-muted hover:text-ink underline cursor-pointer"
            >
              Reset all filters
            </button>
          )}
        </div>
      </div>

      {/* Log Feed */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-5 h-24 animate-pulse bg-surface-soft/60" />
          ))}
        </div>
      ) : displayLogs.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-hairline">
          <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center bg-surface-soft text-muted text-xl">
            📋
          </div>
          <h3 className="text-base font-semibold text-ink">No audit entries found</h3>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            {searchQuery || selectedClass || selectedDate || filterMode !== 'all'
              ? 'No audit records match the selected filters. Try broadening your criteria.'
              : 'No modifications or remarks have been recorded yet. Activity will appear here automatically.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayLogs.map((log) => {
            const hasStatusChange = log.previous_status && log.previous_status !== log.new_status
            const hasRemark = Boolean(log.remark && log.remark.trim())

            return (
              <div
                key={log.id}
                className="card p-4 sm:p-5 transition-all hover:border-hairline/80 hover:shadow-xs space-y-3"
              >
                {/* Header row: Student info + Period link */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-surface-soft border border-hairline flex items-center justify-center font-semibold text-xs text-ink flex-shrink-0">
                      {log.student?.name ? log.student.name.slice(0, 2).toUpperCase() : 'ST'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-ink">{log.student?.name || 'Unknown Student'}</span>
                        <span className="font-mono text-xs text-muted">{log.student?.roll_number}</span>
                        {log.student?.class_name && (
                          <span className="badge badge-pill text-[10px] bg-surface-soft text-ink font-medium">
                            {log.student.class_name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {log.period?.date}
                        {log.period?.period_number ? ` · Period ${log.period.period_number}` : ''}
                        {log.period?.subject_name ? ` · ${log.period.subject_name}` : ''}
                        {log.period?.start_time ? ` (${log.period.start_time.slice(0, 5)} - ${log.period.end_time?.slice(0, 5)})` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* Status badge transition */}
                    {hasStatusChange ? (
                      <div className="flex items-center gap-1 text-xs">
                        <span className={`badge ${log.previous_status === 'Present' ? 'badge-present' : 'badge-absent'}`}>
                          {log.previous_status}
                        </span>
                        <span className="text-muted text-[11px]">→</span>
                        <span className={`badge ${log.new_status === 'Present' ? 'badge-present' : 'badge-absent'}`}>
                          {log.new_status}
                        </span>
                      </div>
                    ) : (
                      <span className={`badge ${log.new_status === 'Present' ? 'badge-present' : 'badge-absent'}`}>
                        {log.new_status}
                      </span>
                    )}

                    {log.period_id && (
                      <Link
                        href={`/dashboard/attendance/${log.period_id}`}
                        className="btn btn-secondary btn-sm text-xs py-1 px-2.5 flex items-center gap-1"
                        title="View period attendance"
                      >
                        <span>View</span>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Remark Highlight Box */}
                {hasRemark && (
                  <div className="p-3 rounded-lg bg-surface-cream-strong/75 border border-hairline flex items-start gap-2.5">
                    <span className="text-sm select-none" aria-hidden="true">💬</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-ink/75 uppercase tracking-wider mb-0.5">
                        Remark Logged
                      </p>
                      <p className="text-xs font-medium text-ink italic leading-relaxed whitespace-pre-wrap break-words">
                        &ldquo;{log.remark}&rdquo;
                      </p>
                    </div>
                  </div>
                )}

                {/* Footer metadata: Who changed it and when */}
                <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-hairline/50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>
                      Logged by{' '}
                      <span className="font-medium text-ink">
                        {log.changedByProfile?.full_name || 'Staff member'}
                      </span>
                    </span>
                    {log.changedByProfile?.role && (
                      <span className="badge badge-pill text-[10px] py-0 px-2 bg-surface-soft text-ink capitalize font-mono">
                        {log.changedByProfile.role}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px]" title={new Date(log.changed_at).toLocaleString()}>
                      {formatRelativeTime(log.changed_at)}
                    </span>
                    <span className="text-muted-soft">·</span>
                    <span className="text-[11px] font-mono hidden sm:inline">
                      {new Date(log.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
