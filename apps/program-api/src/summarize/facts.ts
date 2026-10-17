import type { ApplicationMethod, AttendanceRule, Audience, CompanionRule, ProgramRecord, TargetType, Weekday } from '../types'
import { dongFromAddress } from '../geo/dong'
import { isValidDate, isValidTime, lastApplicationDay, parseDateTime, weekdayOf } from '../match/dates'
import { applicationStatus } from '../match/application'
import { clockOf, compareSessions, hasOperationEnded, hasStarted, MID_JOIN_MENTION, needsMidJoinCheck } from '../match/sessions'

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

/** 요일마다 따로 운영하는 반 하나 ('A반(월요일)') */
export interface ClassFact {
  /** 원문의 반 이름 ('A반'). 요일로만 부르면 null */
  name: string | null
  weekday: Weekday
  /** 그 반의 다음 회차 (시작 전이면 첫 회차) */
  from: DateFact
  /** 그 반의 마지막 회차 */
  to: DateFact
  /** from부터 to까지의 회차 수 (시작 전이면 그 반의 회차 수. 지난 회차를 세면 '11월 9일부터 11월 23일까지 6번'처럼 틀린다) */
  count: number
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
  /** 원문 안내가 요일마다 따로 운영하는 반·조·그룹을 밝혔을 때 반별 회차. 앞으로 회차가 남은 반만 */
  classes: ClassFact[]
  /** 회차도 기간도 없을 때 원문이 밝힌 대략의 일정 ('11월 중 운영 예정') */
  schedule_note: string | null
  /** 앞으로 시작할 가장 빠른 회차 */
  next_session: SessionFact | null
  /** 운영이 이미 끝난 공고 (지난 일은 시간이 지나도 바뀌지 않는다) */
  operation_ended: boolean
  /** 신청 마감이 이미 지난 공고 */
  application_closed: boolean
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
  /** 확인할 점에 신청 기간이 공고 안에서 서로 다르게 적혔다는 항목이 있음 (목록의 접수 기간과 본문의 신청 기간 등) */
  application_conflict: boolean
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
/** 학년·나이 범위가 없을 때 추출이 넣는 확인 항목과, 대상 원문이 나이·학년을 숫자로 밝혔는지 ('3세대'는 아님) */
const AGE_GRADE_ITEM = '대상 학년·나이'
const STATED_AGE_GRADE = /\d\s*세(?!대)|\d\s*학년/
/** 신청(접수·모집) 기간이 서로 다르게 적혔다는 확인 항목 ('상단 접수기간과 본문 신청 기간의 불일치'). 운영 기간과 견주는 항목('신청 기간과 운영 기간의 차이')은 아니다 */
const APPLICATION_CONFLICT = /^(?!.*(?:운영|행사|종료))(?=.*(?:신청|접수|모집)\s*(?:기간|일정))(?=.*(?:불일치|다름|다르|달라|차이|상이|맞지\s*않))/
/**
 * 안내 문장의 요일별 반 이름: 'A반(월요일)', '1조: 화요일' / '월요일 A반', '월요일(B조)', '월요일반은'.
 * 요일 뒤의 반·조·그룹에는 조사만 붙는다 ('월요일 반드시', '화요일 반나절', '화요일 조리 실습', '조별 활동'은 아니다)
 */
const CLASS_THEN_DAY = /(?<![A-Za-z0-9가-힣])([A-Za-z0-9]{1,3}|[가-힣]{1,4})?\s*(반|조|그룹)\s*[(（:：]?\s*([월화수목금토일])요일/g
const DAY_THEN_CLASS = /([월화수목금토일])요일\s*[(（]?\s*([A-Za-z0-9]{1,3}|[가-힣]{1,4})?\s*(반|조|그룹)(?=(?:은|는|이|과|와|을|를|의|에서|에|으로|로|도|만)?(?![가-힣]))/g
/** 이름 없는 반·조·그룹 뒤에 다른 낱말이 이어지면 반이 아니다 ('화요일 그룹 활동') */
const NEXT_WORD = /^\s+[가-힣]/
const KO_WEEKDAYS: Record<string, Weekday> = { 월: 'mon', 화: 'tue', 수: 'wed', 목: 'thu', 금: 'fri', 토: 'sat', 일: 'sun' }
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
 * 요일마다 그 요일의 첫 회차와 마지막 회차 사이만 본다 (월요일 반이 먼저 끝나면 그 뒤의 월요일은 쉬는 날이 아니다).
 */
export function skippedDates(sessions: DateFact[], total: number, sessionCount: number | null, today: string): DateFact[] {
  if (sessions.length < 4 || total !== sessions.length || (sessionCount !== null && sessionCount !== sessions.length)) return []
  const dates = new Set(sessions.map((session) => session.date))
  const skipped: DateFact[] = []
  for (const weekday of new Set(sessions.map((session) => session.weekday))) {
    const same = [...new Set(sessions.filter((session) => session.weekday === weekday).map((session) => session.date))]
    // 한 번뿐인 요일이 섞였으면 매주 이어지는 일정이 아니다 (불규칙 일정의 빈 날을 쉬는 날로 보지 않는다)
    if (same.length < 2) return []
    for (let date = addDays(same[0], 7); date < same[same.length - 1]; date = addDays(date, 7)) {
      if (!dates.has(date)) skipped.push({ date, weekday })
    }
  }
  skipped.sort((a, b) => a.date.localeCompare(b.date))
  if (!skipped.length || skipped.length > MAX_SKIPPED || skipped.length * 3 > sessions.length) return []
  return skipped.filter((fact) => fact.date >= today)
}

/**
 * 안내 문장이 요일마다 따로 운영하는 반을 밝혔으면('A반(월요일)과 B반(금요일)은 따로 운영') 회차를 요일로 묶은 반별 회차.
 * 반의 요일이 둘 이상이고 회차의 요일과 꼭 맞을 때만 낸다 (한 요일에 반이 둘이거나 한 반이 두 요일에 모이면 요일로 나눌 수 없다).
 * 반마다 다음 회차부터 마지막 회차까지와 그 사이 회차 수를 주고, 이미 끝난 반은 뺀다.
 */
export function weekdayClasses(sessions: DateFact[], upcoming: DateFact[], notices: string[]): ClassFact[] {
  const names = new Map<Weekday, string | null>()
  const days = new Map<string, Weekday>()
  let conflict = false
  const add = (day: string, name: string | undefined, kind: string) => {
    const weekday = KO_WEEKDAYS[day]
    const label = name ? `${name}${kind}` : null
    const known = names.get(weekday)
    if (known && label && known !== label) conflict = true
    if (label && (days.get(label) ?? weekday) !== weekday) conflict = true
    if (label) days.set(label, weekday)
    if (!known) names.set(weekday, label)
  }
  for (const notice of notices) {
    for (const [, name, kind, day] of notice.matchAll(CLASS_THEN_DAY)) add(day, name, kind)
    for (const match of notice.matchAll(DAY_THEN_CLASS)) {
      const [whole, day, name, kind] = match
      if (!name && NEXT_WORD.test(notice.slice(match.index + whole.length))) continue
      add(day, name, kind)
    }
  }
  const sessionDays = new Set(sessions.map((session) => session.weekday))
  if (conflict || names.size < 2 || names.size !== sessionDays.size || [...names.keys()].some((day) => !sessionDays.has(day))) return []
  const classes: ClassFact[] = []
  for (const [weekday, name] of names) {
    const same = sessions.filter((session) => session.weekday === weekday)
    const next = upcoming.find((session) => session.weekday === weekday)
    if (next) {
      const count = same.filter((session) => session.date >= next.date).length
      classes.push({ name, weekday, from: { date: next.date, weekday }, to: { date: same[same.length - 1].date, weekday }, count })
    }
  }
  return classes.sort((a, b) => a.from.date.localeCompare(b.from.date))
}

function checkItems(record: ProgramRecord, now: Date): string[] {
  // 끝났거나 신청이 마감된 공고는 기관에 물을 것이 없다 (보호자 웹도 확인할 점을 보이지 않는다)
  if (hasOperationEnded(record, clockOf(now)) || applicationStatus(record, now) === 'closed') return []
  // '만 5세 ~ 초등학교 6학년'처럼 학년·나이 범위 하나로 옮기지 못해도 대상 원문이 밝혔으면 묻게 하지 않는다 (요약은 원문 표현을 쓴다)
  const items = [...new Set(record.uncertain_items.map((item) => item.trim()).filter(Boolean))]
    .filter((item) => !(item === AGE_GRADE_ITEM && STATED_AGE_GRADE.test(record.target_raw)))
  const mentions = (word: string) => items.some((item) => item.includes(word))
  if (needsMidJoinCheck(record, clockOf(now)) && !items.some((item) => MID_JOIN_MENTION.test(item))) items.push('중도 참여 가능 여부')
  if (record.audience === 'unknown' && !mentions('참여 대상') && !mentions('자녀가 참여')) items.push('자녀가 참여하는 프로그램인지')
  if (record.eligibility_requirements === null && record.target_type === 'unknown' && !mentions('자격')) items.push('참여 자격')
  return items
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
  const notices = (record.notices ?? []).map((notice) => notice.trim()).filter(Boolean)
  const items = checkItems(record, now)

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
    classes: weekdayClasses(sessions, nextIndex >= 0 ? sessions.slice(nextIndex) : [], notices),
    schedule_note: dated.length || record.period_start || record.period_end ? null : textOrNull(record.schedule_note),
    next_session: nextIndex >= 0 ? sessions[nextIndex] : null,
    operation_ended: hasOperationEnded(record, clock),
    application_closed: applicationStatus(record, now) === 'closed',
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
    // 잘려 나간 확인 항목이어도 알린다
    application_conflict: items.some((item) => APPLICATION_CONFLICT.test(item)),
    support_languages: record.support_languages,
    support_interpretation: verifiedQuotes(record, 'support_languages').some((quote) => /통역/.test(quote)),
    notices,
    check_items: items.slice(0, MAX_CHECK_ITEMS),
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
