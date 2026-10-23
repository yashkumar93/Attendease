'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'

function TimeoutNotification() {
  const searchParams = useSearchParams()
  const isTimeout = searchParams.get('timeout') === 'true'

  if (!isTimeout) return null

  return (
    <div role="status" aria-live="polite" className="mb-5 px-3.5 py-3 rounded-lg bg-warning-light border border-warning/30 text-warning-foreground text-xs animate-fade-in flex items-start gap-2.5 shadow-sm">
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

function LoginFormContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
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
        setLoading(false)
        return
      }

      // Hard navigation guarantees new auth cookies are sent with the request
      // and eliminates stale client router cache, directly landing on dashboard.
      const redirectTo = searchParams.get('redirectTo') || '/dashboard'
      window.location.href = redirectTo
    } catch {
      setError('Unable to sign in. Check your email and password, then try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] flex" style={{fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"}}>
      {/* Left accent column — Apple dark canvas */}
      <div className="hidden lg:flex w-80 xl:w-96 flex-col justify-between p-10 flex-shrink-0" style={{background: '#000000', borderRight: '1px solid rgba(255,255,255,0.08)'}}>
        <div>
          <div className="flex items-center gap-3 mb-20">
            <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{background: 'rgba(0,102,204,0.2)', border: '1px solid rgba(0,102,204,0.4)'}}>
              <AnthropicSpikeMark className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white text-[15px] font-semibold tracking-[-0.022em]">AttendEase</span>
          </div>
          <p className="text-white text-3xl font-semibold leading-[1.15] tracking-[-0.015em] text-balance max-w-[260px]">
            Academic attendance, simply managed.
          </p>
          <p className="text-[#a1a1a6] text-[15px] mt-4 leading-relaxed tracking-[-0.016em] text-pretty">
            Roster verification, period scheduling, and attendance export in one institutional register.
          </p>
        </div>
        <p className="text-[#7a7a7a] text-[11px] font-medium tracking-[0.08em] uppercase">
          Authorized personnel only
        </p>
      </div>

      {/* Right sign-in panel */}
      <div className="flex-1 flex items-center justify-center p-6" style={{background: '#f5f5f7'}}>
        <div className="w-full max-w-sm animate-fade-in-up bg-white p-8 sm:p-10 rounded-[18px] border border-[#e0e0e0]">
          {/* Mobile-only brand mark */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{background: 'rgba(0,102,204,0.2)'}}>
              <AnthropicSpikeMark className="w-3 h-3 text-[#0066cc]" />
            </div>
            <span className="text-[#1d1d1f] text-[15px] font-semibold tracking-[-0.022em]">AttendEase</span>
          </div>

          <h1 className="text-[#1d1d1f] text-[28px] font-semibold tracking-[-0.015em] mb-1 text-balance">Sign in</h1>
          <p className="text-[#7a7a7a] text-[14px] mb-7 tracking-[-0.016em] text-pretty">Enter your institutional credentials to continue.</p>

          {/* Timeout notification */}
          <Suspense fallback={null}>
            <TimeoutNotification />
          </Suspense>

          {/* Error notification */}
          {error && (
            <div
              id="login-error-message"
              role="alert"
              aria-live="assertive"
              className="mb-5 px-3.5 py-2.5 rounded-lg bg-[#fff0f0] border border-[#b30000]/20 text-[#b30000] text-sm animate-fade-in flex items-start gap-2.5"
            >
              <svg className="w-4 h-4 flex-shrink-0 text-[#b30000] mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-[0.04em] text-[#1d1d1f] mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@school.edu"
                required
                aria-invalid={!!error}
                aria-describedby={error ? "login-error-message" : undefined}
                className="w-full px-3.5 py-2.5 text-base sm:text-sm rounded-lg border border-[#e0e0e0] bg-white text-[#1d1d1f] focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-[#a1a1a6]"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-[0.04em] text-[#1d1d1f] mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                aria-invalid={!!error}
                aria-describedby={error ? "login-error-message" : undefined}
                className="w-full px-3.5 py-2.5 text-base sm:text-sm rounded-lg border border-[#e0e0e0] bg-white text-[#1d1d1f] focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-[#a1a1a6]"
                autoComplete="current-password"
              />
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-5 rounded-full font-normal text-[17px] text-white flex items-center justify-center transition-[background-color,transform] duration-150 ease-out enabled:active:scale-[0.96] disabled:opacity-50"
                style={{background: '#0066cc'}}
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

          <p className="text-center text-xs text-[#7a7a7a] mt-7 tracking-[-0.12px]">
            Contact the administrator for institutional login credentials
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] flex items-center justify-center bg-canvas">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    }>
      <LoginFormContent />
    </Suspense>
  )
}
