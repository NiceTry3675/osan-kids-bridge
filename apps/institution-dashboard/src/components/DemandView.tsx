import { useMemo } from 'react'
import { BarList, Heatmap, InsufficientPanel, StatTile } from './Charts'
import { DONGS, SUPPRESSION_THRESHOLD } from '../data/assumptions'
import { DEMO_RESPONSES } from '../data/generate'
import { MASKED_LABEL, defaultFilters, filterResponses, formatHouseholds, summarize } from '../lib/aggregate'
import type { DemandFilters } from '../lib/aggregate'
import { GRADES, INTERESTS, INTEREST_LABELS, KOREAN_LEVEL_LABELS, LANGUAGES, LANGUAGE_LABELS } from '../lib/labels'
import { slotLabel } from '../lib/slots'
import type { Dong, Grade, Interest, ScreenLanguage } from '../types'

interface Props { filters: DemandFilters; setFilters: (filters: DemandFilters) => void }

export function DemandView({ filters, setFilters }: Props) {
  const summary = useMemo(() => summarize(filterResponses(DEMO_RESPONSES, filters), filters), [filters])
  const filtered = filters.dongs.length > 0 || filters.interest !== 'all' || filters.language !== 'all' || filters.gradeRange[0] !== 1 || filters.gradeRange[1] !== 6
  const toggleDong = (dong: Dong) => setFilters({ ...filters, dongs: filters.dongs.includes(dong) ? filters.dongs.filter((item) => item !== dong) : DONGS.filter((item) => item === dong || filters.dongs.includes(item)) })
  const setGrade = (index: 0 | 1, grade: Grade) => {
    const range: [Grade, Grade] = index === 0 ? [grade, Math.max(grade, filters.gradeRange[1]) as Grade] : [Math.min(grade, filters.gradeRange[0]) as Grade, grade]
    setFilters({ ...filters, gradeRange: range })
  }

  return (
    <div className="view">
      <form className="filter-bar" aria-label="수요 필터" onSubmit={(event) => event.preventDefault()}>
        <fieldset className="filter-group dong-filter">
          <legend>동 <small>{filters.dongs.length ? `${filters.dongs.length}개 선택` : '전체'}</small></legend>
          <div className="chip-row">
            {DONGS.map((dong) => (
              <label key={dong} className={`check-chip${filters.dongs.includes(dong) ? ' checked' : ''}`}>
                <input type="checkbox" checked={filters.dongs.includes(dong)} onChange={() => toggleDong(dong)} />{dong}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="filter-group">
          <legend>자녀 학년</legend>
          <div className="range-row">
            <label><span className="sr-only">시작 학년</span>
              <select value={filters.gradeRange[0]} onChange={(event) => setGrade(0, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select>
            </label>
            <span aria-hidden="true">~</span>
            <label><span className="sr-only">끝 학년</span>
              <select value={filters.gradeRange[1]} onChange={(event) => setGrade(1, Number(event.target.value) as Grade)}>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select>
            </label>
          </div>
        </fieldset>
        <label className="filter-group">
          <span className="filter-label">관심 분야</span>
          <select value={filters.interest} onChange={(event) => setFilters({ ...filters, interest: event.target.value as Interest | 'all' })}>
            <option value="all">전체 분야</option>
            {INTERESTS.map((interest) => <option key={interest} value={interest}>{INTEREST_LABELS[interest]}</option>)}
          </select>
        </label>
        <label className="filter-group">
          <span className="filter-label">사용 언어</span>
          <select value={filters.language} onChange={(event) => setFilters({ ...filters, language: event.target.value as ScreenLanguage | 'all' })}>
            <option value="all">전체 언어</option>
            {LANGUAGES.map((language) => <option key={language} value={language}>{LANGUAGE_LABELS[language]}</option>)}
          </select>
        </label>
        <button className="button ghost reset" type="button" onClick={() => setFilters(defaultFilters())} disabled={!filtered}>필터 초기화</button>
      </form>

      {summary.status === 'insufficient' ? <InsufficientPanel onReset={() => setFilters(defaultFilters())} resetLabel="필터 초기화" /> : (
        <>
          <div className="stat-row" aria-live="polite">
            <StatTile label="응답 가정" value={formatHouseholds({ suppressed: false, value: summary.total })} note={filtered ? `전체 ${DEMO_RESPONSES.length}가정 중` : undefined} />
            <StatTile label="가장 많이 가능한 시간" value={summary.topSlots[0] ? slotLabel(summary.topSlots[0].slot) : '가림'} note={summary.topSlots[0] ? formatHouseholds(summary.topSlots[0].count) : `모든 칸 ${SUPPRESSION_THRESHOLD}가정 미만`} />
            <StatTile label="가정당 가능 시간" value={`${summary.averageSlots.toFixed(1)}칸`} note={summary.averageSlotsEstimated ? '21칸 중 평균(추정)' : '21칸 중 평균'} />
            <StatTile label="한국어 수준 응답률" value={summary.koreanLevelResponseRate === null ? MASKED_LABEL : `${Math.round(summary.koreanLevelResponseRate * 100)}%`} note={summary.koreanLevelResponseRate === null ? '미응답 수 비공개' : undefined} />
          </div>
          <div className="demand-grid">
            <section className="card heat-card" aria-labelledby="heat-title">
              <div className="card-head"><h2 id="heat-title">요일·시간대별 참여 가능 가정</h2></div>
              <Heatmap counts={summary.slots} max={summary.maxSlotValue} caption="요일·시간대별 참여 가능 가정 수" />
            </section>
            <section className="card" aria-labelledby="dong-title">
              <div className="card-head"><h2 id="dong-title">동별 응답</h2></div>
              <BarList label="동별 응답 가정 수" total={summary.total} items={[...summary.dongs].sort((a, b) => (b.count.suppressed ? 2.5 : b.count.value) - (a.count.suppressed ? 2.5 : a.count.value)).map(({ dong, count }) => ({ key: dong, label: dong, count }))} />
            </section>
            <section className="card" aria-labelledby="language-title">
              <div className="card-head"><h2 id="language-title">사용 언어</h2></div>
              <BarList label="화면 언어별 응답 가정 수" total={summary.total} items={summary.languages.map(({ language, count }) => ({ key: language, label: LANGUAGE_LABELS[language], count }))} />
            </section>
            <section className="card" aria-labelledby="level-title">
              <div className="card-head"><h2 id="level-title">자녀 한국어 수준</h2></div>
              <BarList label="자녀 한국어 수준별 응답 가정 수" total={summary.total} items={summary.koreanLevels.map(({ level, count }) => ({ key: level, label: KOREAN_LEVEL_LABELS[level], count, tone: level === 'none' ? 'muted' : undefined }))} />
            </section>
          </div>
        </>
      )}
    </div>
  )
}
