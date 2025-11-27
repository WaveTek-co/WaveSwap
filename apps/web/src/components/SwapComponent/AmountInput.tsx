'use client'

import { forwardRef } from 'react'
import { useThemeConfig, createInputStyles } from '@/lib/theme'

interface AmountInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  className?: string
}

const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  ({ value, onChange, placeholder = "", disabled = false, readOnly = false, className = "" }, ref) => {
    const theme = useThemeConfig()
    // Format the value for display
    const formatDisplayValue = (val: string) => {
      if (!val || val === '0' || val === '0.00' || val === '0.000000' || val === '$0.00') return ''

      // Parse the number and ensure proper formatting
      const num = parseFloat(val)
      if (isNaN(num) || num === 0) return ''

      // Split into integer and decimal parts
      const parts = val.split('.')
      const integerPart = parts[0] || '0'
      const decimalPart = parts[1] ? `.${parts[1]}` : ''

      return `${integerPart}${decimalPart}`
    }

    const displayValue = formatDisplayValue(value)

    return (
      <div className="relative w-full">
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          className={`w-full text-left disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ${className}`}
          style={{
            ...createInputStyles(theme),
            height: '4rem', // Match token selector height (64px)
            fontSize: '1.5rem',
            fontWeight: 700,
            padding: '0 1rem',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            borderRadius: '0.875rem',
            fontFamily: 'var(--font-inter), var(--font-helvetica), system-ui, sans-serif',
            background: `
              linear-gradient(135deg,
                ${theme.colors.surface}f0 0%,
                ${theme.colors.surfaceHover}dd 50%,
                ${theme.colors.surface}f0 100%
              )
            `,
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: theme.colors.border,
            color: theme.colors.textPrimary,
            cursor: readOnly ? 'default' : 'text',
            boxShadow: `
              inset 0 2px 8px ${theme.colors.shadow}15,
              0 1px 0 rgba(255, 255, 255, ${theme.name === 'light' ? '0.8' : '0.1'})
            `,
            transition: 'all 0.2s ease'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = theme.colors.primary
            e.currentTarget.style.boxShadow = `
              inset 0 2px 8px ${theme.colors.shadow}20,
              0 0 0 3px ${theme.colors.primary}15,
              0 1px 0 rgba(255, 255, 255, ${theme.name === 'light' ? '0.8' : '0.1'})
            `
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = theme.colors.border
            e.currentTarget.style.boxShadow = `
              inset 0 2px 8px ${theme.colors.shadow}15,
              0 1px 0 rgba(255, 255, 255, ${theme.name === 'light' ? '0.8' : '0.1'})
            `
          }}
        />

        </div>
    )
  }
)

AmountInput.displayName = 'AmountInput'

export { AmountInput }