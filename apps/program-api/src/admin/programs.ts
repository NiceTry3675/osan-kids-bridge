import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { UNANSWERED_TOPICS } from '../agent/tools'
import { htmlToText } from '../extract/inbox'
import { evaluateProgram } from '../match'
import { koreanDateLabel } from '../match/dates'
import { ageRangeLabel, gradeRangeLabel } from '../match/labels'
import { findSourcePoster, POSTER_LANGUAGES, readReport, servablePoster } from '../poster/translate'
import type { PosterStatus } from '../poster/translate'
import type { PosterLanguage } from '../poster/tokens'
import { factChecks, unverifiedFacts } from '../review/critical'
import { AUDIENCE_LABELS, scheduleText, TARGET_LABELS } from '../review/format'
import { effectiveReviewStatus, isApprovedSummary } from '../review/hash'
import type { EffectiveReviewStatus } from '../review/hash'
import { loadTranscripts } from '../store'
import { DISPLAY_LANGUAGES } from '../types'
import type { Addendum, ApplicationStatus, CompanionRule, DisplayLanguage, Interest, ProgramRecord, SummaryHeading, UncertainTopic } from '../types'

// 기관 대시보드(관리자 화면)용 공고 목록·검수 화면 데이터. 사람 검수 CLI(npm run review, npm run poster approve)와 같은 규칙을 쓴다.

export type SummaryState = 'machine_draft' | 'machine_checked' | 'approved' | 'withdrawn'

export interface AdminPosterBrief {
  status: PosterStatus
  chosen_attempt: number | null
  attempts: number
  /** 보호자 화면에 나가는가 (승인, 또는 시연 설정에서 자동 검증 통과 + 원본이 그대로) */
  served: boolean
}

export interface AdminProgramRow {
  program_id: string
  title: string
  institution: string
  category: Interest
  is_demo: boolean
  review: { status: EffectiveReviewStatus; reviewer: string | null; reviewed_at: string | null; notes: string | null }
  /** 원문 근거로 확인되지 않은 핵심 사실 수 */
  unverified: number
  warnings: number
  summaries: Partial<Record<DisplayLanguage, SummaryState>>
  has_poster: boolean
  posters: Partial<Record<PosterLanguage, AdminPosterBrief>>
  schedule: string
  application_status: ApplicationStatus
  application_end: string | null
  /** 보호자 화면의 '기관에 확인할 점' 수 */
  to_confirm: number
  addenda: Addendum[]
}

export interface AdminFact {
  label: string
  value: string
  /** verified: 원문 근거로 확인 · unverified: 값은 있는데 근거가 없거나 맞지 않음 · not_stated: 공고에 없음 */
  status: 'verified' | 'unverified' | 'not_stated'
  quotes: string[]
}

export interface AdminPosterAttempt {
  n: number
  passed: boolean
  issues: { kind: string; message: string }[]
  duration_ms: number
}

export interface AdminPosterDetail extends AdminPosterBrief {
  language: PosterLanguage
  segments: number
  qr: { matches: boolean } | null
  injected_fault: string | null
  reviewer: string | null
  approved_at: string | null
  /** 번역 뒤 원본 포스터가 바뀌어 다시 만들어야 함 */
  source_changed: boolean
  attempt_list: AdminPosterAttempt[]
}

export interface AdminProgramDetail extends AdminProgramRow {
  source_url: string | null
  retrieved_at: string | null
  facts: AdminFact[]
  unverified_labels: string[]
  warning_list: string[]
  to_confirm_items: string[]
  notices: string[]
  summary_list: { language: DisplayLanguage; state: SummaryState; lines: string[]; heading: SummaryHeading | null; issues: string[]; reviewer: string | null }[]
  source_text: { file: string; text: string }[]
  poster_list: AdminPosterDetail[]
}

export interface AdminContext {
  now: Date
  dataDir: string
  posterDir: string
  showMachineChecked: boolean
}

const COMPANION: Record<CompanionRule, string> = { required: '반드시 함께', allowed: '함께 올 수 있음', not_allowed: '함께 올 수 없음', unknown: '공고에 없음' }
const ATTENDANCE: Record<ProgramRecord['attendance_rule'], string> = { all_sessions: '모든 회차 참여', choose_one: '회차 중 하나 선택', unknown: '공고에 없음' }

