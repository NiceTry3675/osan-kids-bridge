import { useEffect, useMemo, useState } from 'react'
import { LanguagePicker } from '@osan-kids-bridge/ui'
import { DataGuide } from './components/DataGuide'
import { DemandView } from './components/DemandView'
import { ProgramDetailView } from './components/ProgramDetail'
import { ProgramsView } from './components/ProgramsView'
import { QuestionsView } from './components/QuestionsView'
import { RecommendView } from './components/RecommendView'
import { Icon } from './components/icons'
import type { IconName } from './components/icons'
import { AdminError, apiBaseUrl, loadPrograms } from './data/admin'
import type { ProgramRow } from './data/admin'
import { loadQuestions } from './data/questions'
import type { QuestionSummary } from './data/questions'
import { languageOptions, localeState, useLanguage } from './i18n'
import { defaultFilters } from './lib/aggregate'
import type { DemandFilters } from './lib/aggregate'
import { initialPlanForm } from './lib/plan'
import type { PlanForm } from './lib/plan'
import { unresolvedCount } from './lib/resolution'

type View = 'programs' | 'questions' | 'demand' | 'recommend' | 'guide'
const VIEWS: View[] = ['programs', 'questions', 'demand', 'recommend', 'guide']

export type ProgramsState =
  | { status: 'loading' }
  | { status: 'ready'; rows: ProgramRow[] }
  | { status: 'no-api' }
  /** adminOff: 서버는 있는데 관리자 API를 켜지 않음(404) */
  | { status: 'error'; adminOff: boolean }

interface Route { view: View; id: string | null }

