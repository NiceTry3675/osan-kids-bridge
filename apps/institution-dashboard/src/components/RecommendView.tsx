import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Heatmap, InsufficientPanel } from './Charts'
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
 * 추천 탭. 휴대폰에서는 ‘조건’ → ‘결과’ 두 화면을 오가고 ‘자세히’는 시트로 엽니다.
 * 넓은 화면에서는 조건과 결과를 나란히 둡니다. 추천 계산은 lib/recommend.ts 그대로입니다.
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

  return <div className="recommend-layout" data-view={view}>
    <section className="plan-panel" aria-label={t('planTitle')}>
      <form className="plan-form" onSubmit={(event) => { event.preventDefault(); showResult() }}>
        <h2 className="plan-q">{t('programQuestion')}</h2>
        <div className="interest-tiles" role="radiogroup" aria-label={t('planField')}>
          {(['all', ...INTERESTS] as (Interest | 'all')[]).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={form.interest === value} className="itile" onClick={() => update({ interest: value })}>
              <span className={`itile-art tone-${INTEREST_ART[value].tone}`} aria-hidden="true">{INTEREST_ART[value].emoji}</span>
              {value === 'all' ? t('allFields') : localizedInterest(value, t)}
            </button>
          ))}
        </div>
        <div className="field-pair">
          <fieldset className="field"><legend className="field-label">{t('targetGrade')}</legend><div className="range-row"><label><span className="sr-only">{t('startGrade')}</span><select value={form.gradeRange[0]} onChange={(event) => setGrade(0, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{t('gradeValue', { n: grade })}</option>)}</select></label><span>–</span><label><span className="sr-only">{t('endGrade')}</span><select value={form.gradeRange[1]} onChange={(event) => setGrade(1, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{t('gradeValue', { n: grade })}</option>)}</select></label></div></fieldset>
          <label className="field"><span className="field-label">{t('capacity')}</span><span className="unit-input"><input type="number" inputMode="numeric" min={MIN_CAPACITY} max={MAX_CAPACITY} value={capacityText} aria-invalid={capacityError} aria-describedby={capacityError ? 'capacity-error' : undefined} onChange={(event) => onCapacity(event.target.value)} /><span>{t('people', { n: '' })}</span></span>{capacityError && <small id="capacity-error" className="field-error">{MIN_CAPACITY}–{MAX_CAPACITY}</small>}</label>
        </div>
        <fieldset className="field"><legend className="field-label">{t('classCount')}</legend><div className="segment">{CLASS_COUNTS.map((count) => <label key={count} className={form.classCount === count ? 'selected' : ''}><input type="radio" name="class-count" value={count} checked={form.classCount === count} onChange={() => update({ classCount: count })} />{t('classes', { n: count })}</label>)}</div></fieldset>
        <details className="acc">
          <summary><span>{t('venues')}</span><small>{t('venuesSummary', { n: VENUES.length, m: form.venueIds.length })}</small></summary>
          <div className="acc-body">
            <div className="inline-actions"><button type="button" className="text-button" onClick={() => update({ venueIds: VENUES.map((venue) => venue.id) })}>{t('selectAll')}</button><button type="button" className="text-button" onClick={() => update({ venueIds: [] })}>{t('clearAll')}</button></div>
            <div className="venue-list">{VENUES.map((venue) => <label key={venue.id} className={'venue-option' + (form.venueIds.includes(venue.id) ? ' checked' : '')}><input type="checkbox" checked={form.venueIds.includes(venue.id)} onChange={() => toggleVenue(venue.id)} /><span><strong>{localizedVenue(venue, locale)}</strong><small>{localizedDong(venue.dong, locale)} · {t('available', { n: venue.bookable.length })}</small></span></label>)}</div>
          </div>
        </details>
        <details className="acc">
          <summary><span>{t('compareBaseline')}</span><small>{form.baselineOn ? t('baselineOnSummary') : t('baselineOffSummary')}</small></summary>
          <div className="acc-body">
            <label className="toggle"><input type="checkbox" checked={form.baselineOn} onChange={(event) => update({ baselineOn: event.target.checked })} />{t('compareBaseline')}</label>
            {form.baselineOn && <div className="baseline-rows">{form.baseline.slice(0, form.classCount).map((option, at) => <div key={at} className="baseline-row"><span className="baseline-name">{t('planForClass', { n: at + 1 })}</span><label><span className="sr-only">{t('baselineClassSlot', { n: at + 1 })}</span><select value={option.slot} onChange={(event) => setBaseline(at, { slot: event.target.value as SlotKey })}>{SLOTS.map((slot) => <option key={slot} value={slot}>{localizedSlot(slot, t)}</option>)}</select></label><label><span className="sr-only">{t('baselineClassVenue', { n: at + 1 })}</span><select value={option.venueId} onChange={(event) => setBaseline(at, { venueId: event.target.value })}>{VENUES.map((venue) => <option key={venue.id} value={venue.id}>{localizedVenue(venue, locale)}</option>)}</select></label></div>)}</div>}
          </div>
        </details>
        <div className="plan-actions">
          <button className="button ghost" type="button" onClick={reset}>{t('reset')}</button>
          <button className="button primary lg mobile-only" type="submit">{t('showRecommend')}</button>
        </div>
      </form>
    </section>

    <section className="plan-results" aria-live="polite">
      <div className="result-top mobile-only">
        <button type="button" className="back-btn" onClick={() => setView('plan')}>‹ {t('filterOpen')}</button>
        <span className="result-summary">{summary}</span>
      </div>
      {result.status === 'insufficient' && <InsufficientPanel onReset={reset} resetLabel={t('reset')} />}
      {result.status === 'no_options' && <div className="insufficient"><h2>{t('noVenues')}</h2><p>{t('chooseVenue')}</p></div>}
      {result.status === 'no_reach' && <div className="insufficient"><h2>{t('noReach')}</h2><p>{t('widen')}</p></div>}
      {result.status === 'ok' && current && <>
        <div className="option-switch" role="group" aria-label={t('recommendTab')}>{result.recommendations.map((item, index) => <button key={item.rank} type="button" className={selected === index ? 'active' : ''} aria-pressed={selected === index} onClick={() => setSelected(index)}>{t('option', { n: item.rank })}</button>)}</div>
        <Coverage result={result} current={current} />
        <section className="card class-card">
          <h2>{t('classDetails')}</h2>
          {current.classes.map((entry, at) => <div key={entry.option.slot + entry.option.venueId} className="class-item"><span className="class-index">{at + 1}</span><div className="class-main"><strong>{localizedSlot(entry.option.slot, t)} · {localizedVenue(entry.venue, locale)}</strong><small>{localizedDong(entry.venue.dong, locale)}{entry.alternatives.length > 0 && <> · {t('sameEffect')}: {entry.alternatives.map((venue) => localizedVenue(venue, locale)).join(', ')}</>}</small><div className="class-metrics"><span>{t('added')} <b>{entry.marginalSafe.suppressed ? localizedCount(entry.marginalSafe, t) : '+' + localizedCount(entry.marginalSafe, t, 'short')}</b></span><span>{t('expected')} <b className={entry.overCapacity ? 'over' : undefined}>{localizedPeople(entry.expectedHeadcount, t)} / {t('people', { n: form.capacity })}</b></span></div></div><div className="class-numbers"><strong>{localizedCount(suppress(entry.reach), t)}</strong><small>{t('reached')}</small></div></div>)}
          {current.classes.some((entry) => entry.overCapacity) && <p className="capacity-note">{t('overCapacity')}</p>}
          <p className="table-note">{t('estimatedNote', { n: Math.round(ENROLLMENT_RATE * 100) })}</p>
        </section>
        <section className="card desktop-only"><h2>{t('heatPlan', { n: current.rank })}</h2><Heatmap compact counts={eligibleSlots.safe} max={eligibleSlots.max} caption={t('heatPlanCaption')} marks={marks} baselineSlots={baselineSlots} /></section>
        <button type="button" className="button secondary lg full" onClick={() => setDetailsOpen(true)}>{t('detailsOpen', { n: current.rank })}</button>
        <DetailsSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title={t('detailsTitle', { n: current.rank })}>
          <Heatmap compact counts={eligibleSlots.safe} max={eligibleSlots.max} caption={t('heatPlanCaption')} marks={marks} baselineSlots={baselineSlots} />
          <h3 className="sheet-sub">{t('languageTitle')}</h3>
          <Pills items={LANGUAGES.map((language) => [localizedLanguage(language, t), current.languageBreakdown[language]])} />
          <h3 className="sheet-sub">{t('levelTitle')}</h3>
          <Pills items={([...KOREAN_LEVELS, 'none'] as const).map((level) => [localizedLevel(level, t), current.koreanLevelBreakdown[level]])} />
          <h3 className="sheet-sub">{t('insights')}</h3>
          {locale === 'ko-easy'
            ? <div className="insight-copy"><p>{current.explanation}</p><ul>{[...current.languageSuggestions, ...current.teachingSuggestions, ...current.warnings].map((line) => <li key={line}>{line}</li>)}</ul></div>
            : <div className="insight-copy"><p>{t('insightSummary')}</p><ul><li>{t('languageAdvice')}</li><li>{t('teachingAdvice')}</li></ul><details className="original-insight"><summary>{t('originalDetails')}</summary><p>{t('originalNote')}</p><div lang="ko"><p>{current.explanation}</p><ul>{[...current.languageSuggestions, ...current.teachingSuggestions, ...current.warnings].map((line) => <li key={line}>{line}</li>)}</ul></div></details></div>}
        </DetailsSheet>
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
    <article className="card result-card">
      <span className="section-kicker">{t('eligible', { n: result.eligibleCount })}</span>
      <div className="result-total"><strong>{localizedCount(safeCovered, t)}</strong><span>{safeCovered.suppressed ? t('hidden') : rate + '%'}</span></div>
      <div className="meter"><span style={{ width: safeCovered.suppressed ? '2%' : rate + '%' }} /></div>
      {result.baseline && safeBaseline && <div className="baseline-compare"><span>{t('baseline')}</span><strong>{safeBaseline.suppressed ? localizedCount(safeBaseline, t) : percent(result.baseline.covered, result.eligibleCount) + '%'} → {safeCovered.suppressed ? localizedCount(safeCovered, t) : rate + '%'}</strong></div>}
      <p className="demo-result-note">{t('demoResultNote')}{result.method === 'greedy' && <><br />{t('approximate')}</>}</p>
    </article>
  )
}

function Pills({ items }: { items: [string, SafeCount][] }) {
  const { t } = useLanguage()
  return <div className="pill-list">{items.map(([label, count]) => <span key={label}>{label} <strong>{localizedCount(count, t)}</strong></span>)}</div>
}

function DetailsSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useLanguage()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal?.()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog ref={ref} className="dsheet" aria-labelledby={titleId} onClose={onClose} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="dsheet-inner">
        <div className="grab" aria-hidden="true" />
        <div className="dsheet-head"><h2 id={titleId}>{title}</h2><button type="button" className="close-btn" onClick={onClose} aria-label={t('close')}>✕</button></div>
        <div className="dsheet-body">{children}</div>
      </div>
    </dialog>
  )
}