function summaryState(record: ProgramRecord, language: DisplayLanguage): SummaryState | null {
  const summary = record.summaries_by_language[language]
  if (!summary) return null
  if (summary.status === 'approved' && !isApprovedSummary(record, language, summary)) return 'withdrawn'
  return summary.status
}

function posterBrief(id: string, language: PosterLanguage, context: AdminContext): AdminPosterBrief | null {
  const report = readReport(id, language, context.posterDir)
  if (!report) return null
  return {
    status: report.status,
    chosen_attempt: report.chosen_attempt,
    attempts: report.attempts.length,
    served: servablePoster(id, language, context.showMachineChecked, context.posterDir) !== null,
  }
}

export function adminRow(record: ProgramRecord, context: AdminContext): AdminProgramRow {
  const program = evaluateProgram(record, null, context.now)
  const posters: AdminProgramRow['posters'] = {}
  for (const language of POSTER_LANGUAGES) {
    const brief = posterBrief(record.program_id, language, context)
    if (brief) posters[language] = brief
  }
  const summaries: AdminProgramRow['summaries'] = {}
  for (const language of DISPLAY_LANGUAGES) {
    const state = summaryState(record, language)
    if (state) summaries[language] = state
  }
  return {
    program_id: record.program_id,
    title: record.title,
    institution: record.institution,
    category: record.category,
    is_demo: record.source.demo === true,
    review: { status: effectiveReviewStatus(record), reviewer: record.review.reviewer, reviewed_at: record.review.reviewed_at, notes: record.review.notes },
    unverified: unverifiedFacts(record).length,
    warnings: record.warnings.length,
    summaries,
    has_poster: findSourcePoster(record.program_id, context.posterDir) !== null,
    posters,
    schedule: scheduleText(record),
    application_status: program.application_status,
    application_end: program.application_end,
    to_confirm: program.uncertain_items_ko.length,
    addenda: record.addenda ?? [],
  }
}

/** 검수 화면에 보일 사실 값 (근거 필드 이름 기준) */
function factValue(record: ProgramRecord, field: string): string {
  const session = field.match(/^sessions\[(.+)\]\.(date|time|place)$/)
  if (session) {
    const found = record.sessions.find((item) => item.id === session[1])
    if (!found) return '-'
    if (session[2] === 'date') return found.date ? koreanDateLabel(found.date) : '공고에 없음'
    if (session[2] === 'time') return [found.start_time, found.end_time].filter(Boolean).join('~') || '공고에 없음'
    return [found.place_name, found.address].filter(Boolean).join(' · ') || (found.online ? '온라인' : '공고에 없음')
  }
  const method = field.match(/^application_methods\.(.+)$/)
  if (method) {
    return record.application_methods.filter((item) => item.type === method[1])
      .map((item) => [item.label, item.phone, item.url].filter(Boolean).join(' ')).join(' / ') || '-'
  }
  const list = (values: string[] | null) => (values === null ? '공고에 없음' : values.length ? values.join(', ') : '없음')
  switch (field) {
    case 'title': return record.title
    case 'target_type': return TARGET_LABELS[record.target_type]
    case 'target_raw': return record.target_raw || '공고에 없음'
    case 'audience': return AUDIENCE_LABELS[record.audience]
    case 'grade_range': return record.grade_range ? gradeRangeLabel(record.grade_range) : '공고에 없음'
    case 'age_range': return record.age_range ? ageRangeLabel(record.age_range) : '공고에 없음'
    case 'eligibility_requirements': return list(record.eligibility_requirements)
    case 'guardian_companion': return COMPANION[record.guardian_companion]
    case 'sibling_companion': return COMPANION[record.sibling_companion]
    case 'korean_level_required': return record.korean_level_required ?? '공고에 없음'
    case 'support_languages': return list(record.support_languages)
    case 'application_languages': return list(record.application_languages)
    case 'period': return record.period_start || record.period_end ? `${record.period_start ?? '?'} ~ ${record.period_end ?? '?'}` : '공고에 없음'
    case 'session_count': return record.session_count === null ? '공고에 없음' : `${record.session_count}회`
    case 'attendance_rule': return ATTENDANCE[record.attendance_rule]
    case 'mid_join_allowed': return record.mid_join_allowed === null ? '공고에 없음' : record.mid_join_allowed ? '가능' : '불가'
    case 'cost': return record.cost_krw === 0 ? '무료' : record.cost_krw !== null ? `${record.cost_krw.toLocaleString('ko-KR')}원` : record.cost_raw ?? '공고에 없음'
    case 'capacity': return record.capacity === null ? '공고에 없음' : `${record.capacity}명`
    case 'application_period': return record.application_start || record.application_end ? `${record.application_start ?? '?'} ~ ${record.application_end ?? '?'}`.replace(/T/g, ' ') : '공고에 없음'
    default: return '-'
  }
}

