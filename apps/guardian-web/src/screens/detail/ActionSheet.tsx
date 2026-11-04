import { useState } from 'react'
import { useI18n } from '../../i18n'
import type { InquiryMethod, Program } from '../../data/types'
import { canApply, classNames, inquiryMessage, splitSessions } from '../../lib/content'
import { formatDate, formatSessionWhen, isSafeUrl, languageName, weekdayLabel } from '../../lib/format'
import { Icon } from '../../components/Icon'
import { Marked } from '../../components/feedback'
import { SLOT, WithKorean } from '../../components/korean'
import { ExternalLink, PhoneLink } from '../../components/links'
import { Sheet } from '../../components/Sheet'
import { agentAvailable } from '../../data/agent'
import { AiEntry } from '../chat/AiEntry'
import { ApplicationIssueNotice } from './sections'

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
      <ApplicationIssueNotice program={program} />
      {canApply(program) && <ApplyGuide program={program} />}
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

/** 기관 페이지로 나가기 전에 알아 둘 것: 무엇을 골라야 하는지, 신청 페이지가 어떤 말로 되어 있는지 */
function ApplyGuide({ program }: { program: Program }) {
  const { locale, t } = useI18n()
  const { upcoming } = splitSessions(program)
  const classes = classNames(program)
  const matched = upcoming.filter((session) => program.matched_sessions.includes(session.id))
  const picks = (matched.length ? matched : upcoming).slice(0, 3)
  const koreanOnly = locale !== 'ko-easy' && program.application_languages?.length === 1 && program.application_languages[0] === 'ko'
  const pickClass = classes.length > 1
  const pickSession = !pickClass && program.attendance_rule === 'choose_one' && upcoming.length > 1
  if (!pickClass && !pickSession && !koreanOnly) return null
  return (
    <div className="apply-guide">
      {pickClass && <p>{t('applyPickClass', { classes: classes.map((item) => `${item.name}(${weekdayLabel(locale, item.day)})`).join(', ') })}</p>}
      {pickSession && (
        <>
          <p>{t('applyPickSession')}</p>
          <ul>{picks.map((session) => <li key={session.id}>{formatSessionWhen(session, locale)}</li>)}</ul>
        </>
      )}
      {koreanOnly && <p>{t('applyKoreanOnly')}</p>}
    </div>
  )
}

/** 공고에 답이 없는 내용을 기관에 그대로 보여 주거나 보낼 한국어 문장 */
function InquiryText({ message }: { message: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    } catch { /* 문장을 길게 눌러 복사할 수 있습니다. */ }
  }
  return (
    <div className="inquiry-box">
      <p className="inquiry-box-title">{t('inquiryTitle')}</p>
      <p className="muted">{t('inquiryNote')}</p>
      <p className="inquiry-box-text" lang="ko">{message}</p>
      <button type="button" className="btn btn--secondary" onClick={copy} aria-live="polite"><Icon name={copied ? 'check' : 'link'} />{copied ? t('inquiryCopied') : t('inquiryCopy')}</button>
    </div>
  )
}

/** 물어보기: (AI 도우미) → ① 원문에서 먼저 → ② 확인된 문의처(없으면 없다고) */
function AskPanel({ program, onOpenChat }: { program: Program; onOpenChat?: () => void }) {
  const { t } = useI18n()
  const message = inquiryMessage(program)
  return (
    <div className="stack">
      {onOpenChat && agentAvailable && <AiEntry title={t('chatOpen')} body={t('chatOpenProgramBody')} onOpen={onOpenChat} />}
      <div className="step-card">
        <p className="step-title"><span className="step-no">1</span>{t('askStep1')}</p>
        <p className="muted">{t('askStep1Body')}</p>
        {isSafeUrl(program.source_url) && <ExternalLink href={program.source_url} demo={program.is_demo}>{t('sourceLink')}</ExternalLink>}
      </div>
      <div className="step-card">
        <p className="step-title"><span className="step-no">2</span>{t('askStep2')}</p>
        {message && <InquiryText message={message} />}
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
      {method.type === 'visit' && <p className="action-visit"><Icon name="pin" /><span><WithKorean template={t('inquiryVisit', { address: SLOT })} text={method.address ?? ''} /></span></p>}
      {method.type === 'online' && isSafeUrl(method.url) && <ExternalLink href={method.url} demo={demo} variant="secondary">{t('inquiryOnline')}</ExternalLink>}
      <ul className="contact-meta">
        {method.hours && <li><WithKorean template={t('inquiryHours', { hours: SLOT })} text={method.hours} /></li>}
        <li>{method.languages ? t('inquiryLanguages', { languages: method.languages.map((code) => languageName(locale, code)).join(', ') }) : <Marked>{t('inquiryLanguagesUnknown')}</Marked>}</li>
        <li>{t('inquiryVerified', { date: formatDate(method.verified_at, locale) })}</li>
      </ul>
    </li>
  )
}
