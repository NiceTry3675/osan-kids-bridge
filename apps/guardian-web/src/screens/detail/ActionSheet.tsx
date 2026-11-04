import { useState } from 'react'
import { useI18n } from '../../i18n'
import type { InquiryMethod, Program } from '../../data/types'
import { canApply, classNames, inquiryMessage, inquiryTopics, isListPage, splitSessions } from '../../lib/content'
import { formatDate, formatSessionWhen, isSafeUrl, languageName, topicLabel, weekdayLabel } from '../../lib/format'
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

/**
 * 신청하기: 신청 기간 경고 → 지금 신청할 수 있는지 → 고를 것 → 확인된 신청 방법 → 링크가 안 열릴 때.
 * 아는 신청 방법은 신청 시작 전이어도 보여 줍니다. 안내는 실제 방법에 맞춰, 온라인 신청일 때만 기관 페이지 이야기를 합니다.
 */
function ApplyPanel({ program }: { program: Program }) {
  const { locale, t } = useI18n()
  const phone = [...program.inquiry_methods, ...program.application_methods].find((method) => method.phone)?.phone
  const hasSource = isSafeUrl(program.source_url)
  const methods = program.application_methods
  const online = methods.filter((method) => method.type === 'online' && isSafeUrl(method.url))
  const status = program.application_status
  const noPeriod = status === 'unknown' || (status === 'upcoming' && !program.application_start)
  const missing = noPeriod ? t(methods.length ? 'unknownAction' : 'noPeriodMethodAction') : !methods.length && status !== 'closed' ? t('noMethodAction') : null
  return (
    <div className="stack">
      <ApplicationIssueNotice program={program} />
      {status === 'upcoming' && program.application_start && <p><Marked>{t('upcomingAction', { date: formatDate(program.application_start, locale) })}</Marked></p>}
      {status === 'closed' && <p>{t('closedAction')}</p>}
      {missing && <p><Marked>{missing} {t(hasSource ? 'checkSourceOrAsk' : 'askInstitution')}</Marked></p>}
      {canApply(program) && <ApplyGuide program={program} />}
      {status !== 'closed' && online.length > 0 && <p>{t('applyResultNote')}</p>}
      {status !== 'closed' && methods.length > 0 && (
        <div className="actions">
          {methods.map((method, index) => {
            if (method.type === 'online' && isSafeUrl(method.url)) {
              return (
                <div key={index} className="apply-online">
                  {method.label && <p className="apply-method"><WithKorean template={t('applyMethod', { label: SLOT })} text={method.label} /></p>}
                  {isListPage(method.url) && <FindOnList title={program.title} />}
                  <ExternalLink href={method.url} demo={program.is_demo} variant="primary">{t('openApplyPage')}</ExternalLink>
                </div>
              )
            }
            if (method.type === 'phone' && method.phone) return <PhoneLink key={index} phone={method.phone} demo={program.is_demo}>{t('applyPhone', { phone: method.phone })}</PhoneLink>
            if (method.type === 'visit') return <p key={index} className="action-visit"><Icon name="pin" /><span><strong>{t('applyVisit')}</strong><span lang="ko">{method.address}</span></span></p>
            // 주소가 확인되지 않은 온라인 신청: 방법은 알리되 누를 곳을 지어내지 않습니다.
            return method.label ? <p key={index} className="apply-method"><WithKorean template={t('applyMethod', { label: SLOT })} text={method.label} /></p> : null
          })}
        </div>
      )}
      {status !== 'closed' && !methods.length && hasSource && <ExternalLink href={program.source_url!} demo={program.is_demo} variant="primary">{t('sourceLink')}</ExternalLink>}
      {status !== 'closed' && online.length > 0 && (
        <details className="trouble">
          <summary>{t('linkTrouble')}</summary>
          <ol>
            {hasSource && <li>{t('linkTroubleSource')}</li>}
            {phone ? <li>{t('linkTroublePhone', { phone })}</li> : !hasSource && <li>{t('linkTroubleNone')}</li>}
          </ol>
        </details>
      )}
    </div>
  )
}

/** 기관 페이지가 목록이면 어떤 공고를 찾아야 하는지 알려 줍니다. 기관 페이지는 한국어이므로 한국어 제목을 씁니다. */
function FindOnList({ title }: { title: string }) {
  const { t } = useI18n()
  return (
    <div className="find-on-list">
      <p>{t('applyFindTitle')}</p>
      <p className="find-on-list-title" lang="ko">{title}</p>
      <CopyButton text={title} label={t('copyTitle')} />
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    } catch { /* 글자를 길게 눌러 복사할 수 있습니다. */ }
  }
  return <button type="button" className="btn btn--secondary" onClick={copy} aria-live="polite"><Icon name={copied ? 'check' : 'link'} />{copied ? t('inquiryCopied') : label}</button>
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

/** 공고에 답이 없는 내용을 기관에 그대로 보여 주거나 보낼 한국어 문장. 한국어를 못 읽어도 무엇을 묻는지 알 수 있게 합니다. */
function InquiryText({ program, message }: { program: Program; message: string }) {
  const { locale, t } = useI18n()
  const meaning = inquiryTopics(program).map((topic) => (topic === 'application' ? t('application') : topic === 'cost' ? t('cost') : topicLabel(locale, topic))).join(', ')
  return (
    <div className="inquiry-box">
      <p className="inquiry-box-title">{t('inquiryTitle')}</p>
      <p className="inquiry-box-text" lang="ko">{message}</p>
      {locale !== 'ko-easy' && <p className="inquiry-meaning">{t('inquiryMeaning', { items: meaning })}</p>}
      <CopyButton text={message} label={t('inquiryCopy')} />
    </div>
  )
}

/**
 * 물어보기: 기관에 보여 줄 문장 → 확인된 문의처(없으면 찾을 곳) → 원문 → AI 도우미.
 * 가장 쓸모 있는 것을 먼저 두고, 없는 것은 빈 칸으로 남기지 않습니다.
 */
function AskPanel({ program, onOpenChat }: { program: Program; onOpenChat?: () => void }) {
  const { t } = useI18n()
  const message = inquiryMessage(program)
  const hasSource = isSafeUrl(program.source_url)
  return (
    <div className="stack">
      {message && <InquiryText program={program} message={message} />}
      {program.inquiry_methods.length ? (
        <ul className="contacts">{program.inquiry_methods.map((method, index) => <Contact key={index} method={method} demo={program.is_demo} />)}</ul>
      ) : (
        <div className="empty-contact">
          <p className="empty-contact-title"><Marked>{t('noInquiry')}</Marked></p>
          {hasSource && <p>{t('noInquiryHint')}</p>}
        </div>
      )}
      {hasSource && (
        <div className="ask-source">
          <ExternalLink href={program.source_url!} demo={program.is_demo}>{t('sourceLink')}</ExternalLink>
        </div>
      )}
      {onOpenChat && agentAvailable && <AiEntry title={t('chatOpen')} onOpen={onOpenChat} />}
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
