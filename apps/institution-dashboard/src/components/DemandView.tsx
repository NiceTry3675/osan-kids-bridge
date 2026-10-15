import { useMemo, useState } from 'react'
import { BarList, Heatmap, InsufficientPanel, StatTile } from './Charts'
import { DONGS, SUPPRESSION_THRESHOLD } from '../data/assumptions'
import { DEMO_RESPONSES } from '../data/generate'
import { defaultFilters, filterResponses, summarize } from '../lib/aggregate'
import type { DemandFilters } from '../lib/aggregate'
import { GRADES, INTERESTS, LANGUAGES } from '../lib/labels'
import { localizedCount, localizedDong, localizedInterest, localizedLanguage, localizedLevel, localizedSlot, useLanguage } from '../i18n'
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
    <button className="filter-toggle mobile-only" type="button" aria-expanded={filterOpen} aria-controls="demand-filters" onClick={() => setFilterOpen(!filterOpen)}>
      <span><strong>{t('filterTitle')}</strong><small>{filtered ? t('filterOpen') : t('all')}</small></span><span aria-hidden="true">{filterOpen ? '−' : '+'}</span>
    </button>
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
      <div className="stat-row" aria-live="polite">
        <StatTile label={t('households')} value={localizedCount({ suppressed: false, value: summary.total }, t)} note={filtered ? t('outOfAll', { n: DEMO_RESPONSES.length }) : undefined} />
        <StatTile label={t('topTime')} value={summary.topSlots[0] ? localizedSlot(summary.topSlots[0].slot, t) : t('hidden')} note={summary.topSlots[0] ? localizedCount(summary.topSlots[0].count, t) : t('everySlotBelow', { n: SUPPRESSION_THRESHOLD })} />
        <StatTile label={t('avgSlots')} value={t('slots', { n: summary.averageSlots.toFixed(1) })} note={summary.averageSlotsEstimated ? t('avgEstimate') : t('avgNote')} />
        <StatTile label={t('koreanResponse')} value={summary.koreanLevelResponseRate === null ? t('hidden') : Math.round(summary.koreanLevelResponseRate * 100) + '%'} note={summary.koreanLevelResponseRate === null ? t('noResponse') : undefined} />
      </div>
      <div className="demand-grid">
        <section className="card heat-card" aria-labelledby="heat-title"><div className="card-head"><h2 id="heat-title">{t('heatTitle')}</h2></div><Heatmap counts={summary.slots} max={summary.maxSlotValue} caption={t('heatCaption')} /></section>
        <section className="card" aria-labelledby="dong-title"><div className="card-head"><h2 id="dong-title">{t('districtTitle')}</h2></div><BarList label={t('districtCount')} total={summary.total} items={[...summary.dongs].sort((a, b) => (b.count.suppressed ? 2.5 : b.count.value) - (a.count.suppressed ? 2.5 : a.count.value)).map(({ dong, count }) => ({ key: dong, label: localizedDong(dong, locale), count }))} /></section>
        <section className="card" aria-labelledby="language-title"><div className="card-head"><h2 id="language-title">{t('languageTitle')}</h2></div><BarList label={t('languageCount')} total={summary.total} items={summary.languages.map(({ language, count }) => ({ key: language, label: localizedLanguage(language, t), count }))} /></section>
        <section className="card" aria-labelledby="level-title"><div className="card-head"><h2 id="level-title">{t('levelTitle')}</h2></div><BarList label={t('levelCount')} total={summary.total} items={summary.koreanLevels.map(({ level, count }) => ({ key: level, label: localizedLevel(level, t), count, tone: level === 'none' ? 'muted' : undefined }))} /></section>
      </div>
    </>}
  </div>
}
