import { isValidProgramId } from '../store'
import { DISPLAY_LANGUAGES } from '../types'
import type { DisplayLanguage, ProgramRecord, UncertainTopic } from '../types'
import { MAX_MESSAGE_LENGTH, MAX_MESSAGES } from './agent'
import type { AgentMessage, AgentRequest } from './agent'
import { UNANSWERED_TOPICS } from './tools'

// 상담·질문 요청 본문 검사와 기관용 질문 집계

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseAgentRequest(body: unknown): { ok: true; request: AgentRequest } | { ok: false; errors: string[] } {
  if (!isObject(body)) return { ok: false, errors: ['요청 본문은 JSON 객체여야 합니다.'] }
  const errors: string[] = []
  const { messages, locale, program_id: programId } = body
  if (!Array.isArray(messages) || messages.length === 0) errors.push('messages는 한 개 이상의 대화 배열이어야 합니다.')
  else if (messages.length > MAX_MESSAGES * 2) errors.push(`대화는 ${MAX_MESSAGES * 2}개까지 보낼 수 있습니다.`)
  const parsed: AgentMessage[] = []
  if (Array.isArray(messages)) {
    messages.forEach((message, index) => {
      if (!isObject(message) || (message.role !== 'user' && message.role !== 'assistant') || typeof message.text !== 'string' || !message.text.trim()) {
        errors.push(`messages[${index}]: role(user|assistant)과 text가 필요합니다.`)
      } else if (message.text.length > MAX_MESSAGE_LENGTH * 2) {
        errors.push(`messages[${index}]: 한 번에 ${MAX_MESSAGE_LENGTH * 2}자까지 보낼 수 있습니다.`)
      } else {
        parsed.push({ role: message.role, text: message.text.trim() })
      }
    })
    if (parsed.length && parsed[parsed.length - 1].role !== 'user') errors.push('마지막 메시지는 보호자(user)의 질문이어야 합니다.')
  }
  if (!DISPLAY_LANGUAGES.includes(locale as DisplayLanguage)) errors.push(`locale은 ${DISPLAY_LANGUAGES.join(', ')} 중 하나여야 합니다.`)
  if (programId !== undefined && programId !== null && !isValidProgramId(programId)) errors.push('program_id가 올바르지 않습니다.')
  if (errors.length) return { ok: false, errors }
  return { ok: true, request: { messages: parsed, locale: locale as DisplayLanguage, program_id: (programId as string | null | undefined) ?? null } }
}

export interface QuestionInput {
  program_id: string
  topic: UncertainTopic
  question_ko: string
}

export interface StoredQuestion extends QuestionInput {
  /** 전달한 날 (YYYY-MM-DD). 시각·기기·대화는 남기지 않는다 */
  date: string
}

export function parseQuestion(body: unknown): { ok: true; question: QuestionInput } | { ok: false; errors: string[] } {
  if (!isObject(body)) return { ok: false, errors: ['요청 본문은 JSON 객체여야 합니다.'] }
  const errors: string[] = []
  const { program_id: programId, topic, question_ko: question } = body
  if (!isValidProgramId(programId)) errors.push('program_id가 올바르지 않습니다.')
  if (!UNANSWERED_TOPICS.includes(topic as UncertainTopic)) errors.push(`topic은 ${UNANSWERED_TOPICS.join(', ')} 중 하나여야 합니다.`)
  if (typeof question !== 'string' || !question.trim() || question.length > 200) errors.push('question_ko는 1~200자 한국어 질문이어야 합니다.')
  if (errors.length) return { ok: false, errors }
  return { ok: true, question: { program_id: programId as string, topic: topic as UncertainTopic, question_ko: (question as string).trim() } }
}

export interface QuestionSummary {
  total: number
  programs: {
    program_id: string
    title: string
    total: number
    topics: Partial<Record<UncertainTopic, number>>
    questions: { question_ko: string; topic: UncertainTopic; count: number; last_date: string }[]
  }[]
}

/** 기관 대시보드용: 공고별·주제별로 '공고에서 답을 찾지 못한 질문'을 센다 */
export function summarizeQuestions(stored: StoredQuestion[], records: Map<string, ProgramRecord>): QuestionSummary {
  const programs = new Map<string, QuestionSummary['programs'][number]>()
  for (const item of stored) {
    if (!isValidProgramId(item.program_id) || !UNANSWERED_TOPICS.includes(item.topic) || typeof item.question_ko !== 'string') continue
    const entry = programs.get(item.program_id) ?? { program_id: item.program_id, title: records.get(item.program_id)?.title ?? item.program_id, total: 0, topics: {}, questions: [] }
    entry.total += 1
    entry.topics[item.topic] = (entry.topics[item.topic] ?? 0) + 1
    const same = entry.questions.find((question) => question.question_ko === item.question_ko)
    if (same) {
      same.count += 1
      if (item.date > same.last_date) same.last_date = item.date
    } else {
      entry.questions.push({ question_ko: item.question_ko, topic: item.topic, count: 1, last_date: item.date })
    }
    programs.set(item.program_id, entry)
  }
  const list = [...programs.values()].sort((a, b) => b.total - a.total || a.program_id.localeCompare(b.program_id))
  for (const entry of list) entry.questions.sort((a, b) => b.count - a.count || a.question_ko.localeCompare(b.question_ko))
  return { total: list.reduce((sum, entry) => sum + entry.total, 0), programs: list }
}
