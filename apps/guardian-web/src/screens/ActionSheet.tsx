import { useEffect, useId, useRef } from 'react'
import { useI18n } from '../i18n'
import type { InquiryMethod, Locale, Program } from '../data/types'
import { formatDate, isSafeUrl, languageName } from '../lib/format'
import { Icon, Marked } from '../components/bits'
import { ExternalLink, PhoneLink } from '../components/links'

export type ActionTab = 'apply' | 'ask'

interface Props {
  program: Program
  tab: ActionTab | null
  onTab: (tab: ActionTab) => void
  onClose: () => void
}

/** 상세 위에 여는 시트 하나. ‘신청하기’와 ‘물어보기’를 탭으로 오갑니다(명세 5.2: 신청과 문의는 다른 행동). */
export function ActionSheet({ program, tab, onTab, onClose }: Props) {
  const { locale, t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (tab && !dialog.open) dialog.showModal?.()
    if (!tab && dialog.open) dialog.close()
  }, [tab])

  const firstPhone = [...program.inquiry_methods, ...program.application_methods].find((method) => method.phone)?.phone

  return (
    <dialog ref={dialogRef} className="sheet" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="sheet-inner sheet-inner--auto">
        <div className="grab" aria-hidden="true" />
        <header className="sheet-head">
          <h2 id={titleId} className="visually-hidden">{tab === 'ask' ? t('askButton') : t('tabApply')}</h2>
          <div className="seg" role="tablist">
            <button type="button" role="tab" aria-selected={tab !== 'ask'} className="seg-btn" onClick={() => onTab('apply')}>{t('tabApply')}</button>
            <button type="button" role="tab" aria-selected={tab === 'ask'} className="seg-btn" onClick={() => onTab('ask')}>{t('askButton')}</button>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')}><Icon name="x" /></button>
        </header>
        <div className="sheet-body">
          {tab === 'ask' ? (
            <div className="stack">
              <div className="step-card">
                <p className="step-title"><span className="step-no">1</span>{t('askStep1')}</p>
                <p className="muted">{t('askStep1Body')}</p>
                {isSafeUrl(program.source_url) && <ExternalLink href={program.source_url} demo={program.is_demo}>{t('sourceLink')}</ExternalLink>}
              </div>
              <div className="step-card">
                <p className="step-title"><span className="step-no">2</span>{t('askStep2')}</p>
                {program.inquiry_methods.length ? (
                  <ul className="contacts">{program.inquiry_methods.map((method, index) => <Contact key={index} method={method} demo={program.is_demo} locale={locale} />)}</ul>
                ) : (
                  <div className="empty-contact">
                    <p className="empty-contact-title"><Marked>{t('noInquiry')}</Marked></p>
                    <p className="muted">{t('noInquiryHint')}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="stack">
              <p className="sheet-note">{t('applyResultNote')}</p>
              {program.application_status === 'open' && program.application_methods.length > 0 ? (
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
                  {isSafeUrl(program.source_url) && <li>{t('linkTroubleSource')}</li>}
                  {firstPhone ? <li>{t('linkTroublePhone', { phone: firstPhone })}</li> : !isSafeUrl(program.source_url) && <li>{t('linkTroubleNone')}</li>}
                </ol>
              </details>
            </div>
          )}
        </div>
      </div>
    </dialog>
  )
}

function Contact({ method, demo, locale }: { method: InquiryMethod; demo: boolean; locale: Locale }) {
  const { t } = useI18n()
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
