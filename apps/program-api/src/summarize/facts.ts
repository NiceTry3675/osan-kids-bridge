import type { ApplicationMethod, AttendanceRule, Audience, CompanionRule, ProgramRecord, TargetType, Weekday } from '../types'
import { dongFromAddress } from '../geo/dong'
import { isValidDate, isValidTime, lastApplicationDay, parseDateTime, weekdayOf } from '../match/dates'
import { clockOf, compareSessions, hasStarted, needsMidJoinCheck } from '../match/sessions'

// 요약에 쓸 수 있는 사실만 모은다. 원문·소개(description)·근거 인용은 넣지 않는다 (명세 5.4).
// 예외: 회차 없이 기간만 있는 공고의 공통 장소는 원문에서 찾은 장소 인용으로만 남아 있어 그 인용을 쓴다.

export interface DateFact {
  /** YYYY-MM-DD, Asia/Seoul */
  date: string
  weekday: Weekday
}

export interface DateTimeFact extends DateFact {
  /** HH:MM. 원문에 시각이 없으면 null */
  time: string | null
}

export interface SessionFact extends DateFact {
  start_time: string | null
  end_time: string | null
  place: string | null
  address: string | null
  online: boolean
}

export type MethodPurpose = 'apply' | 'inquiry'

export interface MethodFact {
  type: ApplicationMethod['type']
  /** apply: 신청할 수 있는 방법, inquiry: 문의만 받는 연락처 */
  purpose: MethodPurpose
  phone: string | null
  address: string | null
  /** 원문 표현의 방법 이름 ('홈페이지 프로그램 신청'). 온라인 방법만 쓴다 */
  label: string | null
}

export interface SummaryFacts {
  /** 요약을 만든 날 (연도 표기·다음 회차 기준) */
  today: string
  title: string
  institution: string
  target_raw: string
  target_type: TargetType
  audience: Audience
  grade_range: [number, number] | null
  age_range: [number, number] | null
  /** 원문이 나이를 '만 N세'로 적음 */
  age_completed: boolean
  /** 미상 null, 별도 자격 없음 [] */
  eligibility_requirements: string[] | null
  guardian_companion: CompanionRule
  sibling_companion: CompanionRule
  korean_level_required: string | null
  /** 날짜가 확인된 회차 (시간순) */
  sessions: SessionFact[]
  /** 회차가 없을 때 원문에 적힌 공통 장소 (원문 표기 그대로). 회차가 있으면 회차의 장소를 쓴다 */
  venue: string | null
  /** 날짜가 적히지 않은 회차 수 */
  undated_sessions: number
  /** 같은 요일마다 하다가 쉬는 날 (원문 '11월 9일·13일 휴강'). 앞으로 올 날만 */
  skipped_dates: DateFact[]
  /** 회차도 기간도 없을 때 원문이 밝힌 대략의 일정 ('11월 중 운영 예정') */
  schedule_note: string | null
  /** 앞으로 시작할 가장 빠른 회차 */
  next_session: SessionFact | null
  period_start: DateFact | null
  period_end: DateFact | null
  session_count: number | null
  attendance_rule: AttendanceRule
  /** 전 회차 과정이지만 중간에 들어와도 된다고 원문이 밝힘 */
  mid_join_allowed: boolean | null
  /** 장소가 오산시 밖이면 그 주소 (원문 표기) */
  outside_osan: string | null
  /** 무료 0, 미상 null */
  cost_krw: number | null
  cost_raw: string | null
  capacity: number | null
  application_start: DateTimeFact | null
  application_end: DateTimeFact | null
  application_methods: MethodFact[]
  /** 신청 기간 없이 원문이 신청을 대략만 밝힌 표현 ('일정 확정 후 별도 안내') */
  application_note: string | null
  /** 기관이 실제로 통역·진행하는 언어. 미상 null */
  support_languages: string[] | null
  /** 원문이 그 언어 지원을 '통역'이라고 밝힘 */
  support_interpretation: boolean
  /** 보호자에게 알리는 안내 문장 (원문 그대로, 한국어) */
  notices: string[]
  /** 보호자가 기관에 확인할 점 (한국어, 중요한 순) */
  check_items: string[]
}

