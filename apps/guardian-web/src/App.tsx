import { useEffect, useState } from 'react'
import { getProgram, searchPrograms, usingDemoData } from './api'
import { filterChips, formatDate, formatSession, formatWindow, interestLabel, validateWindow, weekdayLabel, weekdays } from './format'
import { LanguageSwitcher, useLanguage, translate } from './language'
import type { Locale } from './language'
import { clearSearchSession, readSearchSession, saveSearchSession } from './searchSession'
import { emptyFilters } from './types'
import type { AvailableWindow, Interest, Program, SearchFilters, SearchResponse, Weekday } from './types'

type View = 'browse' | 'filter' | 'results' | 'detail'
type WindowMode = 'weekday' | 'date'

const interests: Interest[] = ['experience_culture', 'korean_study', 'sports_arts', 'career']
const dongOptions = ['중앙동', '대원동', '신장동', '세마동', '초평동', '남촌동']

function routeProgramId(): string | null {
  const match = window.location.pathname.match(/^\/programs\/([^/]+)\/?$/)
  return match ? decodeURIComponent(match[1]) : null
}

function statusLabel(program: Program, locale: Locale): string {
  switch (program.application_status) {
    case 'open': return translate(locale, 'open')
    case 'upcoming': return program.application_start ? translate(locale, 'upcomingFrom', { date: formatDate(program.application_start, locale) }) : translate(locale, 'upcoming')
    case 'closed': return translate(locale, 'closed')
    case 'unknown': return translate(locale, 'applicationUnknown')
  }
}

function placeLabel(program: Program, locale: Locale): string {
  const session = program.next_session
  if (!session) return translate(locale, 'placeUnknown')
  if (session.online) return translate(locale, 'online')
  return session.place_name ?? translate(locale, 'placeUnknown')
}

function costLabel(program: Program, locale: Locale): string {
  return program.cost_krw === null ? translate(locale, 'costUnknown') : program.cost_krw === 0 ? translate(locale, 'free') : translate(locale, 'won', { amount: program.cost_krw.toLocaleString(locale === 'vi' ? 'vi-VN' : locale === 'zh' ? 'zh-CN' : 'ko-KR') })
}

function isSafeUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (value.includes(':') && value.indexOf(':') === 1 && digits.length <= 3) {
    return `0${digits.slice(0, 1)}:${digits.slice(1)}`
  }
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

