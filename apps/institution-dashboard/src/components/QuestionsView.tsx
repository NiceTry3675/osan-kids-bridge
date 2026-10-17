import type { ProgramsState } from '../App'
import type { QuestionSummary, QuestionTopic } from '../data/questions'
import { useLanguage } from '../i18n'
import { answeredQuestions } from '../lib/resolution'
import { shortStamp } from './AdminParts'
import { ImprovePanel } from './ImprovePanel'
import { Icon } from './icons'
import { ViewHeader } from './ViewHeader'

export const TOPIC_KEYS: Record<QuestionTopic, 'topicFamily' | 'topicCompanion' | 'topicKoreanLevel' | 'topicSchedule' | 'topicAgeGrade' | 'topicMaterials' | 'topicOther'> = {
  family_eligibility: 'topicFamily',
  companion: 'topicCompanion',
  korean_level: 'topicKoreanLevel',
  schedule: 'topicSchedule',
  age_grade: 'topicAgeGrade',
  materials: 'topicMaterials',
  other: 'topicOther',
}

interface Props {
  summary: QuestionSummary | null
  programs: ProgramsState
  selectedId: string | null
  reviewer: string
  onSelect: (id: string) => void
  onReview: (id: string) => void
  onChanged: () => void
}

/**
 * 보호자 질문: 공고에 답이 없어 보호자들이 기관에 알린 질문을 공고별로 모으고,
 * 공고 보완 도우미(AI)가 쓴 초안을 담당자가 채워 공고에 덧붙입니다. 공고 → 질문 → 공고 보완의 순환을 닫는 화면입니다.
 */
export function QuestionsView({ summary, programs, selectedId, reviewer, onSelect, onReview, onChanged }: Props) {
  const { t } = useLanguage()
  const rows = programs.status === 'ready' ? programs.rows : []
  const answered = answeredQuestions(rows)
  const entries = summary?.programs ?? []
  const selected = entries.find((entry) => entry.program_id === selectedId) ?? entries[0] ?? null
  const openCount = (programId: string, questions: { question_ko: string }[]) => questions.filter((question) => !answered.get(programId)?.has(question.question_ko)).length

  return <div className="view">
    <ViewHeader
      kicker={t('navOperate')}
      title={t('questionsTab')}
      lead={t('questionsLead')}
      action={<button className="btn btn--quiet" type="button" onClick={onChanged}><Icon name="refresh" />{t('questionsRefresh')}</button>}
    />
    {summary && <p className="questions-meta">
      <strong>{t('questionsTotal', { n: summary.total, m: summary.programs.length })}</strong>
      {summary.live > 0 && <span className="questions-live"><span className="live-mark" aria-hidden="true">●</span>{t('questionsLive', { n: summary.live })}</span>}
      <small>{t('questionsDemo')}</small>
      {summary.liveFailed && <small className="questions-offline" role="status">{t('questionsOffline')}</small>}
    </p>}
    {summary && entries.length === 0 && <p className="muted">{t('questionsEmpty')}</p>}

    {selected && <div className="split">
      <nav className="card list-pane" aria-label={t('questionsByProgram')}>
        <ul>{entries.map((entry) => {
          const open = openCount(entry.program_id, entry.questions)
          return <li key={entry.program_id}>
            <a
              href={`#questions/${encodeURIComponent(entry.program_id)}`}
              className="list-item"
              aria-current={entry.program_id === selected.program_id ? 'true' : undefined}
              onClick={(event) => { event.preventDefault(); onSelect(entry.program_id) }}
            >
              <strong lang="ko">{entry.title}</strong>
              <small>{t('questionsAsked', { n: entry.total })} · {open > 0 ? <span className="open-count">{t('openCount', { n: open })}</span> : <span className="done-count">{t('allAnswered')}</span>}</small>
            </a>
          </li>
        })}</ul>
      </nav>

      <section className="detail-pane" aria-labelledby="question-program">
        <div className="card">
          <header className="pane-head">
            <h2 id="question-program" className="pane-title" lang="ko">{selected.title}</h2>
            {rows.some((row) => row.program_id === selected.program_id) && <button type="button" className="btn btn--quiet" onClick={() => onReview(selected.program_id)}><Icon name="programs" />{t('openReview')}</button>}
          </header>
          <div className="pane-body">
            <TopicBars topics={selected.topics} />
            <ul className="question-list">
              {selected.questions.map((question) => {
                const addendum = answered.get(selected.program_id)?.get(question.question_ko)
                return <li key={question.question_ko} className={addendum ? 'is-answered' : undefined}>
                  <span>
                    <span lang="ko">{question.question_ko}</span>
                    {question.live && <><span className="live-mark" aria-hidden="true">●</span>{' '}<span className="visually-hidden">{t('questionsLiveLabel')}</span></>}
                  </span>
                  <small>{t(TOPIC_KEYS[question.topic])} · {t('questionsCount', { n: question.count })} · {question.last_date}</small>
                  {addendum && <span className="answered-tag"><Icon name="check" />{t('answeredBy', { date: shortStamp(addendum.added_at) })}</span>}
                </li>
              })}
            </ul>
          </div>
        </div>
        <ImprovePanel
          key={selected.program_id}
          entry={selected}
          row={rows.find((row) => row.program_id === selected.program_id) ?? null}
          programs={programs}
          reviewer={reviewer}
          onSaved={onChanged}
        />
      </section>
    </div>}
    <p className="muted questions-privacy">{t('questionsPrivacy')}</p>
  </div>
}

function TopicBars({ topics }: { topics: Partial<Record<QuestionTopic, number>> }) {
  const { t } = useLanguage()
  const sorted = (Object.entries(topics) as [QuestionTopic, number][]).sort((a, b) => b[1] - a[1])
  const max = sorted[0]?.[1] ?? 1
  return <ul className="topic-bars" aria-label={t('questionsTopicCount')}>
    {sorted.map(([topic, count]) => <li key={topic}>
      <span className="topic-name">{t(TOPIC_KEYS[topic])}</span>
      <span className="topic-track"><span className="topic-fill" style={{ width: `${Math.max(8, (count / max) * 100)}%` }} /></span>
      <span className="topic-count">{count}</span>
    </li>)}
  </ul>
}
