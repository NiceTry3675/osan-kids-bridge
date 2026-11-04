/** 공고 내용을 화면에 고르는 규칙: 어느 언어 글을 쓸지, 무엇을 기관에 확인해야 하는지 */
import type { Interest, Locale, Program, ProgramSession, ReviewedSummary, SearchFilters, UncertainItem, Weekday } from '../data/types'
import { weekdayOfDate } from './format'

const CIRCLE = 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17Z'

/**
 * 분야별 그림과 바탕색. 그림은 장식이고 뜻은 늘 글자로도 적습니다.
 * icon은 첫 화면·홈의 선 아이콘과 같은 그림체(24 격자, 선)로 그린 경로이고, emoji는 예전 그림입니다.
 */
export const INTEREST_VISUAL: Record<Interest, { emoji: string; tone: string; icon: string[] }> = {
  // 팔레트
  experience_culture: { emoji: '🎨', tone: 'peach', icon: [
    'M12 3.5c-4.8 0-8.5 3.6-8.5 8.3 0 4.8 3.8 8.7 8.4 8.7 1.3 0 2-.8 2-1.8 0-.6-.3-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8h2.1c2.2 0 3.8-1.7 3.8-3.9 0-3.9-3.8-6.8-8.5-6.8Z',
    'M7.6 11a.9.9 0 1 0 0 1.8.9.9 0 1 0 0-1.8ZM9.7 7a.9.9 0 1 0 0 1.8.9.9 0 1 0 0-1.8ZM14.2 6.6a.9.9 0 1 0 0 1.8.9.9 0 1 0 0-1.8Z',
  ] },
  // 펼친 책
  korean_study: { emoji: '📖', tone: 'sky', icon: [
    'M3.5 6c2.8-.8 5.7-.5 8.5 1.4 2.8-1.9 5.7-2.2 8.5-1.4v12.5c-2.8-.8-5.7-.5-8.5 1.4-2.8-1.9-5.7-2.2-8.5-1.4Z',
    'M12 7.4v12.5',
  ] },
  // 공
  sports_arts: { emoji: '⚽', tone: 'leaf', icon: [
    CIRCLE,
    'M12 3.5v17M3.5 12h17M6 6c1.8 1.6 2.8 3.7 2.8 6S7.8 16.4 6 18M18 6c-1.8 1.6-2.8 3.7-2.8 6s1 4.4 2.8 6',
  ] },
  // 나침반
  career: { emoji: '🧭', tone: 'lilac', icon: [
    CIRCLE,
    'm15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1Z',
  ] },
}

export interface ProgramText {
  title: string
  institution: string
  target: string
  description: string
  /** 선택한 언어의 검수본을 쓰는지 */
  reviewed: boolean
  /** 선택한 언어가 한국어가 아닌데 검수본이 없어 한국어 원문을 보여 주는지(명세 5.4) */
  missingTranslation: boolean
  /** 원문을 보여 줄 때 붙일 lang 속성 */
  lang: 'ko' | undefined
  summary: ReviewedSummary | null
}

/** 검수본이 있으면 그 언어의 글을, 없으면 한국어 원문을 돌려줍니다. */
export function programText(program: Program, locale: Locale): ProgramText {
  const summary = program.summaries_by_language[locale] ?? null
  if (summary) return { ...summary, reviewed: summary.status !== 'machine_checked', missingTranslation: false, lang: undefined, summary }
  return {
    title: program.title,
    institution: program.institution,
    target: program.target_raw,
    description: program.description,
    reviewed: false,
    missingTranslation: locale !== 'ko-easy',
    lang: 'ko',
    summary: null,
  }
}

/** 회차마다 장소가 다르면 대표 회차의 장소를 전체 장소처럼 보이게 하지 않습니다(명세 5.1). */
export function placesDiffer(program: Program): boolean {
  return new Set(program.sessions.map((item) => (item.online ? 'online' : item.place_name ?? '?'))).size > 1
}

/**
 * 동반 항목은 공고로 아직 모르는 쪽만 남깁니다. 보호자 동반이 확인됐으면 형제자매만 묻고, 둘 다 확인됐으면 묻지 않습니다.
 * 동반을 말하지 않는 원문 표현(‘대상: 만 4~7세 자녀와 부모’ 등)은 근거처럼 보이지 않게 뺍니다.
 */
function companionItem(item: UncertainItem, program: Program): UncertainItem[] {
  const guardianKnown = program.guardian_companion != null
  const siblingKnown = program.sibling_companion != null
  if (guardianKnown && siblingKnown) return []
  if (guardianKnown) return [{ topic: 'sibling', note_ko: null }]
  if (siblingKnown) return [{ topic: 'guardian', note_ko: null }]
  return [{ ...item, note_ko: item.note_ko && /동반|함께|같이/.test(item.note_ko) ? item.note_ko : null }]
}

