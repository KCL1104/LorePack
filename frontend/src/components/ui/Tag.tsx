import type { MouseEventHandler } from 'react'
import styles from './Tag.module.css'

interface TagProps {
  label: string
  selected?: boolean
  onClick?: MouseEventHandler<HTMLSpanElement>
  variant?: 'default' | 'crimson'
  className?: string
}

export function Tag({
  label,
  selected,
  onClick,
  variant = 'default',
  className,
}: TagProps) {
  return (
    <span
      className={`${styles.tag} ${styles[variant]}${selected ? ` ${styles.selected}` : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
    >
      {label}
    </span>
  )
}
