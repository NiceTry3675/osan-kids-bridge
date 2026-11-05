import { useState } from 'react'
import { useI18n } from '../../i18n'
import type { Interest, Program, SearchFilters, SearchResponse } from '../../data/types'
import { emptyFilters } from '../../data/types'
import { isPreferred, isUnlikelyBasis, likelyCount } from '../../lib/content'
import { filterChips, INTERESTS, removeChip } from '../../lib/filters'
import { interestLabel } from '../../lib/format'
import { scrollToTop, useRestoreScroll } from '../../lib/router'
import { Icon } from '../../components/Icon'
import { StatePanel } from '../../components/feedback'
import { ProgramItem } from '../../components/ProgramItem'
import { ConditionSheet } from './ConditionSheet'
import { ChatSheet } from '../chat/ChatSheet'
import { agentAvailable } from '../../data/agent'
import { useSearch } from './useSearch'
import { PosterStrip } from './PosterStrip'
import { InterestIcon } from '../intro/art'

interface Props {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  restoreScrollY?: number
}

/**
 * 02 홈과 04 결과는 같은 페이지입니다. 조건이 없으면 홈, 있으면 결과로 보입니다.
 * 조건과 분야는 위쪽 줄에 고정해, 목록을 내려도 바로 바꿀 수 있습니다.
 */
export function HomeScreen({ filters, onFiltersChange, restoreScrollY }: Props) {
  const { locale, t } = useI18n()
  const [search, retry] = useSearch(filters, locale)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const chips = filterChips(filters, locale)
  const hasConditions = chips.length > 0
  // 조건이 바뀌면 결과가 달라지므로 맨 위부터 보여 줍니다.
  const change = (next: SearchFilters) => { onFiltersChange(next); scrollToTop() }
  const openSheet = () => setSheetOpen(true)

  useRestoreScroll(search.status === 'ready', restoreScrollY)

  return (
    <main className="page" id="main" tabIndex={-1}>
      <HomeBar filters={filters} onChange={change} onConditions={openSheet} onChat={() => setChatOpen(true)} />
      {hasConditions ? (
        <div className="results-head">
          <h1 className="home-title">{search.status === 'ready' ? t('foundCount', { count: likelyCount(search.data, filters) }) : t('browseTitle')}</h1>
          <button type="button" className="btn btn--quiet" onClick={() => change(emptyFilters())}>{t('clearConditions')}</button>
        </div>
      ) : (
        <header className="home-head">
          <h1 className="home-title">{search.status === 'ready' ? t('homeCount', { count: search.data.results.length }) : t('browseTitle')}</h1>
          <PosterStrip programs={search.status === 'ready' ? search.data.results : []} />
        </header>
      )}

      {search.status === 'loading' && <StatePanel busy title={t('loading')} />}
      {search.status === 'error' && (search.missingApi
        ? <StatePanel title={t('missingApi')} hint={t('missingApiHint')} />
        : <StatePanel title={t('loadError')} hint={t('loadErrorHint')} action={<button type="button" className="btn btn--secondary" onClick={retry}>{t('retry')}</button>} />)}
      {search.status === 'ready' && (hasConditions ? <Results data={search.data} filters={filters} onEdit={openSheet} /> : <AllPrograms programs={search.data.results} />)}

      <ChatSheet open={chatOpen} onClose={() => setChatOpen(false)} program={null} suggestions={['chatSuggestSaturday', 'chatSuggestFree']} />
      <ConditionSheet open={sheetOpen} filters={filters} onClose={() => setSheetOpen(false)} onApply={(next) => { change(next); setSheetOpen(false) }} />
    </main>
  )
}

interface HomeBarProps {
  filters: SearchFilters
  onChange: (filters: SearchFilters) => void
  onConditions: () => void
  onChat: () => void
}

/** 위쪽에 고정되는 줄: 아이 조건 · AI 상담 · 넣은 조건(눌러서 빼기) · 분야(눌러서 먼저 보기). 옆으로 밀어 봅니다. */
function HomeBar({ filters, onChange, onConditions, onChat }: HomeBarProps) {
  const { locale, t } = useI18n()
  const applied = filterChips(filters, locale).filter((chip) => !chip.key.startsWith('interest-'))
  const toggle = (interest: Interest) => onChange({
    ...filters,
    interests: filters.interests.includes(interest) ? filters.interests.filter((item) => item !== interest) : [...filters.interests, interest],
  })
  return (
    <div className="home-bar">
      <button type="button" className="chip home-bar-fit" onClick={onConditions}><Icon name="sliders" />{t('conditionsShort')}</button>
      <div className="home-bar-row">
        {agentAvailable && <button type="button" className="chip home-bar-ai" onClick={onChat}>{t('askAiShort')}</button>}
        {applied.map((chip) => (
          <button key={chip.key} type="button" className="chip chip--on" onClick={() => onChange(removeChip(filters, chip.key))} aria-label={t('removeCondition', { label: chip.label })}>
            {chip.label}<Icon name="x" />
          </button>
        ))}
        {INTERESTS.map((interest) => (
          <button key={interest} type="button" className="chip chip--pick" aria-pressed={filters.interests.includes(interest)}
            onClick={(event) => { event.currentTarget.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }); toggle(interest) }}>
            <InterestIcon interest={interest} />{interestLabel(locale, interest)}
          </button>
        ))}
      </div>
    </div>
  )
}

