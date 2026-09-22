'use client'

import { useState } from 'react'
import type { Profile } from '@/lib/types/database'
import { getStaffByEmail } from '@/lib/constants/staff'
import { AnthropicSpikeMark } from './AnthropicSpikeMark'

interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
  profile: Profile | null
  email: string | null
  post?: string | null
  onLogout: () => void
}

export function ProfileModal({
  isOpen,
  onClose,
  profile,
  email,
  post: customPost,
  onLogout,
}: ProfileModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const staff = getStaffByEmail(email)
  const displayName = staff?.name || profile?.full_name || 'Staff Member'
  const displayEmail = staff?.email || email || '—'
  const displayPost = staff?.post || customPost || (profile?.role === 'admin' ? 'Administration' : 'Instructor')
  const displayRole = profile?.role === 'admin' ? 'Administrator' : 'Faculty Instructor'
  const initials = staff?.initials || displayName.slice(0, 2).toUpperCase()

  const handleCopyEmail = async () => {
    if (!displayEmail || displayEmail === '—') return
    try {
      await navigator.clipboard.writeText(displayEmail)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback if clipboard API is restricted
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-content max-w-lg p-0 overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline bg-surface-soft">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-grove/90 flex items-center justify-center flex-shrink-0 text-white">
              <AnthropicSpikeMark className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs font-semibold text-ink uppercase tracking-wider">
              Institutional Profile
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-canvas transition-colors"
            aria-label="Close profile"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Profile Card Intro */}
        <div className="p-6 bg-canvas border-b border-hairline">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-lg bg-surface-dark text-on-dark flex items-center justify-center text-lg font-semibold border border-white/10 flex-shrink-0 shadow-sm">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-semibold text-ink tracking-tight">
                  {displayName}
                </h2>
                <span className={`badge ${profile?.role === 'admin' ? 'bg-surface-cream-strong text-ink' : 'bg-grove-pale text-grove border border-grove/20'} text-xs font-medium`}>
                  {displayRole}
                </span>
              </div>
              <p className="text-sm font-medium text-grove mt-1 leading-snug">
                {displayPost}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-2 h-2 rounded-full bg-grove inline-block animate-pulse" />
                <span className="text-xs text-muted">Active institutional status</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ledger Details Grid */}
        <div className="p-6 space-y-4">
          <p className="text-xs font-medium text-muted">Staff record details</p>
          <div className="border border-hairline rounded-lg overflow-hidden divide-y divide-hairline bg-canvas text-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 gap-1">
              <span className="text-xs text-muted sm:w-1/3">Full name</span>
              <span className="font-medium text-ink sm:w-2/3">{displayName}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 gap-1">
              <span className="text-xs text-muted sm:w-1/3">Designation / Post</span>
              <span className="font-medium text-ink sm:w-2/3">{displayPost}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 gap-1">
              <span className="text-xs text-muted sm:w-1/3">Email address</span>
              <div className="flex items-center justify-between sm:w-2/3 gap-2">
                <span className="font-mono text-xs text-ink">{displayEmail}</span>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="btn btn-secondary btn-sm py-0.5 px-2 text-[11px] h-7"
                  title="Copy email to clipboard"
                >
                  {copied ? (
                    <span className="text-success-foreground font-medium flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Copied
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                      </svg>
                      Copy
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 gap-1">
              <span className="text-xs text-muted sm:w-1/3">System access</span>
              <span className="text-xs text-body sm:w-2/3">
                {profile?.role === 'admin'
                  ? 'Administration (timetable, enrollment, audit & sheets export)'
                  : 'Faculty (period roll-call verification & schedule access)'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 gap-1">
              <span className="text-xs text-muted sm:w-1/3">Institution</span>
              <span className="text-xs text-body sm:w-2/3">
                NIAT Attendance Management System
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-surface-soft border-t border-hairline">
          <button
            type="button"
            onClick={onLogout}
            className="btn btn-secondary text-xs text-danger hover:text-danger hover:border-danger/30 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Sign out
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
