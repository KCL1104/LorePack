import type { ReactNode, MouseEventHandler } from 'react'
import styles from './Button.module.css'

interface ButtonProps {
  variant?: 'primary' | 'ghost'
  children: ReactNode
  onClick?: MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  className?: string
}

export function Button({
  variant = 'primary',
  children,
  onClick,
  disabled,
  className,
}: ButtonProps) {
  return (
    <button
      className={`${styles.button} ${styles[variant]}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
