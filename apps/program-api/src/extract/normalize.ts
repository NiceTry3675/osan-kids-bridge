import { createHash } from 'node:crypto'
import { dongFromAddress } from '../geo/dong'
import { lastApplicationDay } from '../match/dates'
import { INTERESTS } from '../types'
import type {
  ApplicationMethod, AttendanceRule, Audience, CompanionRule, Evidence, Interest, ProgramRecord, ProgramSession, TargetType, Weekday,
} from '../types'
import {
  normalizeForMatch, numbersIn, quoteInSource, supportsAgeRange, supportsApplication, supportsAttendance, supportsAudience, supportsCompanion,
  supportsCost, supportsDate, supportsEligibility, supportsGradeRange, supportsLanguage, supportsNumber, supportsPhone, supportsTargetType,
  supportsTime, verifyEvidence, weekdaysIn, yearsIn,
} from './evidence'
import { ATTENDANCE_RULES, AUDIENCES, COMPANION_RULES, LANGUAGE_CODES, METHOD_TYPES, TARGET_TYPES, WEEKDAYS } from './schema'
import type { RawExtraction } from './schema'

// 모델 응답을 검증해 ProgramRecord로 바꾼다. 결정적 코드만 쓴다.
// 핵심 사실은 원문에서 찾은 인용(verified)이 있고 값이 인용과 맞을 때만 남긴다.

export interface NormalizeContext {
  programId: string
  source: { url: string | null; retrieved_at: string | null; institution_hint?: string | null }
  /** inbox 안의 원문 파일 이름 (텍스트·이미지) */
  files: string[]
  /** 원문 텍스트 + 포스터 판독문 (모델에게 보여준 그대로) */
  sourceText: string
  model: string
  now: Date
}

const WEEKDAY_KO: Record<Weekday, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' }
const DAY_INDEX: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const ONLINE_WORDS = /온라인|비대면|zoom|줌|화상|유튜브|youtube|실시간\s*방송/i
/** 신청 일정 줄에서 온 인용인지 (회차 일정 근거로 쓰지 않는다) */
const APPLICATION_LINE = /접수|신청|모집|마감/
const SCHEDULE_LINE = /행사|운영|교육|일시|일정|활동|시간|회차/
/** '장소 : …' 줄의 값. 같은 장소를 시설 이름까지 적은 표기를 찾는 데 쓴다 */
const PLACE_LINE = /장\s*소\s*[:：]\s*(.+)$/
/** 주소처럼 보이는 표기 (도로명·번지·시군구·괄호 속 동) */
const ADDRESS_LIKE = /(?:로|길)\s*\d|\d+\s*번지|[시군구]\s|\(\s*\S+동\s*\)/
/** 어디서 신청하는지 밝히지 않은 온라인 신청 이름 */
const GENERIC_ONLINE_LABEL = /^(?:온라인|인터넷|홈페이지)?\s*(?:신청|접수)$/
/** 항목 이름 ('■ 신청 방법:', '- 일정:')과 머리 기호 */
const LEADING_MARKS = /^[\s■□※•·*▶-]+/
/** 일정·대상·내용처럼 다른 항목이 다루는 원문 줄의 머리 ('내용:', '일시 :') */
const FIELD_LINE = /^(?:내\s*용|대\s*상|일\s*시|일\s*정|장\s*소|비\s*용|참\s*가\s*비|신\s*청|접\s*수|모\s*집|정\s*원|문\s*의|기\s*간|프로그램)\s*(?:방법|기간|인원|대상)?\s*[:：]/

/** 표준 확인 사항이 다루는 주제 */
const STANDARD_TOPICS: Record<string, RegExp> = {
  '운영 날짜·시간': /일정|일시|날짜|요일|시간|시각/,
  '운영 시간': /시간|시각/,
  '참가비': /비용|참가비|재료비|유료|무료/,
  '대상 학년·나이': /학년|나이|연령/,
  '참여 대상·자격': /대상|자격/,
  '보호자·형제자매 동반 가능 여부': /동반/,
  '보호자 동반 가능 여부': /동반/,
  '형제자매 동반 가능 여부': /동반/,
  '신청 기간': /신청\s*기간|접수\s*기간/,
  '신청 방법': /신청\s*방법|접수\s*방법|신청처/,
}

