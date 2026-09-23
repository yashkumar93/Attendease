'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'

function TimeoutNotification() {
  const searchParams = useSearchParams()
  const isTimeout = searchParams.get('timeout') === 'true'

  if (!isTimeout) return null

  return (
    <div className="mb-5 px-3.5 py-3 rounded-lg bg-warning-light border border-warning/30 text-warning-foreground text-xs animate-fade-in flex items-start gap-2.5 shadow-sm">
      <svg className="w-4 h-4 flex-shrink-0 text-warning mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <div>
        <p className="font-semibold text-ink">Session Expired</p>
        <p className="text-muted mt-0.5 leading-relaxed">
          You were automatically logged out due to 30 minutes of inactivity. Please sign in to resume.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError) {
        setError(authError.message)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Unable to sign in. Check your email and password, then try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{fontFamily: "'DM Sans', system-ui, sans-serif"}}>
      {/* Left accent column — forest green, like a ledger margin rule */}
      <div className="hidden lg:flex w-72 xl:w-80 flex-col justify-between bg-surface-dark border-e border-white/8 p-8 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-7 h-7 rounded bg-grove/90 border border-grove-mid/40 flex items-center justify-center flex-shrink-0">
              <AnthropicSpikeMark className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-on-dark text-[15px] font-semibold tracking-tight">AttendEase</span>
          </div>
          <p className="text-on-dark text-2xl font-semibold leading-snug tracking-tight max-w-[220px]">
            Academic attendance, simply managed.
          </p>
          <p className="text-on-dark-soft text-sm mt-4 leading-relaxed">
            Roster verification, period scheduling, and attendance export — in one institutional register.
          </p>
        </div>
        <p className="text-on-dark-muted text-xs">
          Authorised personnel only
        </p>
      </div>

      {/* Right sign-in panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-canvas">
        <div className="w-full max-w-sm animate-fade-in-up">
          {/* Mobile-only brand mark */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-6 h-6 rounded bg-grove/90 flex items-center justify-center">
              <AnthropicSpikeMark className="w-3 h-3 text-white" />
            </div>
            <span className="text-ink text-[15px] font-semibold tracking-tight">AttendEase</span>
          </div>

          <h1 className="text-ink text-[22px] font-semibold tracking-tight mb-1">Sign in</h1>
          <p className="text-muted text-sm mb-7">Enter your institutional credentials to continue.</p>

          {/* Timeout notification */}
          <Suspense fallback={null}>
            <TimeoutNotification />
          </Suspense>

          {/* Error notification */}
          {error && (
            <div className="mb-5 px-3 py-2.5 rounded bg-danger-light border border-danger/20 text-danger-foreground text-sm animate-fade-in flex items-start gap-2.5">
              <svg className="w-4 h-4 flex-shrink-0 text-danger mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="label text-body-strong">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@school.edu"
                required
                className="input"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="label text-body-strong">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="input"
                autoComplete="current-password"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full btn-lg"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in…
                  </span>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>
          </form>

          <p className="text-center text-xs text-muted-soft mt-7">
            Contact the administrator for institutional login credentials
          </p>
        </div>
      </div>
    </div>
  )
}
