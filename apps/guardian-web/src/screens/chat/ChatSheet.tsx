import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useI18n } from '../../i18n'
import type { MessageKey, Vars } from '../../i18n'
import { agentAvailable, askAgent, reportQuestion } from '../../data/agent'
import type { AgentReply, AgentStep, ChatMessage, UncertainTopic } from '../../data/agent'
import type { Program } from '../../data/types'
import { programText } from '../../lib/content'
import { isSafeUrl } from '../../lib/format'
import { navigate, programPath } from '../../lib/router'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { Notice } from '../../components/feedback'
import { SLOT, WithKorean } from '../../components/korean'
import { ExternalLink, PhoneLink } from '../../components/links'
import { Sheet } from '../../components/Sheet'

type Turn = { role: 'user'; text: string } | { role: 'assistant'; reply: AgentReply }

interface Props {
  open: boolean
  onClose: () => void
  /** 상세에서 열면 그 공고를 먼저 보고 답합니다. */
  program: Program | null
  suggestions: MessageKey[]
}

/** 화면 언어로 보여 줄 공고 제목. 검수본이 없으면 한국어 원문이라 lang='ko'를 붙입니다. */
interface ShownTitle { program_id: string; title: string; lang: 'ko' | undefined }

const TOPIC_KEYS: Record<UncertainTopic, MessageKey> = {
  family_eligibility: 'topicFamily', companion: 'topicCompanion', korean_level: 'topicKoreanLevel',
  schedule: 'topicSchedule', age_grade: 'topicAgeGrade', materials: 'topicMaterials', other: 'topicOther',
}

/** 도구마다 다른 선 아이콘. 처음 보는 도구는 체크로 그립니다. */
const STEP_ICONS: Record<string, IconName> = {
  search_programs: 'search', get_program: 'doc', check_fit: 'scale', flag_unanswered: 'flag', draft_inquiry: 'pen',
}

/**
 * AI 상담 도우미. 서버의 에이전트가 검수된 공고를 도구로 찾아보고 답합니다.
 * 답과 함께 AI가 한 일(도구를 쓴 차례), 원문 근거, 기관에 보낼 한국어 문장, 공고에 답이 없던 질문을 보여 줍니다.
 */
