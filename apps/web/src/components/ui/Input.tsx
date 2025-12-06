'use client'

import React, { forwardRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Search } from 'lucide-react'
import { useThemeWaveLogo } from './ThemeWaveLogo'

export interface InputProps {
  variant?: 'default' | 'ghost' | 'flush'
  size?: 'sm' | 'md' | 'lg'
  label?: string
  error?: string
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  loading?: boolean
  showPasswordToggle?: boolean
  type?: string
  placeholder?: string
  value?: string | undefined
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void | undefined
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void | undefined
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void | undefined
  disabled?: boolean
  className?: string
  id?: string
  autoFocus?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({
    className,
    variant = 'default',
    size = 'md',
    label,
    error,
    helperText,
    leftIcon,
    rightIcon,
    loading,
    showPasswordToggle,
    type,
    placeholder,
    value,
    onChange,
    onFocus,
    onBlur,
    disabled,
    id,
    autoFocus,
  }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const [isFocused, setIsFocused] = useState(false)
    const getWaveLogo = useThemeWaveLogo()

    const inputType = showPasswordToggle && type === 'password'
      ? showPassword ? 'text' : 'password'
      : type

    const baseStyles = 'flex w-full rounded-xl border bg-background px-4 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200'

    const variants = {
      default: 'border-input',
      ghost: 'border-transparent bg-transparent focus:bg-secondary/50',
      flush: 'border-transparent rounded-none px-0 py-0 focus:ring-0 focus:ring-offset-0',
    }

    const sizes = {
      sm: 'h-10 text-sm',
      md: 'h-12 text-sm',
      lg: 'h-14 text-base',
    }

    const inputStyles = cn(
      baseStyles,
      variants[variant],
      sizes[size],
      error && 'border-destructive focus-visible:ring-destructive',
      leftIcon && 'pl-12',
      (rightIcon || showPasswordToggle) && 'pr-12',
      className
    )

    const containerStyles = cn(
      'relative w-full',
      label && 'space-y-2'
    )

    return (
      <div className={containerStyles}>
        {label && (
          <label className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            type={inputType}
            className={inputStyles}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            onFocus={(e) => {
              setIsFocused(true)
              onFocus?.(e)
            }}
            onBlur={(e) => {
              setIsFocused(false)
              onBlur?.(e)
            }}
            disabled={disabled}
            id={id}
            autoFocus={autoFocus}
          />

          {(rightIcon || showPasswordToggle) && (
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
              {showPasswordToggle ? (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <img
                    src={getWaveLogo()}
                    alt={showPassword ? 'Hide' : 'Show'}
                    className={`h-4 w-4 transition-all duration-200 ${
                      showPassword ? 'opacity-60' : 'opacity-100'
                    }`}
                    style={{
                      filter: showPassword
                        ? 'brightness(0.7) contrast(0.8)'
                        : 'brightness(1) contrast(1)'
                    }}
                  />
                </button>
              ) : (
                rightIcon
              )}
            </div>
          )}

          {isFocused && (
            <div className="absolute inset-0 rounded-xl bg-ring/5 pointer-events-none" />
          )}
        </div>

        {(error || helperText) && (
          <p className={cn('text-xs mt-1', error ? 'text-destructive' : 'text-muted-foreground')}>
            {error || helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

interface SearchInputProps {
  className?: string
  placeholder?: string
  value?: string | undefined
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void | undefined
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void | undefined
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void | undefined
  disabled?: boolean
  id?: string
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, placeholder = "Search...", value, onChange, onFocus, onBlur, disabled, id }, ref) => {
    return (
      <Input
        ref={ref}
        leftIcon={<Search className="h-4 w-4" />}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={disabled}
        id={id}
        className={className}
      />
    )
  }
)

SearchInput.displayName = 'SearchInput'

export { Input }
export default Input