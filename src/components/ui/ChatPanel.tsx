/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useRef, useEffect, useTransition, useMemo, useCallback } from 'react'
import { processChatMessage, type ChatResponse } from '@/app/actions/chatbot'
import { type ChatSession, type MenuOption, type PeriodListItem, type ClassOption, type ConfirmationData, IDLE_TIMEOUT_MS, createFreshSession } from '@/lib/types/chatbot-types'
import { AnthropicSpikeMark } from './AnthropicSpikeMark'

interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  content: string
  response?: ChatResponse
  timestamp: Date
}

export function ChatPanel({ onClose, userRole }: { onClose: () => void; userRole?: string }) {
  const [session, setSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Initialize with welcome message ──
  useEffect(() => {
    sendBotMessage('', null) // Empty message triggers menu
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isPending])

  // ── Focus input on step changes ──
  useEffect(() => {
    if (!isPending) inputRef.current?.focus()
  }, [isPending, messages.length])

  // ── Idle timeout ──
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      if (session && session.step !== 'menu' && session.step !== 'done') {
        setSession(null)
        setMessages(prev => [...prev, {
          id: `timeout-${Date.now()}`,
          role: 'bot',
          content: 'Your session has expired due to inactivity. Send a message to start fresh.',
          timestamp: new Date(),
        }])
      }
    }, IDLE_TIMEOUT_MS)
  }, [session])

  useEffect(() => {
    resetIdleTimer()
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current) }
  }, [messages.length, resetIdleTimer])

  // ── Send a message to the server ──
  const sendBotMessage = (text: string, currentSession: ChatSession | null) => {
    startTransition(async () => {
      try {
        const response = await processChatMessage(text, currentSession)
        setSession(response.session)

        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          role: 'bot',
          content: response.message,
          response,
          timestamp: new Date(),
        }
        setMessages(prev => [...prev, botMsg])
      } catch (err: any) {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'bot',
          content: `Something went wrong: ${err.message || 'Please try again.'}`,
          timestamp: new Date(),
        }])
      }
    })
  }

  const sendUserMessage = (text: string) => {
    if (!text.trim() || isPending) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    resetIdleTimer()
    sendBotMessage(text.trim(), session)
  }

  const handleSend = () => sendUserMessage(input)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Quick action buttons ──
  const handleMenuSelect = (intentId: string) => {
    if (isPending) return
    const labels: Record<string, string> = {
      mark_today: 'Mark today\'s attendance',
      update_previous: 'Update previous attendance',
      general_query: 'Ask a question',
    }
    sendUserMessage(labels[intentId] || intentId)
  }

  const handlePeriodSelect = (periodNumber: number) => {
    if (isPending) return
    sendUserMessage(String(periodNumber))
  }

  const handleClassSelect = (classId: number, className: string) => {
    if (isPending) return
    sendUserMessage(className)
  }

  const handleConfirmAction = (action: 'correct' | 'update') => {
    if (isPending) return
    sendUserMessage(action)
  }

  const handleCancelFlow = () => {
    if (isPending) return
    sendUserMessage('cancel')
  }

  // ── Render helpers ──
  const renderCache = useRef(new Map<string, React.ReactNode[]>())

  const renderContent = (id: string, content: string) => {
    const cacheKey = `${id}::${content}`
    if (renderCache.current.has(cacheKey)) return renderCache.current.get(cacheKey)!

    const parts = content.split(/(\*\*.*?\*\*|`.*?`|\n)/g)
    const rendered = parts.map((part, i) => {
      if (part === '\n') return <br key={i} />
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} style={{
            background: 'var(--muted)',
            padding: '0.125rem 0.375rem',
            borderRadius: '4px',
            fontSize: '0.8125rem',
            fontFamily: 'monospace',
          }}>
            {part.slice(1, -1)}
          </code>
        )
      }
      return <span key={i}>{part}</span>
    })
    renderCache.current.set(cacheKey, rendered)
    return rendered
  }

  useMemo(() => {
    const activeKeys = new Set(messages.map(m => `${m.id}::${m.content}`))
    for (const key of renderCache.current.keys()) {
      if (!activeKeys.has(key)) renderCache.current.delete(key)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  // ── Input placeholder based on step ──
  const getPlaceholder = (): string => {
    if (!session) return 'Type a message...'
    switch (session.step) {
      case 'menu': return 'Choose an option above or type a question...'
      case 'select_class': return 'Enter class name or number...'
      case 'ask_date': return 'Enter date (DD/MM/YYYY)...'
      case 'select_period': case 'show_periods': return 'Enter period number (1–7)...'
      case 'ask_absentees': case 'update_loop': return 'List absent names (e.g. Rahul, Priya) or "all present"...'
      case 'clarify_name': return 'Enter correct name or "skip"...'
      case 'confirm': return '"correct" or "update"...'
      case 'ask_overwrite': return '"overwrite" or "cancel"...'
      case 'query_intent': case 'query_db': return 'Ask me anything about attendance...'
      default: return 'Type a message...'
    }
  }

  const isInFlow = session && session.step !== 'menu' && session.step !== 'done' && session.step !== 'query_intent'

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-panel-header">
        <div className="flex items-center gap-2.5">
          <div className="chat-panel-icon">
            <AnthropicSpikeMark className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-on-dark tracking-tight">AttendEase Assistant</h3>
            <p className="text-[11px] text-on-dark-soft">
              {session?.step === 'ask_absentees' || session?.step === 'update_loop'
                ? `Marking ${session.periodLabel || 'attendance'}`
                : session?.currentIntent === 'general_query'
                  ? 'Analytics Mode'
                  : 'Attendance Assistant • IST'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isInFlow && (
            <button
              onClick={handleCancelFlow}
              disabled={isPending}
              className="px-2 py-1 rounded text-[11px] font-medium text-on-dark-soft hover:text-on-dark hover:bg-surface-dark-elevated transition-colors"
              title="Cancel current flow"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-on-dark-soft hover:text-on-dark hover:bg-surface-dark-elevated transition-colors"
            aria-label="Close chat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-panel-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`chat-message ${msg.role === 'user' ? 'chat-message-user' : 'chat-message-bot'}`}>
            {msg.role === 'bot' && (
              <div className="chat-avatar-bot">
                <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
            <div className={`chat-bubble ${
              msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'
            } ${msg.response?.messageType === 'success' || msg.response?.messageType === 'confirmation' ? 'chat-bubble-success' : ''
            } ${msg.response?.messageType === 'error' ? 'chat-bubble-error' : ''
            } ${msg.response?.messageType === 'clarification' ? 'chat-bubble-warning' : ''}`}>

              <div className="chat-bubble-content">
                {renderContent(msg.id, msg.content)}
              </div>

              {/* Menu Options */}
              {msg.response?.menuOptions && (
                <div className="chat-menu-cards">
                  {msg.response.menuOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => handleMenuSelect(opt.id!)}
                      disabled={isPending || opt.disabled}
                      className={`chat-menu-card ${opt.disabled ? 'disabled' : ''}`}
                      title={opt.disabled ? opt.disabledReason : undefined}
                    >
                      <div className="chat-menu-card-icon">
                        {opt.icon === 'mark' && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {opt.icon === 'update' && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                          </svg>
                        )}
                        {opt.icon === 'query' && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                          </svg>
                        )}
                      </div>
                      <div className="chat-menu-card-text">
                        <span className="chat-menu-card-label">{opt.label}</span>
                        <span className="chat-menu-card-desc">{opt.description}</span>
                      </div>
                      <svg className="chat-menu-card-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}

              {/* Class Selection */}
              {msg.response?.classList && (
                <div className="chat-class-chips">
                  {msg.response.classList.map(cls => (
                    <button
                      key={cls.id}
                      onClick={() => handleClassSelect(cls.id, cls.className)}
                      disabled={isPending}
                      className="chat-class-chip"
                    >
                      {cls.className}
                    </button>
                  ))}
                </div>
              )}

              {/* Period List */}
              {msg.response?.periodList && (
                <div className="chat-period-list">
                  {msg.response.periodList.map(p => (
                    <button
                      key={p.periodId}
                      onClick={() => handlePeriodSelect(p.periodNumber)}
                      disabled={isPending}
                      className={`chat-period-list-item ${p.isMarked ? 'is-marked' : ''}`}
                    >
                      <div className="chat-period-list-left">
                        <span className={`chat-period-list-badge ${p.isMarked ? 'marked' : 'unmarked'}`}>
                          {p.isMarked ? '✅' : '—'}
                        </span>
                        <div>
                          <span className="chat-period-list-name">{p.label}</span>
                          <span className="chat-period-list-time">{p.startTime}–{p.endTime}</span>
                        </div>
                      </div>
                      <div className="chat-period-list-right">
                        {p.isMarked ? (
                          <span className="chat-period-list-status">{p.presentCount}P / {p.absentCount}A</span>
                        ) : (
                          <span className="chat-period-list-status unmarked">Not marked</span>
                        )}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Confirmation Stats + Actions */}
              {msg.response?.confirmationData && (
                <>
                  <div className="chat-stats">
                    <div className="chat-stat chat-stat-present">
                      <span className="chat-stat-number">{msg.response.confirmationData.totalPresent}</span>
                      <span className="chat-stat-label">Present</span>
                    </div>
                    <div className="chat-stat chat-stat-absent">
                      <span className="chat-stat-number">{msg.response.confirmationData.totalAbsent}</span>
                      <span className="chat-stat-label">Absent</span>
                    </div>
                  </div>
                  <div className="chat-confirm-actions">
                    <button
                      onClick={() => handleConfirmAction('correct')}
                      disabled={isPending}
                      className="chat-confirm-btn correct"
                    >
                      ✓ Correct
                    </button>
                    <button
                      onClick={() => handleConfirmAction('update')}
                      disabled={isPending}
                      className="chat-confirm-btn update"
                    >
                      ✎ Update
                    </button>
                  </div>
                </>
              )}

              {/* Analytics Data Table */}
              {msg.response?.analyticsData?.rows && msg.response.analyticsData.rows.length > 0 && (
                <div className="chat-analytics-table-wrap">
                  <table className="chat-analytics-table">
                    <thead>
                      <tr>
                        {msg.response.analyticsData.columns?.map(col => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {msg.response.analyticsData.rows.map((row, i) => (
                        <tr key={i}>
                          {msg.response!.analyticsData!.columns?.map(col => (
                            <td key={col}>{row[col] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isPending && (
          <div className="chat-message chat-message-bot">
            <div className="chat-avatar-bot">
              <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="chat-bubble chat-bubble-bot">
              <div className="chat-typing">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Active flow indicator bar */}
      {isInFlow && session && (
        <div className="chat-selected-period-bar">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>
              {session.currentIntent === 'mark_today' && 'Marking today\'s attendance'}
              {session.currentIntent === 'update_previous' && `Updating ${session.targetDate ? formatDateShort(session.targetDate) : 'previous attendance'}`}
              {session.currentIntent === 'general_query' && 'Analytics query'}
              {session.periodLabel && ` · ${session.periodLabel}`}
            </span>
          </div>
          <button
            onClick={handleCancelFlow}
            disabled={isPending}
            className="chat-selected-period-clear"
            title="Cancel"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Input */}
      <div className="chat-panel-input">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={getPlaceholder()}
          disabled={isPending}
          className="chat-input"
        />
        <button
          onClick={handleSend}
          disabled={isPending || !input.trim()}
          className="chat-send-btn"
          aria-label="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function formatDateShort(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}`
}
