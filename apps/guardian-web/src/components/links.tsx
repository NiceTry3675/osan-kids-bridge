import { useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { Icon } from './Icon'
import type { IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'inline'

interface Props {
  href: string
  /** 시연용 공고면 실제 주소로 보내지 않고 그 사실을 알립니다. */
  demo: boolean
  variant?: Variant
  icon?: IconName
  children: ReactNode
}

const classFor = (variant: Variant) => (variant === 'inline' ? 'link' : `btn btn--${variant} btn--lg btn--block`)

function OutLink({ href, demo, variant = 'inline', icon, children }: Props) {
  const { t } = useI18n()
  const [blocked, setBlocked] = useState(false)
  const external = href.startsWith('http')
  const content = <>{icon && <Icon name={icon} />}{children}{external && <Icon name="external" />}</>
  if (demo) {
    return (
      <span className={variant === 'inline' ? 'link-wrap' : 'action-wrap'}>
        <button type="button" className={classFor(variant)} onClick={() => setBlocked(true)}>{content}</button>
        {blocked && <span className="demo-note" role="status">{t('demoLinkBlocked')}</span>}
      </span>
    )
  }
  return <a className={classFor(variant)} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{content}</a>
}

/** 기관 원문·신청·문의 페이지(새 탭) */
export const ExternalLink = (props: Props) => <OutLink {...props} />

/** 전화 걸기 */
export const PhoneLink = ({ phone, demo, children }: { phone: string; demo: boolean; children: ReactNode }) => (
  <OutLink href={`tel:${phone.replace(/[^0-9+]/g, '')}`} demo={demo} variant="secondary" icon="phone">{children}</OutLink>
)