export function ChatSheet({ open, onClose, program, suggestions }: Props) {
  const { locale, t } = useI18n()
  const text = program && programText(program, locale)
  const viewing: ShownTitle | null = program && text && { program_id: program.program_id, title: text.title, lang: text.lang }
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  /** 대화를 비우고 기다리던 답은 취소합니다. */
  const reset = () => { abort.current?.abort(); setTurns([]); setFailed(false) }

  // 다른 공고나 다른 언어로 바뀌면 대화를 새로 시작합니다.
  useEffect(reset, [program?.program_id, locale])
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' }) }, [turns, pending])
  useEffect(() => () => abort.current?.abort(), [])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || pending || !agentAvailable) return
    const next: Turn[] = [...turns, { role: 'user', text: question }]
    setTurns(next)
    setDraft('')
    setPending(true)
    setFailed(false)
    const messages: ChatMessage[] = next.map((turn) => (turn.role === 'user' ? turn : { role: 'assistant', text: turn.reply.reply }))
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    try {
      const reply = await askAgent(messages, locale, program?.program_id ?? null, controller.signal)
      if (!controller.signal.aborted) setTurns((current) => [...current, { role: 'assistant', reply }])
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setFailed(true)
    } finally {
      if (abort.current === controller) setPending(false)
    }
  }

  // 읽기 프로그램에는 하나의 알림 칸으로 ‘확인하는 중’과 새 답의 첫 줄(결론)만 알립니다.
  // 대화 전체를 알림 칸으로 두면 단계·근거·한국어 문의문·버튼까지 한꺼번에 읽혀 답이 묻힙니다.
  const last = turns.at(-1)
  const announcement = pending ? t('chatThinking') : failed ? t('chatError') : last?.role === 'assistant' ? replyLead(last.reply.reply) : ''

  const footer = agentAvailable ? (
    <>
      <label className="visually-hidden" htmlFor="chat-input">{t('chatPlaceholder')}</label>
      <textarea
        id="chat-input"
        className="input chat-input"
        rows={1}
        value={draft}
        placeholder={t('chatPlaceholder')}
        maxLength={800}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft) } }}
      />
      <button type="submit" className="btn btn--primary" disabled={pending || !draft.trim()}>{t('chatSend')}</button>
    </>
  ) : undefined

  return (
    <Sheet
      open={open} onClose={onClose} title={t('chatTitle')} tall footer={footer} onSubmit={() => void send(draft)}
      headerExtra={turns.length > 0 && <button type="button" className="btn btn--quiet chat-reset" onClick={reset}>{t('chatReset')}</button>}
    >
      <p className="visually-hidden" role="status">{announcement}</p>
      <div className="chat">
        {/* 대화가 시작되면 안내는 한 줄로 접어 질문·단계·답이 한 화면에 들어오게 합니다. */}
        {turns.length > 0 ? (
          <p className="chat-intro chat-intro--short"><span className="chat-badge" aria-hidden="true">AI</span>{t('chatIntroShort')}</p>
        ) : (
          <div className="chat-intro">
            <p className="chat-intro-lead"><span className="chat-badge" aria-hidden="true">AI</span>{t('chatIntro')}</p>
            <p className="muted">{t('chatPrivacy')}</p>
            {viewing && <p className="chat-viewing">{withTitle(t, 'chatViewing', viewing)}</p>}
          </div>
        )}
        {!agentAvailable && <Notice tone="mark" title={t('chatUnavailable')} />}
        {agentAvailable && turns.length === 0 && (
          <ul className="chips chat-suggestions">
            {suggestions.map((key) => <li key={key}><button type="button" className="chip" onClick={() => void send(t(key))}>{t(key)}</button></li>)}
          </ul>
        )}
        {turns.map((turn, index) => (turn.role === 'user'
          ? <p key={index} className="bubble bubble--user">{turn.text}</p>
          : <AssistantTurn key={index} reply={turn.reply} viewing={viewing} onAsk={(question) => void send(question)} onOpenProgram={(id) => { onClose(); navigate(programPath(id), { fromChat: true }) }} />))}
        {pending && <p className="bubble bubble--bot bubble--pending"><span className="spinner" aria-hidden="true" />{t('chatThinking')}</p>}
        {failed && <Notice tone="warn" title={t('chatError')} />}
        <div ref={endRef} />
      </div>
    </Sheet>
  )
}

type Translate = (key: MessageKey, vars?: Vars) => string

/** 문구의 {title} 자리에 공고 제목을 넣습니다. 제목이 한국어 원문이면 그 부분에만 lang='ko'를 붙입니다. */
function withTitle(t: Translate, key: MessageKey, { title, lang }: Pick<ShownTitle, 'title' | 'lang'>): ReactNode {
  if (!lang) return t(key, { title })
  const [before, after = ''] = t(key, { title: '\u0000' }).split('\u0000')
  return <>{before}<span lang={lang}>{title}</span>{after}</>
}

function stepLabel(step: AgentStep, t: Translate): string {
  if (!step.ok) return t('stepFailed')
  switch (step.tool) {
    case 'search_programs': return t('stepSearch', { count: step.count ?? 0 })
    case 'get_program': return t('stepGetProgram')
    case 'check_fit': return t('stepCheckFit')
    case 'draft_inquiry': return t('stepDraftInquiry')
    case 'flag_unanswered': return t('stepFlag')
    default: return step.tool
  }
}

/** 공고를 읽은 단계 아래에 붙일 제목. 보고 있는 공고는 화면 언어 제목을, 다른 공고는 서버가 준 한국어 제목을 씁니다. */
function stepTitle(step: AgentStep, viewing: ShownTitle | null): Pick<ShownTitle, 'title' | 'lang'> | null {
  if (!step.ok || step.tool !== 'get_program') return null
  if (viewing && step.program_id === viewing.program_id) return viewing
  return step.title ? { title: step.title, lang: 'ko' } : null
}

/** 같은 일을 연달아 한 단계(같은 공고를 두 번 읽기 등)는 한 번만 보입니다. */
function uniqueSteps(steps: AgentStep[]): AgentStep[] {
  return steps.filter((step, index) => index === 0 || step.tool !== steps[index - 1].tool || step.program_id !== steps[index - 1].program_id)
}

