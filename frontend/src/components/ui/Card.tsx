import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Card.module.css'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hoverable?: boolean
}

export function Card({
  children,
  className,
  onClick,
  hoverable = true,
  ...rest
}: CardProps) {
  return (
    <div
      className={`${styles.card}${hoverable ? ` ${styles.hoverable}` : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      {...rest}
    >
      {children}
    </div>
  )
}
