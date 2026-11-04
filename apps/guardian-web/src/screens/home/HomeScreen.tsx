import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import type { Interest, Program, SearchFilters, SearchResponse } from '../../data/types'
import { emptyFilters } from '../../data/types'
import { INTEREST_VISUAL, isPreferred } from '../../lib/content'
import { filterChips, INTERESTS, removeChip } from '../../lib/filters'
import { interestLabel } from '../../lib/format'
import { useRestoreScroll } from '../../lib/router'
import { Icon } from '../../components/Icon'
import { StatePanel } from '../../components/feedback'
import { ProgramItem } from '../../components/ProgramItem'
import { ConditionSheet } from './ConditionSheet'
import { ChatSheet } from '../chat/ChatSheet'
import { AiEntry } from '../chat/AiEntry'
import { useSearch } from './useSearch'
import { PosterStrip } from './PosterStrip'
import { InterestIcon, ValueIcon } from '../intro/art'

interface Props {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  restoreScrollY?: number
}

/** 02 홈과 04 결과는 같은 페이지입니다. 조건이 없으면 홈, 있으면 결과로 보입니다. */
export function HomeScreen({ filters, onFiltersChange, restoreScrollY }: Props) {
  const { locale, t } = useI18n()
  const [search, retry] = useSearch(filters, locale)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  // 조건 지우기는 되돌릴 수 있게 지운 조건을 잠시 기억합니다.
  const [cleared, setCleared] = useState<SearchFilters | null>(null)
  const chips = filterChips(filters, locale)
  const hasConditions = chips.length > 0
  useEffect(() => { if (hasConditions) setCleared(null) }, [hasConditions])
  const openSheet = () => setSheetOpen(true)

  useRestoreScroll(search.status === 'ready', restoreScrollY)

  return (
    <main className="page" id="main" tabIndex={-1}>
      {hasConditions ? (
        <>
          <div className="bar-top">
            <button type="button" className="btn btn--quiet" onClick={() => { setCleared(filters); onFiltersChange(emptyFilters()) }}><Icon name="x" />{t('clearConditions')}</button>
            <button type="button" className="btn btn--quiet" onClick={openSheet}><Icon name="sliders" />{t('changeConditions')}</button>
          </div>
          <ul className="chips" aria-label={t('appliedConditions')}>
            {chips.map((chip) => (
              <li key={chip.key}>
                <button type="button" className="chip chip--on" onClick={() => onFiltersChange(removeChip(filters, chip.key))} aria-label={t('removeCondition', { label: chip.label })}>
                  {chip.label}<Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
        {cleared && (
          <p className="undo-bar" role="status">
            <span>{t('conditionsCleared')}</span>
            <button type="button" className="btn btn--quiet" onClick={() => onFiltersChange(cleared)}>{t('undo')}</button>
          </p>
        )}
        <HomeHeader
          count={search.status === 'ready' ? search.data.results.length : null}
          programs={search.status === 'ready' ? search.data.results : []}
          onFit={openSheet}
          onChat={() => setChatOpen(true)}
          onInterest={(interest) => onFiltersChange({ ...filters, interests: [interest] })}
        />
        </>
      )}

      {search.status === 'loading' && <StatePanel busy title={t('loading')} />}
      {search.status === 'error' && (search.missingApi
        ? <StatePanel title={t('missingApi')} hint={t('missingApiHint')} />
        : <StatePanel title={t('loadError')} hint={t('loadErrorHint')} action={<button type="button" className="btn btn--secondary" onClick={retry}>{t('retry')}</button>} />)}
      {search.status === 'ready' && (hasConditions ? <Results data={search.data} filters={filters} onEdit={openSheet} /> : <AllPrograms programs={search.data.results} />)}

      {!hasConditions && <p className="home-foot">{t('homeFooter')}</p>}
      <ChatSheet open={chatOpen} onClose={() => setChatOpen(false)} program={null} suggestions={['chatSuggestSaturday', 'chatSuggestFree']} />
      <ConditionSheet open={sheetOpen} filters={filters} onClose={() => setSheetOpen(false)} onApply={(next) => { onFiltersChange(next); setSheetOpen(false) }} />
    </main>
  )
}

interface HomeHeaderProps {
  count: number | null
  programs: Program[]
  onFit: () => void
  onChat: () => void
  onInterest: (interest: Interest) => void
}

/** 홈 머리: 제목 → 내 언어로 바꾼 포스터 → 우리 아이에게 맞게 보기 → AI 상담 → 분야. 첫 화면의 세 가지 가치와 같은 아이콘을 씁니다. */
function HomeHeader({ count, programs, onFit, onChat, onInterest }: HomeHeaderProps) {
  const { locale, t } = useI18n()
  return (
    <header className="home-head">
      <h1 className="home-title">{count === null ? t('browseTitle') : t('homeCount', { count })}</h1>
      <PosterStrip programs={programs} />
      <button type="button" className="fit-card" onClick={onFit}>
        <span className="fit-art" aria-hidden="true"><ValueIcon name="fit" /></span>
        <span className="fit-text"><strong>{t('fitTitle')}</strong><small>{t('fitBody')}</small></span>
        <Icon name="chevron" />
      </button>
      <AiEntry title={t('chatOpenHome')} body={t('chatOpenHomeBody')} onOpen={onChat} />
      <ul className="tiles">
        {INTERESTS.map((interest) => (
          <li key={interest}>
            <button type="button" className="tile" onClick={() => onInterest(interest)}>
              <span className={`tile-art tone-${INTEREST_VISUAL[interest].tone}`} aria-hidden="true"><InterestIcon interest={interest} /></span>
              {interestLabel(locale, interest)}
            </button>
          </li>
        ))}
      </ul>
    </header>
  )
}

function AllPrograms({ programs }: { programs: Program[] }) {
  const { t } = useI18n()
  if (!programs.length) return <StatePanel title={t('emptyAll')} />
  const open = programs.filter((program) => program.application_status === 'open')
  const rest = programs.filter((program) => program.application_status !== 'open')
  return (
    <>
      {open.length > 0 && <ProgramSection title={t('openNow')} programs={open} />}
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
  const confirmed = data.results.filter((program) => program.age_grade_match_status !== 'unknown')
  const ageCheck = data.results.filter((program) => program.age_grade_match_status === 'unknown')
  const prefers = filters.interests.length > 0 || !!filters.dong
  const preferred = prefers ? confirmed.filter((program) => isPreferred(program, filters)) : []
  const others = prefers ? confirmed.filter((program) => !isPreferred(program, filters)) : confirmed
  const anyPreferred = [...data.results, ...data.needs_confirmation].some((program) => isPreferred(program, filters))
  return (
    <>
      {prefers && !anyPreferred && <p className="result-note">{t('noPreferred')}</p>}
      {!confirmed.length && <p className="result-note">{t('noExactMatch')}</p>}
      {confirmed.length > 0 && <p className="result-note">{t('resultsNote')}</p>}
      {preferred.length > 0 && <ProgramSection title={t('preferredTitle', { count: preferred.length })} programs={preferred} />}
      {others.length > 0 && <ProgramSection title={t(prefers ? 'otherResultsTitle' : 'resultsCount', { count: others.length })} programs={others} />}
      {ageCheck.length > 0 && <ProgramSection title={t('ageCheckTitle', { count: ageCheck.length })} note={t('ageCheckNote')} programs={ageCheck} />}
      {data.needs_confirmation.length > 0 && (
        <ProgramSection title={t('needsTimeTitle', { count: data.needs_confirmation.length })} note={t('needsTimeNote')} programs={data.needs_confirmation} />
      )}
    </>
  )
}

function ProgramSection({ title, note, programs }: { title: string; note?: string; programs: Program[] }) {
  return (
    <section className="list-section">
      <h2 className="list-title">{title}</h2>
      {note && <p className="list-note">{note}</p>}
      <ul className="items">{programs.map((program) => <ProgramItem key={program.program_id} program={program} />)}</ul>
    </section>
  )
}
