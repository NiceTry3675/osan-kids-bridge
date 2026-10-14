import { useEffect, useMemo, useState } from 'react'
import { Heatmap, InsufficientPanel } from './Charts'
import { ENROLLMENT_RATE, MAX_CAPACITY, MIN_CAPACITY } from '../data/assumptions'
import { DEMO_RESPONSES } from '../data/generate'
import { VENUES } from '../data/venues'
import { MASKED_NOTE, countSlots, formatCount, formatHouseholds, formatPeople, suppress, suppressSlots } from '../lib/aggregate'
import { GRADES, INTERESTS, INTEREST_LABELS, KOREAN_LEVELS, KOREAN_LEVEL_LABELS, LANGUAGES, LANGUAGE_LABELS, percent } from '../lib/labels'
import { CLASS_COUNTS, initialPlanForm, toProgramPlan } from '../lib/plan'
import type { PlanForm } from '../lib/plan'
import { recommend, selectEligible } from '../lib/recommend'
import { SLOTS, slotLabel, slotLongLabel } from '../lib/slots'
import type { BaselineResult, Grade, Interest, ProgramOption, Recommendation, RecommendResult, SafeCount, SlotKey } from '../types'

interface Props { form: PlanForm; setForm: (form: PlanForm) => void }

/** 억제를 거친 비율 문구: "48%" 또는 "5가정 미만" */
const rateText = (covered: number, eligible: number) => (suppress(covered).suppressed ? formatHouseholds(suppress(covered)) : `${percent(covered, eligible)}%`)
const isMasked = (count: SafeCount) => count.suppressed && Boolean(count.masked)

/** 발표용: 주소에 ?comboLimit=0 처럼 정확 탐색 한도를 낮추면 탐욕 대체 경로를 화면에서 볼 수 있습니다. */
function readComboLimit(): number | undefined {
  if (typeof window === 'undefined') return undefined
  const text = new URLSearchParams(window.location.search).get('comboLimit')
  const value = text === null || text === '' ? NaN : Number(text)
  return Number.isInteger(value) && value >= 0 ? value : undefined
}

