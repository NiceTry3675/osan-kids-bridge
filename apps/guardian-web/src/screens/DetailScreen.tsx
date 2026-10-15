import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { getProgram, MissingApiError } from '../data/api'
import type { CompanionRule, Locale, MatchStatus, Program, SearchFilters } from '../data/types'
import {
  formatCost, formatDate, formatSessionPlace, formatSessionWhen, formatStatus, isSafeUrl,
  languageName, placesDiffer, programText, screenLanguageName, topicLabel,
} from '../lib/format'
import { backToList, navigate } from '../lib/router'
import { INTEREST_VISUAL } from '../lib/visual'
import { Icon, Marked, Notice, StatePanel, StatusTag } from '../components/bits'
import { ActionSheet } from './ActionSheet'
import type { ActionTab } from './ActionSheet'
import { ExternalLink } from '../components/links'

type Load = { status: 'loading' } | { status: 'error'; missingApi: boolean } | { status: 'missing' } | { status: 'ready'; program: Program }

interface Props {
  id: string
  /** 목록에서 들어왔을 때만 조건을 넘깁니다. 공유 링크로 바로 열면 null. */
  filters: SearchFilters | null
}

export function DetailScreen({ id, filters }: Props) {
  const { locale, t } = useI18n()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const filterKey = JSON.stringify(filters)

  useEffect(() => {
    const controller = new AbortController()
    setLoad((previous) => (previous.status === 'ready' && previous.program.program_id === id ? previous : { status: 'loading' }))
    getProgram(id, filters, locale, controller.signal)
      .then((program) => setLoad(program ? { status: 'ready', program } : { status: 'missing' }))
      .catch((error: unknown) => { if (!controller.signal.aborted) setLoad({ status: 'error', missingApi: error instanceof MissingApiError }) })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, filterKey, locale, attempt])

  return (
    <main className="page page--detail" id="main">
      <div className="bar-top">
        <button type="button" className="btn btn--quiet btn--back" onClick={backToList}><Icon name="back" />{t('back')}</button>
        {load.status === 'ready' && <CopyLink />}
      </div>
      {load.status === 'loading' && <StatePanel busy title={t('loading')} />}
      {load.status === 'error' && (load.missingApi
        ? <StatePanel title={t('missingApi')} hint={t('missingApiHint')} />
        : <StatePanel title={t('loadError')} hint={t('loadErrorHint')} action={<button type="button" className="btn btn--secondary" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</button>} />)}
      {load.status === 'missing' && <StatePanel title={t('missingTitle')} hint={t('missingHint')} action={<button type="button" className="btn btn--primary" onClick={() => navigate('/')}>{t('browseOthers')}</button>} />}
      {load.status === 'ready' && <Detail program={load.program} compared={filters !== null} />}
    </main>
  )
}

function CopyLink() {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2400) } catch { /* 주소창에서 복사할 수 있음 */ }
  }
  return (
    <button type="button" className="btn btn--quiet" onClick={copy} aria-live="polite">
      <Icon name={copied ? 'check' : 'link'} />{copied ? t('linkCopied') : t('copyLink')}
    </button>
  )
}

