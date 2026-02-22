import type { ReactNode } from 'react'
import { Divider } from './Divider'
import styles from './SectionHeader.module.css'

interface SectionHeaderProps {
  title: string
  children?: ReactNode
}

export function SectionHeader({ title, children }: SectionHeaderProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {children}
      </div>
      <Divider className={styles.divider} />
    </div>
  )
}
