import React from 'react'

interface AnthropicSpikeMarkProps {
  className?: string
  color?: string
  size?: number
}

/**
 * Anthropic radial-spike mark — a 4-spoke radial asterisk glyph
 * used as the brand wordmark prefix and content marker in the Claude design system.
 */
export function AnthropicSpikeMark({
  className = 'w-4 h-4',
  color = 'currentColor',
  size,
}: AnthropicSpikeMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={color}
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 2C12 7.523 7.523 12 2 12C7.523 12 12 16.477 12 22C12 16.477 16.477 12 22 12C16.477 12 12 7.523 12 2Z" />
    </svg>
  )
}