/** 답의 줄들: 강조 기호를 지우고 빈 줄은 뺍니다. */
const replyLines = (text: string) => text.replace(/\*\*|__|^#+\s*/gm, '').split('\n').map((line) => line.trim()).filter(Boolean)

/** 읽기 프로그램에 알릴 답의 첫 줄(결론). 목록 기호는 뺍니다. */
const replyLead = (text: string) => replyLines(text)[0]?.replace(/^[-•]\s+/, '') ?? ''

/** 첫 문단을 결론으로 굵게 보일 최대 길이. 모델이 형식을 지키지 않고 긴 문단을 쓰면 굵게 하지 않습니다. */
const LEAD_MAX = 160
/**
 * 목록 줄 앞의 짧은 이름표('기관에 확인할 것:' 등). 숫자로 끝나면 시각(10:00)일 수 있고,
 * 쌍점 뒤가 '/'이면 주소(https://)라서 이름표로 보지 않습니다.
 */
const LINE_LABEL = /^([^:：\d][^:：]{0,28}[^:：\d\s])(\s*[:：](?!\/)\s*)(\S.*)$/

/** 목록 한 줄: 짧은 이름표가 있으면 그 부분만 굵게 */
function ReplyLine({ line }: { line: string }) {
  const match = LINE_LABEL.exec(line)
  if (!match) return <>{line}</>
  const [, name, separator, rest] = match
  return <><strong className="bubble-label">{name}{separator.trim()}</strong>{/\s$/.test(separator) && ' '}{rest}</>
}

/**
 * 모델 답의 줄 목록: '- '로 시작하면 목록, 나머지는 문단. 강조 기호는 지웁니다.
 * 결론 한 줄 뒤에 목록이 오면(상담 형식) 첫 문단을 결론으로 굵게 보입니다.
 */
function ReplyText({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = []
  for (const line of replyLines(text)) {
    const list = /^[-•]\s+/.test(line)
    const content = line.replace(/^[-•]\s+/, '')
    const last = blocks[blocks.length - 1]
    if (last && last.list === list && list) last.lines.push(content)
    else blocks.push({ list, lines: [content] })
  }
  const lead = blocks.length > 1 && !blocks[0].list && blocks[0].lines[0].length <= LEAD_MAX
  return (
    <div className="bubble-text">
      {blocks.map((block, index) => (block.list
        ? <ul key={index}>{block.lines.map((line, i) => <li key={i}><ReplyLine line={line} /></li>)}</ul>
        : <p key={index} className={lead && index === 0 ? 'bubble-lead' : undefined}>{block.lines[0]}</p>))}
    </div>
  )
}

/** 에이전트가 도구로 한 일을 차례대로: 번호·도구 아이콘·한 일 */
function AgentSteps({ steps, viewing }: { steps: AgentStep[]; viewing: ShownTitle | null }) {
  const { t } = useI18n()
  const titleId = useId()
  return (
    <div className="agent-steps">
      <p className="agent-steps-title" id={titleId}>{t('chatSteps')}</p>
      <ol aria-labelledby={titleId}>
        {steps.map((step, index) => {
          const read = stepTitle(step, viewing)
          return (
            <li key={index} className={step.ok ? 'agent-step' : 'agent-step agent-step--failed'} style={{ '--step': index } as CSSProperties}>
              <span className="agent-step-no" aria-hidden="true">{index + 1}</span>
              <Icon name={step.ok ? STEP_ICONS[step.tool] ?? 'check' : 'x'} />
              <span className="agent-step-text">
                {stepLabel(step, t)}
                {read && <small className="agent-step-detail" lang={read.lang}>{read.title}</small>}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function AssistantTurn({ reply, viewing, onAsk, onOpenProgram }: { reply: AgentReply; viewing: ShownTitle | null; onAsk: (text: string) => void; onOpenProgram: (id: string) => void }) {
  const { t } = useI18n()
  const steps = uniqueSteps(reply.steps)
  const others = reply.programs.filter((program) => program.program_id !== viewing?.program_id)
  return (
    <div className="bot-turn">
      {steps.length > 0 && <AgentSteps steps={steps} viewing={viewing} />}
      <div className="bubble bubble--bot"><ReplyText text={reply.reply} /></div>
      {reply.citations.length > 0 && (
        <div className="chat-card chat-sources">
          <p className="chat-card-title">{t('chatSources')}</p>
          {reply.citations.map((citation, index) => <blockquote key={index}>
            <span lang="ko">“{citation.quote}”</span>
            {citation.source === 'addendum' && <small className="chat-source-note">{t('chatAddendum')}</small>}
          </blockquote>)}
        </div>
      )}
      {reply.inquiry && <InquiryCard inquiry={reply.inquiry} />}
      {reply.unanswered.length > 0 && <UnansweredCard items={reply.unanswered} />}
      {others.length > 0 && (
        <ul className="chips">
          {others.map((program) => (
            <li key={program.program_id}><button type="button" className="chip" onClick={() => onOpenProgram(program.program_id)}><span lang="ko">{program.title}</span><Icon name="chevron" /></button></li>
          ))}
        </ul>
      )}
      {reply.follow_ups.length > 0 && (
        <ul className="chips chat-followups">
          {reply.follow_ups.map((question) => <li key={question}><button type="button" className="chip" onClick={() => onAsk(question)}>{question}</button></li>)}
        </ul>
      )}
    </div>
  )
}

function InquiryCard({ inquiry }: { inquiry: NonNullable<AgentReply['inquiry']> }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const contacts = inquiry.contacts.filter(shownContact)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inquiry.message_ko)
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    } catch { /* 길게 눌러 복사할 수 있습니다. */ }
  }
  return (
    <div className="chat-card chat-inquiry">
      <p className="chat-card-title">{t('inquiryTitle')}</p>
      <p className="muted">{t('inquiryNote')}</p>
      <pre className="inquiry-text" lang="ko">{inquiry.message_ko}</pre>
      <button type="button" className="btn btn--secondary" onClick={copy}><Icon name={copied ? 'check' : 'link'} />{copied ? t('inquiryCopied') : t('inquiryCopy')}</button>
      {contacts.length
        ? contacts.map((contact, index) => <InquiryContact key={index} contact={contact} demo={inquiry.is_demo} />)
        : <p className="muted">{t('inquiryNoContact')}</p>}
    </div>
  )
}

type InquiryContactInfo = NonNullable<AgentReply['inquiry']>['contacts'][number]

/** 화면에 보일 수 있는 문의처만: 번호가 있는 전화, 주소가 있는 방문, 안전한 주소의 온라인 */
const shownContact = (contact: InquiryContactInfo) =>
  contact.type === 'phone' ? Boolean(contact.phone?.trim())
    : contact.type === 'visit' ? Boolean(contact.address?.trim())
      : contact.type === 'online' && isSafeUrl(contact.url)

function InquiryContact({ contact, demo }: { contact: InquiryContactInfo; demo: boolean }) {
  const { t } = useI18n()
  if (contact.type === 'phone') return <PhoneLink phone={contact.phone!} demo={demo}>{t('inquiryPhone', { phone: contact.phone! })}</PhoneLink>
  if (contact.type === 'visit') return <p className="action-visit"><Icon name="pin" /><span><WithKorean template={t('inquiryVisit', { address: SLOT })} text={contact.address!} /></span></p>
  return <ExternalLink href={contact.url!} demo={demo} variant="secondary">{t('inquiryOnline')}</ExternalLink>
}

function UnansweredCard({ items }: { items: AgentReply['unanswered'] }) {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  // 이미 알린 질문. 중간에 실패해 다시 누르면 남은 질문만 보내 같은 질문이 두 번 세어지지 않게 합니다.
  const sent = useRef(new Set<string>())
  const send = async () => {
    setState('sending')
    try {
      for (const item of items) {
        const id = `${item.program_id}\n${item.question_ko}`
        if (sent.current.has(id)) continue
        await reportQuestion({ program_id: item.program_id, topic: item.topic, question_ko: item.question_ko })
        sent.current.add(id)
      }
      setState('sent')
    } catch {
      setState('failed')
    }
  }
  return (
    <div className="chat-card chat-unanswered">
      <p className="chat-card-title">{t('unansweredTitle')}</p>
      <ul className="unanswered-list">
        {items.map((item) => <li key={item.question_ko}><span className="unanswered-topic">{t(TOPIC_KEYS[item.topic])}</span><span lang="ko">{item.question_ko}</span></li>)}
      </ul>
      <p className="muted">{t('unansweredBody')}</p>
      {state === 'sent'
        ? <p className="unanswered-sent" role="status"><Icon name="check" />{t('unansweredSent')}</p>
        : <button type="button" className="btn btn--outline" onClick={send} disabled={state === 'sending'}>{t('unansweredSend')}</button>}
      {state === 'failed' && <p className="muted" role="status">{t('chatError')}</p>}
    </div>
  )
}
