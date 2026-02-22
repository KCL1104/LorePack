import type { ChangeEventHandler } from 'react'
import styles from './Input.module.css'

interface InputProps {
  value: string
  onChange: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
  placeholder?: string
  multiline?: boolean
  className?: string
  rows?: number
  disabled?: boolean
  autoFocus?: boolean
}

export function Input({
  value,
  onChange,
  placeholder,
  multiline,
  className,
  rows = 4,
  disabled,
  autoFocus,
}: InputProps) {
  const cls = `${styles.input}${multiline ? ` ${styles.multiline}` : ''}${className ? ` ${className}` : ''}`

  if (multiline) {
    return (
      <textarea
        className={cls}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        autoFocus={autoFocus}
      />
    )
  }

  return (
    <input
      className={cls}
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
    />
  )
}