function AllPrograms({ programs }: { programs: Program[] }) {
  const { t } = useI18n()
  if (!programs.length) return <StatePanel title={t('emptyAll')} />
  const open = programs.filter((program) => program.application_status === 'open')
  const rest = programs.filter((program) => program.application_status !== 'open')
  return (
    <>
      {open.length > 0 && <ProgramSection programs={open} />}
      {rest.length > 0 && <ProgramSection title={t('otherPrograms')} programs={rest} />}
    </>
  )
}

/**
 * 결과를 ‘왜 여기 있는지’가 보이게 나눕니다: 먼저 볼 공고 → 다른 공고 → 학년·나이를 확인할 공고 → 시간을 확인할 공고.
 * 공고의 기준이 넣은 조건과 다르면(학년으로 찾았는데 공고는 나이) 임의로 환산해 빼지 않고(명세 3장) 따로 묶어 알립니다.
 */
function Results({ data, filters, onEdit }: { data: SearchResponse; filters: SearchFilters; onEdit: () => void }) {
  const { t } = useI18n()
  if (!data.results.length && !data.needs_confirmation.length) {
    return <StatePanel title={t('noResults')} hint={t('noResultsHint')} action={<button type="button" className="btn btn--secondary" onClick={onEdit}>{t('changeConditions')}</button>} />
  }
  const unlikely = [...data.results, ...data.needs_confirmation].filter((program) => isUnlikelyBasis(program, filters))
  const likely = (programs: Program[]) => programs.filter((program) => !unlikely.includes(program))
  const results = likely(data.results)
  const timeCheck = likely(data.needs_confirmation)
  const confirmed = results.filter((program) => program.age_grade_match_status !== 'unknown')
  const ageCheck = results.filter((program) => program.age_grade_match_status === 'unknown')
  const prefers = filters.interests.length > 0 || !!filters.dong
  const preferred = prefers ? confirmed.filter((program) => isPreferred(program, filters)) : []
  const others = prefers ? confirmed.filter((program) => !isPreferred(program, filters)) : confirmed
  const anyPreferred = [...data.results, ...data.needs_confirmation].some((program) => isPreferred(program, filters))
  return (
    <>
      {prefers && !anyPreferred && <p className="result-note">{t('noPreferred')}</p>}
      {!confirmed.length && <p className="result-note">{t('noExactMatch')}</p>}
      {preferred.length > 0 && <ProgramSection title={t('preferredTitle', { count: preferred.length })} programs={preferred} />}
      {others.length > 0 && (preferred.length > 0
        ? <Fold id={`others-${JSON.stringify(filters)}`} summary={t('showOthers', { count: others.length })} programs={others} />
        : <ProgramSection title={t(prefers ? 'otherResultsTitle' : 'resultsCount', { count: others.length })} programs={others} />)}
      {ageCheck.length > 0 && <ProgramSection title={t('ageCheckTitle', { count: ageCheck.length })} note={t('ageCheckNote')} programs={ageCheck} />}
      {timeCheck.length > 0 && <ProgramSection title={t('needsTimeTitle', { count: timeCheck.length })} programs={timeCheck} />}
      {unlikely.length > 0 && <Fold id={`unlikely-${JSON.stringify(filters)}`} summary={t('showUnlikely', { count: unlikely.length })} note={t('unlikelyNote')} programs={unlikely} />}
    </>
  )
}

const FOLD_KEY = 'guardian-open-folds'
const openFolds = (): string[] => { try { return JSON.parse(sessionStorage.getItem(FOLD_KEY) ?? '[]') as string[] } catch { return [] } }

/**
 * 접어 둔 공고: 빠진 것이 아니라 언제든 펼칠 수 있습니다(명세 3장: 먼저 보기와 기준이 다른 공고는 제외하지 않습니다).
 * 상세에 다녀와도 펼친 상태와 보던 자리가 그대로이도록 조건별로 기억합니다.
 */
function Fold({ id, summary, note, programs }: { id: string; summary: string; note?: string; programs: Program[] }) {
  const [open, setOpen] = useState(() => openFolds().includes(id))
  const toggle = (next: boolean) => {
    setOpen(next)
    try { sessionStorage.setItem(FOLD_KEY, JSON.stringify(next ? [...new Set([...openFolds(), id])] : openFolds().filter((item) => item !== id))) } catch { /* 이번 화면에서만 기억합니다. */ }
  }
  return (
    <details className="others-fold" open={open} onToggle={(event) => toggle(event.currentTarget.open)}>
      <summary>{summary}</summary>
      {note && <p className="list-note">{note}</p>}
      <ProgramSection programs={programs} />
    </details>
  )
}

function ProgramSection({ title, note, programs }: { title?: string; note?: string; programs: Program[] }) {
  return (
    <section className="list-section">
      {title && <h2 className="list-title">{title}</h2>}
      {note && <p className="list-note">{note}</p>}
      <ul className="items">{programs.map((program) => <ProgramItem key={program.program_id} program={program} />)}</ul>
    </section>
  )
}