/** 주소 #programs/<공고 ID>처럼 화면과 고른 공고를 주소에 남겨, 새로고침·링크로 같은 화면을 엽니다. */
function readRoute(): Route {
  const [view, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  return { view: VIEWS.includes(view as View) ? view as View : 'programs', id: id ? decodeURIComponent(id) : null }
}

const REVIEWER_KEY = 'osan-dashboard-reviewer'
function savedReviewer(): string {
  try { return localStorage.getItem(REVIEWER_KEY) ?? '' } catch { return '' }
}

const NAV: { group: 'navOperate' | 'navPlan' | null; views: View[] }[] = [
  { group: 'navOperate', views: ['programs', 'questions'] },
  { group: 'navPlan', views: ['demand', 'recommend'] },
  { group: null, views: ['guide'] },
]
const ICONS: Record<View, IconName> = { programs: 'programs', questions: 'questions', demand: 'demand', recommend: 'recommend', guide: 'guide' }

/**
 * 운영기관 대시보드(관리자 화면, 데스크톱 우선). 왼쪽 메뉴로 업무를 오갑니다.
 * 공고 운영: 공고 관리(AI 추출·번역 검수와 승인) · 보호자 질문(공고 보완 도우미)
 * 프로그램 편성: 수요 현황 · 일정·장소 추천
 */
export default function App() {
  const { locale, setLocale, t } = useLanguage()
  const [route, setRoute] = useState<Route>(readRoute)
  const [filters, setFilters] = useState<DemandFilters>(defaultFilters)
  const [planForm, setPlanForm] = useState<PlanForm>(initialPlanForm)
  const [programs, setPrograms] = useState<ProgramsState>(apiBaseUrl ? { status: 'loading' } : { status: 'no-api' })
  const [questions, setQuestions] = useState<QuestionSummary | null>(null)
  const [version, setVersion] = useState(0)
  const [reviewer, setReviewerState] = useState(savedReviewer)
  const options = useMemo(() => languageOptions(), [])

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    // 새로고침·화면 이동으로 취소된 요청의 결과는 버립니다.
    loadQuestions(controller.signal).then((next) => { if (!controller.signal.aborted) setQuestions(next) }, () => {})
    if (apiBaseUrl) {
      loadPrograms(controller.signal).then(
        (body) => { if (!controller.signal.aborted) setPrograms({ status: 'ready', rows: body.programs }) },
        (error: unknown) => { if (!controller.signal.aborted) setPrograms({ status: 'error', adminOff: error instanceof AdminError && error.status === 404 }) },
      )
    }
    return () => controller.abort()
  }, [version])

  const reload = () => setVersion((value) => value + 1)
  const go = (view: View, id: string | null = null) => {
    const hash = `#${view}${id ? `/${encodeURIComponent(id)}` : ''}`
    if (window.location.hash !== hash) window.location.hash = hash
    setRoute({ view, id })
    window.scrollTo({ top: 0 })
  }
  const setReviewer = (value: string) => {
    setReviewerState(value)
    try { localStorage.setItem(REVIEWER_KEY, value) } catch { /* 이번 방문 동안만 기억합니다. */ }
  }

  const rows = programs.status === 'ready' ? programs.rows : []
  const badges: Partial<Record<View, number>> = {
    programs: rows.filter((row) => row.review.status === 'pending' || row.review.status === 'stale').length,
    questions: questions ? unresolvedCount(questions, rows) : 0,
  }
  const labels: Record<View, string> = { programs: t('programsTab'), questions: t('questionsTab'), demand: t('demandTab'), recommend: t('recommendTab'), guide: t('guideTab') }

  return (
    <div className="admin">
      <a className="skip" href="#main">{t('skip')}</a>
      <aside className="side">
        <div className="side-brand">
          <span className="brand-mark" aria-hidden="true">AX</span>
          <div><strong>{t('brand')}</strong><small>{t('institution')}</small></div>
        </div>
        <nav className="side-nav" aria-label={t('institution')}>
          {NAV.map(({ group, views }) => (
            <div key={group ?? 'etc'} className="side-group">
              {group && <p className="side-group-title">{t(group)}</p>}
              {views.map((view) => (
                <a
                  key={view}
                  href={`#${view}`}
                  className="side-link"
                  aria-current={route.view === view ? 'page' : undefined}
                  onClick={(event) => { event.preventDefault(); go(view) }}
                >
                  <Icon name={ICONS[view]} />
                  <span>{labels[view]}</span>
                  {Boolean(badges[view]) && <span className="side-badge" aria-label={t('navBadge', { n: badges[view]! })}>{badges[view]}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <label className="side-field">
            <span>{t('reviewerName')}</span>
            <input className="input" value={reviewer} maxLength={40} placeholder={t('reviewerPlaceholder')} onChange={(event) => setReviewer(event.target.value)} />
          </label>
          <LanguagePicker
            tone="plain"
            value={locale}
            options={options}
            onChange={setLocale}
            copy={{
              label: t('language'), more: t('pickerMore'), title: t('pickerTitle'), search: t('pickerSearch'), close: t('close'),
              current: t('pickerCurrent'), draft: t('pickerDraft'), inReview: t('pickerInReview'), notOffered: t('pickerNotOffered'), noMatch: t('pickerNoMatch'),
            }}
          />
        </div>
      </aside>
      <div className="main">
        {localeState(locale) === 'draft' && <p className="ribbon ribbon--draft" role="note">{t('draftNotice')}</p>}
        <main id="main" className="main-inner" tabIndex={-1}>
          {route.view === 'programs' && (route.id
            ? <ProgramDetailView key={route.id} programId={route.id} reviewer={reviewer} onBack={() => go('programs')} onChanged={reload} onQuestions={(id) => go('questions', id)} />
            : <ProgramsView state={programs} questions={questions} onOpen={(id) => go('programs', id)} onRetry={reload} />)}
          {route.view === 'questions' && <QuestionsView summary={questions} programs={programs} selectedId={route.id} reviewer={reviewer} onSelect={(id) => go('questions', id)} onReview={(id) => go('programs', id)} onChanged={reload} />}
          {route.view === 'demand' && <DemandView filters={filters} setFilters={setFilters} />}
          {route.view === 'recommend' && <RecommendView form={planForm} setForm={setPlanForm} />}
          {route.view === 'guide' && <DataGuide />}
        </main>
      </div>
    </div>
  )
}
