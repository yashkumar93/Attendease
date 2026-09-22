/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useRef, useEffect, useTransition, useMemo } from 'react'
import { processAttendanceMessage, type ChatbotResult } from '@/app/actions/chatbot'
import { getPeriodStatusSummary, type PeriodStatusSummary, type PeriodTiming } from '@/lib/period-config'
import { AnthropicSpikeMark } from './AnthropicSpikeMark'

interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  content: string
  result?: ChatbotResult
  showPeriodChips?: boolean
  timestamp: Date
}

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const [periodStatus, setPeriodStatus] = useState<PeriodStatusSummary | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialize time detection and welcome greeting
  useEffect(() => {
    const status = getPeriodStatusSummary()
    setPeriodStatus(status)

    let welcomeText = '**Welcome to Quick Mark**\n\n'

    if (status.statusType === 'in_period' && status.currentPeriod) {
      welcomeText +=
        `**Period ${status.currentPeriod.period_number} is currently active** (${status.currentPeriod.label}).\n\n` +
        `Select **Mark Period ${status.currentPeriod.period_number}** below to continue, or choose any period.`
    } else if (status.statusType === 'lunch_break') {
      welcomeText +=
        `**Lunch break** (12:40 – 1:30 PM).\n\n` +
        `Select any period below to record attendance:`
    } else if (status.statusType === 'before_school') {
      welcomeText +=
        `Classes begin at **9:20 AM** (Current time: ${status.displayTime}).\n\n` +
        `Select any period below to mark attendance ahead of time:`
    } else if (status.statusType === 'after_school') {
      welcomeText +=
        `Classes ended at **4:00 PM** (Current time: ${status.displayTime}).\n\n` +
        `Select any period below to mark or adjust attendance:`
    } else {
      welcomeText +=
        `Current time: **${status.displayTime}**.\n\n` +
        `Select any period below to record attendance:`
    }

    setMessages([
      {
        id: 'welcome',
        role: 'bot',
        content: welcomeText,
        showPeriodChips: true,
        timestamp: new Date(),
      },
    ])
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isPending])

  useEffect(() => {
    inputRef.current?.focus()
  }, [selectedPeriod])

  // Handle selecting a period via interactive chip or button
  const handleSelectPeriod = (periodNum: number) => {
    if (isPending) return
    setSelectedPeriod(periodNum)

    const timing = periodStatus?.allPeriods.find((p) => p.period_number === periodNum)
    const label = timing ? ` (${timing.label})` : ''

    const botPrompt: ChatMessage = {
      id: `bot-select-${Date.now()}`,
      role: 'bot',
      content:
        `Selected **Period ${periodNum}**${label}.\n\n` +
        `Now enter the names or roll numbers of **absent students** (separated by comma), or type **all present** if everyone attended.`,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, botPrompt])
  }

  const handleClearSelectedPeriod = () => {
    setSelectedPeriod(null)
  }

  const sendMessage = () => {
    const text = input.trim()
    if (!text || isPending) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')

    const currentSelected = selectedPeriod

    startTransition(async () => {
      try {
        const result = await processAttendanceMessage(text, currentSelected || undefined)
        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          role: 'bot',
          content: result.message,
          result,
          showPeriodChips: result.isHelp || !result.success,
          timestamp: new Date(),
        }

        setMessages((prev) => [...prev, botMsg])

        // If attendance was successfully marked, clear selected period
        if (result.success) {
          setSelectedPeriod(null)
        }
      } catch (err: any) {
        const errMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'bot',
          content: `Unable to process attendance. ${err.message || 'Verify the period number and student names, then try again.'}`,
          showPeriodChips: true,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errMsg])
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    } else if (e.key === 'Escape' && selectedPeriod) {
      handleClearSelectedPeriod()
    }
  }

  // BN-13: Cache rendered output per message to avoid re-running regex splits
  // on every render cycle. The cache is a stable Map keyed by `id + content`
  // so new messages still get rendered fresh.
  const renderCache = useRef(new Map<string, React.ReactNode[]>())

  const renderContent = (id: string, content: string) => {
    const cacheKey = `${id}::${content}`
    if (renderCache.current.has(cacheKey)) {
      return renderCache.current.get(cacheKey)!
    }
    const parts = content.split(/(\*\*.*?\*\*|`.*?`|\n)/g)
    const rendered = parts.map((part, i) => {
      if (part === '\n') return <br key={i} />
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            style={{
              background: 'var(--muted)',
              padding: '0.125rem 0.375rem',
              borderRadius: '4px',
              fontSize: '0.8125rem',
              fontFamily: 'monospace',
            }}
          >
            {part.slice(1, -1)}
          </code>
        )
      }
      return <span key={i}>{part}</span>
    })
    renderCache.current.set(cacheKey, rendered)
    return rendered
  }

  // Prune cache entries for messages no longer in the list to avoid unbounded growth
  useMemo(() => {
    const activeKeys = new Set(messages.map((m) => `${m.id}::${m.content}`))
    for (const key of renderCache.current.keys()) {
      if (!activeKeys.has(key)) renderCache.current.delete(key)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-panel-header">
        <div className="flex items-center gap-2.5">
          <div className="chat-panel-icon">
            <AnthropicSpikeMark className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-on-dark tracking-tight">Quick Mark</h3>
            <p className="text-[11px] text-on-dark-soft">
              {periodStatus?.currentPeriod
                ? `Period ${periodStatus.currentPeriod.period_number} Live • IST`
                : 'Attendance Assistant • IST'}
            </p>
          </div>
        </div>
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

      {/* Messages */}
      <div className="chat-panel-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-message ${msg.role === 'user' ? 'chat-message-user' : 'chat-message-bot'}`}
          >
            {msg.role === 'bot' && (
              <div className="chat-avatar-bot">
                <AnthropicSpikeMark className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
            <div
              className={`chat-bubble ${
                msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'
              } ${msg.result?.success === true ? 'chat-bubble-success' : ''} ${
                msg.result?.success === false && msg.result?.ambiguous.length > 0 ? 'chat-bubble-warning' : ''
              } ${msg.result?.success === false && msg.result?.unmatched.length > 0 ? 'chat-bubble-error' : ''}`}
            >
              <div className="chat-bubble-content">
                {renderContent(msg.id, msg.content)}
              </div>

              {/* Show Active Period Action Button if live */}
              {msg.showPeriodChips && periodStatus?.currentPeriod && (
                <div className="chat-current-period-banner">
                  <div className="chat-current-period-info">
                    <span className="chat-live-pulse" />
                    <span className="text-xs font-medium text-body-strong">
                      Period {periodStatus.currentPeriod.period_number} Live ({periodStatus.currentPeriod.label})
                    </span>
                  </div>
                  <button
                    onClick={() => handleSelectPeriod(periodStatus.currentPeriod!.period_number)}
                    disabled={isPending}
                    className="chat-action-btn-primary"
                  >
                    <span>Mark Period {periodStatus.currentPeriod.period_number}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Show Period Selection Chips */}
              {msg.showPeriodChips && periodStatus && (
                <div className="chat-period-chips-container">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Quick Select Period (1–7):
                  </span>
                  <div className="chat-period-chips">
                    {periodStatus.allPeriods.map((p: PeriodTiming) => {
                      const isCurrent = periodStatus.currentPeriod?.period_number === p.period_number
                      const isSelected = selectedPeriod === p.period_number
                      return (
                        <button
                          key={p.period_number}
                          onClick={() => handleSelectPeriod(p.period_number)}
                          disabled={isPending}
                          className={`chat-period-chip ${isCurrent ? 'is-current' : ''} ${
                            isSelected ? 'active' : ''
                          }`}
                          title={`Period ${p.period_number}: ${p.label}`}
                        >
                          {isCurrent && <span className="chat-live-pulse" style={{ width: 6, height: 6 }} />}
                          <span>P{p.period_number}</span>
                          {isCurrent && <span className="text-[9px] opacity-80">(Live)</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Stats card for successful results */}
              {msg.result?.success && (
                <div className="chat-stats">
                  <div className="chat-stat chat-stat-present">
                    <span className="chat-stat-number">{msg.result.totalPresent}</span>
                    <span className="chat-stat-label">Present</span>
                  </div>
                  <div className="chat-stat chat-stat-absent">
                    <span className="chat-stat-number">{msg.result.totalAbsent}</span>
                    <span className="chat-stat-label">Absent</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isPending && (
          <div className="chat-message chat-message-bot">
            <div className="chat-avatar-bot">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
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

      {/* Selected Period Tag Bar */}
      {selectedPeriod && (
        <div className="chat-selected-period-bar">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>Marking <strong>Period {selectedPeriod}</strong></span>
          </div>
          <button
            onClick={handleClearSelectedPeriod}
            disabled={isPending}
            className="chat-selected-period-clear"
            title="Deselect period"
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
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedPeriod
              ? `Period ${selectedPeriod} absent names (e.g. Rahul, Vicky or all present)`
              : 'e.g. Period 3 - Vicky, Rahul or select a period above'
          }
          disabled={isPending}
          className="chat-input"
        />
        <button
          onClick={sendMessage}
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
