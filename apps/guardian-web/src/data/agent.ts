/**
 * AI 상담 도우미와 번역 포스터의 서버 경계(program-api의 /agent/*, /posters/*).
 * 둘 다 서버의 모델·검증이 있어야 하므로 시연 어댑터(mock)로 대신하지 않습니다. 서버 주소가 없으면 쓸 수 없다고 알립니다.
 */
import type { Locale } from './types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')
export const agentAvailable = Boolean(apiBaseUrl) && import.meta.env.VITE_DATA_MODE !== 'demo'

export type UncertainTopic = 'family_eligibility' | 'companion' | 'korean_level' | 'schedule' | 'age_grade' | 'materials' | 'other'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface AgentStep {
  tool: 'search_programs' | 'get_program' | 'check_fit' | 'draft_inquiry' | 'flag_unanswered' | string
  program_id?: string
  title?: string
  count?: number
  ok: boolean
}

export interface AgentReply {
  reply: string
  citations: { program_id: string; title: string; quote: string }[]
  follow_ups: string[]
  steps: AgentStep[]
  programs: { program_id: string; title: string }[]
  inquiry: {
    program_id: string
    title: string
    message_ko: string
    contacts: { type: 'phone' | 'visit' | 'online'; phone?: string; url?: string; address?: string }[]
    is_demo: boolean
  } | null
  unanswered: { program_id: string; title: string; topic: UncertainTopic; question_ko: string }[]
}

export type PosterLanguage = 'vi' | 'zh'

export interface PosterInfo {
  program_id: string
  original: boolean
  languages: Partial<Record<PosterLanguage, {
    status: 'machine_checked' | 'approved'
    attempts: number
    chosen_attempt: number
    checked: { segments: number; qr: boolean | null; issues: number }
    created_at: string
  }>>
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`요청에 실패했습니다. (${response.status})`)
  return response.json() as Promise<T>
}

export async function askAgent(messages: ChatMessage[], locale: Locale, programId: string | null, signal?: AbortSignal): Promise<AgentReply> {
  const response = await fetch(`${apiBaseUrl}/agent/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, locale, program_id: programId }), signal,
  })
  return readJson<AgentReply>(response)
}

/** 보호자가 ‘기관에 알리기’를 눌렀을 때만 보냅니다. 공고·주제·일반화한 질문만 갑니다. */
export async function reportQuestion(item: { program_id: string; topic: UncertainTopic; question_ko: string }): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/agent/questions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
  if (!response.ok) throw new Error(`요청에 실패했습니다. (${response.status})`)
}

export async function getPosterInfo(id: string, signal?: AbortSignal): Promise<PosterInfo | null> {
  if (!agentAvailable) return null
  const response = await fetch(`${apiBaseUrl}/posters/${encodeURIComponent(id)}`, { signal })
  if (response.status === 404 || response.status === 410) return null
  return readJson<PosterInfo>(response)
}

export const posterUrl = (id: string, variant: PosterLanguage | 'original') => `${apiBaseUrl}/posters/${encodeURIComponent(id)}/${variant}`
