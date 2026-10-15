import type { ApplicationStatus, ProgramRecord, ProgramResponse, SearchFilters, SearchResponse } from '../types'
import { applicationStatus } from './application'
import { evaluateProgram } from './evaluate'
import { clockOf, hasOperationEnded, hasStarted } from './sessions'
import type { Clock } from './sessions'

const APPLICATION_ORDER: Record<ApplicationStatus, number> = { open: 0, upcoming: 1, unknown: 2, closed: 3 }

/** 자녀 프로그램 목록에 올릴 수 있는가 (명세 5.1). 상세 조회 가능 여부와는 별개다 */
export function isListable(record: ProgramRecord, now: Date): boolean {
  // 보호자만 참여하는 공고는 자녀 프로그램 결과에 섞지 않는다
  if (record.audience === 'parent_only' || record.audience === 'adult' || record.target_type === 'parent_only') return false
  if (record.review.status !== 'approved') return false
  if (applicationStatus(record, now) === 'closed') return false
  return !hasOperationEnded(record, clockOf(now))
}

type SortKey = (number | string)[]

/** 같은 동 여부: 시간이 맞으면 일치한 회차, 아니면 앞으로 시작할 회차 중 하나라도 그 동에서 열리는지 */
function inPreferredDong(record: ProgramRecord, program: ProgramResponse, dong: string | undefined, clock: Clock): boolean {
  const wanted = dong?.trim()
  if (!wanted) return false
  const relevant = program.time_match_status === 'matched'
    ? record.sessions.filter((session) => program.matched_sessions.includes(session.id))
    : record.sessions.filter((session) => !hasStarted(session, clock))
  // 회차가 없는 공고는 원문의 공통 장소로 본다
  if (!record.sessions.length) return record.venue?.dong?.trim() === wanted
  return relevant.some((session) => session.dong?.trim() === wanted)
}

// 신청 상태 → 가장 빠른 관련 회차 날짜(미상은 뒤) → 대상·자격 확인 → 관심 분야 → 같은 동 → 시작 시각 → id
function sortKey(record: ProgramRecord, program: ProgramResponse, filters: SearchFilters, clock: Clock): SortKey {
  const uncertain = program.age_grade_match_status === 'unknown' || program.eligibility_status === 'unknown'
  return [
    APPLICATION_ORDER[program.application_status],
    program.next_session?.date ?? '9999-12-31',
    uncertain ? 1 : 0,
    filters.interests.includes(program.category) ? 0 : 1,
    inPreferredDong(record, program, filters.dong, clock) ? 0 : 1,
    program.next_session?.start_time ?? '99:99',
    program.program_id,
  ]
}

function compareKeys(a: SortKey, b: SortKey): number {
  for (let index = 0; index < a.length; index += 1) {
    const [left, right] = [a[index], b[index]]
    if (left === right) continue
    if (typeof left === 'number' && typeof right === 'number') return left - right
    return String(left) < String(right) ? -1 : 1
  }
  return 0
}

/**
 * 명세 5.1의 결과 분류와 순서.
 * 학년·나이, 시간, 무료 조건과 확인된 불일치는 제외. 시간을 입력했고 시간 미상이면 needs_confirmation.
 * 관심 분야·사는 동은 순서만 바꾼다.
 */
export function searchPrograms(records: ProgramRecord[], filters: SearchFilters, now: Date): SearchResponse {
  const clock = clockOf(now)
  const timeApplied = filters.available_windows.length > 0
  const results: { program: ProgramResponse; key: SortKey }[] = []
  const needsConfirmation: typeof results = []

  for (const record of records) {
    if (!isListable(record, now)) continue
    if (filters.free_only && record.cost_krw !== 0) continue
    const program = evaluateProgram(record, filters, now)
    const statuses = [program.age_grade_match_status, program.time_match_status, program.eligibility_status]
    if (statuses.includes('not_matched')) continue
    const entry = { program, key: sortKey(record, program, filters, clock) }
    if (timeApplied && program.time_match_status === 'unknown') needsConfirmation.push(entry)
    else results.push(entry)
  }

  const sorted = (entries: typeof results) => entries.sort((a, b) => compareKeys(a.key, b.key)).map(({ program }) => program)
  return { results: sorted(results), needs_confirmation: sorted(needsConfirmation) }
}