/** 가족 배경을 말하는 원문만 근거로 붙입니다. ‘8~12세 어린이’는 우리 가족이 참여할 수 있는지에 답하지 않습니다. */
const familyItem = (item: UncertainItem): UncertainItem =>
  (item.note_ko && !/다문화|중도\s*입국|결혼\s*이민|이주\s*배경|외국인|거주|시민/.test(item.note_ko) ? { ...item, note_ko: null } : item)

/**
 * 기관에 확인할 항목: 공고의 미확인 항목 + 판정이 unknown인 나이·학년·시간.
 * 기관이 덧붙인 안내가 이미 답한 주제(covers)는 빼서, 같은 화면의 초록 안내 카드와 어긋나지 않게 합니다.
 */
export function itemsToCheck(program: Program): UncertainItem[] {
  const covered = coveredTopics(program)
  const items = program.uncertain_items
    .filter((item) => !covered.has(item.topic))
    .flatMap((item) => (item.topic === 'companion' ? companionItem(item, program) : item.topic === 'family_eligibility' ? [familyItem(item)] : [item]))
  const has = (topic: UncertainItem['topic']) => items.some((item) => item.topic === topic)
  if (program.time_match_status === 'unknown' && !has('schedule')) items.unshift({ topic: 'schedule', note_ko: null })
  if (program.age_grade_match_status === 'unknown' && !has('age_grade')) items.unshift({ topic: 'age_grade', note_ko: null })
  return items.filter((item) => !covered.has(item.topic))
}

export type Addendum = NonNullable<Program['addenda']>[number]

/** 기관이 덧붙인 안내가 답한 주제들: 확인할 점의 주제와 비용('cost') */
export const coveredTopics = (program: Program): Set<string> =>
  new Set((program.addenda ?? []).flatMap((addendum) => addendum.covers ?? []))

/** 비용에 답한 기관 추가 안내. 여러 개면 가장 나중에 덧붙인 것 */
export const costAddendum = (program: Program): Addendum | null =>
  (program.addenda ?? []).filter((addendum) => addendum.covers?.includes('cost')).at(-1) ?? null

export interface AddendumText {
  /** 보여 줄 문장: 화면 언어로 옮긴 것이 있으면 그것, 없으면 기관이 쓴 한국어 문장 */
  text: string
  /** 한국어 문장을 보여 줄 때 붙일 lang 속성 */
  lang: 'ko' | undefined
  /** AI가 옮긴 문장을 보여 줄 때 함께 둘 한국어 원문. 원문을 그대로 보여 주면 null */
  original: string | null
}

/** 기관 추가 안내 문장을 화면 언어로: 베트남어·중국어 번역이 있으면 그것과 한국어 원문을, 없으면 한국어 문장을 */
export function addendumText(addendum: Addendum, locale: Locale): AddendumText {
  const translated = locale === 'vi' || locale === 'zh' ? addendum.translations?.[locale]?.trim() : undefined
  return translated ? { text: translated, lang: undefined, original: addendum.text } : { text: addendum.text, lang: 'ko', original: null }
}

/** 화면 언어로 상담이 된다고 기관 자료에서 확인됐는지 */
export const consultsIn = (program: Program, locale: Locale): boolean =>
  program.inquiry_methods.some((method) => method.languages?.includes(locale)) || !!program.support_languages?.includes(locale)

/** 지금 신청 행동을 보여 줄 수 있는지(명세 5.2: open이고 확인된 방법이 있을 때만) */
export const canApply = (program: Program): boolean => program.application_status === 'open' && program.application_methods.length > 0

const localToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 지난 회차와 앞으로의 회차(날짜 미상 포함)를 가릅니다. 서버가 판정에 쓴 날짜를 기준으로 합니다. */
export function splitSessions(program: Program): { past: ProgramSession[]; upcoming: ProgramSession[] } {
  const today = program.as_of ?? localToday()
  const past = program.sessions.filter((session) => session.date && session.date < today)
  return { past, upcoming: program.sessions.filter((session) => !past.includes(session)) }
}

