import { useEffect, useState } from 'react'
import { AdminError, approvePoster, loadProgram, posterUrl, removeAddendum, reviewProgram } from '../data/admin'
import type { Fact, PosterLanguage, ProgramDetail, SummaryLanguage } from '../data/admin'
import { useLanguage } from '../i18n'
import { ReviewChip, shortStamp } from './AdminParts'
import { Icon } from './icons'
import { ViewHeader } from './ViewHeader'

interface Props {
  programId: string
  reviewer: string
  onBack: () => void
  /** 저장해서 목록·배지를 다시 읽어야 할 때 */
  onChanged: () => void
  onQuestions: (id: string) => void
}

const LANGUAGE_KEYS = { 'ko-easy': 'easyKorean', vi: 'vietnamese', zh: 'chinese' } as const
const SUMMARY_KEYS = { approved: 'summaryApproved', machine_checked: 'summaryChecked', machine_draft: 'summaryDraft', withdrawn: 'summaryWithdrawn' } as const

/**
 * 공고 검수 화면: 왼쪽 원본(포스터·원문 글), 가운데 AI가 읽은 사실과 원문 근거, 오른쪽 번역 포스터와 검증 기록.
 * 아래 '검수 결정'에서 사람이 승인해야 보호자 화면에 게시됩니다 (npm run review와 같은 규칙).
 */
