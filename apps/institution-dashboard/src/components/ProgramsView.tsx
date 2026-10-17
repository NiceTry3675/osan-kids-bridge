import { useMemo, useState } from 'react'
import type { ProgramsState } from '../App'
import type { ProgramRow } from '../data/admin'
import type { QuestionSummary } from '../data/questions'
import { useLanguage } from '../i18n'
import { AdminUnavailable, Kpi, PosterChips, ReviewChip, SummaryChips } from './AdminParts'
import { Icon } from './icons'
import { ViewHeader } from './ViewHeader'

type Filter = 'all' | 'review' | 'published' | 'posters'
const FILTERS: Filter[] = ['all', 'review', 'published', 'posters']
const needsReview = (row: ProgramRow) => row.review.status === 'pending' || row.review.status === 'stale'

interface Props {
  state: ProgramsState
  questions: QuestionSummary | null
  onOpen: (id: string) => void
  onRetry: () => void
}

/**
 * 공고 관리: AI가 읽은 공고와 번역 포스터를 사람이 검수·승인하는 목록.
 * 검수가 필요한 공고(검수 대기·원문이 바뀐 공고)를 먼저 보여 줍니다.
 */
export function ProgramsView({ state, questions, onOpen, onRetry }: Props) {
  const { t } = useLanguage()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const rows = state.status === 'ready' ? state.rows : []
  const asked = useMemo(() => new Map(questions?.programs.map((entry) => [entry.program_id, entry.total]) ?? []), [questions])

  const shown = useMemo(() => rows
    .filter((row) => filter === 'all' || (filter === 'review' ? needsReview(row) : filter === 'published' ? row.review.status === 'approved' : Object.keys(row.posters).length > 0))
    .filter((row) => !query.trim() || `${row.title} ${row.institution} ${row.program_id}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(needsReview(b)) - Number(needsReview(a)) || (asked.get(b.program_id) ?? 0) - (asked.get(a.program_id) ?? 0) || a.title.localeCompare(b.title, 'ko')),
  [rows, filter, query, asked])

  const posters = rows.flatMap((row) => Object.values(row.posters))
  const labels: Record<Filter, string> = { all: t('filterAll'), review: t('filterReview'), published: t('filterPublished'), posters: t('filterPosters') }

  return <div className="view">
    <ViewHeader
      kicker={t('navOperate')}
      title={t('programsTab')}
      lead={t('programsLead')}
      action={state.status === 'ready' && <button className="btn btn--quiet" type="button" onClick={onRetry}><Icon name="refresh" />{t('questionsRefresh')}</button>}
    />
    {state.status !== 'ready' ? <AdminUnavailable state={state} onRetry={onRetry} /> : <>
      <section className="kpis" aria-label={t('kpiTitle')}>
        <Kpi label={t('kpiTotal')} value={rows.length} hint={t('kpiPublished', { n: rows.filter((row) => row.review.status === 'approved').length })} />
        <Kpi tone="mark" label={t('kpiNeedsReview')} value={rows.filter(needsReview).length} hint={t('kpiUnverified', { n: rows.filter((row) => row.unverified > 0).length })} />
        <Kpi label={t('kpiPosters')} value={posters.filter((poster) => poster.chosen_attempt !== null).length} hint={t('kpiPostersApproved', { n: posters.filter((poster) => poster.status === 'approved').length })} />
        <Kpi tone="action" label={t('kpiAddenda')} value={rows.reduce((sum, row) => sum + row.addenda.length, 0)} hint={t('kpiAddendaHint')} />
      </section>

      <div className="toolbar">
        <div className="seg seg--inline" role="radiogroup" aria-label={t('filterTitle')}>
          {FILTERS.map((item) => <button key={item} type="button" role="radio" aria-checked={filter === item} className="seg-btn" onClick={() => setFilter(item)}>{labels[item]}</button>)}
        </div>
        <label className="search">
          <Icon name="search" />
          <span className="visually-hidden">{t('searchPrograms')}</span>
          <input className="input" type="search" value={query} placeholder={t('searchPrograms')} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t('colProgram')}</th>
              <th scope="col">{t('colReview')}</th>
              <th scope="col">{t('colEvidence')}</th>
              <th scope="col">{t('colSummaries')}</th>
              <th scope="col">{t('colPosters')}</th>
              <th scope="col" className="num">{t('colQuestions')}</th>
              <th scope="col">{t('colSchedule')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => <tr key={row.program_id} className="row-link" onClick={() => onOpen(row.program_id)}>
              <th scope="row">
                <a href={`#programs/${encodeURIComponent(row.program_id)}`} className="row-title" lang="ko" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpen(row.program_id) }}>{row.title}</a>
                <small>{row.institution}{row.is_demo && <> · <span className="demo-tag">{t('demoNotice')}</span></>}{row.addenda.length > 0 && <> · <span className="addenda-tag">{t('addendaCount', { n: row.addenda.length })}</span></>}</small>
              </th>
              <td><ReviewChip status={row.review.status} /></td>
              <td>{row.unverified > 0 ? <span className="flag flag--mark"><Icon name="alert" />{t('unverifiedCount', { n: row.unverified })}</span> : <span className="flag flag--ok"><Icon name="check" />{t('allVerified')}</span>}</td>
              <td><SummaryChips summaries={row.summaries} /></td>
              <td><PosterChips posters={row.posters} /></td>
              <td className="num">{asked.get(row.program_id) ?? 0}</td>
              <td><span className="schedule" lang="ko">{row.schedule}</span></td>
            </tr>)}
          </tbody>
        </table>
        {shown.length === 0 && <p className="muted table-empty">{t('noPrograms')}</p>}
      </div>
      <p className="muted">{t('programsLegend')}</p>
    </>}
  </div>
}
