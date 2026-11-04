import type { CompanionRule, GuardianAddendum, GuardianCompanionRule, MatchStatus, ProgramRecord, ProgramResponse, SearchFilters, UncertainItem } from '../types'
import { applicationStatus } from './application'
import { addendumCovers, guardianMethods, guardianSummaries, guardianUncertainItems, representativeSession } from './contract'
import { lastApplicationDay, seoulDateOf } from './dates'
import { ageRangeLabel, gradeLabel, gradeRangeLabel, sessionLabel } from './labels'
import { clockOf, hasOperationEnded, hasStarted, judgeTime, MID_JOIN_MENTION, needsMidJoinCheck } from './sessions'
import type { Clock, TimeJudgement } from './sessions'

export const MID_JOIN_ITEM = '중도 참여 확인 필요'
export const ELIGIBILITY_ITEM = '참여 자격 확인 필요'
export const AUDIENCE_ITEM = '자녀가 참여하는 프로그램인지 확인 필요'
/** 다문화가족 대상을 더 구체적으로 밝힌 자격 ('중도입국 자녀' 등). 있으면 '다문화가족'을 따로 덧붙이지 않는다 */
const MIGRANT_BACKGROUND = /다문화|중도\s*입국|결혼\s*이민|이주\s*배경|이민자|외국인\s*(?:가정|가족|주민)/

interface AgeGradeJudgement {
  status: MatchStatus
  reason: string | null
}

function inRange(value: number, range: [number, number] | null): MatchStatus {
  if (!range || range[0] > range[1]) return 'unknown'
  return value >= range[0] && value <= range[1] ? 'matched' : 'not_matched'
}

/** 같은 기준끼리만 비교한다. 나이와 학년을 서로 환산하지 않는다 */
export function judgeAgeGrade(record: ProgramRecord, filters: SearchFilters | null): AgeGradeJudgement {
  // 자녀가 참여하지 않는 공고, 학년·나이 제한이 없다고 확인된 '누구나' 공고는 자녀의 학년·나이를 묻지 않는다
  if (record.audience === 'adult' || record.audience === 'parent_only') return { status: 'not_applied', reason: null }
  if (record.target_type === 'all' && !record.grade_range && !record.age_range) return { status: 'not_applied', reason: null }
  if (filters?.child_grade !== undefined) {
    const status = inRange(filters.child_grade, record.grade_range)
    const reason = status === 'matched' && record.grade_range
      ? `입력한 학년(${gradeLabel(filters.child_grade)})이 공고 대상 학년(${gradeRangeLabel(record.grade_range)})에 들어가요`
      : null
    return { status, reason }
  }
  if (filters?.child_age !== undefined) {
    const status = inRange(filters.child_age, record.age_range)
    const reason = status === 'matched' && record.age_range
      ? `입력한 나이(${filters.child_age}세)가 공고 대상 나이(${ageRangeLabel(record.age_range)})에 들어가요`
      : null
    return { status, reason }
  }
  return { status: 'not_applied', reason: null }
}

/**
 * 학년·나이 밖의 참여 자격. 가족 배경은 입력받지 않으므로 입력 유무와 관계없이 같다.
 * 별도 자격이 없다고 확인된([]) '누구나' 공고만 matched. 다문화가족 대상은 자동으로 matched가 되지 않는다.
 */
export function eligibilityStatus(record: ProgramRecord): MatchStatus {
  const requirements = record.eligibility_requirements
  return requirements !== null && requirements.length === 0 && record.target_type === 'all' ? 'matched' : 'unknown'
}

function timeReason(record: ProgramRecord, time: TimeJudgement, clock: Clock): string | null {
  if (time.status !== 'matched' || !time.matched.length) return null
  const count = time.matched.length
  const first = sessionLabel(time.matched[0])
  if (record.attendance_rule === 'all_sessions') {
    const scope = record.sessions.some((session) => hasStarted(session, clock)) ? '남은' : '전체'
    return count === 1 ? `${scope} 회차(${first})가 입력한 시간 안에 들어가요` : `${scope} 회차 ${count}개가 모두 입력한 시간 안에 들어가요`
  }
  return count === 1 ? `입력한 시간 안에 들어가는 회차가 있어요: ${first}` : `입력한 시간 안에 들어가는 회차가 ${count}개 있어요. 가장 빠른 회차: ${first}`
}

/**
 * 공고의 확인 필요 사항에 판정에서 나온 사항을 겹치지 않게 덧붙인다.
 * 자격이 그냥 미상일 때의 일반 문구는 보호자 웹이 화면 언어로 보여주므로 넣지 않고, 확인할 자격이 구체적일 때만 넣는다.
 */
function uncertainItems(record: ProgramRecord, eligibility: MatchStatus, clock: Clock): string[] {
  const items = [...new Set(record.uncertain_items.map((item) => item.trim()).filter(Boolean))]
  const mentions = (word: string) => items.some((item) => item.includes(word))
  const add = (item: string) => { if (!items.includes(item)) items.push(item) }

  if (needsMidJoinCheck(record, clock) && !items.some((item) => MID_JOIN_MENTION.test(item))) add(MID_JOIN_ITEM)
  if (eligibility === 'unknown') {
    const required = (record.eligibility_requirements ?? []).map((item) => item.trim()).filter(Boolean)
    if (record.target_type === 'multicultural_family' && !required.some((item) => MIGRANT_BACKGROUND.test(item))) required.push('다문화가족')
    const unmentioned = required.filter((item) => !mentions(item))
    if (unmentioned.length) add(`${ELIGIBILITY_ITEM}: ${unmentioned.join(', ')}`)
  }
  if (record.audience === 'unknown' && !mentions('참여 대상') && !mentions('자녀가 참여')) add(AUDIENCE_ITEM)
  // 기관이 추가 안내로 답한 항목은 더 이상 '기관에 확인할 점'이 아니다
  const resolved = new Set((record.addenda ?? []).flatMap((addendum) => addendum.resolves_items.map((item) => item.trim())))
  return items.filter((item) => !resolved.has(item))
}

