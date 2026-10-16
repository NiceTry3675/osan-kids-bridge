import { useEffect, useMemo, useState } from 'react'
import { Heatmap, InsufficientPanel } from './Charts'
import { Icon } from './icons'
import { Sheet } from './Sheet'
import { ViewHeader } from './ViewHeader'
import { ENROLLMENT_RATE, MAX_CAPACITY, MIN_CAPACITY } from '../data/assumptions'
import { DEMO_RESPONSES } from '../data/generate'
import { VENUES } from '../data/venues'
import { countSlots, suppress, suppressSlots } from '../lib/aggregate'
import { GRADES, INTERESTS, KOREAN_LEVELS, LANGUAGES, percent } from '../lib/labels'
import { CLASS_COUNTS, initialPlanForm, toProgramPlan } from '../lib/plan'
import type { PlanForm } from '../lib/plan'
import { recommend, selectEligible } from '../lib/recommend'
import { SLOTS } from '../lib/slots'
import { localizedCount, localizedDong, localizedInterest, localizedLanguage, localizedLevel, localizedPeople, localizedSlot, localizedVenue, useLanguage } from '../i18n'
import type { Grade, Interest, ProgramOption, Recommendation, RecommendResult, SafeCount, SlotKey } from '../types'

const INTEREST_ART: Record<Interest | 'all', { emoji: string; tone: string }> = {
  all: { emoji: '✨', tone: 'sand' },
  experience_culture: { emoji: '🎨', tone: 'peach' },
  korean_study: { emoji: '📖', tone: 'sky' },
  sports_arts: { emoji: '⚽', tone: 'leaf' },
  career: { emoji: '🧭', tone: 'lilac' },
}

interface Props { form: PlanForm; setForm: (form: PlanForm) => void }
function readComboLimit(): number | undefined {
  const text = new URLSearchParams(window.location.search).get('comboLimit')
  const value = text === null || text === '' ? NaN : Number(text)
  return Number.isInteger(value) && value >= 0 ? value : undefined
}

/**
 * 추천 탭. ‘조건’ → ‘결과’ 두 화면을 오가고 ‘자세히’는 시트로 엽니다(보호자 웹의 조건 → 결과와 같은 흐름).
 * 추천 계산은 lib/recommend.ts 그대로입니다.
 */
