import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { MissingApiError, searchPrograms } from '../data/api'
import type { Interest, Program, SearchFilters, SearchResponse } from '../data/types'
import { emptyFilters } from '../data/types'
import { filterChips, interestLabel, INTERESTS, removeChip } from '../lib/format'
import { useRestoreScroll } from '../lib/router'
import { INTEREST_VISUAL } from '../lib/visual'
import { Icon, StatePanel } from '../components/bits'
import { ProgramItem } from '../components/ProgramItem'
import { ConditionSheet } from './ConditionSheet'

type Load = { status: 'loading' } | { status: 'error'; missingApi: boolean } | { status: 'ready'; data: SearchResponse }

/** 같은 조건·언어로 돌아왔을 때 바로 그리기 위한 마지막 결과(새로고침하면 사라짐) */
const cache = new Map<string, SearchResponse>()

interface Props {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  restoreScrollY?: number
}

/** 홈과 결과는 같은 페이지입니다. 조건이 없으면 홈, 있으면 결과로 보입니다. */
export function BrowseScreen({ filters, onFiltersChange, restoreScrollY }: Props) {
  const { locale, t } = useI18n()
  const cacheKey = JSON.stringify([filters, locale])
  const [load, setLoad] = useState<Load>(() => {
    const cached = cache.get(cacheKey)
    return cached ? { status: 'ready', data: cached } : { status: 'loading' }
  })
  const [attempt, setAttempt] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const cached = cache.get(cacheKey)
    if (cached) setLoad({ status: 'ready', data: cached })
    else setLoad((previous) => (previous.status === 'ready' ? previous : { status: 'loading' }))
    searchPrograms(filters, locale, controller.signal)
      .then((data) => { cache.set(cacheKey, data); setLoad({ status: 'ready', data }) })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad({ status: 'error', missingApi: error instanceof MissingApiError })
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, attempt])

  useRestoreScroll(load.status === 'ready', restoreScrollY)

  const chips = filterChips(filters, locale)
  const hasConditions = chips.length > 0
  const pickInterest = (interest: Interest) => onFiltersChange({ ...filters, interests: [interest] })

  return (
    <main className="page" id="main">
      {hasConditions ? (
        <>
          <div className="bar-top">
            <button type="button" className="btn btn--quiet btn--back" onClick={() => onFiltersChange(emptyFilters())}><Icon name="back" />{t('backHome')}</button>
            <button type="button" className="btn btn--quiet" onClick={() => setSheetOpen(true)}><Icon name="sliders" />{t('changeConditions')}</button>
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
        <header className="home-head">
          <h1 className="home-title">{load.status === 'ready' ? t('homeCount', { count: load.data.results.length }) : t('browseTitle')}</h1>
          <button type="button" className="fit-card" onClick={() => setSheetOpen(true)}>
            <span className="fit-art" aria-hidden="true">🧒</span>
            <span className="fit-text"><strong>{t('fitTitle')}</strong><small>{t('fitBody')}</small></span>
            <Icon name="chevron" />
          </button>
          <ul className="tiles">
            {INTERESTS.map((interest) => (
              <li key={interest}>
                <button type="button" className="tile" onClick={() => pickInterest(interest)}>
                  <span className={`tile-art tone-${INTEREST_VISUAL[interest].tone}`} aria-hidden="true">{INTEREST_VISUAL[interest].emoji}</span>
                  {interestLabel(locale, interest)}
                </button>
              </li>
            ))}
          </ul>
        </header>
      )}

      {load.status === 'loading' && <StatePanel busy title={t('loading')} />}
      {load.status === 'error' && (
        load.missingApi
          ? <StatePanel title={t('missingApi')} hint={t('missingApiHint')} />
          : <StatePanel title={t('loadError')} hint={t('loadErrorHint')} action={<button type="button" className="btn btn--secondary" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</button>} />
      )}
      {load.status === 'ready' && (hasConditions
        ? <Results data={load.data} onEdit={() => setSheetOpen(true)} />
        : <Home programs={load.data.results} />)}

      {!hasConditions && <p className="home-foot">{t('homeFooter')}</p>}
      <ConditionSheet open={sheetOpen} filters={filters} onClose={() => setSheetOpen(false)} onApply={(next) => { onFiltersChange(next); setSheetOpen(false) }} />
    </main>
  )
}

function Home({ programs }: { programs: Program[] }) {
  const { t } = useI18n()
  if (!programs.length) return <StatePanel title={t('emptyAll')} />
  const open = programs.filter((program) => program.application_status === 'open')
  const rest = programs.filter((program) => program.application_status !== 'open')
  return (
    <>
      {open.length > 0 && <Section title={t('openNow')} programs={open} />}
      {rest.length > 0 && <Section title={t('otherPrograms')} programs={rest} />}
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
      <Section title={t('resultsCount', { count: data.results.length })} programs={data.results} />
      {data.needs_confirmation.length > 0 && <Section title={t('needsTimeTitle', { count: data.needs_confirmation.length })} note={t('needsTimeNote')} programs={data.needs_confirmation} />}
    </>
  )
}

function Section({ title, note, programs }: { title: string; note?: string; programs: Program[] }) {
  return (
    <section className="list-section">
      <h2 className="list-title">{title}</h2>
      {note && <p className="list-note">{note}</p>}
      <ul className="items">{programs.map((program) => <ProgramItem key={program.program_id} program={program} />)}</ul>
    </section>
  )
}
