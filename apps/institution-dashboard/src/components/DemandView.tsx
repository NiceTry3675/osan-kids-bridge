import { useMemo, useState } from 'react'
import { BarList, Heatmap, InsufficientPanel } from './Charts'
import { ViewHeader } from './ViewHeader'
import { DONGS } from '../data/assumptions'
import { DEMO_RESPONSES } from '../data/generate'
import { defaultFilters, filterResponses, summarize } from '../lib/aggregate'
import type { DemandFilters, DemandSummary } from '../lib/aggregate'
import { GRADES, INTERESTS, LANGUAGES } from '../lib/labels'
import { localizedDong, localizedInterest, localizedLanguage, localizedLevel, localizedSlot, useLanguage } from '../i18n'
import type { Dong, Grade, Interest, ScreenLanguage } from '../types'

interface Props { filters: DemandFilters; setFilters: (filters: DemandFilters) => void }

export function DemandView({ filters, setFilters }: Props) {
  const { locale, t } = useLanguage()
  const [filterOpen, setFilterOpen] = useState(false)
  const summary = useMemo(() => summarize(filterResponses(DEMO_RESPONSES, filters), filters), [filters])
  const filtered = filters.dongs.length > 0 || filters.interest !== 'all' || filters.language !== 'all' || filters.gradeRange[0] !== 1 || filters.gradeRange[1] !== 6
  const toggleDong = (dong: Dong) => setFilters({ ...filters, dongs: filters.dongs.includes(dong) ? filters.dongs.filter((item) => item !== dong) : DONGS.filter((item) => item === dong || filters.dongs.includes(item)) })
  const setGrade = (index: 0 | 1, grade: Grade) => {
    const range: [Grade, Grade] = index === 0 ? [grade, Math.max(grade, filters.gradeRange[1]) as Grade] : [Math.min(grade, filters.gradeRange[0]) as Grade, grade]
    setFilters({ ...filters, gradeRange: range })
  }
  return <div className="view">
    <ViewHeader title={t('demandTab')} action={
      <button className="filter-chip mobile-only" type="button" aria-expanded={filterOpen} aria-controls="demand-filters" onClick={() => setFilterOpen(!filterOpen)}>
        <SlidersIcon />{filtered ? t('filterShort') : t('filterAll')}
      </button>
    } />
    <form id="demand-filters" className={'filter-bar' + (filterOpen ? ' is-open' : '')} aria-label={t('filterTitle')} onSubmit={(event) => event.preventDefault()}>
      <fieldset className="filter-group dong-filter"><legend>{t('district')} <small>{filters.dongs.length ? t('selected', { n: filters.dongs.length }) : t('all')}</small></legend>
        <div className="chip-row">{DONGS.map((dong) => <label key={dong} className={'check-chip' + (filters.dongs.includes(dong) ? ' checked' : '')}><input type="checkbox" checked={filters.dongs.includes(dong)} onChange={() => toggleDong(dong)} />{localizedDong(dong, locale)}</label>)}</div>
      </fieldset>
      <fieldset className="filter-group"><legend>{t('grade')}</legend><div className="range-row">
        <label><span className="sr-only">{t('startGrade')}</span><select value={filters.gradeRange[0]} onChange={(event) => setGrade(0, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{t('gradeValue', { n: grade })}</option>)}</select></label>
        <span aria-hidden="true">~</span>
        <label><span className="sr-only">{t('endGrade')}</span><select value={filters.gradeRange[1]} onChange={(event) => setGrade(1, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{t('gradeValue', { n: grade })}</option>)}</select></label>
      </div></fieldset>
      <label className="filter-group"><span className="filter-label">{t('interest')}</span><select value={filters.interest} onChange={(event) => setFilters({ ...filters, interest: event.target.value as Interest | 'all' })}><option value="all">{t('allFields')}</option>{INTERESTS.map((interest) => <option key={interest} value={interest}>{localizedInterest(interest, t)}</option>)}</select></label>
      <label className="filter-group"><span className="filter-label">{t('screenLanguage')}</span><select value={filters.language} onChange={(event) => setFilters({ ...filters, language: event.target.value as ScreenLanguage | 'all' })}><option value="all">{t('allLanguages')}</option>{LANGUAGES.map((language) => <option key={language} value={language}>{localizedLanguage(language, t)}</option>)}</select></label>
      <div className="filter-actions">
        <button className="button ghost reset" type="button" onClick={() => setFilters(defaultFilters())} disabled={!filtered}>{t('reset')}</button>
        <button className="button primary mobile-only" type="button" onClick={() => setFilterOpen(false)}>{t('applyFilters')}</button>
      </div>
    </form>
    {filterOpen && <div className="scrim mobile-only" aria-hidden="true" onClick={() => setFilterOpen(false)} />}
    {summary.status === 'insufficient' ? <InsufficientPanel onReset={() => setFilters(defaultFilters())} resetLabel={t('reset')} /> : <>
      <DemandSummaryLine summary={summary} filtered={filtered} />
      <div className="demand-grid">
        <section className="card heat-card" aria-labelledby="heat-title">
          <div className="card-head"><h2 id="heat-title">{t('heatTitle')}</h2></div>
          <Heatmap counts={summary.slots} max={summary.maxSlotValue} caption={t('heatCaption')} />
          <dl className="key-list">
            <div><dt>{t('avgSlots')}</dt><dd>{t('slots', { n: summary.averageSlots.toFixed(1) })}{summary.averageSlotsEstimated && <small> · {t('avgEstimate')}</small>}</dd></div>
            <div><dt>{t('koreanResponse')}</dt><dd>{summary.koreanLevelResponseRate === null ? t('hidden') : Math.round(summary.koreanLevelResponseRate * 100) + '%'}</dd></div>
          </dl>
        </section>
        <section className="card" aria-labelledby="dong-title"><div className="card-head"><h2 id="dong-title">{t('districtTitle')}</h2></div><BarList label={t('districtCount')} total={summary.total} items={[...summary.dongs].sort((a, b) => (b.count.suppressed ? 2.5 : b.count.value) - (a.count.suppressed ? 2.5 : a.count.value)).map(({ dong, count }) => ({ key: dong, label: localizedDong(dong, locale), count }))} /></section>
        <section className="card" aria-labelledby="language-title"><div className="card-head"><h2 id="language-title">{t('languageTitle')}</h2></div><BarList label={t('languageCount')} total={summary.total} items={summary.languages.map(({ language, count }) => ({ key: language, label: localizedLanguage(language, t), count }))} /></section>
        <section className="card" aria-labelledby="level-title"><div className="card-head"><h2 id="level-title">{t('levelTitle')}</h2></div><BarList label={t('levelCount')} total={summary.total} items={summary.koreanLevels.map(({ level, count }) => ({ key: level, label: localizedLevel(level, t), count, tone: level === 'none' ? 'muted' : undefined }))} /></section>
      </div>
    </>}
  </div>
}

/** 숫자 4칸 대신 한 문장: 몇 가정이 답했고, 가장 많이 몰린 시간이 언제인지. 가린 칸은 문장에 넣지 않습니다. */
function DemandSummaryLine({ summary, filtered }: { summary: Extract<DemandSummary, { status: 'ok' }>; filtered: boolean }) {
  const { locale, t } = useLanguage()
  const separator = locale === 'zh' ? '、' : ', '
  const peaks = summary.topSlots.map(({ slot }) => localizedSlot(slot, t)).join(separator)
  return (
    <p className="demand-summary" aria-live="polite">
      <strong>{filtered ? t('demandSummaryFiltered', { n: summary.total, total: DEMO_RESPONSES.length }) : t('demandSummary', { n: summary.total })}</strong>{' '}
      {peaks ? t('demandPeak', { slots: peaks }) : t('demandPeakHidden')}
    </p>
  )
}

const SlidersIcon = () => (
  <svg className="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
)