export function RecommendView({ form, setForm }: Props) {
  const [capacityText, setCapacityText] = useState(String(form.capacity))
  const [selected, setSelected] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
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
  const onCapacity = (text: string) => {
    setCapacityText(text)
    const value = Number(text)
    if (text !== '' && Number.isInteger(value) && value >= MIN_CAPACITY && value <= MAX_CAPACITY) update({ capacity: value })
  }
  const toggleVenue = (id: string) => update({ venueIds: form.venueIds.includes(id) ? form.venueIds.filter((item) => item !== id) : VENUES.filter((venue) => venue.id === id || form.venueIds.includes(venue.id)).map((venue) => venue.id) })
  const setBaseline = (at: number, patch: Partial<ProgramOption>) => update({ baseline: form.baseline.map((option, index) => (index === at ? { ...option, ...patch } : option)) })
  const reset = () => { const initial = initialPlanForm(); setForm(initial); setCapacityText(String(initial.capacity)) }
  const current = result.recommendations[selected] ?? result.recommendations[0]
  const marks: Partial<Record<SlotKey, string[]>> = {}
  current?.classes.forEach((item, at) => { (marks[item.option.slot] ??= []).push(`${at + 1}반`) })
  const planSummary = [
    form.interest === 'all' ? '전체 분야' : INTEREST_LABELS[form.interest],
    `${form.gradeRange[0]}~${form.gradeRange[1]}학년`,
    `${form.classCount}개 반`,
    `정원 ${form.capacity}명`,
    `후보 장소 ${form.venueIds.length}/${VENUES.length}곳`,
    form.baselineOn ? '기존 계획과 비교' : '기존 계획 비교 끔',
  ].join(' · ')

  return (
    <div className="view recommend-layout">
      <form className={`card plan-form${formOpen ? ' open' : ''}`} aria-labelledby="plan-title" onSubmit={(event) => event.preventDefault()}>
        <div className="card-head">
          <h2 id="plan-title">프로그램 조건</h2>
          <p className="plan-summary">{planSummary}</p>
          <button className="button secondary plan-toggle" type="button" aria-expanded={formOpen} aria-controls="plan-fields" onClick={() => setFormOpen(!formOpen)}>{formOpen ? '조건 접기' : '조건 바꾸기'}</button>
        </div>
        <div id="plan-fields" className="plan-fields">
          <label className="field">
            <span className="field-label">프로그램 분야</span>
            <select value={form.interest} onChange={(event) => update({ interest: event.target.value as Interest | 'all' })}>
              <option value="all">전체 분야</option>
              {INTERESTS.map((interest) => <option key={interest} value={interest}>{INTEREST_LABELS[interest]}</option>)}
            </select>
          </label>
          <fieldset className="field">
            <legend className="field-label">대상 학년</legend>
            <div className="range-row">
              <label><span className="sr-only">시작 학년</span><select value={form.gradeRange[0]} onChange={(event) => setGrade(0, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
              <span aria-hidden="true">~</span>
              <label><span className="sr-only">끝 학년</span><select value={form.gradeRange[1]} onChange={(event) => setGrade(1, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
            </div>
          </fieldset>
          <div className="field-pair">
            <fieldset className="field">
              <legend className="field-label">열 반 수</legend>
              <div className="segment">
                {CLASS_COUNTS.map((count) => (
                  <label key={count} className={form.classCount === count ? 'selected' : ''}>
                    <input type="radio" name="class-count" value={count} checked={form.classCount === count} onChange={() => update({ classCount: count })} />{count}개 반
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="field">
              <span className="field-label">반당 정원</span>
              <span className="unit-input"><input type="number" inputMode="numeric" min={MIN_CAPACITY} max={MAX_CAPACITY} value={capacityText} aria-invalid={capacityError} aria-describedby={capacityError ? 'capacity-error' : undefined} onChange={(event) => onCapacity(event.target.value)} /><span aria-hidden="true">명</span></span>
              {capacityError && <small id="capacity-error" className="field-error">{MIN_CAPACITY}~{MAX_CAPACITY}명</small>}
            </label>
          </div>
          <fieldset className="field venue-field">
            <legend className="field-label">후보 장소 <small>{form.venueIds.length}/{VENUES.length}곳</small></legend>
            <div className="inline-actions">
              <button type="button" className="text-button" onClick={() => update({ venueIds: VENUES.map((venue) => venue.id) })}>모두 선택</button>
              <button type="button" className="text-button" onClick={() => update({ venueIds: [] })}>모두 해제</button>
            </div>
            <div className="venue-list">
              {VENUES.map((venue) => (
                <label key={venue.id} className={`venue-option${form.venueIds.includes(venue.id) ? ' checked' : ''}`}>
                  <input type="checkbox" checked={form.venueIds.includes(venue.id)} onChange={() => toggleVenue(venue.id)} />
                  <span><strong>{venue.name}</strong><small>{venue.dong} · 대관 가능 {venue.bookable.length}칸</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="field baseline-field">
            <legend className="field-label">기존 계획</legend>
            <label className="toggle"><input type="checkbox" checked={form.baselineOn} onChange={(event) => update({ baselineOn: event.target.checked })} />기존 계획과 비교</label>
            <div className="baseline-rows">
              {form.baseline.slice(0, form.classCount).map((option, at) => (
                <div key={at} className="baseline-row">
                  <span className="baseline-name" aria-hidden="true">{at + 1}반</span>
                  <label><span className="sr-only">기존 계획 {at + 1}반 요일·시간대</span>
                    <select value={option.slot} disabled={!form.baselineOn} onChange={(event) => setBaseline(at, { slot: event.target.value as SlotKey })}>
                      {SLOTS.map((slot) => <option key={slot} value={slot}>{slotLabel(slot)}</option>)}
                    </select>
                  </label>
                  <label><span className="sr-only">기존 계획 {at + 1}반 장소</span>
                    <select value={option.venueId} disabled={!form.baselineOn} onChange={(event) => setBaseline(at, { venueId: event.target.value })}>
                      {VENUES.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
          <button className="button ghost full" type="button" onClick={reset}>초기화</button>
        </div>
      </form>

      <div className="results">
        <p className="sr-only" role="status">{statusText(result)}</p>
        {result.status === 'insufficient' && <InsufficientPanel onReset={reset} resetLabel="초기화" />}
        {result.status === 'no_options' && <EmptyState title="후보 장소 없음" text="장소를 하나 이상 선택하세요." />}
        {result.status === 'no_reach' && <EmptyState title="참여 가능한 가정 없음" text="장소를 추가하거나 분야·학년 조건을 넓혀 보세요." />}
        {result.status === 'ok' && current && (
          <>
            {result.notices.length > 0 && <ul className="notice-list">{result.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul>}
            <div className="overview-grid">
              <section id="mini-heat" className="card mini-heat" aria-labelledby="mini-heat-title">
                <div className="card-head">
                  <h2 id="mini-heat-title">대상 가정 {formatHouseholds(suppress(result.eligibleCount))} · {current.rank}안 위치</h2>
                </div>
                <Heatmap compact counts={eligibleSlots.safe} max={eligibleSlots.max} caption={`대상 수요 히트맵과 추천 ${current.rank}위 칸`} marks={marks} baselineSlots={result.baseline?.classes.map((item) => item.option.slot)} />
              </section>
              <CompareCard result={result} best={result.recommendations[0]} />
            </div>
            <div className="rec-list">
              {result.recommendations.map((item, at) => (
                <RecommendationCard key={item.options.map((option) => `${option.slot}|${option.venueId}`).join(',')} item={item} eligible={result.eligibleCount} capacity={form.capacity} baseline={result.baseline} selected={at === selected} onSelect={() => { setSelected(at); document.getElementById('mini-heat')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** 화면 읽기 프로그램용 한 줄 요약(결과 전체를 다시 읽지 않도록 이 줄만 알림) */
function statusText(result: RecommendResult): string {
  const best = result.recommendations[0]
  if (result.status !== 'ok' || !best) return ''
  const baseline = result.baseline ? ` · 기존 계획 ${rateText(result.baseline.covered, result.eligibleCount)}` : ''
  return `1안: 대상 ${formatHouseholds(suppress(result.eligibleCount))} 중 ${formatHouseholds(suppress(best.covered))}(${rateText(best.covered, result.eligibleCount)})${baseline}`
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="insufficient" role="status"><div className="state-icon" aria-hidden="true">?</div><h2>{title}</h2><p>{text}</p></div>
}

function CompareCard({ result, best }: { result: RecommendResult; best: Recommendation }) {
  const eligible = result.eligibleCount
  const baseline = result.baseline
  const rows = [
    ...(baseline ? [{ key: 'baseline', label: `기존 계획(${baseline.classes.length}개 반)`, covered: baseline.covered, tone: 'baseline' }] : []),
    ...(best.classes.length > 1 ? [{ key: 'single', label: '1개 반 최대', covered: result.bestSingleCovered, tone: 'single' }] : []),
    { key: 'best', label: `1안(${best.classes.length}개 반)`, covered: best.covered, tone: 'best' },
  ]
  return (
    <section className="card compare-card" aria-labelledby="compare-title">
      <div className="card-head">
        <h2 id="compare-title">기존 계획 대비</h2>
        {baseline
          ? <p>{baseline.classes.map((item) => `${slotLabel(item.option.slot)} ${item.venue.name}${item.bookable ? '' : '(대관 불가 칸)'}`).join(' · ')}</p>
          : <p>기존 계획 비교가 꺼져 있습니다.</p>}
      </div>
      {baseline && <p className="compare-headline"><strong>{rateText(baseline.covered, eligible)}</strong> → <strong>{rateText(best.covered, eligible)}</strong></p>}
      <ul className="compare-bars">
        {rows.map((row) => {
          const safe = suppress(row.covered)
          return (
            <li key={row.key}>
              <span className="bar-label">{row.label}</span>
              <span className="bar-track" aria-hidden="true"><span className={`bar-fill ${row.tone}${safe.suppressed ? ' suppressed' : ''}`} style={{ width: safe.suppressed ? '8px' : `${eligible ? (row.covered / eligible) * 100 : 0}%` }} /></span>
              <span className="bar-value">{formatHouseholds(safe)}{!safe.suppressed && <small> {percent(row.covered, eligible)}%</small>}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

interface CardProps { item: Recommendation; eligible: number; capacity: number; baseline?: BaselineResult; selected: boolean; onSelect: () => void }

function RecommendationCard({ item, eligible, capacity, baseline, selected, onSelect }: CardProps) {
  const coveredSafe = suppress(item.covered)
  const titleId = `rec-${item.rank}-title`
  const levelKeys = [...KOREAN_LEVELS, 'none' as const]
  const masked = item.classes.some((entry) => isMasked(entry.marginalSafe)) || LANGUAGES.some((language) => isMasked(item.languageBreakdown[language])) || levelKeys.some((level) => isMasked(item.koreanLevelBreakdown[level]))
  return (
    <article className={`card rec-card${selected ? ' selected' : ''}${item.rank === 1 ? ' top' : ''}`} aria-labelledby={titleId}>
      <header className="rec-head">
        <div>
          <span className="rank">{item.rank}안</span>
          <h3 id={titleId}>{item.classes.map((entry) => `${slotLabel(entry.option.slot)} ${entry.venue.dong}`).join(' · ')}</h3>
        </div>
        <button type="button" className={`select-button${selected ? ' active' : ''}`} aria-pressed={selected} onClick={onSelect}>{selected ? '표시 중' : '히트맵 보기'}</button>
      </header>

      <div className="coverage">
        <p className="coverage-line"><strong>{formatHouseholds(coveredSafe)}{!coveredSafe.suppressed && ` (${percent(item.covered, eligible)}%)`}</strong> / 대상 {formatHouseholds(suppress(eligible))}</p>
        <span className="meter" aria-hidden="true"><span style={{ width: coveredSafe.suppressed ? '2%' : `${(item.covered / Math.max(1, eligible)) * 100}%` }} /></span>
        {baseline && item.baselineDelta !== undefined && (
          <p className={`delta${item.baselineDelta > 0 ? ' up' : ''}`}>기존 계획 {rateText(baseline.covered, eligible)} 대비{!suppress(baseline.covered).suppressed && !coveredSafe.suppressed && item.baselineDelta !== 0 && ` (${item.baselineDelta > 0 ? '+' : ''}${item.baselineDelta}가정)`}</p>
        )}
      </div>

      <div className="table-wrap">
        <table className="class-table">
          <caption className="sr-only">추천 {item.rank}위 반별 내역</caption>
          <thead><tr><th scope="col">반</th><th scope="col">요일·시간대</th><th scope="col">장소</th><th scope="col">닿는 가정</th><th scope="col">새로 더함</th><th scope="col">예상 신청 / 정원</th></tr></thead>
          <tbody>
            {item.classes.map((entry, at) => (
              <tr key={`${entry.option.slot}|${entry.option.venueId}`}>
                <th scope="row">{at + 1}반</th>
                <td>{slotLongLabel(entry.option.slot)}</td>
                <td>{entry.venue.name}<small>{entry.venue.dong}{entry.alternatives.length > 0 && ` · 같은 효과: ${entry.alternatives.map((venue) => venue.name).join(', ')}`}</small></td>
                <td className="num">{formatCount(suppress(entry.reach))}</td>
                <td className="num">{!entry.marginalSafe.suppressed && entry.marginalSafe.value === 0 ? '0' : isMasked(entry.marginalSafe) ? formatCount(entry.marginalSafe) : `+${formatCount(entry.marginalSafe)}`}</td>
                <td className="num">
                  {formatPeople(entry.expectedHeadcount)} / {capacity}명
                  {entry.overCapacity && <span className="tag warn">정원 초과</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="table-note">예상 신청: 신청률 {Math.round(ENROLLMENT_RATE * 100)}% 기준{masked ? ` · ${MASKED_NOTE}` : ''}</p>

      <div className="support-grid">
        <section aria-label="통역·번역 준비">
          <h4>사용 언어</h4>
          <p className="dist">{LANGUAGES.map((language) => <span key={language}>{LANGUAGE_LABELS[language]} <b>{formatHouseholds(item.languageBreakdown[language])}</b></span>)}</p>
        </section>
        <section aria-label="수업 난이도와 보조 인력">
          <h4>자녀 한국어 수준</h4>
          <p className="dist">{levelKeys.map((level) => <span key={level}>{KOREAN_LEVEL_LABELS[level]} <b>{formatHouseholds(item.koreanLevelBreakdown[level])}</b></span>)}</p>
        </section>
      </div>

      {item.warnings.some((line) => !line.includes('정원')) && (
        <ul className="warning-list" aria-label="확인할 점">{item.warnings.filter((line) => !line.includes('정원')).map((line) => <li key={line}>{line}</li>)}</ul>
      )}
    </article>
  )
}
