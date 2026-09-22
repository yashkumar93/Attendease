'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatPanel } from './ChatPanel'
import { AnthropicSpikeMark } from './AnthropicSpikeMark'

export function ChatBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userRole, setUserRole] = useState<string>('instructor')
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setIsAuthenticated(!!user)
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        if (profile) setUserRole((profile as any).role)
      }
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
          aria-label="Open AttendEase Assistant"
          title="AttendEase Assistant"
        >
          <div className="chat-fab-inner">
            <AnthropicSpikeMark className="w-5 h-5 text-on-primary" />
          </div>
          <span className="chat-fab-label">Assistant</span>
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
          <ChatPanel onClose={() => setIsOpen(false)} userRole={userRole} />
        </>
      )}
    </>
  )
}