function Detail({ program, compared }: { program: Program; compared: boolean }) {
  const { locale, t } = useI18n()
  const [sheet, setSheet] = useState<ActionTab | null>(null)
  const text = programText(program, locale)
  const languageNameNow = screenLanguageName(locale)
  const original = text.reviewed ? undefined : 'ko'
  const visual = INTEREST_VISUAL[program.category]
  const inquiryInLocale = program.inquiry_methods.some((method) => method.languages?.includes(locale)) || !!program.support_languages?.includes(locale)
  const canApply = program.application_status === 'open' && program.application_methods.length > 0

  return (
    <article className="detail">
      {program.review_state === 'recheck' && <Notice tone="warn" title={t('recheckTitle')}>{t('recheckBody')}</Notice>}
      {text.missingTranslation && (
        <Notice tone="mark" title={t('noSummaryTitle', { language: languageNameNow })}>
          <p>{t('noSummaryBody', { language: languageNameNow })}</p>
          <p>{inquiryInLocale ? t('noSummaryAlt', { language: languageNameNow }) : t('noSummaryNoAlt', { language: languageNameNow })}</p>
        </Notice>
      )}

      <header className="detail-head">
        <span className={`detail-art tone-${visual.tone}`} aria-hidden="true">{visual.emoji}</span>
        <StatusTag status={program.application_status}>{formatStatus(program, locale)}</StatusTag>
        <h1 className="detail-title" lang={original}>{text.title}{text.missingTranslation && <span className="tag-original">{t('originalTag')}</span>}</h1>
        <p className="detail-org" lang={original}>{text.institution}</p>
        <p className="detail-meta">
          {program.verified_at && <span>{t('verifiedAt', { date: formatDate(program.verified_at, locale) })}</span>}
          {isSafeUrl(program.source_url) && <ExternalLink href={program.source_url} demo={program.is_demo}>{t('sourceLink')}</ExternalLink>}
        </p>
        {text.reviewed && locale !== 'ko-easy' && <p className="reviewed-line"><Icon name="check" />{t('reviewedSummary', { language: languageNameNow })}</p>}
      </header>

      <FactSheet program={program} targetText={text.target} targetLang={original} />
      <StatusNote program={program} />
      {(program.uncertain_items.length > 0 || program.time_match_status === 'unknown' || program.age_grade_match_status === 'unknown') && <ToCheck program={program} />}

      <Section title={t('compareTitle')}>
        {compared ? (
          <dl className="rows">
            <Row label={t('rowAgeGrade')}><Judge status={program.age_grade_match_status} /></Row>
            <Row label={t('rowEligibility')}>{program.eligibility_status === 'matched' ? t('eligibilityConfirmed') : <Judge status={program.eligibility_status} />}</Row>
            <Row label={t('rowTime')}><Judge status={program.time_match_status} /></Row>
          </dl>
        ) : <p className="muted">{t('directLinkNote')}</p>}
      </Section>

      <Section title={t('description')}>
        {text.missingTranslation ? (
          <details className="original">
            <summary>{t('showOriginal')}</summary>
            <p lang="ko">{program.description}</p>
          </details>
        ) : <p className="prose" lang={original}>{text.description}</p>}
      </Section>

      <Sessions program={program} />

      <Section title={t('participationTitle')}>
        <dl className="rows">
          <Row label={t('rowGuardian')}><Companion rule={program.guardian_companion} /></Row>
          <Row label={t('rowSibling')}><Companion rule={program.sibling_companion} /></Row>
          <Row label={t('rowKoreanLevel')}>{program.korean_level_required ? <span lang="ko">{program.korean_level_required}</span> : <Marked>{t('notInNotice')}</Marked>}</Row>
        </dl>
      </Section>

      <Section title={t('languageTitle')}>
        <dl className="rows">
          <Row label={t('rowScreenLanguage')}>{t('screenLanguageValue', { language: languageNameNow })}</Row>
          <Row label={t('rowSupportLanguage')}><LanguageList codes={program.support_languages} locale={locale} /></Row>
          <Row label={t('rowApplicationLanguage')}><LanguageList codes={program.application_languages} locale={locale} /></Row>
        </dl>
        <p className="muted">{t('languageSeparateNote')}</p>
      </Section>

      <div className="action-bar">
        <button type="button" className="btn btn--secondary btn--lg" onClick={() => setSheet('ask')}><Icon name="chat" />{t('askButton')}</button>
        {canApply
          ? <button type="button" className="btn btn--primary btn--lg" onClick={() => setSheet('apply')}>{t('applyButton')}</button>
          : program.application_status === 'closed'
            ? <button type="button" className="btn btn--primary btn--lg" onClick={() => navigate('/')}>{t('browseOthers')}</button>
            : <button type="button" className="btn btn--primary btn--lg" onClick={() => setSheet('apply')}>{t('seeOriginalHowTo')}</button>}
      </div>
      <ActionSheet program={program} tab={sheet} onTab={setSheet} onClose={() => setSheet(null)} />
    </article>
  )
}

