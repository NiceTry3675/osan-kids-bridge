/**
 * 관리자 API(program-api /admin/...) 연결. 공고 검수·번역 포스터 승인·공고 보완 도우미·기관 추가 안내·편성 도우미를 다룹니다.
 * 서버 모양은 apps/program-api/src/admin/programs.ts, improve.ts와 같습니다(앱끼리 직접 가져오지 않도록 옮겨 둠).
 */
import type { Dong, Grade, Interest, SafeCount, SlotKey } from '@osan-kids-bridge/planning'
import type { QuestionTopic } from './questions'

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'stale'
export type SummaryState = 'machine_draft' | 'machine_checked' | 'approved' | 'withdrawn'
export type SummaryLanguage = 'ko-easy' | 'vi' | 'zh'
export type PosterLanguage = 'vi' | 'zh'
export type PosterStatus = 'machine_checked' | 'approved' | 'failed'

export interface Addendum {
  id: string
  topic: QuestionTopic
  text: string
  resolves_questions: string[]
  resolves_items: string[]
  author: string
  added_at: string
  drafted_by_ai: boolean
}

export interface PosterBrief {
  status: PosterStatus
  chosen_attempt: number | null
  attempts: number
  served: boolean
}

export interface ProgramRow {
  program_id: string
  title: string
  institution: string
  category: string
  is_demo: boolean
  review: { status: ReviewStatus; reviewer: string | null; reviewed_at: string | null; notes: string | null }
  unverified: number
  warnings: number
  summaries: Partial<Record<SummaryLanguage, SummaryState>>
  has_poster: boolean
  posters: Partial<Record<PosterLanguage, PosterBrief>>
  schedule: string
  application_status: 'open' | 'upcoming' | 'closed' | 'unknown'
  application_end: string | null
  to_confirm: number
  addenda: Addendum[]
}

export interface Fact {
  label: string
  value: string
  status: 'verified' | 'unverified' | 'not_stated'
  quotes: string[]
}

export interface PosterDetail extends PosterBrief {
  language: PosterLanguage
  segments: number
  qr: { matches: boolean } | null
  injected_fault: string | null
  reviewer: string | null
  approved_at: string | null
  source_changed: boolean
  attempt_list: { n: number; passed: boolean; issues: { kind: string; message: string }[]; duration_ms: number }[]
}

export interface ProgramDetail extends ProgramRow {
  source_url: string | null
  retrieved_at: string | null
  facts: Fact[]
  unverified_labels: string[]
  warning_list: string[]
  to_confirm_items: string[]
  notices: string[]
  summary_list: { language: SummaryLanguage; state: SummaryState; lines: string[]; heading: { title: string; institution: string; target: string } | null; issues: string[]; reviewer: string | null }[]
  source_text: { file: string; text: string }[]
  poster_list: PosterDetail[]
}

export type DraftKind = 'already_in_notice' | 'add_notice'

export interface ImproveItem {
  id: string
  kind: DraftKind
  topic: QuestionTopic
  questions: string[]
  quote: string | null
  draft: string | null
  resolves_items: string[]
  reason: string
  blanks: string[]
  problems: string[]
  asked: number
}

export interface ImproveResult {
  program_id: string
  title: string
  items: ImproveItem[]
  uncovered: string[]
  passed: boolean
  rounds: number
  steps: { tool: 'read_notice' | 'read_questions' | 'check_draft' | 'submit'; ok: boolean; problems?: number }[]
  model: string
}

