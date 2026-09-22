import React from 'react'

interface AnthropicSpikeMarkProps {
  className?: string
  color?: string
  size?: number
}

/**
 * Institutional attendance register mark — a bespoke roll-call ledger glyph
 * with ruled register lines and verified checkmark.
 */
export function AnthropicSpikeMark({
  className = 'w-4 h-4',
  color = 'currentColor',
  size,
}: AnthropicSpikeMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M8 7h7" />
      <path d="M8 11h7" />
      <path d="M9 16l2 2 4-4" />
    </svg>
  )
}
