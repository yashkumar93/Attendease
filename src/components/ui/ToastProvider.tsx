'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
  isExiting?: boolean
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismissToast = useCallback((id: number) => {
    // Clear any active timer
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id))
      timersRef.current.delete(id)
    }

    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t))
    )
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 160)
  }, [])

  const startDismissTimer = useCallback((id: number, delay = 4000) => {
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id))
    }
    const timer = setTimeout(() => {
      dismissToast(id)
    }, delay)
    timersRef.current.set(id, timer)
  }, [dismissToast])

  const pauseDismissTimer = useCallback((id: number) => {
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id))
      timersRef.current.delete(id)
    }
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type, isExiting: false }])
    startDismissTimer(id)
  }, [startDismissTimer])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container — persistent live region positioned top-end */}
      <div
        className="fixed top-4 end-4 z-[100] flex flex-col gap-2 pointer-events-none pt-[env(safe-area-inset-top,0)]"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onMouseEnter={() => pauseDismissTimer(toast.id)}
            onMouseLeave={() => startDismissTimer(toast.id, 2000)}
            onFocus={() => pauseDismissTimer(toast.id)}
            onBlur={() => startDismissTimer(toast.id, 2000)}
            className={`toast toast-${toast.type} pointer-events-auto flex items-center justify-between gap-3 ${
              toast.isExiting ? 'toast-exit' : ''
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {toast.type === 'success' && (
                <svg className="w-4 h-4 flex-shrink-0 text-success-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {toast.type === 'error' && (
                <svg className="w-4 h-4 flex-shrink-0 text-danger-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
              {toast.type === 'info' && (
                <svg className="w-4 h-4 flex-shrink-0 text-info" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              )}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="p-1 rounded-md text-current opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex-shrink-0 cursor-pointer"
              aria-label="Dismiss notification"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
