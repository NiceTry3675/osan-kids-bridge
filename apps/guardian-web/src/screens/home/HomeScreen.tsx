import { useState } from 'react'
import { useI18n } from '../../i18n'
import type { Interest, Program, SearchFilters, SearchResponse } from '../../data/types'
import { emptyFilters } from '../../data/types'
import { INTEREST_VISUAL } from '../../lib/content'
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
  const chips = filterChips(filters, locale)
  const hasConditions = chips.length > 0
  const openSheet = () => setSheetOpen(true)

  useRestoreScroll(search.status === 'ready', restoreScrollY)

  return (
    <main className="page" id="main">
      {hasConditions ? (
        <>
          <div className="bar-top">
            <button type="button" className="btn btn--quiet btn--back" onClick={() => onFiltersChange(emptyFilters())}><Icon name="back" />{t('backHome')}</button>
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
        <HomeHeader
          count={search.status === 'ready' ? search.data.results.length : null}
          onFit={openSheet}
          onChat={() => setChatOpen(true)}
          onInterest={(interest) => onFiltersChange({ ...filters, interests: [interest] })}
        />
      )}

      {search.status === 'loading' && <StatePanel busy title={t('loading')} />}
      {search.status === 'error' && (search.missingApi
        ? <StatePanel title={t('missingApi')} hint={t('missingApiHint')} />
        : <StatePanel title={t('loadError')} hint={t('loadErrorHint')} action={<button type="button" className="btn btn--secondary" onClick={retry}>{t('retry')}</button>} />)}
      {search.status === 'ready' && (hasConditions ? <Results data={search.data} onEdit={openSheet} /> : <AllPrograms programs={search.data.results} />)}

      {!hasConditions && <p className="home-foot">{t('homeFooter')}</p>}
      <ChatSheet open={chatOpen} onClose={() => setChatOpen(false)} program={null} suggestions={['chatSuggestSaturday', 'chatSuggestFree']} />
      <ConditionSheet open={sheetOpen} filters={filters} onClose={() => setSheetOpen(false)} onApply={(next) => { onFiltersChange(next); setSheetOpen(false) }} />
    </main>
  )
}

function HomeHeader({ count, onFit, onChat, onInterest }: { count: number | null; onFit: () => void; onChat: () => void; onInterest: (interest: Interest) => void }) {
  const { locale, t } = useI18n()
  return (
    <header className="home-head">
      <h1 className="home-title">{count === null ? t('browseTitle') : t('homeCount', { count })}</h1>
      <button type="button" className="fit-card" onClick={onFit}>
        <span className="fit-art" aria-hidden="true">🧒</span>
        <span className="fit-text"><strong>{t('fitTitle')}</strong><small>{t('fitBody')}</small></span>
        <Icon name="chevron" />
      </button>
      <AiEntry title={t('chatOpenHome')} body={t('chatOpenHomeBody')} onOpen={onChat} />
      <ul className="tiles">
        {INTERESTS.map((interest) => (
          <li key={interest}>
            <button type="button" className="tile" onClick={() => onInterest(interest)}>
              <span className={`tile-art tone-${INTEREST_VISUAL[interest].tone}`} aria-hidden="true">{INTEREST_VISUAL[interest].emoji}</span>
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

function Results({ data, onEdit }: { data: SearchResponse; onEdit: () => void }) {
  const { t } = useI18n()
  if (!data.results.length && !data.needs_confirmation.length) {
    return <StatePanel title={t('noResults')} hint={t('noResultsHint')} action={<button type="button" className="btn btn--secondary" onClick={onEdit}>{t('changeConditions')}</button>} />
  }
  return (
    <>
      <p className="result-note">{t('resultsNote')}</p>
      <ProgramSection title={t('resultsCount', { count: data.results.length })} programs={data.results} />
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
