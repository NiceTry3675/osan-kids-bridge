import { useEffect, useRef, useState } from 'react'
import type { ProgramsState } from '../App'
import { AdminError, addAddenda, fillBlanks, improveProgram } from '../data/admin'
import type { ImproveItem, ImproveResult, ProgramRow } from '../data/admin'
import type { QuestionEntry } from '../data/questions'
import { useLanguage } from '../i18n'
import { openQuestions } from '../lib/resolution'
import { Icon } from './icons'
import { TOPIC_KEYS } from './QuestionsView'

interface Props {
  entry: QuestionEntry
  /** 관리자 API의 공고 (없으면 서버가 없거나 이 공고가 서버에 없음) */
  row: ProgramRow | null
  programs: ProgramsState
  reviewer: string
  onSaved: () => void
}

interface Edit {
  include: boolean
  draft: string
  values: Record<string, string>
  resolves: string[]
}

const blankNames = (draft: string) => [...new Set([...draft.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((match) => match[1].trim()))]

const STEP_KEYS = { read_notice: 'stepReadNotice', read_questions: 'stepReadQuestions', check_draft: 'stepCheck', submit: 'stepSubmit' } as const
/** 서버가 한 번에 받는 질문 수. 많이 물은 질문부터 보낸다 */
const MAX_QUESTIONS = 20
const countBlanks = (text: string) => text.match(/\{\{[^{}]*\}\}/g)?.length ?? 0

/**
 * 공고 보완 도우미: 아직 답하지 않은 보호자 질문으로 AI가 '기관 추가 안내' 초안을 쓰고(코드 검사를 통과해야 제출),
 * 담당자가 빈칸을 채워 고른 항목만 공고에 덧붙입니다. 덧붙인 안내는 보호자 AI 상담의 근거가 됩니다.
 */
export function ImprovePanel({ entry, row, programs, reviewer, onSaved }: Props) {
  const { t } = useLanguage()
  const [result, setResult] = useState<ImproveResult | null>(null)
  const [edits, setEdits] = useState<Edit[]>([])
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  // 확정자 칸은 직접 고치기 전까지 왼쪽 아래 담당자 이름을 따라갑니다
  const [ownAuthor, setOwnAuthor] = useState<string | null>(null)
  const author = ownAuthor ?? reviewer
  const [error, setError] = useState<{ text: string; details: string[] } | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  const open = row ? openQuestions(entry, programs.status === 'ready' ? programs.rows : []) : entry.questions
  const sendable = [...open].sort((a, b) => b.count - a.count).slice(0, MAX_QUESTIONS)
  const available = programs.status === 'ready' && row !== null

  const start = async () => {
    controller.current?.abort()
    controller.current = new AbortController()
    setRunning(true)
    setError(null)
    setSaved(null)
    setResult(null)
    try {
      const next = await improveProgram(entry.program_id, sendable.map(({ question_ko, topic, count }) => ({ question_ko, topic, count })), controller.current.signal)
      setResult(next)
      // 공고에 덧붙일 안내 중 검사를 통과한 것만 미리 고른다. 공고에 이미 있는 답은 담당자가 골라야 덧붙인다
      setEdits(next.items.map((item) => ({ include: item.kind === 'add_notice' && item.problems.length === 0, draft: item.draft ?? '', values: {}, resolves: item.resolves_items })))
    } catch (failure) {
      if (controller.current?.signal.aborted) return
      setError({ text: failure instanceof AdminError ? failure.message : t('apiErrorTitle'), details: failure instanceof AdminError ? failure.details : [] })
    } finally {
      setRunning(false)
    }
  }

  const update = (index: number, patch: Partial<Edit>) => setEdits(edits.map((edit, at) => (at === index ? { ...edit, ...patch } : edit)))
  const finalText = (edit: Edit) => fillBlanks(edit.draft, edit.values).trim()
  const chosen = result ? result.items.map((item, index) => ({ item, edit: edits[index] })).filter(({ edit }) => edit?.include) : []
  const unfilled = chosen.reduce((sum, { edit }) => sum + (finalText(edit) ? countBlanks(finalText(edit)) : 1), 0)
  const canSave = chosen.length > 0 && unfilled === 0 && author.trim() !== '' && !saving

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await addAddenda(entry.program_id, author.trim(), chosen.map(({ item, edit }) => ({
        topic: item.topic,
        text: finalText(edit),
        resolves_questions: item.questions,
        resolves_items: edit.resolves,
        drafted_by_ai: true,
      })))
      setSaved(chosen.length)
      setResult(null)
      onSaved()
    } catch (failure) {
      setError({ text: failure instanceof AdminError ? failure.message : t('apiErrorTitle'), details: failure instanceof AdminError ? failure.details : [] })
    } finally {
      setSaving(false)
    }
  }

  return <section className="card improve" aria-labelledby="improve-title">
    <header className="pane-head">
      <h2 id="improve-title" className="pane-title"><Icon name="sparkle" />{t('improveTitle')}</h2>
      <span className="ai-tag">{t('aiAgent')}</span>
    </header>
    <div className="pane-body">
      <p className="pane-lead">{t('improveLead')}</p>

      {saved !== null && <div className="notice notice--ok" role="status"><p className="notice-title">{t('addendaSaved', { n: saved })}</p><div className="notice-body"><p>{t('addendaSavedHint')}</p></div></div>}
      {error && <div className="notice notice--warn" role="alert"><p className="notice-title">{error.text}</p>{error.details.length > 0 && <ul className="notice-body dot-list">{error.details.map((line) => <li key={line}>{line}</li>)}</ul>}</div>}

      {!available && <p className="muted">{programs.status === 'ready' ? t('improveNoProgram') : t('improveNeedsApi')}</p>}
      {available && !result && !running && (open.length
        ? <button type="button" className="btn btn--primary" onClick={start}><Icon name="sparkle" />{t('improveStart', { n: sendable.length })}</button>
        : <p className="muted">{t('improveAllAnswered')}</p>)}
      {running && <div className="agent-running" role="status"><span className="spinner" aria-hidden="true" />{t('improveRunning')}</div>}

      {result && <>
        <ol className="agent-steps" aria-label={t('agentSteps')}>
          {result.steps.map((step, index) => <li key={index} className={`agent-step${step.ok ? '' : ' agent-step--failed'}`}>
            <Icon name={step.ok ? 'check' : 'alert'} />
            {t(STEP_KEYS[step.tool], { n: step.tool === 'read_questions' ? sendable.length : step.problems ?? 0 })}
            {!step.ok && step.problems ? ` · ${t('stepProblems', { n: step.problems })}` : ''}
          </li>)}
        </ol>
        <p className={result.passed ? 'check-line check-line--ok' : 'check-line check-line--warn'}>
          <Icon name={result.passed ? 'check' : 'alert'} />{result.passed ? t('improvePassed', { n: result.rounds }) : t('improveNotPassed')}
        </p>
        {result.uncovered.length > 0 && <p className="muted">{t('improveUncovered', { list: result.uncovered.join(' / ') })}</p>}

        <ol className="draft-list">{result.items.map((item, index) => <DraftCard key={item.id} item={item} edit={edits[index]} onChange={(patch) => update(index, patch)} />)}</ol>

        <div className="improve-foot">
          <label className="field-inline"><span>{t('authorName')}</span><input className="input" value={author} maxLength={40} onChange={(event) => setOwnAuthor(event.target.value)} /></label>
          <p className="muted">{unfilled > 0 ? t('fillBlanksFirst', { n: unfilled }) : t('addendaPublishHint')}</p>
          <div className="improve-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setResult(null)}>{t('cancel')}</button>
            <button type="button" className="btn btn--primary" disabled={!canSave} onClick={save}><Icon name="check" />{t('addAddenda', { n: chosen.length })}</button>
          </div>
        </div>
      </>}
    </div>
  </section>
}