/** 편성 도우미 결과 (apps/program-api/src/admin/planner.ts와 같은 모양) */
export interface PlanClass { n: number; slot: SlotKey; when: string; venue_id: string; venue: string; dong: Dong; reach: string; reach_count: SafeCount; expected: string; expected_people: number; over_capacity: boolean }
export interface PlanReason { text: string; facts: { id: string; label: string; value: string }[] }
export interface PlanProposal {
  id: string
  /** 계산 결과에서 고른 안 번호 (일정·장소 추천에서 같은 안을 연다) */
  rank: number
  title: string
  interest: Interest | 'all'
  interest_label: string
  grade_range: [Grade, Grade]
  class_count: number
  capacity: number
  classes: PlanClass[]
  eligible: number
  covered: string
  covered_count: SafeCount
  coverage_pct: number | null
  baseline: { label: string; covered: string; coverage_pct: number | null } | null
  gain: number | null
  language_support: { language: 'ko-easy' | 'vi' | 'zh'; label: string }[]
  language_needs: string[]
  teaching: string[]
  warnings: string[]
  reasons: PlanReason[]
  problems: string[]
}
export type PlanTool = 'read_demand' | 'read_questions' | 'read_programs' | 'simulate_plan' | 'check_plan' | 'submit_plan'
export interface PlanResult {
  proposals: PlanProposal[]
  passed: boolean
  rounds: number
  steps: { tool: PlanTool; ok: boolean; label?: string; problems?: number }[]
  model: string
  data_note: string
}

export interface NewAddendum {
  topic: QuestionTopic
  text: string
  resolves_questions: string[]
  resolves_items: string[]
  drafted_by_ai: boolean
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? null

/** 서버가 준 오류 문장과 상세 목록 */
export class AdminError extends Error {
  constructor(message: string, readonly status: number, readonly details: string[] = []) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) throw new AdminError('no-api', 0)
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  })
  const body = await response.json().catch(() => null) as { error?: string; errors?: string[] } | null
  if (!response.ok) throw new AdminError(body?.error ?? `HTTP ${response.status}`, response.status, body?.errors ?? [])
  return body as T
}

const post = <T>(path: string, body: unknown, signal?: AbortSignal) => request<T>(path, { method: 'POST', body: JSON.stringify(body), signal })
const id = (value: string) => encodeURIComponent(value)

export const loadPrograms = (signal?: AbortSignal) => request<{ now: string; programs: ProgramRow[] }>('/admin/programs', { signal })
export const loadProgram = (programId: string, signal?: AbortSignal) => request<ProgramDetail>(`/admin/programs/${id(programId)}`, { signal })

export interface ReviewInput {
  action: 'approve' | 'reject' | 'reset'
  reviewer?: string
  language_reviewer?: string
  summaries?: SummaryLanguage[]
  note?: string
  force?: boolean
}
export const reviewProgram = (programId: string, input: ReviewInput) => post<ProgramDetail>(`/admin/programs/${id(programId)}/review`, input)
export const approvePoster = (programId: string, language: PosterLanguage, reviewer: string) => post<ProgramDetail>(`/admin/posters/${id(programId)}/${language}/approve`, { reviewer })
export const improveProgram = (programId: string, questions: { question_ko: string; topic: QuestionTopic; count: number }[], signal?: AbortSignal) =>
  post<ImproveResult>(`/admin/programs/${id(programId)}/improve`, { questions }, signal)
export const proposePlan = (questions: { question_ko: string; topic: QuestionTopic; count: number }[], signal?: AbortSignal) =>
  post<PlanResult>('/admin/planning/propose', { questions }, signal)
export const addAddenda = (programId: string, author: string, items: NewAddendum[]) => post<ProgramDetail>(`/admin/programs/${id(programId)}/addenda`, { author, items })
export const removeAddendum = (programId: string, addendumId: string) => request<ProgramDetail>(`/admin/programs/${id(programId)}/addenda/${id(addendumId)}`, { method: 'DELETE' })

/** 포스터 이미지 주소: 원본, 내보내는 번역본, 또는 n회차 시도 */
export const posterUrl = (programId: string, variant: 'original' | PosterLanguage, attempt?: number) =>
  `${apiBaseUrl}/admin/posters/${id(programId)}/${variant}${attempt ? `-${attempt}` : ''}`

/** 빈칸 {{이름}}을 담당자가 넣은 값으로 바꾼다. 채우지 않은 빈칸은 그대로 둔다 */
export function fillBlanks(draft: string, values: Record<string, string>): string {
  return draft.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (whole, name: string) => values[name.trim()]?.trim() || whole)
}

export const hasBlank = (text: string) => /\{\{[^{}]*\}\}/.test(text)
