// WaveSwap UI Components - Main entry point

import React from 'react'

export interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}

export const Button: React.FC<ButtonProps> = ({ children, onClick, disabled, className = '' }): React.ReactNode => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg font-medium ${className}`}
    >
      {children}
    </button>
  )
}

export interface InputProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
}

export const Input: React.FC<InputProps> = ({ value, onChange, placeholder, className = '' }) => {
  return (
    <input
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      className={`px-3 py-2 border rounded-lg ${className}`}
    />
  )
}

export { default as TokenIcon } from './TokenIcon'