const MAX_CHECK_ITEMS = 4
/** 이보다 많이 빠지면 매주가 아니라 격주·불규칙 일정으로 본다 */
const MAX_SKIPPED = 3
const DAY_MS = 86_400_000

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

function dateFact(date: string | null): DateFact | null {
  return isValidDate(date) ? { date, weekday: weekdayOf(date) } : null
}

function dateTimeFact(value: string | null): DateTimeFact | null {
  const parsed = value ? parseDateTime(value) : null
  return parsed ? { date: parsed.date, weekday: weekdayOf(parsed.date), time: parsed.time } : null
}

/** 신청 마감. 새벽 마감('10-17 00:00까지')은 보호자 웹과 같이 전날까지로 쓴다 */
function applicationEndFact(value: string | null): DateTimeFact | null {
  const parsed = dateTimeFact(value)
  const lastDay = lastApplicationDay(value)
  if (!parsed || !lastDay || lastDay === parsed.date) return parsed
  return { date: lastDay, weekday: weekdayOf(lastDay), time: null }
}

/** 회차나 공통 장소 중 오산시 밖에 있는 곳의 주소 */
function outsideOsan(record: ProgramRecord): string | null {
  const places = record.sessions.length ? record.sessions : record.venue ? [record.venue] : []
  for (const place of places) {
    const text = place.address ?? place.place_name
    if (text && dongFromAddress(text).outside_osan) return text
  }
  return null
}

/**
 * 신청 방법인지 문의처인지. 원문 표현에서 온 label로 판단한다.
 * '전화 신청·문의'는 신청, '전화 문의'는 문의, 아무 말이 없는 전화번호는 문의로 본다 (신청 가능하다고 단정하지 않는다).
 */
export function methodPurpose(method: ApplicationMethod): MethodPurpose {
  if (/신청|접수|예약|등록/.test(method.label)) return 'apply'
  return method.type === 'phone' || /문의|상담|연락/.test(method.label) ? 'inquiry' : 'apply'
}

/** 원문에서 찾은 공통 장소 인용에서 '장소 :' 같은 항목 이름을 뗀다 */
function venueText(record: ProgramRecord): string | null {
  const quote = record.evidence.find((entry) => entry.verified && entry.field === 'venue')?.quote
  return quote?.replace(/^\s*(?:교육|행사|활동|운영|모임)?\s*장\s*소\s*[:：|]?\s*/, '').trim() || null
}

/** 원문에서 찾은 인용 중 그 항목의 것 */
const verifiedQuotes = (record: ProgramRecord, field: string) =>
  record.evidence.filter((entry) => entry.verified && entry.field === field).map((entry) => entry.quote)

const timeOrNull = (time: string | null) => (isValidTime(time) ? time : null)
const textOrNull = (text: string | null | undefined) => text?.trim() || null

/**
 * 회차 요일이 매주 이어지는데 몇 날만 빠졌으면 그날들 (휴강일). 모든 회차가 날짜로 적혀 있을 때만 본다.
 * 빠진 날이 많으면(격주 등) 쉬는 날이 아니라 일정의 간격이므로 내지 않는다.
 */
export function skippedDates(sessions: DateFact[], total: number, sessionCount: number | null, today: string): DateFact[] {
  if (sessions.length < 4 || total !== sessions.length || (sessionCount !== null && sessionCount !== sessions.length)) return []
  const weekdays = new Set(sessions.map((session) => session.weekday))
  const dates = new Set(sessions.map((session) => session.date))
  const skipped: DateFact[] = []
  for (let date = sessions[0].date; date <= sessions[sessions.length - 1].date; date = addDays(date, 1)) {
    const weekday = weekdayOf(date)
    if (weekdays.has(weekday) && !dates.has(date)) skipped.push({ date, weekday })
  }
  if (!skipped.length || skipped.length > MAX_SKIPPED || skipped.length * 3 > sessions.length) return []
  return skipped.filter((fact) => fact.date >= today)
}

