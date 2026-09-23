'use client'

import { useState } from 'react'
import type { Profile } from '@/lib/types/database'
import { getStaffByEmail } from '@/lib/constants/staff'
import { createClient } from '@/lib/supabase/client'
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
  const [showPasswordSection, setShowPasswordSection] = useState(false)

  // Password change form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null)

  const supabase = createClient()

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

  const resetPasswordForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPwdError(null)
    setPwdSuccess(null)
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdError(null)
    setPwdSuccess(null)

    if (!currentPassword) {
      setPwdError('Please enter your current password.')
      return
    }

    if (newPassword.length < 6) {
      setPwdError('New password must be at least 6 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match.')
      return
    }

    if (currentPassword === newPassword) {
      setPwdError('New password must be different from current password.')
      return
    }

    setPwdLoading(true)

    try {
      // 1. Verify current password by signing in
      if (displayEmail && displayEmail !== '—') {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: displayEmail,
          password: currentPassword,
        })

        if (signInErr) {
          setPwdError('Current password is incorrect. Please verify and try again.')
          setPwdLoading(false)
          return
        }
      }

      // 2. Update password via Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateErr) {
        setPwdError(updateErr.message || 'Failed to update password. Please try again.')
        setPwdLoading(false)
        return
      }

      setPwdSuccess('Your password has been changed successfully.')
      resetPasswordForm()
      setShowPasswordSection(false)
    } catch (err: any) {
      setPwdError(err?.message || 'An unexpected error occurred. Please try again.')
    } finally {
      setPwdLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-content max-w-lg p-0 overflow-hidden animate-scale-in max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline bg-surface-soft flex-shrink-0">
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

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 divide-y divide-hairline">
          {/* Profile Card Intro */}
          <div className="p-6 bg-canvas">
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

          {/* Security & Password Section */}
          <div className="p-6 space-y-4 bg-canvas">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">Account Security</p>
                <p className="text-xs text-muted mt-0.5">Password management and active session controls</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordSection(!showPasswordSection)
                  if (!showPasswordSection) resetPasswordForm()
                }}
                className={`btn btn-sm text-xs ${showPasswordSection ? 'btn-secondary' : 'btn-primary'}`}
              >
                {showPasswordSection ? 'Cancel' : 'Change password'}
              </button>
            </div>

            {/* Global success feedback */}
            {pwdSuccess && !showPasswordSection && (
              <div className="p-3 rounded-md bg-grove-pale border border-grove/20 text-grove text-xs flex items-center gap-2 animate-fade-in">
                <svg className="w-4 h-4 text-grove flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{pwdSuccess}</span>
              </div>
            )}

            {/* Password Change Form */}
            {showPasswordSection && (
              <form onSubmit={handlePasswordSubmit} className="border border-hairline rounded-lg p-4 bg-surface-soft space-y-3.5 animate-scale-in">
                <p className="text-xs font-semibold text-ink uppercase tracking-wider">
                  Update your password
                </p>

                {pwdError && (
                  <div className="p-2.5 rounded bg-danger-light border border-danger/20 text-danger-foreground text-xs flex items-start gap-2">
                    <svg className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span>{pwdError}</span>
                  </div>
                )}

                {/* Current password */}
                <div>
                  <label className="block text-xs font-medium text-body-strong mb-1">
                    Current password
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      required
                      className="input w-full text-xs pe-9 h-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors p-0.5"
                      title={showCurrentPassword ? 'Hide password' : 'Show password'}
                    >
                      {showCurrentPassword ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* New password */}
                <div>
                  <label className="block text-xs font-medium text-body-strong mb-1">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      required
                      minLength={6}
                      className="input w-full text-xs pe-9 h-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors p-0.5"
                      title={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm new password */}
                <div>
                  <label className="block text-xs font-medium text-body-strong mb-1">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    minLength={6}
                    className="input w-full text-xs h-8"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      resetPasswordForm()
                      setShowPasswordSection(false)
                    }}
                    className="btn btn-secondary btn-sm text-xs h-8"
                    disabled={pwdLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm text-xs h-8 flex items-center gap-1.5"
                    disabled={pwdLoading}
                  >
                    {pwdLoading ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Save password'
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Inactivity Security Badge */}
            <div className="flex items-center gap-2 p-3 rounded-lg border border-hairline bg-surface-soft text-xs text-muted">
              <svg className="w-4 h-4 text-grove flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                <strong className="text-ink font-medium">Session protection:</strong> Automatic logout will trigger after 30 minutes of inactivity.
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-surface-soft border-t border-hairline flex-shrink-0">
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