/** 원문이 기관의 언어 지원을 '통역'이라고 밝힘 */
export const supportInterpretation = (record: ProgramRecord) =>
  record.evidence.some((entry) => entry.verified && entry.field === 'support_languages' && /통역/.test(entry.quote))

const companion = (rule: CompanionRule): GuardianCompanionRule => (rule === 'unknown' ? null : rule)

/**
 * 기관 추가 안내를 보호자 웹 모양으로: 주제·문장·덧붙인 날(서울 기준)·답한 주제·번역만. 담당자 이름과 보호자 질문은 내보내지 않는다.
 * 답한 주제에서 아직 남은 확인할 점의 주제는 뺀다 (안내가 한 항목만 풀었을 때 같은 주제의 다른 항목까지 숨지 않게)
 */
const guardianAddenda = (record: ProgramRecord, open: UncertainItem[]): GuardianAddendum[] => {
  const openTopics = new Set(open.map((item) => item.topic))
  return (record.addenda ?? []).map((addendum) => {
    const translations = Object.fromEntries((['vi', 'zh'] as const).flatMap((language) => {
      const text = addendum.translations?.[language]?.trim()
      return text ? [[language, text]] : []
    }))
    return {
      topic: addendum.topic,
      text: addendum.text,
      added_at: seoulDateOf(addendum.added_at),
      covers: addendumCovers(addendum, openTopics),
      ...(Object.keys(translations).length ? { translations } : {}),
    }
  })
}

/**
 * 저장된 공고 한 건을 요청 시점의 판정과 함께 응답 형식으로 바꾼다.
 * filters가 null이면 공유 링크 단독 진입: 입력이 필요한 판정은 not_applied, 일치 근거는 없다.
 * 운영이 끝난 공고는 신청 기간이 남아 있어도 closed다 (공유 링크 상세에 신청 행동을 내지 않게, 명세 5.1·5.2).
 */
export function evaluateProgram(record: ProgramRecord, filters: SearchFilters | null, now: Date): ProgramResponse {
  const clock = clockOf(now)
  const ageGrade = judgeAgeGrade(record, filters)
  const eligibility = eligibilityStatus(record)
  const time = judgeTime(record, filters?.available_windows ?? [], clock)
  const reasons = [ageGrade.reason, timeReason(record, time, clock)].filter((reason): reason is string => reason !== null)
  const checkItems = uncertainItems(record, eligibility, clock)
  const openItems = guardianUncertainItems(record, checkItems)
  const verifiedAt = record.review.status === 'approved' ? seoulDateOf(record.review.reviewed_at) : null
  const methods = guardianMethods(record, verifiedAt ?? seoulDateOf(record.extracted_at) ?? record.extracted_at.slice(0, 10))

  return {
    program_id: record.program_id,
    title: record.title,
    institution: record.institution,
    category: record.category,
    target_raw: record.target_raw,
    description: record.description,
    grade_range: record.grade_range,
    age_range: record.age_range,
    age_grade_match_status: ageGrade.status,
    eligibility_status: eligibility,
    time_match_status: time.status,
    uncertain_items: openItems,
    uncertain_items_ko: checkItems,
    matched_reasons: reasons,
    attendance_rule: record.attendance_rule,
    ...(record.mid_join_allowed === null ? {} : { mid_join_allowed: record.mid_join_allowed }),
    sessions: record.sessions,
    venue: record.venue ?? null,
    schedule_note: record.schedule_note ?? null,
    matched_sessions: time.matched.map((session) => session.id),
    next_session: representativeSession(record, time, clock),
    cost_krw: record.cost_krw,
    cost_raw: record.cost_raw,
    application_status: hasOperationEnded(record, clock) ? 'closed' : applicationStatus(record, now),
    application_start: seoulDateOf(record.application_start),
    application_end: lastApplicationDay(record.application_end),
    application_methods: methods.apply,
    inquiry_methods: methods.inquiry,
    application_note: record.application_note ?? null,
    notices: record.notices ?? [],
    addenda: guardianAddenda(record, openItems),
    source_url: record.source.url,
    verified_at: verifiedAt,
    review_state: 'current',
    is_demo: record.source.demo === true,
    application_start_at: record.application_start,
    application_end_at: record.application_end,
    target_type: record.target_type,
    audience: record.audience,
    eligibility_requirements: record.eligibility_requirements,
    guardian_companion: companion(record.guardian_companion),
    sibling_companion: companion(record.sibling_companion),
    korean_level_required: record.korean_level_required,
    support_languages: record.support_languages,
    support_interpretation: supportInterpretation(record),
    application_languages: record.application_languages,
    period_start: record.period_start,
    period_end: record.period_end,
    session_count: record.session_count,
    capacity: record.capacity,
    summaries_by_language: guardianSummaries(record, record.summaries_by_language),
    source_evidence: record.evidence.filter((entry) => entry.verified).map(({ field, quote }) => ({ field, quote })),
  }
}
