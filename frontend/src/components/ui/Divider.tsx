import styles from './Divider.module.css'

interface DividerProps {
  className?: string
}

export function Divider({ className }: DividerProps) {
  return (
    <div className={`${styles.divider}${className ? ` ${className}` : ''}`}>
      <svg viewBox="0 0 200 12" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="6" x2="90" y2="6" stroke="currentColor" strokeWidth="1" />
        <rect x="95" y="1" width="10" height="10" transform="rotate(45 100 6)" stroke="currentColor" strokeWidth="1" fill="none" />
        <line x1="110" y1="6" x2="200" y2="6" stroke="currentColor" strokeWidth="1" />
      </svg>
    </div>
  )
}