export function adminFacts(record: ProgramRecord): AdminFact[] {
  return factChecks(record).map((check) => {
    const quotes = record.evidence.filter((entry) => entry.verified && check.fields.includes(entry.field)).map((entry) => entry.quote)
    const verified = quotes.length > 0 && (check.supports === undefined || check.supports(quotes.join('\n')))
    return {
      label: check.label,
      value: factValue(record, check.fields[0]),
      status: !check.present ? 'not_stated' : verified ? 'verified' : 'unverified',
      quotes: [...new Set(quotes)],
    }
  })
}

const TEXT_FILES = new Set(['.txt', '.md', '.html', '.htm'])

/** 공고 원문: inbox의 글 파일 + 저장된 포스터 판독문 */
function sourceText(record: ProgramRecord, dataDir: string): { file: string; text: string }[] {
  const texts: { file: string; text: string }[] = []
  const folder = join(dataDir, 'inbox', record.program_id)
  if (existsSync(folder)) {
    for (const name of readdirSync(folder).sort()) {
      const ext = extname(name).toLowerCase()
      if (name.startsWith('.') || name.startsWith('_') || !TEXT_FILES.has(ext)) continue
      const raw = readFileSync(join(folder, name), 'utf8')
      texts.push({ file: name, text: (ext === '.html' || ext === '.htm' ? htmlToText(raw) : raw).replace(/\r\n?/g, '\n').trim() })
    }
  }
  for (const transcript of loadTranscripts(record.program_id, dataDir, () => {})) texts.push({ file: `${transcript.file} (포스터 판독)`, text: transcript.text })
  return texts
}

function posterDetail(id: string, language: PosterLanguage, context: AdminContext): AdminPosterDetail | null {
  const report = readReport(id, language, context.posterDir)
  const brief = posterBrief(id, language, context)
  if (!report || !brief) return null
  const source = findSourcePoster(id, context.posterDir)
  return {
    ...brief,
    language,
    segments: report.table.length,
    qr: report.qr ? { matches: report.qr.matches } : null,
    injected_fault: report.injected_fault ?? null,
    reviewer: report.reviewer ?? null,
    approved_at: report.approved_at ?? null,
    source_changed: source !== null && source.sha256 !== report.source_sha256,
    attempt_list: report.attempts.map((attempt) => ({ n: attempt.n, passed: attempt.issues.length === 0, issues: attempt.issues.map(({ kind, message }) => ({ kind, message })), duration_ms: attempt.duration_ms })),
  }
}

export function adminDetail(record: ProgramRecord, context: AdminContext): AdminProgramDetail {
  const program = evaluateProgram(record, null, context.now)
  return {
    ...adminRow(record, context),
    source_url: record.source.url,
    retrieved_at: record.source.retrieved_at,
    facts: adminFacts(record),
    unverified_labels: unverifiedFacts(record),
    warning_list: record.warnings,
    to_confirm_items: program.uncertain_items_ko,
    notices: record.notices ?? [],
    summary_list: DISPLAY_LANGUAGES.flatMap((language) => {
      const summary = record.summaries_by_language[language]
      const state = summaryState(record, language)
      return summary && state ? [{ language, state, lines: summary.lines, heading: summary.heading ?? null, issues: summary.issues, reviewer: summary.reviewer ?? null }] : []
    }),
    source_text: sourceText(record, context.dataDir),
    poster_list: POSTER_LANGUAGES.flatMap((language) => posterDetail(record.program_id, language, context) ?? []),
  }
}

// ---- 요청 본문 ----

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null)

export interface ReviewRequest {
  action: 'approve' | 'reject' | 'reset'
  reviewer: string | null
  language_reviewer: string | null
  summaries: DisplayLanguage[]
  note: string | null
  force: boolean
}

