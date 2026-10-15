import type { ReactNode } from 'react'
import { useLanguage } from '../i18n'

/** 탭 맨 위: 보호자 웹 상세처럼 작은 회색 줄(서비스·화면) 아래 큰 제목, 오른쪽에 그 화면의 행동 하나 */
export function ViewHeader({ title, action }: { title: string; action?: ReactNode }) {
  const { t } = useLanguage()
  return (
    <header className="view-head">
      <div className="view-head-text">
        <p className="view-kicker">{t('brand')} · {t('institution')}</p>
        <h1 className="view-title">{title}</h1>
      </div>
      {action}
    </header>
  )
}
