import { useMemo, useState } from 'react'
import { BarList, Heatmap, InsufficientPanel } from './Charts'
import { Icon } from './icons'
import { Sheet } from './Sheet'
import { ViewHeader } from './ViewHeader'
import { DONGS, DEMO_RESPONSES, defaultFilters, filterResponses, summarize, GRADES, INTERESTS, LANGUAGES } from '@osan-kids-bridge/planning'
import type { DemandFilters, DemandSummary, Dong, Grade, Interest, ScreenLanguage } from '@osan-kids-bridge/planning'
import { localizedDong, localizedInterest, localizedLanguage, localizedLevel, localizedSlot, useLanguage } from '../i18n'

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
  const pick = (pressed: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" className="chip chip--pick" aria-pressed={pressed} onClick={onClick}>{label}</button>
  )

  return <div className="view">
    <ViewHeader kicker={t('navPlan')} title={t('demandTab')} lead={t('demandLead')} action={
      <button className="btn btn--quiet" type="button" aria-haspopup="dialog" onClick={() => setFilterOpen(true)}>
        <Icon name="sliders" />{filtered ? t('filterOpen') : t('filterTitle')}
      </button>
    } />

    <Sheet
      open={filterOpen}
      onClose={() => setFilterOpen(false)}
      title={t('filterTitle')}
      onSubmit={() => setFilterOpen(false)}
      footer={<>
        <button className="btn btn--ghost btn--lg" type="button" onClick={() => setFilters(defaultFilters())} disabled={!filtered}>{t('reset')}</button>
        <button className="btn btn--primary btn--lg" type="submit">{t('applyFilters')}</button>
      </>}
    >
      <fieldset className="field">
        <legend>{t('district')} <small className="legend-note">{filters.dongs.length ? t('selected', { n: filters.dongs.length }) : t('all')}</small></legend>
        <div className="chips">{DONGS.map((dong) => pick(filters.dongs.includes(dong), localizedDong(dong, locale), () => toggleDong(dong)))}</div>
      </fieldset>
      <fieldset className="field">
        <legend>{t('grade')}</legend>
        <div className="range-row">
          <label><span className="visually-hidden">{t('startGrade')}</span><select className="input" value={filters.gradeRange[0]} onChange={(event) => setGrade(0, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{t('gradeValue', { n: grade })}</option>)}</select></label>
          <span aria-hidden="true">~</span>
          <label><span className="visually-hidden">{t('endGrade')}</span><select className="input" value={filters.gradeRange[1]} onChange={(event) => setGrade(1, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{t('gradeValue', { n: grade })}</option>)}</select></label>
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>{t('interest')}</legend>
        <div className="chips">
          {pick(filters.interest === 'all', t('allFields'), () => setFilters({ ...filters, interest: 'all' }))}
          {INTERESTS.map((interest) => pick(filters.interest === interest, localizedInterest(interest, t), () => setFilters({ ...filters, interest: interest as Interest })))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>{t('screenLanguage')}</legend>
        <div className="chips">
          {pick(filters.language === 'all', t('allLanguages'), () => setFilters({ ...filters, language: 'all' }))}
          {LANGUAGES.map((language) => pick(filters.language === language, localizedLanguage(language, t), () => setFilters({ ...filters, language: language as ScreenLanguage })))}
        </div>
      </fieldset>
    </Sheet>

    {summary.status === 'insufficient' ? <InsufficientPanel onReset={() => setFilters(defaultFilters())} resetLabel={t('reset')} /> : <>
      <DemandSummaryLine summary={summary} filtered={filtered} />
      <div className="dash-grid">
      <section className="card block-card dash-grid-wide" aria-labelledby="heat-title">
        <h2 id="heat-title" className="block-title">{t('heatTitle')}</h2>
        <Heatmap counts={summary.slots} max={summary.maxSlotValue} caption={t('heatCaption')} />
        <dl className="rows key-rows">
          <div className="row"><dt>{t('avgSlots')}</dt><dd>{t('slots', { n: summary.averageSlots.toFixed(1) })}{summary.averageSlotsEstimated && <small> · {t('avgEstimate')}</small>}</dd></div>
          <div className="row"><dt>{t('koreanResponse')}</dt><dd>{summary.koreanLevelResponseRate === null ? t('hidden') : Math.round(summary.koreanLevelResponseRate * 100) + '%'}</dd></div>
        </dl>
      </section>
      <section className="card block-card" aria-labelledby="dong-title"><h2 id="dong-title" className="block-title">{t('districtTitle')}</h2><BarList label={t('districtCount')} total={summary.total} items={[...summary.dongs].sort((a, b) => (b.count.suppressed ? 2.5 : b.count.value) - (a.count.suppressed ? 2.5 : a.count.value)).map(({ dong, count }) => ({ key: dong, label: localizedDong(dong, locale), count }))} /></section>
      <section className="card block-card" aria-labelledby="language-title"><h2 id="language-title" className="block-title">{t('languageTitle')}</h2><BarList label={t('languageCount')} total={summary.total} items={summary.languages.map(({ language, count }) => ({ key: language, label: localizedLanguage(language, t), count }))} /></section>
      <section className="card block-card" aria-labelledby="level-title"><h2 id="level-title" className="block-title">{t('levelTitle')}</h2><BarList label={t('levelCount')} total={summary.total} items={summary.koreanLevels.map(({ level, count }) => ({ key: level, label: localizedLevel(level, t), count, tone: level === 'none' ? 'muted' : undefined }))} /></section>
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