export function parseReviewRequest(body: unknown): { ok: true; request: ReviewRequest } | { ok: false; errors: string[] } {
  if (!isObject(body)) return { ok: false, errors: ['요청 본문은 JSON 객체여야 합니다.'] }
  const errors: string[] = []
  const action = body.action
  if (action !== 'approve' && action !== 'reject' && action !== 'reset') errors.push('action은 approve, reject, reset 중 하나여야 합니다.')
  const reviewer = text(body.reviewer, 40)
  if (action !== 'reset' && !reviewer) errors.push('검수자 이름(1~40자)이 필요합니다.')
  const note = body.note === undefined || body.note === null || body.note === '' ? null : text(body.note, 300)
  if (body.note && !note) errors.push('메모는 300자까지 쓸 수 있습니다.')
  if (action === 'reject' && !note) errors.push('반려하려면 사유(메모)가 필요합니다.')
  const summaries = Array.isArray(body.summaries) ? body.summaries : []
  if (!summaries.every((language) => DISPLAY_LANGUAGES.includes(language as DisplayLanguage))) errors.push(`summaries에는 ${DISPLAY_LANGUAGES.join(', ')}만 넣을 수 있습니다.`)
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    request: {
      action: action as ReviewRequest['action'],
      reviewer,
      language_reviewer: text(body.language_reviewer, 40),
      summaries: [...new Set(summaries as DisplayLanguage[])],
      note,
      force: body.force === true,
    },
  }
}

export interface AddendaInput {
  author: string
  items: Omit<Addendum, 'id' | 'author' | 'added_at'>[]
}

const MAX_ADDENDA = 20

/** 담당자가 확정한 추가 안내. 빈칸({{…}})이 남아 있거나 '기관에 확인할 점' 목록에 없는 문구를 풀겠다고 하면 받지 않는다 */
export function parseAddenda(body: unknown, toConfirm: string[]): { ok: true; input: AddendaInput } | { ok: false; errors: string[] } {
  if (!isObject(body)) return { ok: false, errors: ['요청 본문은 JSON 객체여야 합니다.'] }
  const errors: string[] = []
  const author = text(body.author, 40)
  if (!author) errors.push('담당자 이름(1~40자)이 필요합니다.')
  const raw = Array.isArray(body.items) ? body.items : []
  if (!raw.length || raw.length > 8) errors.push('items는 1~8개여야 합니다.')
  const items: AddendaInput['items'] = []
  raw.slice(0, 8).forEach((entry, index) => {
    const item = isObject(entry) ? entry : {}
    const sentence = text(item.text, 300)
    if (!sentence) errors.push(`items[${index}]: text는 1~300자여야 합니다.`)
    else if (/\{\{|\}\}/.test(sentence)) errors.push(`items[${index}]: 채우지 않은 빈칸이 있습니다.`)
    if (!UNANSWERED_TOPICS.includes(item.topic as UncertainTopic)) errors.push(`items[${index}]: topic이 올바르지 않습니다.`)
    const strings = (value: unknown) => (Array.isArray(value) ? value : []).filter((line): line is string => typeof line === 'string' && line.trim() !== '').map((line) => line.trim())
    const questions = strings(item.resolves_questions).filter((line) => line.length <= 200).slice(0, 20)
    const resolves = strings(item.resolves_items)
    const unknown = resolves.filter((line) => !toConfirm.includes(line))
    if (unknown.length) errors.push(`items[${index}]: '기관에 확인할 점'에 없는 문구: ${unknown.join(', ')}`)
    if (sentence) items.push({ topic: item.topic as UncertainTopic, text: sentence, resolves_questions: questions, resolves_items: resolves, drafted_by_ai: item.drafted_by_ai === true })
  })
  return errors.length ? { ok: false, errors } : { ok: true, input: { author: author!, items } }
}

export function addAddenda(record: ProgramRecord, input: AddendaInput, now: Date): ProgramRecord {
  const existing = record.addenda ?? []
  if (existing.length + input.items.length > MAX_ADDENDA) throw new Error(`추가 안내는 공고 하나에 ${MAX_ADDENDA}개까지 둘 수 있습니다.`)
  let next = existing.reduce((max, addendum) => Math.max(max, Number(addendum.id.replace(/^add-/, '')) || 0), 0)
  const added: Addendum[] = input.items.map((item) => ({ id: `add-${(next += 1)}`, ...item, author: input.author, added_at: now.toISOString() }))
  return { ...record, addenda: [...existing, ...added] }
}

export function removeAddendum(record: ProgramRecord, id: string): ProgramRecord | null {
  const existing = record.addenda ?? []
  if (!existing.some((addendum) => addendum.id === id)) return null
  return { ...record, addenda: existing.filter((addendum) => addendum.id !== id) }
}
