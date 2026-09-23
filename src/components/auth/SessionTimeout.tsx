'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// 30 minutes in milliseconds
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000
// Warning threshold: 2 minutes before logout (at 28 minutes)
const WARNING_THRESHOLD_MS = 2 * 60 * 1000
// Check interval: every 10 seconds
const CHECK_INTERVAL_MS = 10 * 1000
// Activity throttle: update timestamp at most every 2 seconds
const ACTIVITY_THROTTLE_MS = 2000
const STORAGE_KEY = 'attendease_last_active'

export function SessionTimeout() {
  const router = useRouter()
  const supabase = createClient()
  const [isWarningOpen, setIsWarningOpen] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(120)

  const lastRecordedActivityRef = useRef<number>(Date.now())
  const isLoggingOutRef = useRef<boolean>(false)

  // Execute logout when session expires
  const performLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return
    isLoggingOutRef.current = true

    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY)
      }
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Error during automatic inactivity sign-out:', err)
    } finally {
      setIsWarningOpen(false)
      router.push('/login?timeout=true')
      router.refresh()
    }
  }, [supabase, router])

  // Record active user interaction
  const recordActivity = useCallback(() => {
    const now = Date.now()
    if (now - lastRecordedActivityRef.current < ACTIVITY_THROTTLE_MS) {
      return
    }

    lastRecordedActivityRef.current = now
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, now.toString())
    }

    // Dismiss warning if user becomes active
    setIsWarningOpen((prev) => {
      if (prev) return false
      return prev
    })
  }, [])

  // Explicit user reset via "Stay Signed In" button
  const handleStaySignedIn = () => {
    const now = Date.now()
    lastRecordedActivityRef.current = now
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, now.toString())
    }
    setIsWarningOpen(false)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Initialize timestamp if not present
    const existing = localStorage.getItem(STORAGE_KEY)
    if (!existing) {
      localStorage.setItem(STORAGE_KEY, Date.now().toString())
    }

    // Attach interaction listeners
    const eventTypes: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ]

    eventTypes.forEach((evt) => {
      window.addEventListener(evt, recordActivity, { passive: true })
    })

    // Routine check for inactivity expiration
    const checkExpiration = () => {
      if (isLoggingOutRef.current) return

      const raw = localStorage.getItem(STORAGE_KEY)
      const lastActive = raw ? parseInt(raw, 10) : Date.now()
      const now = Date.now()
      const elapsed = now - lastActive

      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        performLogout()
      } else if (elapsed >= INACTIVITY_TIMEOUT_MS - WARNING_THRESHOLD_MS) {
        const remainingMs = INACTIVITY_TIMEOUT_MS - elapsed
        const sec = Math.max(0, Math.ceil(remainingMs / 1000))
        setRemainingSeconds(sec)
        setIsWarningOpen(true)
      } else {
        setIsWarningOpen(false)
      }
    }

    const intervalId = setInterval(checkExpiration, CHECK_INTERVAL_MS)

    // Immediate check when returning to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkExpiration()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Synchronize across multiple browser tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const updated = parseInt(e.newValue, 10)
        lastRecordedActivityRef.current = updated
        setIsWarningOpen(false)
      }
    }
    window.addEventListener('storage', handleStorage)

    // Countdown tick while warning modal is shown
    const countdownInterval = setInterval(() => {
      if (isWarningOpen && !isLoggingOutRef.current) {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            performLogout()
            return 0
          }
          return prev - 1
        })
      }
    }, 1000)

    return () => {
      eventTypes.forEach((evt) => {
        window.removeEventListener(evt, recordActivity)
      })
      clearInterval(intervalId)
      clearInterval(countdownInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [recordActivity, performLogout, isWarningOpen])

  if (!isWarningOpen) return null

  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="inactivity-dialog-title"
    >
      <div className="w-full max-w-md bg-canvas border border-hairline rounded-xl shadow-2xl p-6 space-y-4 animate-scale-in text-ink">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-danger-light text-danger flex items-center justify-center flex-shrink-0 border border-danger/20">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 id="inactivity-dialog-title" className="text-base font-semibold text-ink">
              Session Timeout Warning
            </h3>
            <p className="text-xs text-muted mt-0.5">
              30-Minute Institutional Inactivity Limit
            </p>
          </div>
        </div>

        <p className="text-sm text-body leading-relaxed">
          You have been inactive for nearly 30 minutes. For institutional security, your session will be automatically terminated in:
        </p>

        <div className="py-3 px-4 rounded-lg bg-surface-soft border border-hairline text-center">
          <span className="text-2xl font-mono font-bold text-danger tracking-wider">
            {formattedTime}
          </span>
          <p className="text-[11px] text-muted mt-0.5">minutes remaining before sign-out</p>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-hairline">
          <button
            type="button"
            onClick={performLogout}
            className="btn btn-secondary btn-sm text-xs text-danger hover:text-danger hover:border-danger/30"
          >
            Sign out now
          </button>
          <button
            type="button"
            onClick={handleStaySignedIn}
            className="btn btn-primary btn-sm text-xs px-4"
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  )
}
