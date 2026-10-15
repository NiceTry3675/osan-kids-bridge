import type { ReactNode } from 'react'
import type { ApplicationStatus } from '../data/types'

export function StatusTag({ status, children }: { status: ApplicationStatus; children: ReactNode }) {
  return <span className={`status status--${status}`}><span className="status-dot" aria-hidden="true" />{children}</span>
}

/** 형광펜 표시: 아직 확인되지 않은 것 */
export function Marked({ children }: { children: ReactNode }) {
  return <mark className="marked">{children}</mark>
}

export function Notice({ tone = 'info', title, children, role }: { tone?: 'info' | 'mark' | 'warn'; title?: ReactNode; children?: ReactNode; role?: 'status' | 'note' | 'alert' }) {
  return (
    <div className={`notice notice--${tone}`} role={role ?? 'note'}>
      {title && <p className="notice-title">{title}</p>}
      {children && <div className="notice-body">{children}</div>}
    </div>
  )
}

export function StatePanel({ title, hint, action, busy }: { title: string; hint?: string; action?: ReactNode; busy?: boolean }) {
  return (
    <div className="state" role={busy ? 'status' : undefined} aria-live={busy ? 'polite' : undefined}>
      {busy && <span className="spinner" aria-hidden="true" />}
      <p className="state-title">{title}</p>
      {hint && <p className="state-hint">{hint}</p>}
      {action}
    </div>
  )
}

export function Icon({ name }: { name: 'chevron' | 'back' | 'link' | 'phone' | 'pin' | 'globe' | 'sliders' | 'x' | 'external' | 'check' | 'chat' }) {
  const paths: Record<typeof name, ReactNode> = {
    chevron: <path d="m9 5 7 7-7 7" />,
    back: <path d="M15 5 8 12l7 7" />,
    link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
    phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
    pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" /></>,
    sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    chat: <path d="M4 5h16v11H9l-5 4V5Z" />,
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}
