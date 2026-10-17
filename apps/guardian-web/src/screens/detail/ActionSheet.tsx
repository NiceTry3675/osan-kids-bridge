import { useI18n } from '../../i18n'
import type { InquiryMethod, Program } from '../../data/types'
import { canApply } from '../../lib/content'
import { formatDate, isSafeUrl, languageName } from '../../lib/format'
import { Icon } from '../../components/Icon'
import { Marked } from '../../components/feedback'
import { ExternalLink, PhoneLink } from '../../components/links'
import { Sheet } from '../../components/Sheet'
import { agentAvailable } from '../../data/agent'
import { AiEntry } from '../chat/AiEntry'

export type ActionTab = 'apply' | 'ask'

interface Props {
  program: Program
  tab: ActionTab | null
  onTab: (tab: ActionTab) => void
  onClose: () => void
  /** AI 상담 도우미 열기 (서버가 연결된 화면에서만) */
  onOpenChat?: () => void
}

/** 06 신청·물어보기: 상세 위에 여는 시트 하나, 탭 두 개(명세 5.2: 신청과 문의는 다른 행동). */
export function ActionSheet({ program, tab, onTab, onClose, onOpenChat }: Props) {
  const { t } = useI18n()
  const tabs = (
    <div className="seg" role="tablist">
      <button type="button" role="tab" aria-selected={tab !== 'ask'} className="seg-btn" onClick={() => onTab('apply')}>{t('tabApply')}</button>
      <button type="button" role="tab" aria-selected={tab === 'ask'} className="seg-btn" onClick={() => onTab('ask')}>{t('askButton')}</button>
    </div>
  )
  return (
    <Sheet open={tab !== null} onClose={onClose} title={tab === 'ask' ? t('askButton') : t('tabApply')} titleHidden headerExtra={tabs}>
      {tab === 'ask' ? <AskPanel program={program} onOpenChat={onOpenChat} /> : <ApplyPanel program={program} />}
    </Sheet>
  )
}

/** 신청하기: 외부로 나가기 전 안내 → 확인된 신청 방법 → 링크가 안 열릴 때 */
function ApplyPanel({ program }: { program: Program }) {
  const { locale, t } = useI18n()
  const phone = [...program.inquiry_methods, ...program.application_methods].find((method) => method.phone)?.phone
  const hasSource = isSafeUrl(program.source_url)
  return (
    <div className="stack">
      <p className="sheet-note">{t('applyResultNote')}</p>
      {canApply(program) ? (
        <div className="actions">
          {program.application_methods.map((method) => {
            if (method.type === 'online' && isSafeUrl(method.url)) return <ExternalLink key="online" href={method.url} demo={program.is_demo} variant="primary">{t('openApplyPage')}</ExternalLink>
            if (method.type === 'phone' && method.phone) return <PhoneLink key="phone" phone={method.phone} demo={program.is_demo}>{t('applyPhone', { phone: method.phone })}</PhoneLink>
            if (method.type === 'visit') return <p key="visit" className="action-visit"><Icon name="pin" /><span><strong>{t('applyVisit')}</strong><span lang="ko">{method.address}</span></span></p>
            return null
          })}
        </div>
      ) : (
        <>
          <p><Marked>{program.application_status === 'upcoming' && program.application_start ? t('upcomingAction', { date: formatDate(program.application_start, locale) }) : t('unknownAction')}</Marked></p>
          {isSafeUrl(program.source_url) && <ExternalLink href={program.source_url} demo={program.is_demo} variant="primary">{t('sourceLink')}</ExternalLink>}
        </>
      )}
      <details className="trouble">
        <summary>{t('linkTrouble')}</summary>
        <ol>
          {hasSource && <li>{t('linkTroubleSource')}</li>}
          {phone ? <li>{t('linkTroublePhone', { phone })}</li> : !hasSource && <li>{t('linkTroubleNone')}</li>}
        </ol>
      </details>
    </div>
  )
}

/** 물어보기: (AI 도우미) → ① 원문에서 먼저 → ② 확인된 문의처(없으면 없다고) */
function AskPanel({ program, onOpenChat }: { program: Program; onOpenChat?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="stack">
      {onOpenChat && agentAvailable && <AiEntry title={t('chatOpen')} body={t('chatOpenHomeBody')} onOpen={onOpenChat} />}
      <div className="step-card">
        <p className="step-title"><span className="step-no">1</span>{t('askStep1')}</p>
        <p className="muted">{t('askStep1Body')}</p>
        {isSafeUrl(program.source_url) && <ExternalLink href={program.source_url} demo={program.is_demo}>{t('sourceLink')}</ExternalLink>}
      </div>
      <div className="step-card">
        <p className="step-title"><span className="step-no">2</span>{t('askStep2')}</p>
        {program.inquiry_methods.length ? (
          <ul className="contacts">{program.inquiry_methods.map((method, index) => <Contact key={index} method={method} demo={program.is_demo} />)}</ul>
        ) : (
          <div className="empty-contact">
            <p className="empty-contact-title"><Marked>{t('noInquiry')}</Marked></p>
            <p className="muted">{t('noInquiryHint')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** 문의처 하나. 운영 시간·상담 언어는 기관 자료에서 확인된 경우에만 적습니다. */
function Contact({ method, demo }: { method: InquiryMethod; demo: boolean }) {
  const { locale, t } = useI18n()
  return (
    <li className="contact">
      {method.type === 'phone' && method.phone && <PhoneLink phone={method.phone} demo={demo}>{t('inquiryPhone', { phone: method.phone })}</PhoneLink>}
      {method.type === 'visit' && <p className="action-visit"><Icon name="pin" /><span lang="ko">{t('inquiryVisit', { address: method.address ?? '' })}</span></p>}
      {method.type === 'online' && isSafeUrl(method.url) && <ExternalLink href={method.url} demo={demo} variant="secondary">{t('inquiryOnline')}</ExternalLink>}
      <ul className="contact-meta">
        {method.hours && <li>{t('inquiryHours', { hours: method.hours })}</li>}
        <li>{method.languages ? t('inquiryLanguages', { languages: method.languages.map((code) => languageName(locale, code)).join(', ') }) : <Marked>{t('inquiryLanguagesUnknown')}</Marked>}</li>
        <li>{t('inquiryVerified', { date: formatDate(method.verified_at, locale) })}</li>
      </ul>
    </li>
  )
}