function ProgramCard({ program, onOpen }: { program: Program; onOpen: (id: string) => void }) {
  const { locale, t } = useLanguage()
  const checks = [
    program.time_match_status === 'unknown' && t('askSchedule'),
    program.age_grade_match_status === 'unknown' && t('askAge'),
    program.eligibility_status === 'unknown' && t('askEligibility'),
  ].filter(Boolean) as string[]
  return (
    <button className="program-card" type="button" onClick={() => onOpen(program.program_id)} aria-label={t('openDetail', { title: program.title })}>
      <span className="card-body">
        <span className="card-topline"><span className="card-category">{interestLabel(locale, program.category)}</span><span className={`status-text status-${program.application_status}`}>{statusLabel(program, locale)}</span></span>
        <strong className="card-title">{program.title}</strong>
        <span className="card-institution">{program.institution}</span>
        <span className="card-info"><span className="meta-label">{program.time_match_status === 'matched' ? t('matchedSession') : t('schedule')}</span><span>{formatSession(program.next_session, locale)}</span></span>
        <span className="card-info"><span className="meta-label">{t('place')}</span><span>{placeLabel(program, locale)}</span></span>
        <span className="card-info"><span className="meta-label">{t('targetOriginal')}</span><span>{program.target_raw}</span></span>
        <span className="card-info"><span className="meta-label">{t('cost')}</span><span>{costLabel(program, locale)}</span></span>
        {program.age_grade_match_status === 'matched' && <span className="card-match">{t('ageMatched')}</span>}
        {checks.length > 0 && <span className="card-check">{t('checks', { items: checks.join(' · ') })}</span>}
      </span>
      <span className="card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

function Loading({ label }: { label?: string }) {
  const { t } = useLanguage()
  return <div className="state-panel" role="status"><span className="spinner" aria-hidden="true" /><p>{label ?? t('loadingPrograms')}</p></div>
}

function ErrorPanel({ onRetry, title }: { onRetry: () => void; title?: string }) {
  const { t } = useLanguage()
  return <div className="state-panel"><div className="state-icon">!</div><h2>{title ?? t('errorList')}</h2><p>{t('retryHint')}</p><button className="button secondary" type="button" onClick={onRetry}>{t('retry')}</button></div>
}

interface FilterWizardProps {
  draft: SearchFilters
  setDraft: (filters: SearchFilters) => void
  onClose: () => void
  onApply: () => void
}

function FilterWizard({ draft, setDraft, onClose, onApply }: FilterWizardProps) {
  const { locale, t } = useLanguage()
  const [step, setStep] = useState(1)
  const [windowMode, setWindowMode] = useState<WindowMode>('weekday')
  const [weekday, setWeekday] = useState<Weekday>('sat')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [windowError, setWindowError] = useState('')
  const [editingWindowIndex, setEditingWindowIndex] = useState<number | null>(null)
  const [childMode, setChildMode] = useState<'grade' | 'age'>(draft.child_age ? 'age' : 'grade')
  const [childAgeText, setChildAgeText] = useState(draft.child_age ? String(draft.child_age) : '')
  const [childError, setChildError] = useState('')

  const updateChildAge = (value: string) => {
    setChildAgeText(value)
    const age = Number(value)
    setChildError(value && (!Number.isInteger(age) || age < 1 || age > 18) ? t('ageError') : '')
    setDraft({ ...draft, child_age: value && Number.isInteger(age) && age >= 1 && age <= 18 ? age : undefined, child_grade: undefined })
  }

  const addWindow = () => {
    const window: AvailableWindow = windowMode === 'weekday'
      ? { day_of_week: weekday, start_time: start, end_time: end }
      : { date, start_time: start, end_time: end }
    const error = validateWindow(window, locale)
    if (error) { setWindowError(error); return false }
    if (draft.available_windows.some((existing, index) => index !== editingWindowIndex && JSON.stringify(existing) === JSON.stringify(window))) {
      setWindowError(t('duplicateTime')); return false
    }
    const windows = [...draft.available_windows]
    if (editingWindowIndex === null) windows.push(window)
    else windows[editingWindowIndex] = window
    setDraft({ ...draft, available_windows: windows })
    setEditingWindowIndex(null)
    setWindowError('')
    setStart('')
    setEnd('')
    return true
  }

  const editWindow = (window: AvailableWindow, index: number) => {
    setEditingWindowIndex(index)
    if ('date' in window) { setWindowMode('date'); setDate(window.date) }
    else { setWindowMode('weekday'); setWeekday(window.day_of_week) }
    setStart(window.start_time)
    setEnd(window.end_time)
    setWindowError('')
  }

  const deleteWindow = (index: number) => {
    setDraft({ ...draft, available_windows: draft.available_windows.filter((_, itemIndex) => itemIndex !== index) })
    if (editingWindowIndex === index) { setEditingWindowIndex(null); setStart(''); setEnd('') }
    else if (editingWindowIndex !== null && editingWindowIndex > index) setEditingWindowIndex(editingWindowIndex - 1)
  }

  const goNext = () => {
    if (step === 1 && childError) return
    if (step === 2 && (start || end || (windowMode === 'date' && date)) && !addWindow()) return
    if (step === 3) onApply()
    else setStep(step + 1)
  }

  const skipStep = () => {
    if (step === 1) {
      setDraft({ ...draft, child_age: undefined, child_grade: undefined })
      setChildAgeText('')
      setChildError('')
    } else if (step === 2) {
      setDraft({ ...draft, available_windows: [] })
      setEditingWindowIndex(null)
      setStart('')
      setEnd('')
      setWindowError('')
    }
    setStep(step + 1)
  }

  return (
    <div className="app-shell wizard-shell">
      <LanguageSwitcher />
      <header className="topbar"><button className="icon-button" type="button" onClick={step === 1 ? onClose : () => setStep(step - 1)} aria-label={t('back')}>‹</button><div className="progress" aria-label={t('stepCount', { step })}><span className={step >= 1 ? 'active' : ''} /><span className={step >= 2 ? 'active' : ''} /><span className={step >= 3 ? 'active' : ''} /></div><span className="step-count">{step}/3</span></header>
      <main className="wizard-content">
        {step === 1 && <>
          <div className="eyebrow">{t('childStepEyebrow')}</div>
          <h1>{t('childStepTitle')}</h1>
          <div className="segment" role="group" aria-label={t('childModeGroup')}><button type="button" className={childMode === 'grade' ? 'selected' : ''} onClick={() => { setChildMode('grade'); setChildAgeText(''); setChildError(''); setDraft({ ...draft, child_age: undefined }) }}>{t('grade')}</button><button type="button" className={childMode === 'age' ? 'selected' : ''} onClick={() => { setChildMode('age'); setChildError(''); setDraft({ ...draft, child_grade: undefined }) }}>{t('age')}</button></div>
          {childMode === 'grade' ? <div className="choice-grid grade-grid">{[1, 2, 3, 4, 5, 6].map((grade) => <button className={draft.child_grade === grade ? 'choice selected' : 'choice'} type="button" key={grade} onClick={() => setDraft({ ...draft, child_grade: grade, child_age: undefined })}>{t('gradeOption', { grade })}</button>)}</div>
            : <label className="field-label">{t('ageInput')} <span className="field-hint">{t('ageHint')}</span><input className="text-input" type="number" min="1" max="18" inputMode="numeric" value={childAgeText} placeholder={t('agePlaceholder')} aria-invalid={!!childError} aria-describedby={childError ? 'child-age-error' : undefined} onChange={(event) => updateChildAge(event.target.value)} /></label>}
          {childError && <p id="child-age-error" className="field-error" role="alert">{childError}</p>}
          {(draft.child_grade || draft.child_age || childAgeText) && <button className="text-button" type="button" onClick={() => { setChildAgeText(''); setChildError(''); setDraft({ ...draft, child_grade: undefined, child_age: undefined }) }}>{t('clearChild')}</button>}
        </>}
        {step === 2 && <>
          <div className="eyebrow">{draft.child_grade ? t('gradeOption', { grade: draft.child_grade }) : draft.child_age ? t('ageOption', { age: draft.child_age }) : t('noChild')}</div>
          <h1>{t('timeStepTitle')}</h1>
          <div className="segment" role="group" aria-label={t('timeModeGroup')}><button type="button" className={windowMode === 'weekday' ? 'selected' : ''} onClick={() => { setWindowMode('weekday'); setWindowError('') }}>{t('weekdayMode')}</button><button type="button" className={windowMode === 'date' ? 'selected' : ''} onClick={() => { setWindowMode('date'); setWindowError('') }}>{t('dateMode')}</button></div>
          {windowMode === 'weekday' ? <div className="weekday-grid" role="group" aria-label={t('weekdayGroup')}>{weekdays.map(({ value }) => <button className={weekday === value ? 'day selected' : 'day'} type="button" key={value} onClick={() => setWeekday(value)} aria-pressed={weekday === value}>{weekdayLabel(locale, value)}</button>)}</div> : <label className="field-label">{t('dateInput')}<input className="text-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>}
          <div className="time-range"><label className="field-label">{t('start')}<input className="text-input" type="text" inputMode="numeric" maxLength={5} placeholder="10:05" value={start} aria-invalid={!!windowError} onChange={(event) => { setStart(formatTimeInput(event.target.value)); setWindowError('') }} /></label><span aria-hidden="true">~</span><label className="field-label">{t('end')}<input className="text-input" type="text" inputMode="numeric" maxLength={5} placeholder="12:10" value={end} aria-invalid={!!windowError} onChange={(event) => { setEnd(formatTimeInput(event.target.value)); setWindowError('') }} /></label></div>
          {windowError && <p className="field-error" role="alert">{windowError}</p>}
          <button className="add-window" type="button" onClick={addWindow}>{editingWindowIndex === null ? `+ ${t('addTime')}` : t('finishTimeEdit')}</button>
          {draft.available_windows.length > 0 && <div className="added-windows"><h2>{t('addedTimes')}</h2>{draft.available_windows.map((window, index) => <div className={editingWindowIndex === index ? 'window-row editing' : 'window-row'} key={`${formatWindow(window, locale)}-${index}`}><span>{formatWindow(window, locale)}</span><button type="button" onClick={() => editWindow(window, index)} aria-label={t('editWindow', { window: formatWindow(window, locale) })}>{t('edit')}</button><button type="button" onClick={() => deleteWindow(index)} aria-label={t('deleteWindow', { window: formatWindow(window, locale) })}>{t('delete')}</button></div>)}</div>}
        </>}
        {step === 3 && <>
          <div className="eyebrow">{t('preferenceEyebrow')}</div>
          <h1>{t('preferenceTitle')}</h1>
          <h2 className="section-label">{t('interests')} <span className="field-hint">{t('interestHint')}</span></h2>
          <div className="choice-grid">{interests.map((value) => <button className={draft.interests.includes(value) ? 'choice selected' : 'choice'} type="button" key={value} aria-pressed={draft.interests.includes(value)} onClick={() => setDraft({ ...draft, interests: draft.interests.includes(value) ? draft.interests.filter((item) => item !== value) : [...draft.interests, value] })}>{interestLabel(locale, value)}</button>)}</div>
          <label className="field-label spaced">{t('dong')} <span className="field-hint">{t('dongHint')}</span><select className="text-input" value={draft.dong ?? ''} onChange={(event) => setDraft({ ...draft, dong: event.target.value || undefined })}><option value="">{t('none')}</option>{dongOptions.map((dong) => <option key={dong} value={dong}>{dong}</option>)}</select></label>
          <label className="toggle-row"><span><strong>{t('freeOnly')}</strong><small>{t('freeOnlyHint')}</small></span><input type="checkbox" checked={draft.free_only} onChange={(event) => setDraft({ ...draft, free_only: event.target.checked })} /></label>
        </>}
      </main>
      <footer className="bottom-actions">{step < 3 && <button className="button ghost" type="button" onClick={skipStep}>{step === 1 ? t('noChildStep') : t('noTimeStep')}</button>}<button className="button primary" type="button" onClick={goNext}>{step === 3 ? t('showResults') : t('next')}</button></footer>
    </div>
  )
}

function InfoSheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { t } = useLanguage()
  return <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="sheet" role="dialog" aria-modal="true" aria-label={title}><div className="sheet-handle" /><h2>{title}</h2>{children}<button className="button secondary full" type="button" onClick={onClose}>{t('close')}</button></section></div>
}

function App() {
  const { locale, t } = useLanguage()
  const initialId = routeProgramId()
  const arrivedFromList = Boolean(initialId && window.history.state?.fromList)
  const [startedAtDetail] = useState(Boolean(initialId))
  const [initialSession] = useState(() => initialId && !arrivedFromList ? { filters: emptyFilters(), hasApplied: false } : readSearchSession())
  const [view, setView] = useState<View>(initialId ? 'detail' : initialSession.hasApplied ? 'results' : 'browse')
  const [programId, setProgramId] = useState<string | null>(initialId)
  const [filters, setFilters] = useState<SearchFilters>(initialSession.filters)
  const [draft, setDraft] = useState<SearchFilters>(initialSession.filters)
  const [hasApplied, setHasApplied] = useState(initialSession.hasApplied)
  const [cameFromList, setCameFromList] = useState(arrivedFromList)
  const [search, setSearch] = useState<SearchResponse | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [searchRevision, setSearchRevision] = useState(0)
  const [detail, setDetail] = useState<Program | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [detailRevision, setDetailRevision] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const [externalNoticeOpen, setExternalNoticeOpen] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!startedAtDetail || view !== 'detail') saveSearchSession({ filters, hasApplied })
  }, [filters, hasApplied, startedAtDetail, view])

  useEffect(() => {
    const handlePop = () => {
      const id = routeProgramId()
      setProgramId(id)
      setView(id ? 'detail' : hasApplied ? 'results' : 'browse')
      setHelpOpen(false)
      setExternalNoticeOpen(false)
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [hasApplied])

  useEffect(() => {
    if (view !== 'browse' && view !== 'results') return
    const controller = new AbortController()
    setSearchLoading(true)
    setSearchError(false)
    searchPrograms(filters, controller.signal).then((data) => { if (!controller.signal.aborted) setSearch(data) }).catch(() => { if (!controller.signal.aborted) setSearchError(true) }).finally(() => { if (!controller.signal.aborted) setSearchLoading(false) })
    return () => controller.abort()
  }, [view, filters, searchRevision])

  useEffect(() => {
    if (view !== 'detail' || !programId) return
    const controller = new AbortController()
    setDetail(null)
    setDetailLoading(true)
    setDetailError(false)
    getProgram(programId, filters, controller.signal).then((data) => { if (!controller.signal.aborted) setDetail(data) }).catch(() => { if (!controller.signal.aborted) setDetailError(true) }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [view, programId, filters, detailRevision])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const openFilters = () => { setDraft({ ...filters, available_windows: [...filters.available_windows], interests: [...filters.interests] }); setView('filter') }
  const applyFilters = () => { setFilters({ ...draft, available_windows: [...draft.available_windows], interests: [...draft.interests] }); setHasApplied(true); setView('results') }
  const openDetail = (id: string) => { setCameFromList(true); window.history.pushState({ fromList: true }, '', `/programs/${encodeURIComponent(id)}`); setProgramId(id); setView('detail'); window.scrollTo(0, 0) }
  const goHome = () => { window.history.pushState({}, '', '/'); clearSearchSession(); setProgramId(null); setFilters(emptyFilters()); setDraft(emptyFilters()); setHasApplied(false); setView('browse'); setHelpOpen(false); setExternalNoticeOpen(false); window.scrollTo(0, 0) }
  const backFromDetail = () => { if (cameFromList) window.history.back(); else goHome() }
  const removeChip = (key: string) => {
    const next = { ...filters, available_windows: [...filters.available_windows], interests: [...filters.interests] }
    if (key === 'child') { next.child_grade = undefined; next.child_age = undefined }
    if (key.startsWith('time-')) next.available_windows.splice(Number(key.slice(5)), 1)
    if (key.startsWith('interest-')) next.interests = next.interests.filter((item) => item !== key.slice(9))
    if (key === 'dong') next.dong = undefined
    if (key === 'free') next.free_only = false
    setFilters(next)
  }
  const shareDetail = async () => {
    if (!detail) return
    const url = `${window.location.origin}/programs/${encodeURIComponent(detail.program_id)}`
    try {
      if (navigator.share) await navigator.share({ title: detail.title, url })
      else { await navigator.clipboard.writeText(url); setToast(t('copied')) }
    } catch (error) { if ((error as DOMException).name !== 'AbortError') setToast(t('copyFailed')) }
  }
  const openExternal = (url: string) => {
    if (!isSafeUrl(url)) return
    setHelpOpen(false)
    if (usingDemoData) { setExternalNoticeOpen(true); return }
    window.open(url, '_blank', 'noopener,noreferrer')
    setExternalNoticeOpen(true)
  }
  const callPhone = (phone: string) => {
    setHelpOpen(false)
    if (usingDemoData) { setToast(t('demoPhone')); return }
    window.location.href = `tel:${phone.replace(/[^\d+]/g, '')}`
  }

  if (view === 'filter') return <FilterWizard draft={draft} setDraft={setDraft} onClose={() => setView(hasApplied ? 'results' : 'browse')} onApply={applyFilters} />

  const chips = filterChips(filters, locale)
  const firstMethod = detail?.application_methods.find((method) => method.type === 'online' && isSafeUrl(method.url))
    ?? detail?.application_methods.find((method) => method.type === 'phone' && method.phone)
    ?? detail?.application_methods.find((method) => method.type === 'visit' && method.address)

  return <div className="app-shell">
    <LanguageSwitcher />
    {usingDemoData && <div className="demo-banner">{t('demoBanner')}</div>}
    {view === 'browse' && <>
      <header className="site-header"><span className="brand">{t('brand')}</span><span className="location">{t('location')}</span></header>
      <main className="page-content">
        <section className="hero"><p className="eyebrow">{t('heroEyebrow')}</p><h1>{t('heroTitle')}</h1><button className="hero-cta" type="button" onClick={openFilters}><strong>{t('heroAction')}</strong><span aria-hidden="true">→</span></button></section>
        {locale !== 'ko-easy' && <p className="content-language-note">{t('originalKoreanNotice')}</p>}
        <section className="section-block"><div className="section-heading"><div><p className="eyebrow">{t('openEyebrow')}</p><h2>{t('openPrograms')}</h2></div><button type="button" className="text-button" onClick={() => setView('results')}>{t('viewAll')} →</button></div>
          {searchLoading && <Loading />}{searchError && <ErrorPanel onRetry={() => setSearchRevision((value) => value + 1)} />}{!searchLoading && !searchError && search && <div className="program-list">{search.results.filter((item) => item.application_status === 'open').slice(0, 3).map((program) => <ProgramCard key={program.program_id} program={program} onOpen={openDetail} />)}{search.results.filter((item) => item.application_status === 'open').length === 0 && <p className="soft-empty">{t('noOpenPrograms')}</p>}</div>}
        </section>
      </main>
    </>}

    {view === 'results' && <>
      <header className="site-header"><button className="icon-button" type="button" aria-label={t('home')} onClick={goHome}>‹</button><span className="brand">{t('resultsBrand')}</span><button className="header-action" type="button" onClick={openFilters}>{t('changeConditions')}</button></header>
      <main className="page-content results-content">
        {locale !== 'ko-easy' && <p className="content-language-note">{t('originalKoreanNotice')}</p>}
        <div className="filter-summary"><div className="summary-title"><strong>{chips.length ? t('appliedConditions') : t('browseWithoutConditions')}</strong></div>{chips.length > 0 && <div className="chip-row" aria-label={t('appliedConditions')}>{chips.map((chip) => <button className="removable-chip" type="button" key={chip.key} onClick={() => removeChip(chip.key)} aria-label={t('removeCondition', { label: chip.label })}>{chip.label} <span aria-hidden="true">×</span></button>)}</div>}</div>
        {searchLoading && <Loading />}{searchError && <ErrorPanel onRetry={() => setSearchRevision((value) => value + 1)} />}
        {!searchLoading && !searchError && search && <>
          {search.results.length + search.needs_confirmation.length === 0 ? <div className="empty-results"><div className="state-icon">⌕</div><h1>{t('noResults')}</h1><button className="button secondary full" type="button" onClick={() => { setFilters(emptyFilters()); setHasApplied(false) }}>{t('allPrograms')}</button></div>
            : <>
              {search.results.length > 0 && <section className="section-block"><div className="section-heading"><div><p className="eyebrow">{t('resultEyebrow')}</p><h1>{t('programCount', { count: search.results.length })}</h1></div></div><div className="program-list">{search.results.map((program) => <ProgramCard key={program.program_id} program={program} onOpen={openDetail} />)}</div></section>}
              {search.needs_confirmation.length > 0 && <section className="section-block needs-block"><div className="section-heading"><div><p className="eyebrow">{t('checkEyebrow')}</p><h2>{t('unknownTimeCount', { count: search.needs_confirmation.length })}</h2></div></div><div className="program-list">{search.needs_confirmation.map((program) => <ProgramCard key={program.program_id} program={program} onOpen={openDetail} />)}</div></section>}
            </>}
        </>}
      </main>
    </>}

    {view === 'detail' && <>
      <header className="site-header detail-header"><button className="icon-button" type="button" onClick={backFromDetail} aria-label={t('back')}>‹</button><span className="brand">{t('detailBrand')}</span><button className="header-action" type="button" onClick={shareDetail} disabled={!detail}>{t('share')}</button></header>
      <main className="detail-main">
        {detailLoading && <Loading label={t('loadingDetail')} />}
        {detailError && <ErrorPanel title={t('errorDetail')} onRetry={() => setDetailRevision((value) => value + 1)} />}
        {!detailLoading && !detailError && !detail && <div className="empty-results missing-detail"><div className="state-icon">⌁</div><h1>{t('missingProgram')}</h1><p>{t('missingHint')}</p><button className="button primary full" type="button" onClick={goHome}>{t('browseOthers')}</button></div>}
        {!detailLoading && !detailError && detail && <>
          <section className={`detail-hero category-bg-${detail.category}`}><span className="detail-category">{interestLabel(locale, detail.category)}</span><span className={`status-pill status-${detail.application_status}`}>{statusLabel(detail, locale)}</span><h1>{detail.title}</h1><p>{detail.institution}</p></section>
          <div className="detail-sections">
            <section className="detail-section facts-section priority-facts"><h2>{t('quickFacts')}</h2><dl><div><dt>{detail.time_match_status === 'matched' ? t('matchedSession') : t('nextSchedule')}</dt><dd>{formatSession(detail.next_session, locale)}</dd></div><div><dt>{t('place')}</dt><dd>{placeLabel(detail, locale)}</dd></div><div><dt>{t('targetOriginal')}</dt><dd>{detail.target_raw}</dd></div><div><dt>{t('cost')}</dt><dd>{costLabel(detail, locale)}{detail.cost_krw === null && detail.cost_raw ? ` · ${detail.cost_raw}` : ''}</dd></div><div><dt>{t('application')}</dt><dd>{statusLabel(detail, locale)}{detail.application_end && detail.application_status === 'open' ? ` · ${t('until', { date: formatDate(detail.application_end, locale) })}` : ''}</dd></div><div><dt>{t('eligibility')}</dt><dd>{detail.eligibility_status === 'matched' ? t('eligibilityMatched') : detail.eligibility_status === 'unknown' ? t('eligibilityUnknown') : t('eligibilityNotApplied')}</dd></div></dl></section>
            <section className="detail-section participation-section">
              <h2>{t('checkBefore')}</h2>
              {detail.matched_reasons.length > 0 && <div className="detail-reasons">
                {locale === 'ko-easy'
                  ? detail.matched_reasons.map((reason) => <p key={reason}>✓ {reason}</p>)
                  : <>{detail.age_grade_match_status === 'matched' && <p>✓ {t('ageMatched')}</p>}{detail.time_match_status === 'matched' && <p>✓ {t('inputTimeMatch')}</p>}</>}
              </div>}
              {(detail.age_grade_match_status === 'unknown' || detail.time_match_status === 'unknown' || detail.eligibility_status === 'unknown' || detail.uncertain_items.length > 0) &&
                <div className="notice-box">
                  <strong>{t('askInstitution')}</strong>
                  {detail.age_grade_match_status === 'unknown' && <p>· {t('askAge')}</p>}
                  {detail.time_match_status === 'unknown' && <p>· {t('askSchedule')}</p>}
                  {detail.eligibility_status === 'unknown' && detail.uncertain_items.length === 0 && <p>· {t('askEligibility')}</p>}
                  {detail.uncertain_items.map((item) => <p key={item}>· {item}</p>)}
                </div>}
              <div className="language-check">
                <strong>{t('askLanguage')}</strong>
                <p>{t('askLanguageHint')}</p>
                <strong>{t('askApplicationLanguage')}</strong>
                <p>{t('askApplicationHint')}</p>
                <p>{t('askParticipationHint')}</p>
              </div>
              {locale !== 'ko-easy' && <p className="original-language-note">{t('originalKoreanNotice')}</p>}
            </section>
            <section className="detail-section"><h2>{t('allSessions')}</h2><p className="attendance-rule">{detail.attendance_rule === 'all_sessions' ? t('attendAll') : detail.attendance_rule === 'choose_one' ? t('chooseOne') : t('attendanceUnknown')}</p><div className="session-list">{detail.sessions.map((item) => <div className="session-row" key={item.id}><span><strong>{formatSession(item, locale)}</strong><small>{item.online ? t('online') : item.place_name ?? t('placeUnknown')}</small></span>{detail.matched_sessions.includes(item.id) && <span className="match-mark">{t('inputTimeMatch')}</span>}</div>)}</div></section>
            <section className="detail-section"><h2>{t('programInfo')}</h2><p className="description">{detail.description}</p><h3 className="method-heading">{t('applicationMethods')}</h3><div className="method-list">{detail.application_methods.filter((method) => method.type !== 'online' || isSafeUrl(method.url)).map((method) => <div key={method.type} className="method-row"><span>{method.type === 'phone' ? t('phone') : method.type === 'visit' ? t('visit') : t('online')}</span><strong>{method.type === 'phone' ? method.phone : method.type === 'visit' ? method.address : method.label}</strong></div>)}</div></section>
            <section className="detail-section source-section"><h2>{t('sourceInfo')}</h2>{!usingDemoData && detail.verified_at && <p>{t('verifiedAt', { date: formatDate(detail.verified_at, locale) })}</p>}{!usingDemoData && isSafeUrl(detail.source_url) && <button className="underlined-button" type="button" onClick={() => openExternal(detail.source_url!)}>{t('openSource')} ↗</button>}<button className="underlined-button" type="button" onClick={() => setHelpOpen(true)}>{t('linkTrouble')}</button></section>
          </div>
          <footer className="detail-actions">
            {detail.application_status === 'open' && firstMethod && (firstMethod.type === 'online' ? <button className="button primary full" type="button" onClick={() => openExternal(firstMethod.url!)}>{usingDemoData ? t('applyDemo') : t('apply')}</button> : firstMethod.type === 'phone' ? <button className="button primary full" type="button" onClick={() => callPhone(firstMethod.phone!)}>{t('callInstitution')}</button> : <div className="action-note">{t('visitAddress', { address: firstMethod.address ?? '' })}</div>)}
            {detail.application_status === 'open' && !firstMethod && <p className="action-note">{t('noMethod')}</p>}
            {detail.application_status === 'upcoming' && <><p className="action-note">{detail.application_start ? t('applyFrom', { date: formatDate(detail.application_start, locale) }) : t('applyStartUnknown')}</p>{!usingDemoData && isSafeUrl(detail.source_url) && <button className="button primary full" type="button" onClick={() => openExternal(detail.source_url!)}>{t('sourceApply')}</button>}</>}
            {detail.application_status === 'closed' && <><p className="action-note">{t('closedHint')}</p><button className="button primary full" type="button" onClick={goHome}>{t('browseOthers')}</button></>}
            {detail.application_status === 'unknown' && <><p className="action-note">{t('unknownApplicationHint')}</p>{!usingDemoData && isSafeUrl(detail.source_url) && <button className="button primary full" type="button" onClick={() => openExternal(detail.source_url!)}>{t('sourceCheck')}</button>}</>}
          </footer>
        </>}
      </main>
    </>}

    {helpOpen && detail && <InfoSheet title={t('linkTrouble')} onClose={() => setHelpOpen(false)}><p className="sheet-copy">{usingDemoData ? t('demoHelpIntro') : t('helpIntro')}</p><div className="sheet-options">{isSafeUrl(detail.source_url) && <button type="button" onClick={() => openExternal(detail.source_url!)}><small>1 · {t('original')}</small><strong>{t('openSource')}</strong><span>{t('originalHint')}</span></button>}{detail.application_methods.filter((method) => method.type === 'phone' && method.phone).map((method) => <button type="button" key={method.phone} onClick={() => callPhone(method.phone!)}><small>2 · {t('phone')}</small><strong>{t('callInstitution')}</strong><span>{method.phone}</span></button>)}{!isSafeUrl(detail.source_url) && !detail.application_methods.some((method) => method.type === 'phone' && method.phone) && <p>{t('noFallback')}</p>}</div></InfoSheet>}
    {externalNoticeOpen && <InfoSheet title={usingDemoData ? t('demoExternalTitle') : t('externalTitle')} onClose={() => setExternalNoticeOpen(false)}><p className="sheet-copy">{usingDemoData ? t('demoExternalCopy') : t('externalCopy')}</p></InfoSheet>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>
}

export default App
