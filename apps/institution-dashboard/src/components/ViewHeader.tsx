import type { ReactNode } from 'react'
import { useLanguage } from '../i18n'

/** 화면 맨 위: 작은 회색 줄(어느 업무인지) 아래 큰 제목과 한 줄 설명, 오른쪽에 그 화면의 행동 */
export function ViewHeader({ title, kicker, lead, action }: { title: ReactNode; kicker?: ReactNode; lead?: ReactNode; action?: ReactNode }) {
  const { t } = useLanguage()
  return (
    <header className="view-head">
      <div className="view-head-text">
        <p className="view-kicker">{kicker ?? `${t('brand')} · ${t('institution')}`}</p>
        <h1 className="view-title">{title}</h1>
        {lead && <p className="view-lead">{lead}</p>}
      </div>
      {action && <div className="view-actions">{action}</div>}
    </header>
  )
}