function DraftCard({ item, edit, onChange }: { item: ImproveItem; edit: Edit | undefined; onChange: (patch: Partial<Edit>) => void }) {
  const { t } = useLanguage()
  if (!edit) return null
  const names = blankNames(edit.draft)
  const preview = fillBlanks(edit.draft, edit.values)
  return <li className={`draft${edit.include ? '' : ' draft--off'}`}>
    <header className="draft-head">
      <label className="draft-include"><input type="checkbox" checked={edit.include} onChange={(event) => onChange({ include: event.target.checked })} /><span>{t(TOPIC_KEYS[item.topic])}</span></label>
      <span className={`kind-tag kind-tag--${item.kind}`}>{item.kind === 'already_in_notice' ? t('kindAlready') : t('kindAdd')}</span>
      <span className="muted">{t('askedBy', { n: item.asked })}</span>
    </header>
    <ul className="draft-questions" lang="ko">{item.questions.map((question) => <li key={question}>{question}</li>)}</ul>
    {item.quote && <blockquote className="draft-quote"><span>{t('quoteFromNotice')}</span><p lang="ko">{item.quote}</p></blockquote>}
    <label className="draft-field">
      <span>{t('draftSentence')}</span>
      <textarea className="input draft-text" lang="ko" rows={2} value={edit.draft} onChange={(event) => onChange({ draft: event.target.value })} />
    </label>
    {names.length > 0 && <div className="blanks">
      {names.map((name) => <label key={name} className="blank">
        <span lang="ko">{name}</span>
        <input className="input" lang="ko" value={edit.values[name] ?? ''} placeholder={t('blankPlaceholder')} onChange={(event) => onChange({ values: { ...edit.values, [name]: event.target.value } })} />
      </label>)}
    </div>}
    <p className="draft-preview"><span>{t('draftPreview')}</span><span lang="ko">{preview.split(/(\{\{[^{}]*\}\})/).map((part, index) => part.startsWith('{{') ? <mark key={index}>{part}</mark> : part)}</span></p>
    {item.resolves_items.length > 0 && <fieldset className="draft-resolves">
      <legend>{t('resolvesLegend')}</legend>
      {item.resolves_items.map((line) => <label key={line} className="check-row check-row--small">
        <input type="checkbox" checked={edit.resolves.includes(line)} onChange={(event) => onChange({ resolves: event.target.checked ? [...edit.resolves, line] : edit.resolves.filter((value) => value !== line) })} />
        <span lang="ko">{line}</span>
      </label>)}
    </fieldset>}
    {item.problems.length > 0 && <ul className="draft-problems" lang="ko">{item.problems.map((problem) => <li key={problem}><Icon name="alert" />{problem}</li>)}</ul>}
    {item.reason && <p className="muted" lang="ko">{item.reason}</p>}
  </li>
}