export function RecommendView({ form, setForm }: Props) {
  const { locale, t } = useLanguage()
  const [capacityText, setCapacityText] = useState(String(form.capacity))
  const [selected, setSelected] = useState(0)
  const [view, setView] = useState<'plan' | 'result'>('plan')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const comboLimit = useMemo(readComboLimit, [])
  const result = useMemo(() => recommend(DEMO_RESPONSES, VENUES, toProgramPlan(form), { comboLimit }), [form, comboLimit])
  const eligibleSlots = useMemo(() => {
    const counts = countSlots(selectEligible(DEMO_RESPONSES, form))
    const safe = suppressSlots(counts)
    return { safe, max: Math.max(0, ...SLOTS.filter((slot) => !safe[slot].suppressed).map((slot) => counts[slot])) }
  }, [form])
  useEffect(() => { if (selected >= result.recommendations.length) setSelected(0) }, [result, selected])
  const update = (patch: Partial<PlanForm>) => setForm({ ...form, ...patch })
  const setGrade = (index: 0 | 1, grade: Grade) => update({ gradeRange: index === 0 ? [grade, Math.max(grade, form.gradeRange[1]) as Grade] : [Math.min(grade, form.gradeRange[0]) as Grade, grade] })
  const capacityValue = Number(capacityText)
  const capacityError = !Number.isInteger(capacityValue) || capacityValue < MIN_CAPACITY || capacityValue > MAX_CAPACITY
  const onCapacity = (value: string) => {
    setCapacityText(value)
    const number = Number(value)
    if (value !== '' && Number.isInteger(number) && number >= MIN_CAPACITY && number <= MAX_CAPACITY) update({ capacity: number })
  }
  const toggleVenue = (id: string) => update({ venueIds: form.venueIds.includes(id) ? form.venueIds.filter((item) => item !== id) : VENUES.filter((venue) => venue.id === id || form.venueIds.includes(venue.id)).map((venue) => venue.id) })
  const setBaseline = (at: number, patch: Partial<ProgramOption>) => update({ baseline: form.baseline.map((option, index) => index === at ? { ...option, ...patch } : option) })
  const reset = () => { const initial = initialPlanForm(); setForm(initial); setCapacityText(String(initial.capacity)) }
  const current = result.recommendations[selected] ?? result.recommendations[0]
  const marks: Partial<Record<SlotKey, string[]>> = {}
  current?.classes.forEach((item, at) => { (marks[item.option.slot] ??= []).push(String(at + 1)) })
  const baselineSlots = result.baseline?.classes.map((item) => item.option.slot)
  const summary = [
    form.interest === 'all' ? t('allFields') : localizedInterest(form.interest, t),
    t('gradeValue', { n: form.gradeRange[0] }) + '–' + t('gradeValue', { n: form.gradeRange[1] }),
    t('classes', { n: form.classCount }),
    t('people', { n: form.capacity }),
  ].join(' · ')
  const showResult = () => { setView('result'); window.scrollTo({ top: 0 }) }

  if (view === 'plan') return <div className="view">
    <ViewHeader title={t('recommendTab')} />
    <form className="plan-form" aria-label={t('planTitle')} onSubmit={(event) => { event.preventDefault(); showResult() }}>
      <fieldset className="field">
        <legend>{t('programQuestion')}</legend>
        <div className="tiles tiles--five" role="radiogroup" aria-label={t('planField')}>
          {(['all', ...INTERESTS] as (Interest | 'all')[]).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={form.interest === value} className="tile" onClick={() => update({ interest: value })}>
              <span className={`tile-art tone-${INTEREST_ART[value].tone}`} aria-hidden="true">{INTEREST_ART[value].emoji}</span>
              {value === 'all' ? t('allFields') : localizedInterest(value, t)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>{t('targetGrade')}</legend>
        <div className="range-row">
          <label><span className="visually-hidden">{t('startGrade')}</span><select className="input" value={form.gradeRange[0]} onChange={(event) => setGrade(0, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{t('gradeValue', { n: grade })}</option>)}</select></label>
          <span aria-hidden="true">~</span>
          <label><span className="visually-hidden">{t('endGrade')}</span><select className="input" value={form.gradeRange[1]} onChange={(event) => setGrade(1, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{t('gradeValue', { n: grade })}</option>)}</select></label>
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>{t('classCount')}</legend>
        <div className="picks" role="radiogroup" aria-label={t('classCount')}>
          {CLASS_COUNTS.map((count) => <button key={count} type="button" role="radio" aria-checked={form.classCount === count} className="pick" onClick={() => update({ classCount: count })}>{t('classes', { n: count })}</button>)}
        </div>
      </fieldset>
      <div className="field">
        <label className="field-label" htmlFor="capacity">{t('capacity')}</label>
        <div className="input-row">
          <input id="capacity" className="input input--short" type="number" inputMode="numeric" min={MIN_CAPACITY} max={MAX_CAPACITY} value={capacityText} aria-invalid={capacityError} aria-describedby={capacityError ? 'capacity-error' : undefined} onChange={(event) => onCapacity(event.target.value)} />
          <span>{t('people', { n: '' }).trim()}</span>
        </div>
        {capacityError && <p id="capacity-error" className="field-error">{MIN_CAPACITY}–{MAX_CAPACITY}</p>}
      </div>
      <details className="fold">
        <summary><span>{t('venues')}</span><small>{t('venuesSummary', { n: VENUES.length, m: form.venueIds.length })}</small></summary>
        <div className="fold-body">
          <div className="fold-actions"><button type="button" className="link-btn" onClick={() => update({ venueIds: VENUES.map((venue) => venue.id) })}>{t('selectAll')}</button><button type="button" className="link-btn" onClick={() => update({ venueIds: [] })}>{t('clearAll')}</button></div>
          <ul className="check-list">{VENUES.map((venue) => <li key={venue.id}><label className="check-row"><input type="checkbox" checked={form.venueIds.includes(venue.id)} onChange={() => toggleVenue(venue.id)} /><span><strong>{localizedVenue(venue, locale)}</strong><small>{localizedDong(venue.dong, locale)} · {t('available', { n: venue.bookable.length })}</small></span></label></li>)}</ul>
        </div>
      </details>
      <details className="fold">
        <summary><span>{t('compareBaseline')}</span><small>{form.baselineOn ? t('baselineOnSummary') : t('baselineOffSummary')}</small></summary>
        <div className="fold-body">
          <label className="switch-row switch-row--flat"><input type="checkbox" checked={form.baselineOn} onChange={(event) => update({ baselineOn: event.target.checked })} /><span className="switch" aria-hidden="true" /><strong>{t('compareBaseline')}</strong></label>
          {form.baselineOn && <div className="baseline-rows">{form.baseline.slice(0, form.classCount).map((option, at) => <div key={at} className="baseline-row"><span className="baseline-name">{t('planForClass', { n: at + 1 })}</span><label><span className="visually-hidden">{t('baselineClassSlot', { n: at + 1 })}</span><select className="input" value={option.slot} onChange={(event) => setBaseline(at, { slot: event.target.value as SlotKey })}>{SLOTS.map((slot) => <option key={slot} value={slot}>{localizedSlot(slot, t)}</option>)}</select></label><label><span className="visually-hidden">{t('baselineClassVenue', { n: at + 1 })}</span><select className="input" value={option.venueId} onChange={(event) => setBaseline(at, { venueId: event.target.value })}>{VENUES.map((venue) => <option key={venue.id} value={venue.id}>{localizedVenue(venue, locale)}</option>)}</select></label></div>)}</div>}
        </div>
      </details>
      <div className="form-actions">
        <button className="btn btn--ghost btn--lg" type="button" onClick={reset}>{t('reset')}</button>
        <button className="btn btn--primary btn--lg" type="submit">{t('showRecommend')}</button>
      </div>
    </form>
  </div>

  return <div className="view">
    <ViewHeader title={t('recommendTab')} />
    <div className="bar-top">
      <button type="button" className="btn btn--quiet btn--back" onClick={() => { setView('plan'); window.scrollTo({ top: 0 }) }}><Icon name="back" />{t('filterOpen')}</button>
    </div>
    <p className="muted plan-summary">{summary}</p>
    <section aria-live="polite" className="results">
      {result.status === 'insufficient' && <InsufficientPanel onReset={reset} resetLabel={t('reset')} />}
      {result.status === 'no_options' && <div className="state"><p className="state-title">{t('noVenues')}</p><p className="state-hint">{t('chooseVenue')}</p></div>}
      {result.status === 'no_reach' && <div className="state"><p className="state-title">{t('noReach')}</p><p className="state-hint">{t('widen')}</p></div>}
      {result.status === 'ok' && current && <>
        <div className="seg" role="tablist" aria-label={t('recommendTab')}>{result.recommendations.map((item, index) => <button key={item.rank} type="button" role="tab" className="seg-btn" aria-selected={selected === index} onClick={() => setSelected(index)}>{t('option', { n: item.rank })}</button>)}</div>
        <Coverage result={result} current={current} />
        <section className="block" aria-labelledby="class-title">
          <h2 id="class-title" className="block-title">{t('classDetails')}</h2>
          <ol className="class-list">
            {current.classes.map((entry, at) => <li key={entry.option.slot + entry.option.venueId} className="class-item">
              <span className="class-index">{at + 1}</span>
              <div className="class-main">
                <strong>{localizedSlot(entry.option.slot, t)} · {localizedVenue(entry.venue, locale)}</strong>
                <small>{localizedDong(entry.venue.dong, locale)}{entry.alternatives.length > 0 && <> · {t('sameEffect')}: {entry.alternatives.map((venue) => localizedVenue(venue, locale)).join(', ')}</>}</small>
                <span className="class-metrics"><span>{t('added')} <b>{entry.marginalSafe.suppressed ? localizedCount(entry.marginalSafe, t) : '+' + localizedCount(entry.marginalSafe, t, 'short')}</b></span><span>{t('expected')} <b className={entry.overCapacity ? 'over' : undefined}>{localizedPeople(entry.expectedHeadcount, t)} / {t('people', { n: form.capacity })}</b></span></span>
              </div>
              <div className="class-numbers"><strong>{localizedCount(suppress(entry.reach), t)}</strong><small>{t('reached')}</small></div>
            </li>)}
          </ol>
          {current.classes.some((entry) => entry.overCapacity) && <div className="notice notice--warn" role="note"><p className="notice-title">{t('overCapacity')}</p></div>}
          <p className="muted">{t('estimatedNote', { n: Math.round(ENROLLMENT_RATE * 100) })}</p>
        </section>
        <button type="button" className="btn btn--secondary btn--lg btn--block" aria-haspopup="dialog" onClick={() => setDetailsOpen(true)}>{t('detailsOpen', { n: current.rank })}</button>
        <Sheet tall open={detailsOpen} onClose={() => setDetailsOpen(false)} title={t('detailsTitle', { n: current.rank })}>
          <div className="stack">
            <Heatmap compact counts={eligibleSlots.safe} max={eligibleSlots.max} caption={t('heatPlanCaption')} marks={marks} baselineSlots={baselineSlots} />
            <h3 className="sheet-sub">{t('languageTitle')}</h3>
            <Pills items={LANGUAGES.map((language) => [localizedLanguage(language, t), current.languageBreakdown[language]])} />
            <h3 className="sheet-sub">{t('levelTitle')}</h3>
            <Pills items={([...KOREAN_LEVELS, 'none'] as const).map((level) => [localizedLevel(level, t), current.koreanLevelBreakdown[level]])} />
            <h3 className="sheet-sub">{t('insights')}</h3>
            {locale === 'ko-easy'
              ? <div className="insight-copy"><p>{current.explanation}</p><ul>{[...current.languageSuggestions, ...current.teachingSuggestions, ...current.warnings].map((line) => <li key={line}>{line}</li>)}</ul></div>
              : <div className="insight-copy"><p>{t('insightSummary')}</p><ul><li>{t('languageAdvice')}</li><li>{t('teachingAdvice')}</li></ul><details className="original"><summary>{t('originalDetails')}</summary><p>{t('originalNote')}</p><div lang="ko"><p>{current.explanation}</p><ul>{[...current.languageSuggestions, ...current.teachingSuggestions, ...current.warnings].map((line) => <li key={line}>{line}</li>)}</ul></div></details></div>}
          </div>
        </Sheet>
      </>}
    </section>
  </div>
}

function Coverage({ result, current }: { result: RecommendResult; current: Recommendation }) {
  const { t } = useLanguage()
  const safeCovered = suppress(current.covered)
  const safeBaseline = result.baseline ? suppress(result.baseline.covered) : null
  const rate = percent(current.covered, result.eligibleCount)
  return (
    <article className="coverage">
      <p className="coverage-kicker">{t('eligible', { n: result.eligibleCount })}</p>
      <div className="result-total"><strong>{localizedCount(safeCovered, t)}</strong><span>{safeCovered.suppressed ? t('hidden') : rate + '%'}</span></div>
      <div className="meter"><span style={{ width: safeCovered.suppressed ? '2%' : rate + '%' }} /></div>
      {result.baseline && safeBaseline && <div className="baseline-compare"><span>{t('baseline')}</span><strong>{safeBaseline.suppressed ? localizedCount(safeBaseline, t) : percent(result.baseline.covered, result.eligibleCount) + '%'} → {safeCovered.suppressed ? localizedCount(safeCovered, t) : rate + '%'}</strong></div>}
      <p className="muted">{t('demoResultNote')}{result.method === 'greedy' && <><br />{t('approximate')}</>}</p>
    </article>
  )
}

function Pills({ items }: { items: [string, SafeCount][] }) {
  const { t } = useLanguage()
  return <div className="pill-list">{items.map(([label, count]) => <span key={label}>{label} <strong>{localizedCount(count, t)}</strong></span>)}</div>
}
