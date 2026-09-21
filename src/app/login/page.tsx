'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { AnthropicSpikeMark } from '@/components/ui/AnthropicSpikeMark'

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
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-canvas">
      {/* Subtle warm ambient atmosphere */}
      <div className="absolute inset-0 bg-canvas" />
      <div className="absolute top-0 right-1/4 w-[520px] h-[520px] rounded-full bg-surface-soft/80 blur-3xl -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] rounded-full bg-surface-cream-strong/40 blur-3xl translate-y-1/3 pointer-events-none" />

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md mx-4 animate-fade-in-up">
        <div className="bg-canvas border border-hairline rounded-xl p-8 sm:p-10 shadow-sm">
          {/* Brand header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-surface-card border border-hairline mb-4 text-primary">
              <AnthropicSpikeMark className="w-6 h-6 text-primary" />
            </div>
            <h1 className="font-serif text-3xl font-normal text-ink tracking-tight">
              AttendEase
            </h1>
            <p className="text-sm text-muted mt-1.5 font-sans">
              Academic Attendance Management
            </p>
          </div>

          {/* Error notification */}
          {error && (
            <div className="mb-6 p-3 rounded-md bg-danger-light border border-danger/25 text-danger-foreground text-sm animate-fade-in flex items-center gap-2.5">
              <svg className="w-4 h-4 flex-shrink-0 text-danger" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="label text-body-strong">
                Email Address
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
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>
            </div>
          </form>

          <p className="text-center text-xs text-muted-soft mt-8">
            Contact your administrator for institutional login credentials
          </p>
        </div>
      </div>
    </div>
  )
}
