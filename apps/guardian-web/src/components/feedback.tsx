import type { ReactNode } from 'react'
import type { ApplicationStatus } from '../data/types'

/** 신청 상태: 색 + 점 모양 + 글자. 색만으로 뜻을 전하지 않습니다. */
export function StatusTag({ status, children }: { status: ApplicationStatus; children: ReactNode }) {
  return <span className={`status status--${status}`}><span className="status-dot" aria-hidden="true" />{children}</span>
}

/** 노란 형광펜: 아직 확인되지 않은 정보에만 씁니다. */
export function Marked({ children }: { children: ReactNode }) {
  return <mark className="marked">{children}</mark>
}

interface NoticeProps { tone?: 'info' | 'mark' | 'warn'; title: ReactNode; children?: ReactNode }

export function Notice({ tone = 'info', title, children }: NoticeProps) {
  return (
    <div className={`notice notice--${tone}`} role="note">
      <p className="notice-title">{title}</p>
      {children && <div className="notice-body">{children}</div>}
    </div>
  )
}

interface StatePanelProps { title: string; hint?: string; action?: ReactNode; busy?: boolean }

/** 불러오는 중·오류·빈 결과처럼 목록 대신 보이는 안내 */
export function StatePanel({ title, hint, action, busy }: StatePanelProps) {
  return (
    <div className="state" role={busy ? 'status' : undefined}>
      {busy && <span className="spinner" aria-hidden="true" />}
      <p className="state-title">{title}</p>
      {hint && <p className="state-hint">{hint}</p>}
      {action}
    </div>
  )
}
