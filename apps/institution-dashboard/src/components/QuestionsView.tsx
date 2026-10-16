import { useEffect, useState } from 'react'
import { ViewHeader } from './ViewHeader'
import { loadQuestions } from '../data/questions'
import type { QuestionSummary, QuestionTopic } from '../data/questions'
import { useLanguage } from '../i18n'

const TOPIC_KEYS: Record<QuestionTopic, { label: 'topicFamily' | 'topicCompanion' | 'topicKoreanLevel' | 'topicSchedule' | 'topicAgeGrade' | 'topicMaterials' | 'topicOther'; fix: 'fixFamily' | 'fixCompanion' | 'fixKoreanLevel' | 'fixSchedule' | 'fixAgeGrade' | 'fixMaterials' | 'fixOther' }> = {
  family_eligibility: { label: 'topicFamily', fix: 'fixFamily' },
  companion: { label: 'topicCompanion', fix: 'fixCompanion' },
  korean_level: { label: 'topicKoreanLevel', fix: 'fixKoreanLevel' },
  schedule: { label: 'topicSchedule', fix: 'fixSchedule' },
  age_grade: { label: 'topicAgeGrade', fix: 'fixAgeGrade' },
  materials: { label: 'topicMaterials', fix: 'fixMaterials' },
  other: { label: 'topicOther', fix: 'fixOther' },
}

/**
 * 보호자 질문 탭: 공고에 답이 없어 보호자들이 되묻는 내용을 공고별·주제별로 모아,
 * 다음 공고에 무엇을 적어야 하는지 보여 줍니다. 공고 → 질문 → 공고 보완의 순환을 닫는 화면입니다.
 */
export function QuestionsView() {
  const { t } = useLanguage()
  const [summary, setSummary] = useState<QuestionSummary | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    loadQuestions(controller.signal).then(setSummary)
    return () => controller.abort()
  }, [version])

  return <div className="view">
    <ViewHeader title={t('questionsTab')} action={<button className="btn btn--quiet" type="button" onClick={() => setVersion((value) => value + 1)}>{t('questionsRefresh')}</button>} />
    <p className="demand-summary">{t('questionsLead')}</p>
    {summary && <p className="questions-meta">
      <strong>{t('questionsTotal', { n: summary.total, m: summary.programs.length })}</strong>
      {summary.live > 0 && <span className="questions-live">{t('questionsLive', { n: summary.live })}</span>}
      <small>{t('questionsDemo')}</small>
    </p>}
    {summary && summary.programs.length === 0 && <p className="muted">{t('questionsEmpty')}</p>}
    {summary?.programs.map((program) => {
      const topics = (Object.entries(program.topics) as [QuestionTopic, number][]).sort((a, b) => b[1] - a[1])
      const max = topics[0]?.[1] ?? 1
      return <section key={program.program_id} className="block question-program" aria-label={program.title}>
        <h2 className="block-title" lang="ko">{program.title}</h2>
        <ul className="topic-bars" aria-label={t('questionsTopicCount')}>
          {topics.map(([topic, count]) => <li key={topic}>
            <span className="topic-name">{t(TOPIC_KEYS[topic].label)}</span>
            <span className="topic-track"><span className="topic-fill" style={{ width: `${Math.max(8, (count / max) * 100)}%` }} /></span>
            <span className="topic-count">{count}</span>
          </li>)}
        </ul>
        <div className="question-fix">
          <p className="question-fix-title">{t('questionsFix')}</p>
          <ul>{topics.slice(0, 3).map(([topic]) => <li key={topic}>{t(TOPIC_KEYS[topic].fix)}</li>)}</ul>
        </div>
        <details className="fold">
          <summary>{t('questionsSource')}<small>{program.questions.length}</small></summary>
          <ul className="question-list fold-body">
            {program.questions.map((question) => <li key={question.question_ko} className={question.live ? 'is-live' : undefined}>
              <span lang="ko">{question.question_ko}</span>
              <small>{t('questionsCount', { n: question.count })} · {question.last_date}</small>
            </li>)}
          </ul>
        </details>
      </section>
    })}
    <p className="muted questions-privacy">{t('questionsPrivacy')}</p>
  </div>
}