function FactSheet({ program, targetText, targetLang }: { program: Program; targetText: string; targetLang?: string }) {
  const { locale, t } = useI18n()
  const session = program.next_session
  const targetType = { multicultural_family: t('targetMulticultural'), all: t('targetAll'), parent_only: t('targetParent'), unknown: t('targetUnknown') }[program.target_type]
  return (
    <dl className="facts">
      <div className="fact-row">
        <dt>{t('target')}</dt>
        <dd><span lang={targetLang}>{targetText}</span><span className="fact-sub">{program.target_type === 'unknown' ? <Marked>{targetType}</Marked> : targetType}</span></dd>
      </div>
      <div className="fact-row">
        <dt>{program.time_match_status === 'matched' ? t('matchedSession') : t('representative')}</dt>
        <dd>{session?.date ? formatSessionWhen(session, locale) : <Marked>{t('scheduleUnknown')}</Marked>}</dd>
      </div>
      <div className="fact-row">
        <dt>{t('place')}</dt>
        <dd><span lang="ko">{formatSessionPlace(session, locale)}</span>{placesDiffer(program) && <span className="fact-sub">{t('placesDiffer')}</span>}</dd>
      </div>
      <div className="fact-row">
        <dt>{t('cost')}</dt>
        <dd>{program.cost_krw === null ? <Marked>{formatCost(program, locale)}</Marked> : formatCost(program, locale)}</dd>
      </div>
      <div className="fact-row">
        <dt>{t('application')}</dt>
        <dd>
          <StatusTag status={program.application_status}>{formatStatus(program, locale)}</StatusTag>
          {program.application_status === 'open' && program.application_end && <span className="fact-sub">{t('applyUntil', { date: formatDate(program.application_end, locale) })}</span>}
        </dd>
      </div>
    </dl>
  )
}

/** 신청 중이 아닐 때 다음 행동을 글로 알려 줍니다. */
function StatusNote({ program }: { program: Program }) {
  const { locale, t } = useI18n()
  if (program.application_status === 'open') return null
  const text = program.application_status === 'upcoming' && program.application_start
    ? t('upcomingAction', { date: formatDate(program.application_start, locale) })
    : program.application_status === 'closed' ? t('closedAction') : t('unknownAction')
  return <Notice tone={program.application_status === 'unknown' ? 'mark' : 'info'} title={text} />
}

function ToCheck({ program }: { program: Program }) {
  const { locale, t } = useI18n()
  const items = [...program.uncertain_items]
  if (program.time_match_status === 'unknown' && !items.some((item) => item.topic === 'schedule')) items.unshift({ topic: 'schedule', note_ko: null })
  if (program.age_grade_match_status === 'unknown' && !items.some((item) => item.topic === 'age_grade')) items.unshift({ topic: 'age_grade', note_ko: null })
  return (
    <section className="check-card">
      <h2 className="block-title">{t('toCheck')}</h2>
      <ul className="checks">
        {items.map((item, index) => (
          <li key={`${item.topic}-${index}`}>
            <Marked>{topicLabel(locale, item.topic)}</Marked>
            {item.note_ko && <span className="check-quote">{t('sourceSays', { text: item.note_ko })}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Sessions({ program }: { program: Program }) {
  const { locale, t } = useI18n()
  const rule = { all_sessions: t('attendAll'), choose_one: t('chooseOne'), unknown: t('attendanceUnknown') }[program.attendance_rule]
  return (
    <Section title={t('sessionsTitle')}>
      <p>{program.attendance_rule === 'unknown' ? <Marked>{rule}</Marked> : rule}</p>
      <ol className="sessions">
        {program.sessions.map((session) => (
          <li key={session.id} className={program.matched_sessions.includes(session.id) ? 'session is-matched' : 'session'}>
            <span className="session-when">{formatSessionWhen(session, locale)}</span>
            <span className="session-where" lang="ko">{formatSessionPlace(session, locale)}</span>
            {program.matched_sessions.includes(session.id) && <span className="session-flag"><Icon name="check" />{t('sessionMatched')}</span>}
          </li>
        ))}
      </ol>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="block"><h2 className="block-title">{title}</h2>{children}</section>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="row"><dt>{label}</dt><dd>{children}</dd></div>
}

function Judge({ status }: { status: MatchStatus }) {
  const { t } = useI18n()
  const label = { matched: t('judgeMatched'), not_matched: t('judgeNotMatched'), unknown: t('judgeUnknown'), not_applied: t('judgeNotApplied') }[status]
  return status === 'unknown' ? <Marked>{label}</Marked> : <span className={`judge judge--${status}`}>{label}</span>
}

function Companion({ rule }: { rule: CompanionRule }) {
  const { t } = useI18n()
  if (rule === null) return <Marked>{t('notInNotice')}</Marked>
  return <>{{ required: t('companionRequired'), allowed: t('companionAllowed'), not_allowed: t('companionNotAllowed') }[rule]}</>
}

function LanguageList({ codes, locale }: { codes: string[] | null; locale: Locale }) {
  const { t } = useI18n()
  if (codes === null) return <Marked>{t('languageUnknown')}</Marked>
  if (!codes.length) return <>{t('languageNone')}</>
  return <>{codes.map((code) => languageName(locale, code)).join(', ')}</>
}
