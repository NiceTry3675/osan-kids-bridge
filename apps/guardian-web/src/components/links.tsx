import { useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { Icon } from './bits'

/** 외부 링크. 시연용 공고는 실제 주소로 보내지 않고 그 사실을 알립니다. */
export function ExternalLink({ href, demo, children, variant }: { href: string; demo: boolean; children: ReactNode; variant?: 'primary' | 'secondary' }) {
  const { t } = useI18n()
  const [blocked, setBlocked] = useState(false)
  const className = variant ? `btn btn--${variant} btn--lg btn--block` : 'link'
  if (demo) {
    return (
      <span className={variant ? 'action-wrap' : 'link-wrap'}>
        <button type="button" className={className} onClick={() => setBlocked(true)}>{children}<Icon name="external" /></button>
        {blocked && <span className="demo-note" role="status">{t('demoLinkBlocked')}</span>}
      </span>
    )
  }
  return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}<Icon name="external" /></a>
}

export function PhoneLink({ phone, demo, children }: { phone: string; demo: boolean; children: ReactNode }) {
  const { t } = useI18n()
  const [blocked, setBlocked] = useState(false)
  if (demo) {
    return (
      <span className="action-wrap">
        <button type="button" className="btn btn--secondary btn--lg btn--block" onClick={() => setBlocked(true)}><Icon name="phone" />{children}</button>
        {blocked && <span className="demo-note" role="status">{t('demoLinkBlocked')}</span>}
      </span>
    )
  }
  return <a className="btn btn--secondary btn--lg btn--block" href={`tel:${phone.replace(/[^0-9+]/g, '')}`}><Icon name="phone" />{children}</a>
}