function checkItems(record: ProgramRecord, now: Date): string[] {
  const items = [...new Set(record.uncertain_items.map((item) => item.trim()).filter(Boolean))]
  const mentions = (word: string) => items.some((item) => item.includes(word))
  if (needsMidJoinCheck(record, clockOf(now)) && !mentions('중도')) items.push('중도 참여 가능 여부')
  if (record.audience === 'unknown' && !mentions('참여 대상') && !mentions('자녀가 참여')) items.push('자녀가 참여하는 프로그램인지')
  if (record.eligibility_requirements === null && record.target_type === 'unknown' && !mentions('자격')) items.push('참여 자격')
  return items.slice(0, MAX_CHECK_ITEMS)
}

export function summaryFacts(record: ProgramRecord, now: Date): SummaryFacts {
  const clock = clockOf(now)
  const dated = record.sessions.filter((session) => isValidDate(session.date)).sort(compareSessions)
  const sessions: SessionFact[] = dated.map((session) => ({
    date: session.date as string,
    weekday: weekdayOf(session.date as string),
    start_time: timeOrNull(session.start_time),
    end_time: timeOrNull(session.end_time),
    place: textOrNull(session.place_name),
    address: textOrNull(session.address),
    online: session.online,
  }))
  const nextIndex = dated.findIndex((session) => !hasStarted(session, clock))

  return {
    today: clock.today,
    title: record.title.trim(),
    institution: record.institution.trim(),
    target_raw: record.target_raw.trim(),
    target_type: record.target_type,
    audience: record.audience,
    grade_range: record.grade_range,
    age_range: record.age_range,
    age_completed: record.age_range !== null && [record.target_raw, ...verifiedQuotes(record, 'age_range')].some((text) => /만\s*\d/.test(text)),
    eligibility_requirements: record.eligibility_requirements,
    guardian_companion: record.guardian_companion,
    sibling_companion: record.sibling_companion,
    korean_level_required: textOrNull(record.korean_level_required),
    sessions,
    venue: sessions.length ? null : venueText(record),
    undated_sessions: record.sessions.length - dated.length,
    skipped_dates: skippedDates(sessions, record.sessions.length, record.session_count, clock.today),
    schedule_note: dated.length || record.period_start || record.period_end ? null : textOrNull(record.schedule_note),
    next_session: nextIndex >= 0 ? sessions[nextIndex] : null,
    period_start: dateFact(record.period_start),
    period_end: dateFact(record.period_end),
    session_count: record.session_count,
    attendance_rule: record.attendance_rule,
    mid_join_allowed: record.mid_join_allowed,
    outside_osan: outsideOsan(record),
    cost_krw: record.cost_krw,
    cost_raw: textOrNull(record.cost_raw),
    capacity: record.capacity,
    application_start: dateTimeFact(record.application_start),
    application_end: applicationEndFact(record.application_end),
    application_methods: record.application_methods.map((method) => ({
      type: method.type,
      purpose: methodPurpose(method),
      phone: textOrNull(method.phone),
      address: textOrNull(method.address),
      label: method.type === 'online' ? textOrNull(method.label) : null,
    })),
    application_note: record.application_start || record.application_end ? null : textOrNull(record.application_note),
    support_languages: record.support_languages,
    support_interpretation: verifiedQuotes(record, 'support_languages').some((quote) => /통역/.test(quote)),
    notices: (record.notices ?? []).map((notice) => notice.trim()).filter(Boolean),
    check_items: checkItems(record, now),
  }
}

/** 사실에 나오는 모든 날짜 (회차·기간·신청) */
export function factDates(facts: SummaryFacts): DateFact[] {
  return [...facts.sessions, ...facts.skipped_dates, facts.period_start, facts.period_end, facts.application_start, facts.application_end]
    .filter((fact): fact is DateFact => fact !== null)
}

/** 사실에 나오는 모든 시각 (회차 시작·종료, 신청 시작·마감) */
export function factTimes(facts: SummaryFacts): string[] {
  const times = [
    ...facts.sessions.flatMap((session) => [session.start_time, session.end_time]),
    facts.application_start?.time ?? null,
    facts.application_end?.time ?? null,
  ]
  return [...new Set(times.filter((time): time is string => time !== null))]
}

/** 사실에 나오는 전화번호 */
export function factPhones(facts: SummaryFacts): string[] {
  return facts.application_methods.map((method) => method.phone).filter((phone): phone is string => phone !== null)
}
