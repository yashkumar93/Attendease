'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatPanel } from './ChatPanel'
import { AnthropicSpikeMark } from './AnthropicSpikeMark'

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
          title="Quick Mark"
        >
          <div className="chat-fab-inner">
            <AnthropicSpikeMark className="w-5 h-5 text-on-primary" />
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