export function ProgramDetailView({ programId, reviewer, onBack, onChanged, onQuestions }: Props) {
  const { t } = useLanguage()
  const [detail, setDetail] = useState<ProgramDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [source, setSource] = useState<'poster' | 'text'>('poster')
  const [onlyCheck, setOnlyCheck] = useState(false)
  const [posterLanguage, setPosterLanguage] = useState<PosterLanguage>('vi')
  const [attempt, setAttempt] = useState<number | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string; details?: string[] } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    loadProgram(programId, controller.signal).then((next) => {
      if (controller.signal.aborted) return
      setDetail(next)
      if (!next.has_poster) setSource('text')
      if (next.poster_list.length && !next.poster_list.some((poster) => poster.language === 'vi')) setPosterLanguage(next.poster_list[0].language)
    }, () => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [programId])

  const run = async (action: () => Promise<ProgramDetail>, done: string) => {
    setBusy(true)
    setMessage(null)
    try {
      setDetail(await action())
      setMessage({ tone: 'ok', text: done })
      onChanged()
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof AdminError ? error.message : t('apiErrorTitle'), details: error instanceof AdminError ? error.details : [] })
    } finally {
      setBusy(false)
    }
  }

  const back = <button type="button" className="crumb" onClick={onBack}><Icon name="back" />{t('programsTab')}</button>
  if (!detail) {
    return <div className="view">
      <ViewHeader kicker={back} title={failed ? t('apiErrorTitle') : t('loading')} />
      {!failed && <div className="state" role="status"><span className="spinner" aria-hidden="true" /></div>}
    </div>
  }

  const facts = onlyCheck ? detail.facts.filter((fact) => fact.status === 'unverified') : detail.facts
  const verified = detail.facts.filter((fact) => fact.status === 'verified').length
  const stated = detail.facts.filter((fact) => fact.status !== 'not_stated').length
  const poster = detail.poster_list.find((item) => item.language === posterLanguage) ?? null

  return <div className="view detail">
    <ViewHeader
      kicker={back}
      title={<span lang="ko">{detail.title}</span>}
      lead={<>{detail.institution} · <span lang="ko">{detail.schedule}</span>{detail.is_demo && <> · <span className="demo-tag">{t('demoNotice')}</span></>}</>}
      action={<>
        <ReviewChip status={detail.review.status} />
        {detail.source_url && <a className="btn btn--quiet" href={detail.source_url} target="_blank" rel="noreferrer"><Icon name="external" />{t('sourceLink')}</a>}
      </>}
    />

    {message && <div className={`notice ${message.tone === 'ok' ? 'notice--ok' : 'notice--warn'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>
      <p className="notice-title">{message.text}</p>
      {message.details?.length ? <ul className="notice-body dot-list">{message.details.map((line) => <li key={line}>{line}</li>)}</ul> : null}
    </div>}

    <div className="review-grid">
      <section className="card pane" aria-labelledby="pane-source">
        <header className="pane-head">
          <h2 id="pane-source" className="pane-title">{t('paneSource')}</h2>
          <div className="seg seg--inline seg--small" role="tablist" aria-label={t('paneSource')}>
            <button type="button" role="tab" className="seg-btn" aria-selected={source === 'poster'} disabled={!detail.has_poster} onClick={() => setSource('poster')}>{t('sourcePoster')}</button>
            <button type="button" role="tab" className="seg-btn" aria-selected={source === 'text'} onClick={() => setSource('text')}>{t('sourceText')}</button>
          </div>
        </header>
        <div className="pane-body">
          {source === 'poster' && detail.has_poster
            ? <img className="poster-img" src={posterUrl(detail.program_id, 'original')} alt={t('posterOriginalAlt', { title: detail.title })} />
            : detail.source_text.length
              ? detail.source_text.map((entry) => <figure key={entry.file} className="source-text"><figcaption>{entry.file}</figcaption><pre lang="ko">{entry.text}</pre></figure>)
              : <p className="muted">{t('noSourceText')}</p>}
          <p className="muted">{t('retrievedAt', { date: detail.retrieved_at ?? '-' })}</p>
        </div>
      </section>

      <section className="card pane pane--facts" aria-labelledby="pane-facts">
        <header className="pane-head">
          <h2 id="pane-facts" className="pane-title"><Icon name="sparkle" />{t('paneFacts')}</h2>
          <label className="toggle"><input type="checkbox" checked={onlyCheck} onChange={(event) => setOnlyCheck(event.target.checked)} />{t('onlyUnverified')}</label>
        </header>
        <div className="pane-body">
          <p className="pane-lead">{t('factsLead', { n: stated, m: verified })}</p>
          {detail.unverified_labels.length > 0 && <div className="notice notice--mark" role="note"><p className="notice-title">{t('unverifiedNotice', { labels: detail.unverified_labels.join(', ') })}</p></div>}
          <ul className="fact-list">{facts.map((fact, index) => <FactRow key={`${fact.label}-${index}`} fact={fact} />)}</ul>
          {detail.warning_list.length > 0 && <details className="fold">
            <summary><span>{t('extractWarnings')}</span><small>{detail.warning_list.length}</small></summary>
            <ul className="fold-body dot-list" lang="ko">{detail.warning_list.map((line) => <li key={line}>{line}</li>)}</ul>
          </details>}

          <h3 className="pane-sub">{t('toConfirmTitle')}</h3>
          {detail.to_confirm_items.length
            ? <ul className="dot-list" lang="ko">{detail.to_confirm_items.map((item) => <li key={item}>{item}</li>)}</ul>
            : <p className="muted">{t('toConfirmNone')}</p>}
          <button type="button" className="link-btn link-btn--start" onClick={() => onQuestions(detail.program_id)}><Icon name="questions" />{t('openQuestions')}</button>

          {detail.addenda.length > 0 && <>
            <h3 className="pane-sub">{t('addendaTitle')}</h3>
            <ul className="addenda">{detail.addenda.map((addendum) => <li key={addendum.id}>
              <p lang="ko">{addendum.text}</p>
              <small>{addendum.author} · {shortStamp(addendum.added_at)}{addendum.drafted_by_ai && <> · {t('draftedByAi')}</>}</small>
              <button type="button" className="link-btn" disabled={busy} onClick={() => run(() => removeAddendum(detail.program_id, addendum.id), t('addendumRemoved'))}>{t('remove')}</button>
            </li>)}</ul>
          </>}

          <h3 className="pane-sub">{t('summariesTitle')}</h3>
          {detail.summary_list.length ? <div className="summary-list">{detail.summary_list.map((summary) => <article key={summary.language} className="summary-card">
            <header><strong>{t(LANGUAGE_KEYS[summary.language])}</strong><span className={`lang-chip lang-chip--${summary.state}`}>{t(SUMMARY_KEYS[summary.state])}</span></header>
            {summary.heading && <p className="summary-heading" lang={summary.language === 'ko-easy' ? 'ko' : summary.language}>{summary.heading.title}</p>}
            <ol lang={summary.language === 'ko-easy' ? 'ko' : summary.language}>{summary.lines.map((line) => <li key={line}>{line}</li>)}</ol>
            {summary.issues.length > 0 && <ul className="summary-issues" lang="ko">{summary.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
          </article>)}</div> : <p className="muted">{t('noSummaries')}</p>}
        </div>
      </section>

      <section className="card pane" aria-labelledby="pane-poster">
        <header className="pane-head">
          <h2 id="pane-poster" className="pane-title"><Icon name="image" />{t('panePoster')}</h2>
          {detail.poster_list.length > 0 && <div className="seg seg--inline seg--small" role="tablist" aria-label={t('panePoster')}>
            {detail.poster_list.map((item) => <button key={item.language} type="button" role="tab" className="seg-btn" aria-selected={posterLanguage === item.language} onClick={() => { setPosterLanguage(item.language); setAttempt(null) }}>{t(LANGUAGE_KEYS[item.language])}</button>)}
          </div>}
        </header>
        <div className="pane-body">
          {!poster ? <p className="muted">{detail.has_poster ? t('noTranslatedPoster') : t('noPosterAtAll')}</p> : <>
            <img className="poster-img" src={posterUrl(detail.program_id, poster.language, attempt ?? undefined)} alt={t('posterTranslatedAlt', { title: detail.title, language: t(LANGUAGE_KEYS[poster.language]) })} />
            {attempt !== null && <p className="muted">{t('viewingAttempt', { n: attempt })} <button type="button" className="link-btn" onClick={() => setAttempt(null)}>{t('viewFinal')}</button></p>}
            <p className={`poster-state poster-state--${poster.status}`}>
              <Icon name={poster.status === 'failed' ? 'alert' : 'check'} />
              {poster.status === 'approved' ? t('posterApprovedBy', { name: poster.reviewer ?? '-', date: shortStamp(poster.approved_at) })
                : poster.status === 'failed' ? t('posterFailedLong') : t('posterCheckedLong', { n: poster.chosen_attempt ?? 0 })}
            </p>
            <ol className="timeline">
              <li className="timeline-step timeline-step--ok"><span>{t('stepTable', { n: poster.segments })}</span></li>
              {poster.attempt_list.map((item) => <li key={item.n} className={`timeline-step ${item.passed ? 'timeline-step--ok' : 'timeline-step--fail'}`}>
                <span>
                  <button type="button" className="link-btn link-btn--inline" onClick={() => setAttempt(item.n)}>{t('attemptN', { n: item.n })}</button>
                  {item.passed ? t('attemptPassed') : t('attemptIssues', { n: item.issues.length })}
                  {poster.chosen_attempt === item.n && <strong className="chosen"> · {t('attemptChosen')}</strong>}
                </span>
                {item.issues.length > 0 && <ul lang="ko">{item.issues.map((issue) => <li key={issue.message}>{issue.message}</li>)}</ul>}
              </li>)}
              {poster.qr && <li className={`timeline-step ${poster.qr.matches ? 'timeline-step--ok' : 'timeline-step--fail'}`}><span>{poster.qr.matches ? t('qrMatches') : t('qrMismatch')}</span></li>}
            </ol>
            {poster.injected_fault && <p className="muted">{t('injectedFault', { fault: poster.injected_fault })}</p>}
            {poster.source_changed && <div className="notice notice--warn" role="note"><p className="notice-title">{t('posterSourceChanged')}</p></div>}
            <button
              type="button"
              className="btn btn--secondary btn--block"
              disabled={busy || poster.status === 'approved' || poster.chosen_attempt === null || poster.source_changed || !reviewer.trim()}
              onClick={() => run(() => approvePoster(detail.program_id, poster.language, reviewer.trim()), t('posterApprovedDone'))}
            >{poster.status === 'approved' ? t('posterApproved') : t('approvePoster')}</button>
            {!reviewer.trim() && poster.status !== 'approved' && <p className="muted">{t('needReviewer')}</p>}
          </>}
        </div>
      </section>
    </div>

    <ReviewDecision detail={detail} reviewer={reviewer} busy={busy} run={run} />
  </div>
}

function FactRow({ fact }: { fact: Fact }) {
  const { t } = useLanguage()
  const icon = fact.status === 'verified' ? <Icon name="check" /> : fact.status === 'unverified' ? <Icon name="alert" /> : <span aria-hidden="true">–</span>
  const label = fact.status === 'verified' ? t('factVerified') : fact.status === 'unverified' ? t('factUnverified') : t('factNotStated')
  return <li className={`fact fact--${fact.status}`}>
    <span className="fact-icon" title={label}>{icon}<span className="visually-hidden">{label}</span></span>
    <div className="fact-main">
      <span className="fact-label">{fact.label}</span>
      <span className={fact.status === 'unverified' ? 'fact-value marked' : 'fact-value'} lang="ko">{fact.value}</span>
      {fact.quotes.length > 0 && <q className="fact-quote" lang="ko" title={fact.quotes.join('\n')}>{fact.quotes[0]}</q>}
    </div>
  </li>
}

interface DecisionProps {
  detail: ProgramDetail
  reviewer: string
  busy: boolean
  run: (action: () => Promise<ProgramDetail>, done: string) => Promise<void>
}

/** 검수 결정: 승인(언어별 요약 함께), 반려(사유 필요), 검수 대기로 되돌리기 */
function ReviewDecision({ detail, reviewer, busy, run }: DecisionProps) {
  const { t } = useLanguage()
  const ready = detail.summary_list.filter((summary) => summary.state === 'machine_checked' || summary.state === 'approved').map((summary) => summary.language)
  // 검수자 칸은 직접 고치기 전까지 왼쪽 아래 담당자 이름을 따라갑니다
  const [ownName, setOwnName] = useState<string | null>(null)
  const name = ownName ?? reviewer
  const [languages, setLanguages] = useState<SummaryLanguage[]>(ready.filter((language) => language === 'ko-easy'))
  const [languageReviewer, setLanguageReviewer] = useState('')
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const needsLanguageReviewer = languages.some((language) => language !== 'ko-easy')
  const blocked = detail.unverified_labels.length > 0 && !confirmed
  const canApprove = name.trim() !== '' && !blocked && (!needsLanguageReviewer || languageReviewer.trim() !== '')
  const toggle = (language: SummaryLanguage) => setLanguages(languages.includes(language) ? languages.filter((item) => item !== language) : [...languages, language])

  return <section className="card decision" aria-labelledby="decision-title">
    <header className="pane-head">
      <h2 id="decision-title" className="pane-title">{t('decisionTitle')}</h2>
      <p className="muted">{detail.review.reviewer ? t('lastReview', { name: detail.review.reviewer, date: shortStamp(detail.review.reviewed_at) }) : t('notReviewedYet')}</p>
    </header>
    <div className="decision-grid">
      <label className="field-inline"><span>{t('reviewerName')}</span><input className="input" value={name} maxLength={40} onChange={(event) => setOwnName(event.target.value)} /></label>
      <fieldset className="field-inline">
        <legend>{t('approveSummaries')}</legend>
        <div className="chips">{(['ko-easy', 'vi', 'zh'] as SummaryLanguage[]).map((language) => <label key={language} className={`check-chip${ready.includes(language) ? '' : ' is-disabled'}`}>
          <input type="checkbox" disabled={!ready.includes(language)} checked={languages.includes(language)} onChange={() => toggle(language)} />{t(LANGUAGE_KEYS[language])}
        </label>)}</div>
      </fieldset>
      <label className="field-inline"><span>{t('languageReviewer')}</span><input className="input" value={languageReviewer} maxLength={40} disabled={!needsLanguageReviewer} placeholder={needsLanguageReviewer ? t('languageReviewerHint') : ''} onChange={(event) => setLanguageReviewer(event.target.value)} /></label>
      <label className="field-inline field-inline--wide"><span>{t('reviewNote')}</span><input className="input" value={note} maxLength={300} placeholder={t('reviewNoteHint')} onChange={(event) => setNote(event.target.value)} /></label>
    </div>
    {detail.unverified_labels.length > 0 && <label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{t('confirmUnverified', { n: detail.unverified_labels.length })}</label>}
    <div className="decision-actions">
      {detail.review.status !== 'pending' && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => run(() => reviewProgram(detail.program_id, { action: 'reset' }), t('resetDone'))}>{t('resetReview')}</button>}
      <button type="button" className="btn btn--outline" disabled={busy || !name.trim() || !note.trim()} title={note.trim() ? undefined : t('rejectNeedsNote')} onClick={() => run(() => reviewProgram(detail.program_id, { action: 'reject', reviewer: name.trim(), note: note.trim() }), t('rejectDone'))}>{t('reject')}</button>
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy || !canApprove}
        onClick={() => run(() => reviewProgram(detail.program_id, { action: 'approve', reviewer: name.trim(), summaries: languages, language_reviewer: languageReviewer.trim() || undefined, note: note.trim() || undefined, force: confirmed }), t('approveDone'))}
      ><Icon name="check" />{t('approve')}</button>
    </div>
  </section>
}
