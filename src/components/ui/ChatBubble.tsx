'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatPanel } from './ChatPanel'

export function ChatBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user)
    })
  }, [supabase])

  // Listen for sidebar "Quick Mark" button click
  useEffect(() => {
    const handler = () => setIsOpen(true)
    window.addEventListener('open-quick-mark', handler)
    return () => window.removeEventListener('open-quick-mark', handler)
  }, [])

  if (!isAuthenticated) return null

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="chat-fab"
          aria-label="Open Quick Mark chat"
          title="Quick Mark ⚡"
        >
          <div className="chat-fab-inner">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <span className="chat-fab-label">Quick Mark</span>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="chat-backdrop"
            onClick={() => setIsOpen(false)}
          />
          <ChatPanel onClose={() => setIsOpen(false)} />
        </>
      )}
    </>
  )
}