export function toDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function toTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::00)?$/)
  if (!match) return null
  const [hour, minute] = match.slice(1).map(Number)
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function weekdayOf(date: string): Weekday {
  const [year, month, day] = date.split('-').map(Number)
  return DAY_INDEX[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

/** 인용 안에서 해당 날짜 바로 뒤에 붙은 요일 표기 ('11월 7일(토)', '2026-11-07(토)', '11.7(토)') */
export function statedWeekdayFor(date: string, text: string, hint?: Weekday | null): Weekday | null {
  const [year, month, day] = date.split('-').map(Number)
  const plain = text.normalize('NFKC')
  const pattern = /(?:(\d{4})\s*[-./년]\s*)?(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\s*\.?\s*(?:\(\s*([월화수목금토일])\s*\)|([월화수목금토일])요일)/g
  for (const match of plain.matchAll(pattern)) {
    if (Number(match[2]) !== month || Number(match[3]) !== day) continue
    if (match[1] && Number(match[1]) !== year) continue
    return DAY_INDEX[(['일', '월', '화', '수', '목', '금', '토'] as const).indexOf((match[4] ?? match[5]) as '일')]
  }
  return hint && weekdaysIn(plain).includes(hint) ? hint : null
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  return text && text !== 'null' ? text : null
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(cleanText).filter((item): item is string => item !== null)
}

function toInt(value: unknown): number | null {
  const number = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value
  return typeof number === 'number' && Number.isInteger(number) ? number : null
}

function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? value as T : fallback
}

const unique = <T>(items: T[]): T[] => [...new Set(items)]
const show = (value: unknown): string => typeof value === 'string' ? `'${value}'` : JSON.stringify(value)
const koreanDate = (date: string): string => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`

interface Checked {
  entries: Evidence[]
  /** 원문에서 찾은 인용을 이은 글. 하나도 없으면 null */
  text: string | null
}

interface SessionDraft {
  date: string
  start_time: string | null
  end_time: string | null
  place_name: string | null
  address: string | null
  online: boolean
  evidence: { suffix: string; entries: Evidence[] }[]
}

export function toProgramRecord(raw: RawExtraction, context: NormalizeContext): ProgramRecord {
  const r: Partial<RawExtraction> = raw ?? {}
  const { sourceText, programId } = context
  const warnings: string[] = []
  const qualityItems: string[] = []
  const evidence: Evidence[] = []
  const inferredYears: string[] = []
  const retrievedYear = context.source.retrieved_at ? Number(context.source.retrieved_at.slice(0, 4)) : null
  const warn = (message: string) => warnings.push(message)

  const check = (field: string, quotes: unknown): Checked => {
    const entries = verifyEvidence(stringList(quotes).map((quote) => ({ field, quote })), sourceText)
    const found = entries.filter((entry) => entry.verified).map((entry) => entry.quote)
    return { entries, text: found.length ? found.join('\n') : null }
  }

  /** 근거가 있고 값이 근거와 맞으면 근거를 기록하고 true. 아니면 경고를 남기고 false */
  const accept = (label: string, value: unknown, checked: Checked, supports?: (text: string) => boolean): boolean => {
    if (!checked.text) {
      warn(`${label}: 원문에서 근거를 찾지 못해 비웠습니다 (값: ${show(value)})`)
      return false
    }
    if (supports && !supports(checked.text)) {
      warn(`${label}: 값이 근거 인용과 맞지 않아 비웠습니다 (값: ${show(value)}, 인용: '${checked.text.split('\n')[0]}')`)
      return false
    }
    evidence.push(...checked.entries)
    return true
  }

  /** 날짜 하나를 검증한다. 연도 추정·요일 대조 포함 */
  const checkedDate = (label: string, value: unknown, text: string | null, hint?: Weekday | null): string | null => {
    if (value === null || value === undefined) return null
    const date = toDate(value)
    if (!date) {
      warn(`${label}: 날짜 형식이 올바르지 않아 비웠습니다 (값: ${show(value)})`)
      return null
    }
    if (!text) {
      warn(`${label}: 원문에서 근거를 찾지 못해 비웠습니다 (값: ${show(value)})`)
      return null
    }
    if (!supportsDate(date, text)) {
      warn(`${label}: 날짜가 근거 인용과 맞지 않아 비웠습니다 (값: ${date}, 인용: '${text.split('\n')[0]}')`)
      return null
    }
    let result = date
    const yearStated = yearsIn(text).length > 0
    const stated = statedWeekdayFor(date, text, hint)
    if (stated && weekdayOf(result) !== stated) {
      const fixed = yearStated ? null : yearMatchingWeekday(result, stated, retrievedYear)
      if (fixed) {
        warn(`${label}: 원문의 요일(${WEEKDAY_KO[stated]})에 맞춰 연도를 ${fixed.slice(0, 4)}년으로 고쳤습니다 (모델 값: ${result})`)
        result = fixed
      } else {
        warn(`${label}: ${result}은 ${WEEKDAY_KO[weekdayOf(result)]}요일인데 원문에는 ${WEEKDAY_KO[stated]}요일로 적혀 있습니다`)
        qualityItems.push(`${koreanDate(result)} 날짜와 요일(${WEEKDAY_KO[stated]}) 불일치`)
      }
    }
    if (!yearStated) inferredYears.push(label.includes(result) ? label : `${label} ${result}`)
    return result
  }

  // ---- 제목·기관·분류 ----
  let title = cleanText(r.title)
  if (!title) {
    title = programId
    warn('제목을 원문에서 찾지 못해 프로그램 ID로 대신했습니다')
  } else if (quoteInSource(title, sourceText)) {
    evidence.push({ field: 'title', quote: title, verified: true })
  } else {
    const checked = check('title', r.title_evidence)
    evidence.push(...checked.entries)
    if (!checked.text) warn(`제목: 원문에서 근거를 찾지 못했습니다 (값: '${title}')`)
  }

  let institution = cleanText(r.institution)
  const institutionHint = context.source.institution_hint
  if (institution) {
    const checked = check('institution', r.institution_evidence)
    if (checked.text || quoteInSource(institution, sourceText)) {
      evidence.push(...(checked.entries.length ? checked.entries : [{ field: 'institution', quote: institution, verified: true }]))
    } else {
      warn(`기관: 원문에서 근거를 찾지 못했습니다 (값: '${institution}')`)
      institution = institutionHint ?? institution
    }
    // 띄어쓰기만 다른 이름은 수집 정보의 표기로 맞춘다 ('오산시 가족센터' → '오산시가족센터')
    if (institutionHint && normalizeForMatch(institution) === normalizeForMatch(institutionHint)) institution = institutionHint
  } else {
    institution = institutionHint ?? ''
    warn(institution ? `기관 이름이 원문에 없어 수집 정보의 기관(${institution})을 썼습니다` : '기관 이름을 확인하지 못했습니다')
  }

  const category: Interest = oneOf(r.category, INTERESTS, 'experience_culture')
  if (r.category !== category) warn(`분류 값이 올바르지 않아 experience_culture로 두었습니다 (값: ${show(r.category)})`)

  // ---- 대상 ----
  let targetType: TargetType = oneOf(r.target_type, TARGET_TYPES, 'unknown')
  if (targetType !== 'unknown') {
    const type = targetType
    if (!accept('대상 구분', type, check('target_type', r.target_evidence), (text) => supportsTargetType(type, text))) targetType = 'unknown'
  }
  let targetRaw = cleanText(r.target_raw) ?? ''
  if (targetRaw && !quoteInSource(targetRaw, sourceText)) {
    warn(`대상 원문 표현을 원문에서 찾지 못해 비웠습니다 (값: '${targetRaw}')`)
    targetRaw = ''
  } else if (targetRaw) {
    evidence.push({ field: 'target_raw', quote: targetRaw, verified: true })
  }

  let audience: Audience = oneOf(r.audience, AUDIENCES, 'unknown')
  if (audience !== 'unknown') {
    const value = audience
    if (!accept('참여하는 사람', value, check('audience', r.audience_evidence), (text) => supportsAudience(value, text))) audience = 'unknown'
  }

  const gradeRange = checkRange('학년 범위', 'grade_range', r.grade_min, r.grade_max, r.grade_evidence, 'grade')
  const ageRange = checkRange('나이 범위', 'age_range', r.age_min, r.age_max, r.age_evidence, 'age')

  function checkRange(label: string, field: string, minValue: unknown, maxValue: unknown, quotes: unknown, kind: 'grade' | 'age'): [number, number] | null {
    let min = toInt(minValue)
    let max = toInt(maxValue)
    if (min === null && max === null) {
      if (minValue != null || maxValue != null) warn(`${label}: 정수가 아니어서 비웠습니다`)
      return null
    }
    if (kind === 'grade') {
      min ??= 1
      max ??= min <= 6 ? 6 : min <= 9 ? 9 : 12
    } else {
      min ??= 0
      max ??= 99
    }
    const [low, high] = kind === 'grade' ? [1, 12] : [0, 99]
    if (min < low || max > high || min > max) {
      warn(`${label}: 범위가 올바르지 않아 비웠습니다 (값: ${min}~${max})`)
      return null
    }
    const range: [number, number] = [min, max]
    const supports = kind === 'grade' ? supportsGradeRange : supportsAgeRange
    return accept(label, `${min}~${max}`, check(field, quotes), (text) => supports(range, text)) ? range : null
  }

  let eligibility: string[] | null = Array.isArray(r.eligibility_requirements) ? unique(stringList(r.eligibility_requirements)) : null
  if (eligibility) {
    const items = eligibility
    if (!accept('참여 자격', items, check('eligibility_requirements', r.eligibility_evidence), (text) => supportsEligibility(items, text))) eligibility = null
  }
  // '오산시민 누구나'의 '누구나'는 제한이 없다는 말이라 자격에서 뗀다 ('오산시민'만 남고, '누구나'뿐이면 자격 없음 [])
  if (eligibility) eligibility = unique(eligibility.map((item) => item.replace(/\s*(?:누구나|누구든지|제한\s*없음)\s*$/, '').trim()).filter(Boolean))
  // 다문화가족 대상이 원문으로 확인되면 그 자체가 참여 자격이다
  if (targetType === 'multicultural_family' && eligibility === null) eligibility = ['다문화가족']

  const companion = (label: string, field: string, who: 'guardian' | 'sibling', value: unknown, quotes: unknown): CompanionRule => {
    const rule = oneOf(value, COMPANION_RULES, 'unknown')
    return rule !== 'unknown' && accept(label, rule, check(field, quotes), (text) => supportsCompanion(rule, text, who)) ? rule : 'unknown'
  }
  const guardianCompanion = companion('보호자 동반', 'guardian_companion', 'guardian', r.guardian_companion, r.guardian_companion_evidence)
  const siblingCompanion = companion('형제자매 동반', 'sibling_companion', 'sibling', r.sibling_companion, r.sibling_companion_evidence)

  let koreanLevel = cleanText(r.korean_level_required)
  if (koreanLevel && !accept('필요 한국어 수준', koreanLevel, check('korean_level_required', r.korean_level_evidence))) koreanLevel = null

  const languages = (label: string, field: string, value: unknown, quotes: unknown): string[] | null => {
    if (!Array.isArray(value)) return null
    const given = unique(stringList(value).map((code) => code.toLowerCase()))
    const codes = given.filter((code) => LANGUAGE_CODES.includes(code))
    if (codes.length < given.length) warn(`${label}: 알 수 없는 언어 코드를 뺐습니다 (${given.filter((code) => !codes.includes(code)).join(', ')})`)
    if (!codes.length && given.length) return null
    return accept(label, codes, check(field, quotes), (text) => codes.every((code) => supportsLanguage(code, text))) ? codes : null
  }
  const supportLanguages = languages('지원 언어', 'support_languages', r.support_languages, r.support_languages_evidence)
  const applicationLanguages = languages('신청 페이지 언어', 'application_languages', r.application_languages, r.application_languages_evidence)

  // ---- 장소 ----
  const placeParts = (label: string, placeName: string | null, address: string | null, checked: Checked) => {
    if (!placeName && !address) return null
    if (!checked.text) {
      warn(`${label}: 원문에서 근거를 찾지 못해 비웠습니다 (값: '${[placeName, address].filter(Boolean).join(' ')}')`)
      return null
    }
    const keep = (part: string | null) => {
      if (part && !quoteInSource(part, sourceText)) {
        warn(`${label}: 원문에 그대로 없는 표기를 뺐습니다 (값: '${part}')`)
        return null
      }
      return part
    }
    const result = { place_name: qualifiedPlace(keep(placeName)), address: keep(address) }
    return result.place_name || result.address ? result : null
  }

  /** 원문의 다른 '장소:' 줄에 같은 장소가 시설 이름과 함께 적혀 있으면 그 표기를 쓴다 ('대체육관' → '오산오색문화체육센터 대체육관') */
  function qualifiedPlace(name: string | null): string | null {
    if (!name) return name
    const longer = sourceText.split('\n')
      .map((line) => line.match(PLACE_LINE)?.[1]?.trim())
      .filter((value): value is string => !!value && value !== name && value.endsWith(name) && value.length <= name.length + 30 && !ADDRESS_LIKE.test(value))
      .sort((a, b) => b.length - a.length)[0]
    return longer ?? name
  }

  const venueChecked = check('venue', r.venue_evidence)
  const venue = placeParts('공통 장소', cleanText(r.venue_place_name), cleanText(r.venue_address), venueChecked)
  const venueOnline = r.venue_online === true && venueChecked.text !== null && ONLINE_WORDS.test(venueChecked.text)
  if (r.venue_online === true && !venueOnline) warn('공통 장소: 온라인 진행 근거가 없어 오프라인으로 두었습니다')
  if (venue || venueOnline) evidence.push(...venueChecked.entries)

  // ---- 회차 ----
  const drafts: SessionDraft[] = []
  for (const [index, session] of (Array.isArray(r.sessions) ? r.sessions : []).entries()) {
    const label = `회차 ${typeof session?.date === 'string' ? session.date : index + 1}`
    const dateChecked = check('date', session?.date_evidence)
    if (dateChecked.text && APPLICATION_LINE.test(dateChecked.text) && !SCHEDULE_LINE.test(dateChecked.text)) {
      warn(`${label}: 신청 일정 문구를 회차 날짜 근거로 써서 뺐습니다 ('${dateChecked.text.split('\n')[0]}')`)
      continue
    }
    const hint = WEEKDAYS.includes(session?.weekday_stated as Weekday) ? session.weekday_stated : null
    const date = checkedDate(label, session?.date, dateChecked.text, hint)
    if (!date) {
      if (session?.date == null) warn(`${label}: 날짜가 없는 회차를 뺐습니다`)
      continue
    }
    const draft: SessionDraft = {
      date, start_time: null, end_time: null, place_name: null, address: null, online: false,
      evidence: [{ suffix: 'date', entries: dateChecked.entries }],
    }

    const start = toTime(session.start_time)
    const end = toTime(session.end_time)
    if ((session.start_time && !start) || (session.end_time && !end)) warn(`${label}: 시각 형식이 올바르지 않아 비웠습니다`)
    if (start || end) {
      const timeChecked = check('time', session.time_evidence)
      const text = timeChecked.text
      if (!text) warn(`${label}: 시각의 근거를 원문에서 찾지 못해 비웠습니다 (값: ${start ?? '?'}~${end ?? '?'})`)
      else if (APPLICATION_LINE.test(text) && !SCHEDULE_LINE.test(text)) warn(`${label}: 신청 일정의 시각을 회차 시각으로 써서 비웠습니다 ('${text.split('\n')[0]}')`)
      else if ((start && !supportsTime(start, text)) || (end && !supportsTime(end, text))) warn(`${label}: 시각이 근거 인용과 맞지 않아 비웠습니다 (값: ${start ?? '?'}~${end ?? '?'}, 인용: '${text.split('\n')[0]}')`)
      else if (start && end && start >= end) warn(`${label}: 시작 시각이 종료 시각보다 늦어 비웠습니다 (${start}~${end})`)
      else {
        Object.assign(draft, { start_time: start, end_time: end })
        draft.evidence.push({ suffix: 'time', entries: timeChecked.entries })
      }
    }

    const placeChecked = check('place', session.place_evidence)
    const place = placeParts(`${label} 장소`, cleanText(session.place_name), cleanText(session.address), placeChecked)
    if (place) {
      Object.assign(draft, place)
      draft.evidence.push({ suffix: 'place', entries: placeChecked.entries })
    } else if (venue) {
      Object.assign(draft, venue)
    }
    draft.online = (session.online === true && ONLINE_WORDS.test(`${placeChecked.text ?? ''}\n${dateChecked.text}`)) || (!place && venueOnline)
    if (session.online === true && !draft.online) warn(`${label}: 온라인 진행 근거가 없어 오프라인으로 두었습니다`)
    drafts.push(draft)
  }

  // ---- 운영 기간·회차 수 ----
  const periodChecked = check('period', r.period_evidence)
  const periodText = periodChecked.text && APPLICATION_LINE.test(periodChecked.text) && !SCHEDULE_LINE.test(periodChecked.text) ? null : periodChecked.text
  if (periodChecked.text && !periodText) warn(`운영 기간: 신청 일정 문구를 근거로 써서 비웠습니다 ('${periodChecked.text.split('\n')[0]}')`)
  let periodStart = checkedDate('운영 기간 시작일', r.period_start, periodText)
  let periodEnd = checkedDate('운영 기간 종료일', r.period_end, periodText)
  if (periodStart && periodEnd && periodStart > periodEnd) {
    warn(`운영 기간: 시작일이 종료일보다 늦어 비웠습니다 (${periodStart}~${periodEnd})`)
    periodStart = periodEnd = null
  }
  if (periodStart || periodEnd) evidence.push(...periodChecked.entries)

  let sessionCount = toInt(r.session_count)
  if (sessionCount !== null && sessionCount < 1) sessionCount = null
  if (sessionCount !== null) {
    const count = sessionCount
    if (!accept('총 회차 수', count, check('session_count', r.session_count_evidence), (text) => supportsNumber(count, text))) sessionCount = null
  }

  // 하루짜리 운영 기간은 그 자체가 회차 날짜다
  if (!drafts.length && periodStart && periodStart === periodEnd && (sessionCount === null || sessionCount === 1)) {
    drafts.push({
      date: periodStart, start_time: null, end_time: null, place_name: venue?.place_name ?? null, address: venue?.address ?? null,
      online: venueOnline, evidence: [{ suffix: 'date', entries: periodChecked.entries }],
    })
  }

  // 회차도 기간도 없이 대략의 일정만 밝힌 원문 표현 ('11월 중 운영 예정'). 원문에 그대로 있을 때만 남긴다
  let scheduleNote = cleanText(r.schedule_note)?.replace(LEADING_MARKS, '').replace(/^(?:일\s*정|일\s*시|운영\s*기간)\s*[:：]\s*/, '').trim() || null
  if (scheduleNote && (drafts.length || periodStart || periodEnd)) scheduleNote = null
  else if (scheduleNote && !quoteInSource(scheduleNote, sourceText)) {
    warn(`대략의 일정: 원문에 그대로 없는 표현을 뺐습니다 (값: '${scheduleNote}')`)
    scheduleNote = null
  }
  if (scheduleNote) evidence.push({ field: 'schedule_note', quote: scheduleNote, verified: true })

  const seen = new Set<string>()
  const sorted = drafts
    .filter((draft) => {
      const key = [draft.date, draft.start_time, draft.end_time, draft.place_name, draft.address].join('|')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99'))

  const outside = new Set<string>()
  const sessions: ProgramSession[] = sorted.map((draft, index) => {
    const id = `${programId}-s${index + 1}`
    for (const item of draft.evidence) evidence.push(...item.entries.map((entry) => ({ ...entry, field: `sessions[${id}].${item.suffix}` })))
    const lookup = dongFromAddress(draft.address ?? draft.place_name)
    if (lookup.outside_osan) outside.add(draft.address ?? draft.place_name ?? '')
    return {
      id, date: draft.date, start_time: draft.start_time, end_time: draft.end_time,
      place_name: draft.place_name, dong: lookup.dong, online: draft.online, address: draft.address,
    }
  })
  if (!sessions.length && venue && dongFromAddress(venue.address ?? venue.place_name).outside_osan) outside.add(venue.address ?? venue.place_name ?? '')
  for (const place of outside) {
    warn(`장소가 오산시 밖입니다: ${place}`)
    qualityItems.push(`오산시 밖 장소(${place})`)
  }

  if (sessionCount !== null && sessions.length && sessionCount !== sessions.length) {
    if (sessionCount > sessions.length) {
      warn(`원문은 총 ${sessionCount}회인데 날짜가 확인된 회차는 ${sessions.length}개입니다`)
      qualityItems.push(`나머지 회차 일정 (총 ${sessionCount}회 중 ${sessions.length}회만 날짜 확인)`)
    } else {
      warn(`원문은 총 ${sessionCount}회인데 회차가 ${sessions.length}개 추출되었습니다`)
      qualityItems.push(`전체 회차 수 (원문 총 ${sessionCount}회, 일정 ${sessions.length}개)`)
    }
  }
  const lastSession = sessions[sessions.length - 1]
  if (sessions.length && ((periodStart && sessions[0].date! < periodStart) || (periodEnd && lastSession.date! > periodEnd))) {
    warn(`회차 날짜가 운영 기간(${periodStart ?? '?'}~${periodEnd ?? '?'}) 밖에 있습니다`)
    qualityItems.push('회차 날짜와 운영 기간')
  }

  // 회차가 하나뿐이면 그 회차에 참석하는 것이므로 근거 없이 all_sessions. 그 밖에는 원문이 참석 방식을 밝혀야 한다
  const singleSession = sessions.length === 1 && (sessionCount === null || sessionCount === 1)
  const attendanceChecked = check('attendance_rule', r.attendance_evidence)
  let attendanceRule: AttendanceRule = oneOf(r.attendance_rule, ATTENDANCE_RULES, 'unknown')
  if (attendanceRule !== 'unknown' && !(singleSession && attendanceRule === 'all_sessions')) {
    const [rule, name] = [attendanceRule, title]
    if (!accept('참석 방식', rule, attendanceChecked, (text) => supportsAttendance(rule, text, name))) attendanceRule = 'unknown'
  } else if (attendanceRule !== 'unknown') {
    evidence.push(...attendanceChecked.entries.filter((entry) => entry.verified))
  }
  if (attendanceRule === 'unknown' && singleSession) attendanceRule = 'all_sessions'

  let midJoin = typeof r.mid_join_allowed === 'boolean' ? r.mid_join_allowed : null
  if (midJoin !== null && !accept('중도 참여', midJoin, check('mid_join_allowed', r.mid_join_evidence))) midJoin = null

  // ---- 비용·정원 ----
  // 인용이 '무료'뿐이어도 그 인용이 있는 원문 줄('■ 참가비: 무료')로 비용을 가리키는 말인지 확인한다
  const sourceLinesOf = (quote: string) => {
    const parts = quote.split('\n').map((part) => normalizeForMatch(part)).filter(Boolean)
    return sourceText.split('\n').filter((line) => parts.some((part) => normalizeForMatch(line).includes(part))).join('\n')
  }
  let costKrw = toInt(r.cost_krw)
  let costRaw = cleanText(r.cost_raw)
  if (costKrw !== null && costKrw < 0) costKrw = null
  if (costKrw !== null || costRaw) {
    let checked = check('cost', r.cost_evidence)
    const krw = costKrw
    // '무료'처럼 항목 이름 없이 값만 인용했으면 그 원문 줄을 근거로 남긴다 (검수 승인도 같은 근거로 대조한다)
    if (krw !== null && checked.text && !supportsCost(krw, checked.text)) {
      const lines = sourceLinesOf(checked.text)
      if (lines && supportsCost(krw, lines)) {
        checked = { entries: lines.split('\n').map((line) => ({ field: 'cost', quote: line.trim(), verified: true })), text: lines }
      }
    }
    if (!accept('비용', costRaw ?? krw, checked, (text) => krw === null || supportsCost(krw, text))) {
      costKrw = null
      costRaw = null
    } else if (costRaw && !quoteInSource(costRaw, sourceText)) {
      costRaw = checked.text!.split('\n')[0]
    }
  }

  let capacity = toInt(r.capacity)
  if (capacity !== null && capacity < 1) capacity = null
  if (capacity !== null) {
    const count = capacity
    if (!accept('정원', count, check('capacity', r.capacity_evidence), (text) => supportsNumber(count, text))) capacity = null
  }

  // ---- 신청 기간·방법 ----
  const applicationChecked = check('application_period', r.application_period_evidence)
  const applicationDateTime = (label: string, value: unknown): string | null => {
    if (value === null || value === undefined) return null
    const match = typeof value === 'string' ? value.trim().match(/^(\d{4}-\d{1,2}-\d{1,2})(?:[T ](\d{1,2}:\d{2})(?::\d{2})?)?$/) : null
    if (!match) {
      warn(`${label}: 날짜 형식이 올바르지 않아 비웠습니다 (값: ${show(value)})`)
      return null
    }
    const date = checkedDate(label, match[1], applicationChecked.text)
    if (!date || !match[2]) return date
    const time = toTime(match[2])
    if (!time || !supportsTime(time, applicationChecked.text!)) {
      warn(`${label}: 시각이 근거 인용과 맞지 않아 날짜만 남겼습니다 (값: ${show(value)})`)
      return date
    }
    return `${date}T${time}`
  }
  let applicationStart = applicationDateTime('신청 시작', r.application_start)
  let applicationEnd = applicationDateTime('신청 마감', r.application_end)
  if (applicationStart && applicationEnd && applicationStart.slice(0, 10) > applicationEnd.slice(0, 10)) {
    warn(`신청 기간: 시작이 마감보다 늦어 비웠습니다 (${applicationStart}~${applicationEnd})`)
    applicationStart = applicationEnd = null
  }
  if (applicationStart || applicationEnd) evidence.push(...applicationChecked.entries)

  // 신청 마감이 운영이 끝난 뒤로 적힌 원문은 모델이 적지 않아도 늘 묻는다
  const operationEnd = periodEnd ?? (sessions.length && (sessionCount === null || sessionCount <= sessions.length) ? lastSession.date : null)
  const applicationLastDay = lastApplicationDay(applicationEnd)
  const lateApplication = !!operationEnd && !!applicationLastDay && applicationLastDay > operationEnd
  if (lateApplication) qualityItems.push(`신청 마감(${koreanDate(applicationLastDay!)})이 운영 종료일(${koreanDate(operationEnd!)})보다 늦은 점`)

  const applicationMethods: ApplicationMethod[] = []
  const methodKeys = new Set<string>()
  for (const [index, method] of (Array.isArray(r.application_methods) ? r.application_methods : []).entries()) {
    const type = oneOf(method?.type, METHOD_TYPES, 'online')
    if (method?.type !== type) {
      warn(`신청 방법 ${index + 1}: 종류가 올바르지 않아 뺐습니다 (값: ${show(method?.type)})`)
      continue
    }
    let checked = check(`application_methods.${type}`, method.evidence)
    const url = cleanText(method.url)
    const phone = cleanText(method.phone)
    const address = cleanText(method.address)
    const label = `신청 방법(${type})`
    const result: ApplicationMethod = { type, label: cleanText(method.label) ?? (type === 'online' ? '온라인 신청' : type === 'phone' ? '전화 문의' : '방문 신청') }
    if (url) {
      if (/^https?:\/\/\S+$/i.test(url) && sourceText.includes(url)) result.url = url
      else warn(`${label}: 원문에 없는 URL을 뺐습니다 (값: '${url}')`)
    }
    if (phone) {
      if (/^[0-9()+\-.\s]{7,20}$/.test(phone) && checked.text && supportsPhone(phone, checked.text)) result.phone = phone
      else warn(`${label}: 근거와 맞지 않는 전화번호를 뺐습니다 (값: '${phone}')`)
    }
    if (address) {
      if (quoteInSource(address, sourceText)) result.address = address
      else warn(`${label}: 원문에 그대로 없는 주소를 뺐습니다 (값: '${address}')`)
    }
    if (type === 'phone' && !result.phone) continue
    // 문의 전화를 신청 방법으로 올리지 않는다: 원문 인용이 전화 신청을 밝혀야 '신청'이라고 부른다
    if (type === 'phone' && /신청|접수|예약|등록/.test(result.label) && !(checked.text && supportsApplication(checked.text))) {
      warn(`${label}: 원문이 전화 신청을 밝히지 않아 '전화 문의'로 두었습니다 (값: '${result.label}')`)
      result.label = '전화 문의'
    }
    // 원문에 그대로 있는 URL은 그 자체가 근거다
    if (!checked.text && result.url) checked = { entries: [{ field: checked.entries[0]?.field ?? `application_methods.${type}`, quote: result.url, verified: true }], text: result.url }
    if (!accept(label, result.label, checked)) continue
    // '온라인 신청'처럼 어디서 신청하는지 빠진 이름은 원문 인용의 표현으로 바꾼다 ('■ 신청 방법: 오산시가족센터 홈페이지 프로그램 신청')
    if (type === 'online' && GENERIC_ONLINE_LABEL.test(result.label) && checked.text) {
      const stated = checked.text.split('\n')
        .map((quote) => quote.replace(LEADING_MARKS, '').replace(/^(?:신청|접수)\s*(?:방법|처)\s*[:：]\s*/, '').trim())
        .find((quote) => quote.length >= 4 && quote.length <= 40 && !GENERIC_ONLINE_LABEL.test(quote) && !/https?:\/\/|www\./i.test(quote))
      if (stated) result.label = stated
    }
    const key = [type, result.url, result.phone, result.address].join('|')
    if (methodKeys.has(key)) continue
    methodKeys.add(key)
    applicationMethods.push(result)
  }

  // 신청 기간 없이 신청을 대략만 밝힌 원문 표현 ('일정 확정 후 별도 안내'). 원문에 그대로 있을 때만 남긴다
  let applicationNote = cleanText(r.application_note)?.replace(LEADING_MARKS, '').replace(/^(?:신\s*청|접\s*수|모\s*집)(?:\s*(?:방법|기간|안내))?\s*[:：]\s*/, '').trim() || null
  if (applicationNote && (applicationStart || applicationEnd)) applicationNote = null
  else if (applicationNote && (applicationNote.length > 80 || !quoteInSource(applicationNote, sourceText))) {
    warn(`신청 안내: 원문에 그대로 없는 표현을 뺐습니다 (값: '${applicationNote}')`)
    applicationNote = null
  }
  if (applicationNote) evidence.push({ field: 'application_note', quote: applicationNote, verified: true })

  // ---- 소개·안내·확인 사항 ----
  const description = cleanText(r.description) ?? ''
  // 보호자에게 알리는 안내 문장: 원문에 글자 그대로 있는 것만 (머리 기호는 뗀다)
  const notices: string[] = []
  for (const item of stringList(r.notices)) {
    const notice = item.replace(LEADING_MARKS, '').trim()
    if (!notice || notice.length > 120 || notices.includes(notice) || notices.length >= 4) continue
    if (!quoteInSource(notice, sourceText)) {
      warn(`안내 문장: 원문에 그대로 없어 뺐습니다 (값: '${notice}')`)
      continue
    }
    // '내용:', '일시:'처럼 다른 항목이 다루는 줄은 안내 문장이 아니다
    const line = sourceText.split('\n').find((text) => normalizeForMatch(text).includes(normalizeForMatch(notice))) ?? notice
    if (FIELD_LINE.test(notice) || FIELD_LINE.test(line.replace(LEADING_MARKS, ''))) {
      warn(`안내 문장: 다른 항목의 원문 줄이라 뺐습니다 (값: '${notice}')`)
      continue
    }
    notices.push(notice)
    evidence.push({ field: 'notices', quote: notice, verified: true })
  }
  const sourceNumbers = new Set(numbersIn(sourceText))
  const strayNumbers = unique(numbersIn(description).filter((value) => !sourceNumbers.has(value) && !(value >= 2000 && value < 2100)))
  if (strayNumbers.length) warn(`소개 문장에 원문에 없는 숫자가 있습니다: ${strayNumbers.join(', ')}`)

  if (inferredYears.length) {
    const years = unique(inferredYears.map((item) => item.slice(-10, -6)))
    warn(`원문 날짜에 연도가 없어 ${years.join('·')}년으로 추정했습니다 (원문 확인일 ${context.source.retrieved_at ?? '미상'} 기준): ${inferredYears.join(', ')}`)
  }

  const forChildren = audience === 'child' || audience === 'parent_child' || audience === 'unknown'
  const standardItems: string[] = []
  if (!sessions.length) standardItems.push('운영 날짜·시간')
  else if (sessions.some((session) => !session.start_time || !session.end_time)) standardItems.push('운영 시간')
  if (costKrw === null) standardItems.push('참가비')
  // '누구나'로 확인된 공고는 학년·나이 제한이 없다는 뜻이라 묻지 않는다
  if (forChildren && !gradeRange && !ageRange && targetType !== 'all') standardItems.push('대상 학년·나이')
  if (eligibility === null || (targetType === 'unknown' && !eligibility.length)) standardItems.push('참여 대상·자격')
  if (forChildren) {
    const [guardianUnknown, siblingUnknown] = [guardianCompanion === 'unknown', siblingCompanion === 'unknown']
    if (guardianUnknown && siblingUnknown) standardItems.push('보호자·형제자매 동반 가능 여부')
    else if (guardianUnknown) standardItems.push('보호자 동반 가능 여부')
    else if (siblingUnknown) standardItems.push('형제자매 동반 가능 여부')
  }
  if (!applicationStart && !applicationEnd) standardItems.push('신청 기간')
  else if (!applicationStart) standardItems.push('신청 시작일')
  else if (!applicationEnd) standardItems.push('신청 마감일')
  if (!applicationMethods.length) standardItems.push('신청 방법')
  // 모델이 적은 항목 중 이미 표준 항목이 다루는 주제는 뺀다
  const covered = standardItems.map((item) => STANDARD_TOPICS[item]).filter(Boolean)
  if (lateApplication) covered.push(/(?:신청|접수).*(?:늦|이후|뒤)|(?:늦|이후|뒤).*(?:신청|접수)/)
  // 신청 마감이 첫 회차 뒤면 시작 후에도 받는다는 뜻이다 (중도 참여는 판정이 따로 묻는다)
  const firstDate = sessions.find((session) => session.date)?.date
  if (firstDate && applicationLastDay && applicationLastDay > firstDate) covered.push(/(?:시작|개강|첫\s*회).*(?:후|뒤|이후).*(?:접수|신청)/)
  const modelItems = stringList(r.uncertain_items)
    .filter((item) => item.length <= 80 && !covered.some((topic) => topic.test(item)))
    .slice(0, 8)
  const uncertainItems = unique([...qualityItems, ...standardItems, ...modelItems])

  const evidenceKeys = new Set<string>()
  const uniqueEvidence = evidence.filter((entry) => {
    const key = `${entry.field}\u0000${entry.quote}`
    if (evidenceKeys.has(key)) return false
    evidenceKeys.add(key)
    return true
  })

  return {
    program_id: programId,
    title,
    institution,
    category,
    audience,
    target_type: targetType,
    target_raw: targetRaw,
    description,
    grade_range: gradeRange,
    age_range: ageRange,
    eligibility_requirements: eligibility,
    guardian_companion: guardianCompanion,
    sibling_companion: siblingCompanion,
    korean_level_required: koreanLevel,
    support_languages: supportLanguages,
    application_languages: applicationLanguages,
    sessions,
    venue: venue || venueOnline
      ? { place_name: venue?.place_name ?? null, address: venue?.address ?? null, dong: venue ? dongFromAddress(venue.address ?? venue.place_name).dong : null, online: venueOnline }
      : null,
    schedule_note: scheduleNote,
    period_start: periodStart,
    period_end: periodEnd,
    session_count: sessionCount,
    attendance_rule: attendanceRule,
    mid_join_allowed: midJoin,
    cost_krw: costKrw,
    cost_raw: costRaw,
    capacity,
    application_start: applicationStart,
    application_end: applicationEnd,
    application_methods: applicationMethods,
    application_note: applicationNote,
    uncertain_items: uncertainItems,
    notices,
    evidence: uniqueEvidence,
    summaries_by_language: {},
    source: {
      url: context.source.url,
      retrieved_at: context.source.retrieved_at,
      files: context.files,
      content_hash: contentHash(sourceText),
    },
    extracted_at: context.now.toISOString(),
    model: context.model,
    warnings,
    review: { status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null },
  }
}

export function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** 연도 없는 날짜가 원문 요일과 맞지 않을 때, 원문 확인일 전후 해에서 요일이 맞는 해를 찾는다 */
function yearMatchingWeekday(date: string, weekday: Weekday, retrievedYear: number | null): string | null {
  const base = retrievedYear ?? Number(date.slice(0, 4))
  for (const year of [base, base + 1, base - 1]) {
    const candidate = toDate(`${year}${date.slice(4)}`)
    if (candidate && weekdayOf(candidate) === weekday) return candidate
  }
  return null
}
