import { useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { DEMO_RESPONSES, INTERESTS, VENUES, filterResponses, summarize } from '@osan-kids-bridge/planning'
import type { DemandResponse, Interest, SlotKey } from '@osan-kids-bridge/planning'
import type { ProgramsState } from '../App'
import { AdminError, apiBaseUrl, proposePlan } from '../data/admin'
import type { PlanProposal, PlanResult, PlanTool } from '../data/admin'
import type { QuestionSummary, QuestionTopic } from '../data/questions'
import { localizedCount, localizedDong, localizedInterest, localizedLanguage, localizedPeople, localizedSlot, localizedVenue, useLanguage } from '../i18n'
import { initialPlanForm } from '../lib/plan'
import type { PlanForm } from '../lib/plan'
import { BarList, Heatmap } from './Charts'
import { Icon } from './icons'
import { TOPIC_KEYS } from './QuestionsView'
import { ViewHeader } from './ViewHeader'

const STEP_KEYS: Record<PlanTool, 'planStepDemand' | 'planStepQuestions' | 'planStepPrograms' | 'planStepSimulate' | 'planStepCheck' | 'planStepSubmit'> = {
  read_demand: 'planStepDemand', read_questions: 'planStepQuestions', read_programs: 'planStepPrograms', simulate_plan: 'planStepSimulate', check_plan: 'planStepCheck', submit_plan: 'planStepSubmit',
}
/** 서버가 한 번에 받는 질문 수. 많이 물은 질문부터 보낸다 */
const MAX_QUESTIONS = 100

/**
 * 편성 도우미 실행 상태와 결과. 추천 화면을 다녀오거나 실행 중에 다른 메뉴로 가도 끊기지 않고 남도록 App이 들고 있다.
 * runId: 다시 만들기를 누르면 늘어나, 늦게 끝난 이전 실행의 결과가 새 결과를 덮지 않게 한다
 */
export interface PlanState { result: PlanResult | null; selected: number; running: boolean; error: { text: string; details: string[] } | null; runId: number }
export const initialPlanState = (): PlanState => ({ result: null, selected: 0, running: false, error: null, runId: 0 })

interface Props {
  questions: QuestionSummary | null
  programs: ProgramsState
  state: PlanState
  setState: Dispatch<SetStateAction<PlanState>>
  /** 편성안을 일정·장소 추천 화면의 조건과 안 번호로 넘긴다 */
  onOpenRecommend: (form: PlanForm, rank: number) => void
}

/** 편성안 대상(분야·학년)에 드는 응답. 추천 계산의 대상 수요와 같은 규칙 */
const targetResponses = (proposal: PlanProposal | null): DemandResponse[] =>
  proposal ? filterResponses(DEMO_RESPONSES, { dongs: [], gradeRange: proposal.grade_range, interest: proposal.interest, language: 'all' }) : DEMO_RESPONSES

/**
 * AI 편성 제안: 보호자 익명 통계(시연은 가상 응답)·보호자가 못 찾은 질문·지금 공고를 편성 도우미가 도구로 읽고,
 * 추천 계산을 시뮬레이션 도구로 돌려 '무엇을·누구에게·언제·어디서' 편성안을 씁니다. 숫자는 코드가 계산하고 근거의 숫자는 코드가 대조합니다.
 * 결정은 담당자가 하며, 편성안은 일정·장소 추천 화면에서 조건을 바꿔 가며 다시 볼 수 있습니다.
 */
export function PlanView({ questions, programs, state, setState, onOpenRecommend }: Props) {
  const { t } = useLanguage()
  const { result, selected, running, error } = state
  const setSelected = (index: number) => setState((current) => ({ ...current, selected: index }))

  const proposal = result?.proposals[selected] ?? null
  const summary = useMemo(() => summarize(targetResponses(proposal)), [proposal])
  const interestCounts = useMemo(() => INTERESTS.map((interest) => ({ interest, count: DEMO_RESPONSES.filter((response) => response.interests.includes(interest)).length })), [])
  const topics = useMemo(() => {
    const totals = new Map<QuestionTopic, number>()
    for (const entry of questions?.programs ?? []) for (const [topic, count] of Object.entries(entry.topics) as [QuestionTopic, number][]) totals.set(topic, (totals.get(topic) ?? 0) + count)
    return [...totals].sort((a, b) => b[1] - a[1])
  }, [questions])
  const sendable = useMemo(() => (questions?.programs ?? []).flatMap((entry) => entry.questions)
    .sort((a, b) => b.count - a.count).slice(0, MAX_QUESTIONS).map(({ question_ko, topic, count }) => ({ question_ko, topic, count })), [questions])
  const marks = useMemo(() => {
    const byslot: Partial<Record<SlotKey, string[]>> = {}
    for (const item of proposal?.classes ?? []) byslot[item.slot] = [...(byslot[item.slot] ?? []), String(item.n)]
    return byslot as Record<SlotKey, string[]>
  }, [proposal])
  const available = Boolean(apiBaseUrl) && programs.status !== 'error'

  // 실행은 화면을 떠나도 끝까지 가고(App 상태에 저장), 이전 결과는 새 결과가 올 때까지 그대로 보인다
  const start = async () => {
    const runId = state.runId + 1
    setState((current) => ({ ...current, running: true, error: null, runId }))
    try {
      const next = await proposePlan(sendable)
      setState((current) => (current.runId === runId ? { ...current, result: next, selected: 0, running: false } : current))
    } catch (failure) {
      const problem = { text: failure instanceof AdminError ? failure.message : t('apiErrorTitle'), details: failure instanceof AdminError ? failure.details : [] }
      setState((current) => (current.runId === runId ? { ...current, running: false, error: problem } : current))
    }
  }

  const openRecommend = (item: PlanProposal) => onOpenRecommend({
    interest: item.interest,
    gradeRange: item.grade_range,
    classCount: item.class_count,
    capacity: item.capacity,
    venueIds: VENUES.map((venue) => venue.id),
    baselineOn: true,
    baseline: initialPlanForm().baseline,
  }, item.rank)

  return <div className="view plan-view">
    <ViewHeader kicker={t('navPlan')} title={t('planTab')} lead={t('planLead')} />
    <div className="plan-grid">
      <section className="card block-card plan-data" aria-labelledby="plan-data-title">
        <header className="plan-data-head">
          <h2 id="plan-data-title" className="block-title"><Icon name="demand" />{t('planDataTitle')}</h2>
          <span className="demo-tag">{t('planDemo')}</span>
        </header>
        <p className="muted">{proposal
          ? t('planTargetLead', { target: `${proposal.interest === 'all' ? t('allFields') : localizedInterest(proposal.interest as Interest, t)} · ${t('gradeRangeShort', { a: proposal.grade_range[0], b: proposal.grade_range[1] })}`, n: proposal.eligible })
          : t('planDataLead', { n: DEMO_RESPONSES.length })}</p>
        {summary.status === 'ok' && <Heatmap counts={summary.slots} max={summary.maxSlotValue} caption={t('heatCaption')} marks={marks} compact />}
        <div className="plan-data-cols">
          <div>
            <h3 className="plan-sub">{t('planInterestTitle')}</h3>
            <BarList label={t('planInterestTitle')} total={DEMO_RESPONSES.length} items={interestCounts.map(({ interest, count }) => ({ key: interest, label: localizedInterest(interest, t), count: { suppressed: false, value: count } }))} />
          </div>
          <div>
            <h3 className="plan-sub">{t('planQuestionTitle')}</h3>
            {topics.length
              ? <ul className="topic-bars" aria-label={t('planQuestionTitle')}>{topics.map(([topic, count]) => <li key={topic}>
                <span className="topic-name">{t(TOPIC_KEYS[topic])}</span>
                <span className="topic-track"><span className="topic-fill" style={{ width: `${Math.max(8, (count / topics[0][1]) * 100)}%` }} /></span>
                <span className="topic-count">{count}</span>
              </li>)}</ul>
              : <p className="muted">{t('planQuestionNone')}</p>}
          </div>
        </div>
      </section>

      <section className="card improve plan-agent" aria-labelledby="plan-agent-title">
        <header className="pane-head">
          <h2 id="plan-agent-title" className="pane-title"><Icon name="sparkle" />{t('plannerTitle')}</h2>
          <span className="ai-tag">{t('aiAgent')}</span>
        </header>
        <div className="pane-body">
          <p className="pane-lead">{t('planAgentLead')}</p>
          {error && <div className="notice notice--warn" role="alert"><p className="notice-title">{error.text}</p>{error.details.length > 0 && <ul className="notice-body dot-list">{error.details.map((line) => <li key={line}>{line}</li>)}</ul>}</div>}
          {!available && <p className="muted">{t('planNeedsApi')}</p>}
          {available && !running && <button type="button" className={result ? 'btn btn--ghost' : 'btn btn--primary'} onClick={start}><Icon name="sparkle" />{result ? t('planRetry') : t('planStart')}</button>}
          {running && <div className="agent-running" role="status"><span className="spinner" aria-hidden="true" />{t('planRunning')}</div>}

          {result && <>
            <ol className="agent-steps" aria-label={t('agentSteps')}>
              {result.steps.map((step, index) => <li key={index} className={`agent-step${step.ok ? '' : ' agent-step--failed'}`}>
                <Icon name={step.ok ? 'check' : 'alert'} />
                {t(STEP_KEYS[step.tool])}{step.label ? ` · ${step.label}` : ''}
                {!step.ok && step.problems ? ` · ${t('stepProblems', { n: step.problems })}` : ''}
              </li>)}
            </ol>
            <p className={result.passed ? 'check-line check-line--ok' : 'check-line check-line--warn'}>
              <Icon name={result.passed ? 'check' : 'alert'} />{result.passed ? t('planPassed', { n: result.rounds }) : !result.proposals.length ? t('planEmpty') : result.proposals.every((item) => item.problems.length === 0) ? t('planNotSubmitted') : t('planNotPassed')}
            </p>
            {result.proposals.length > 1 && <div className="seg" role="tablist" aria-label={t('plannerTitle')}>
              {result.proposals.map((item, index) => <button key={item.id} type="button" role="tab" className="seg-btn" aria-selected={index === selected} onClick={() => setSelected(index)}>{index + 1}. {item.title}</button>)}
            </div>}
            {proposal && <PlanCard proposal={proposal} onOpen={() => openRecommend(proposal)} />}
            <p className="muted plan-note">{t('planDecision')} · {result.data_note}</p>
          </>}
        </div>
      </section>
    </div>
  </div>
}

function PlanCard({ proposal, onOpen }: { proposal: PlanProposal; onOpen: () => void }) {
  const { locale, t } = useLanguage()
  const interest = proposal.interest === 'all' ? t('allFields') : localizedInterest(proposal.interest as Interest, t)
  const covered = localizedCount(proposal.covered_count, t)
  return <article className="plan-card" aria-label={proposal.title}>
    <header className="plan-card-head">
      <h3 className="plan-card-title">{proposal.title}</h3>
      <p className="plan-card-target">{t('planTarget', { interest, a: proposal.grade_range[0], b: proposal.grade_range[1], k: proposal.class_count, c: proposal.capacity })}</p>
    </header>
    <div className="plan-metric">
      <p className="plan-metric-main"><strong>{proposal.coverage_pct === null ? covered : `${proposal.coverage_pct}%`}</strong><span>{t('planCoverage', { eligible: proposal.eligible, covered })}</span></p>
      {proposal.baseline && proposal.baseline.coverage_pct !== null && proposal.coverage_pct !== null && (
        <p className="plan-compare">
          <span>{t('planBaseline')} <b>{proposal.baseline.coverage_pct}%</b></span>
          <Icon name="chevron" />
          <span>{t('planThis')} <b>{proposal.coverage_pct}%</b></span>
          {proposal.gain !== null && proposal.gain > 0 && <span className="plan-gain">{t('planGain', { n: proposal.gain })}</span>}
        </p>
      )}
    </div>
    <h4 className="plan-sub">{t('planWhenWhere')}</h4>
    <ol className="plan-classes">
      {proposal.classes.map((item) => {
        const venue = VENUES.find((entry) => entry.id === item.venue_id)
        return <li key={item.n}>
          <span className="plan-class-n">{item.n}</span>
          <span className="plan-class-main"><b>{localizedSlot(item.slot, t)}</b> · {venue ? localizedVenue(venue, locale) : item.venue}<small>{localizedDong(item.dong, locale)}</small></span>
          <span className="plan-class-reach">{localizedCount(item.reach_count, t)}<small>{t('planExpected', { n: localizedPeople(item.expected_people, t) })}</small></span>
        </li>
      })}
    </ol>
    <h4 className="plan-sub">{t('planReasons')}</h4>
    <ul className="plan-reasons">
      {proposal.reasons.map((reason, index) => <li key={index}>
        <p>{reason.text}</p>
        {reason.facts.length > 0 && <p className="fact-chips" aria-label={t('planFacts')}>
          {reason.facts.map((fact, at) => <span key={`${fact.id}-${at}`} className="fact-chip" title={fact.label}><Icon name="check" />{fact.value}<small>{fact.label}</small></span>)}
        </p>}
      </li>)}
    </ul>
    {proposal.language_support.length > 0 && <p className="plan-languages"><b>{t('planLanguages')}</b> {proposal.language_support.map((item) => localizedLanguage(item.language, t)).join(' · ')}</p>}
    {proposal.warnings.length > 0 && <ul className="notice-body dot-list">{proposal.warnings.map((line, at) => <li key={`${at}-${line}`}>{line}</li>)}</ul>}
    {proposal.problems.length > 0 && <div className="notice notice--warn"><p className="notice-title">{t('planProblems')}</p><ul className="notice-body dot-list">{proposal.problems.map((line, at) => <li key={`${at}-${line}`}>{line}</li>)}</ul></div>}
    <div className="plan-actions">
      <button type="button" className="btn btn--secondary" onClick={onOpen}><Icon name="recommend" />{t('planOpenRecommend')}</button>
    </div>
  </article>
}