/** 시간이 맞는지 모르는 이유. 공고마다 달라서 한 문구로 뭉뚱그리지 않습니다. */
export function timeUnknownReason(program: Program): 'timeWhyAttendance' | 'timeWhyMissing' | 'timeWhyMidJoin' | null {
  if (program.time_match_status !== 'unknown') return null
  if (!program.sessions.some((session) => session.date && session.start_time && session.end_time)) return 'timeWhyMissing'
  if (program.attendance_rule === 'unknown') return 'timeWhyAttendance'
  return program.attendance_rule === 'all_sessions' && splitSessions(program).past.length > 0 ? 'timeWhyMidJoin' : 'timeWhyMissing'
}

const DAY_BY_KOREAN: Record<string, Weekday> = { 월: 'mon', 화: 'tue', 수: 'wed', 목: 'thu', 금: 'fri', 토: 'sat', 일: 'sun' }

/** 공고 글에 적힌 반 이름과 요일 (‘A반(월요일)’). 적혀 있을 때만 쓰고 지어내지 않습니다. */
export function classNames(program: Program): { name: string; day: Weekday }[] {
  const text = [program.description, program.summaries_by_language['ko-easy']?.description].filter(Boolean).join(' ')
  const found = new Map<Weekday, string>()
  for (const [, name, day] of text.matchAll(/([A-Za-z가-힣]{1,3}반)\s*[(（]\s*([월화수목금토일])요일/g)) found.set(DAY_BY_KOREAN[day], name)
  return [...found].map(([day, name]) => ({ name, day }))
}

export interface SessionGroup {
  key: string
  day: Weekday
  time: string
  sessions: ProgramSession[]
  /** 공고에 적힌 반 이름 */
  className: string | null
  /** 날짜 간격이 모두 7일인지. 쉬는 주가 있는데 ‘매주’라고 하면 헛걸음하게 됩니다. */
  weekly: boolean
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const dayMs = (date: string) => { const [year, month, day] = date.split('-').map(Number); return Date.UTC(year, month - 1, day) }
const isWeekly = (sessions: ProgramSession[]) =>
  sessions.length > 1 && sessions.every((session, index) => index === 0 || dayMs(session.date!) - dayMs(sessions[index - 1].date!) === WEEK_MS)

/**
 * 같은 요일·시간·장소에 되풀이되는 회차를 묶습니다. 묶을 만하지 않으면 null을 돌려줘 날짜를 그대로 보이게 합니다.
 * 장소가 다른 회차를 한 묶음에 넣으면 다른 장소가 화면에서 사라지므로 따로 묶습니다.
 * 공고에 반이 적혀 있으면 ‘반마다 언제’로 묶고, 반이 없으면 회차가 5개 이상이고 묶음마다 평균 3회 이상일 때만 묶습니다.
 * 회차가 적으면 고를 날짜를 바로 보여 주는 편이 낫습니다.
 */
export function groupSessions(program: Program, sessions: ProgramSession[]): SessionGroup[] | null {
  if (sessions.length < 2 || sessions.some((session) => !session.date || !session.start_time || !session.end_time)) return null
  const classes = classNames(program)
  const groups = new Map<string, SessionGroup>()
  for (const session of [...sessions].sort((a, b) => a.date!.localeCompare(b.date!))) {
    const day = weekdayOfDate(session.date!)
    const time = `${session.start_time}~${session.end_time}`
    const key = `${day}-${time}-${session.online ? 'online' : session.place_name ?? ''}`
    const group = groups.get(key) ?? { key, day, time, sessions: [], className: classes.find((item) => item.day === day)?.name ?? null, weekly: false }
    group.sessions.push(session)
    groups.set(key, group)
  }
  const list = [...groups.values()].map((group) => ({ ...group, weekly: isWeekly(group.sessions) }))
  if (classes.length > 1 && list.every((group) => group.className)) return list
  return sessions.length >= 5 && sessions.length / list.length >= 3 ? list : null
}

/** 반이 나뉜 공고의 반별 다음 회차. 다음 일정에 한 반의 날짜만 보이지 않게 합니다. */
export function nextByClass(program: Program): { name: string; session: ProgramSession }[] | null {
  const { upcoming } = splitSessions(program)
  const groups = groupSessions(program, upcoming)
  const named = groups?.filter((group) => group.className) ?? []
  return named.length > 1 ? named.map((group) => ({ name: group.className!, session: group.sessions[0] })) : null
}

/**
 * 고른 관심 분야나 동의 공고인지(‘먼저 볼 공고’로 묶을 때 씁니다).
 * 동은 서버 정렬(inPreferredDong)과 같은 회차만 봅니다: 시간이 맞으면 맞는 회차, 아니면 앞으로의 회차, 회차가 없으면 공통 장소.
 * 지난 회차나 시간이 안 맞는 회차가 그 동에서 열렸다고 먼저 보여 주지 않습니다.
 */
export function isPreferred(program: Program, filters: SearchFilters): boolean {
  if (filters.interests.includes(program.category)) return true
  if (!filters.dong) return false
  if (!program.sessions.length) return program.next_session?.dong === filters.dong
  const relevant = program.time_match_status === 'matched'
    ? program.sessions.filter((session) => program.matched_sessions.includes(session.id))
    : splitSessions(program).upcoming
  return relevant.some((session) => session.dong === filters.dong)
}

const INQUIRY_KO: Partial<Record<UncertainItem['topic'], string>> = {
  family_eligibility: '저희 가족도 참여할 수 있나요?',
  companion: '보호자나 형제자매도 함께 가도 되나요?',
  guardian: '보호자도 함께 가야 하나요?',
  sibling: '형제자매도 함께 가도 되나요?',
  korean_level: '아이가 한국어를 잘 못해도 참여할 수 있나요?',
  schedule: '정확한 일정과 참여 방법을 알려 주세요.',
  age_grade: '참여할 수 있는 아이의 나이와 학년을 알려 주세요.',
  materials: '준비물이나 추가 비용이 있나요?',
}

/**
 * 공고에 답이 없는 내용을 기관에 그대로 보여 줄 수 있는 한국어 문장으로 만듭니다.
 * AI 없이 ‘기관에 확인할 점’에서 만들기 때문에 서버가 없어도 쓸 수 있습니다. 물을 것이 없으면 null.
 */
export function inquiryMessage(program: Program): string | null {
  const questions = [...new Set(inquiryTopics(program).flatMap((topic) => (topic === 'application' ? '신청 마감일이 정확히 언제인가요?' : topic === 'cost' ? '참가비가 있나요? 있다면 얼마인가요?' : INQUIRY_KO[topic] ?? [])))]
  if (!questions.length) return null
  return [`안녕하세요. ‘${program.title}’ 프로그램에 대해 여쭤보고 싶어요.`, ...questions, '감사합니다.'].join('\n')
}

/** 문장에 담긴 주제. 한국어를 못 읽어도 무엇을 묻는지 화면 언어로 알 수 있게 합니다. */
export function inquiryTopics(program: Program): (UncertainItem['topic'] | 'application' | 'cost')[] {
  const topics = [...new Set(itemsToCheck(program).filter((item) => INQUIRY_KO[item.topic]).map((item) => item.topic))]
  return [
    ...(program.application_issue ? ['application' as const] : []),
    ...topics,
    ...(program.cost_krw === null && !costAddendum(program) ? ['cost' as const] : []),
  ]
}

/** 이만큼 넘게 벗어나면 ‘맞지 않을 수 있는 공고’로 접습니다. 중도입국 등으로 나이와 학년이 다른 아이를 위해 여유를 둡니다. */
const BASIS_MARGIN_YEARS = 2

/**
 * 공고의 대상 기준이 넣은 조건과 달라(학년으로 찾았는데 공고는 나이) 판단할 수 없을 때, 차이가 큰지 어림합니다.
 * 판정이 아닙니다: 공고를 빼지 않고(명세 3장) 접어 두기만 합니다. 초등 n학년은 대략 만 n+5~n+6세로 봅니다.
 */
export function isUnlikelyBasis(program: Program, filters: SearchFilters): boolean {
  if (program.age_grade_match_status !== 'unknown') return false
  const gap = (from: number, to: number, otherFrom: number, otherTo: number) => Math.max(otherFrom - to, from - otherTo, 0)
  if (filters.child_grade !== undefined && program.age_range) {
    return gap(filters.child_grade + 5, filters.child_grade + 6, program.age_range[0], program.age_range[1]) > BASIS_MARGIN_YEARS
  }
  if (filters.child_age !== undefined && program.grade_range) {
    return gap(filters.child_age, filters.child_age, program.grade_range[0] + 5, program.grade_range[1] + 6) > BASIS_MARGIN_YEARS
  }
  return false
}

/** 찾은 공고 수: 접어 둔 ‘맞지 않을 수 있는 공고’는 뺍니다. 조건 시트의 버튼과 결과 제목이 같은 숫자를 보여 줍니다. */
export const likelyCount = (data: { results: Program[]; needs_confirmation: Program[] }, filters: SearchFilters): number =>
  [...data.results, ...data.needs_confirmation].filter((program) => !isUnlikelyBasis(program, filters)).length

/** 공고 자체가 아니라 기관의 목록 페이지로 가는 주소인지. 그러면 나가서 공고를 직접 찾아야 합니다. */
export const isListPage = (url: string): boolean => /\/list(?:\.do)?(?:[?#]|$)/.test(url)
