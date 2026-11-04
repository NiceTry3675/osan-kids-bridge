/** 화면 언어에 맞춘 표기: 날짜·회차·장소·비용·신청 상태·언어 이름 */
import { translate } from '../i18n'
import type { MessageKey } from '../i18n'
import type { Interest, Locale, Program, ProgramSession, UncertainItem, Weekday } from '../data/types'

const WEEKDAY_BY_INDEX: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_KEY: Record<Weekday, MessageKey> = { mon: 'dayMon', tue: 'dayTue', wed: 'dayWed', thu: 'dayThu', fri: 'dayFri', sat: 'daySat', sun: 'daySun' }
const INTEREST_KEY: Record<Interest, MessageKey> = { experience_culture: 'interestExperience', korean_study: 'interestKorean', sports_arts: 'interestSports', career: 'interestCareer' }
const TOPIC_KEY: Record<UncertainItem['topic'], MessageKey> = {
  family_eligibility: 'topicFamily', companion: 'topicCompanion', guardian: 'topicGuardian', sibling: 'topicSibling', korean_level: 'topicKoreanLevel', schedule: 'topicSchedule',
  age_grade: 'topicAgeGrade', materials: 'topicMaterials', other: 'topicOther',
}
const LANGUAGE_KEY: Record<string, MessageKey> = { ko: 'lang_ko', vi: 'lang_vi', zh: 'lang_zh', en: 'lang_en' }
const NUMBER_LOCALE: Record<Locale, string> = { 'ko-easy': 'ko-KR', vi: 'vi-VN', zh: 'zh-CN' }

export const weekdayLabel = (locale: Locale, day: Weekday) => translate(locale, DAY_KEY[day])
export const interestLabel = (locale: Locale, interest: Interest) => translate(locale, INTEREST_KEY[interest])
export const topicLabel = (locale: Locale, topic: UncertainItem['topic']) => translate(locale, TOPIC_KEY[topic])

/** 기관 자료의 언어 코드('ko', 'vi' …)를 화면 언어 이름으로. 모르는 코드는 그대로 둡니다. */
export const languageName = (locale: Locale, code: string) => (LANGUAGE_KEY[code] ? translate(locale, LANGUAGE_KEY[code]) : code)

/** 지금 화면 언어의 이름(예: ‘베트남어’) */
export const screenLanguageName = (locale: Locale) => (locale === 'ko-easy' ? '쉬운 한국어' : languageName(locale, locale))

export function weekdayOfDate(date: string): Weekday {
  const [year, month, day] = date.split('-').map(Number)
  return WEEKDAY_BY_INDEX[(new Date(year, month - 1, day).getDay() + 6) % 7]
}

export function formatDate(date: string, locale: Locale): string {
  const [, month, day] = date.split('-').map(Number)
  return translate(locale, 'dateFormat', { month, day, weekday: weekdayLabel(locale, weekdayOfDate(date)) })
}

export function formatSessionWhen(session: ProgramSession | null, locale: Locale): string {
  if (!session?.date) return translate(locale, 'scheduleUnknown')
  const time = session.start_time && session.end_time ? `${session.start_time}~${session.end_time}` : translate(locale, 'timeUnknown')
  return `${formatDate(session.date, locale)} ${time}`
}

export function formatSessionPlace(session: ProgramSession | null, locale: Locale): string {
  if (!session) return translate(locale, 'placeUnknown')
  if (session.online) return translate(locale, 'placeOnline')
  return session.place_name ? placeName(session.place_name) : translate(locale, 'placeUnknown')
}

/**
 * 회차별 날짜가 없을 때 공고가 밝힌 일정: 운영 기간과 총 횟수, 없으면 null.
 * 공고에 적힌 것을 ‘일정 확인 필요’로만 뭉개지 않으려는 것입니다.
 */
export function periodText(program: Pick<Program, 'period_start' | 'period_end' | 'session_count'>, locale: Locale): string | null {
  const { period_start: start, period_end: end, session_count: count } = program
  const range = start && end
    ? start === end ? formatDate(start, locale) : `${formatDate(start, locale)} ~ ${formatDate(end, locale)}`
    : start ? formatDate(start, locale) : end ? formatDate(end, locale) : null
  if (!range) return null
  return count ? `${range} · ${translate(locale, 'sessionTotal', { count })}` : range
}

/** 공고가 ‘2층 가족센터’처럼 층을 앞에 적어도 ‘가족센터 2층’으로 읽히게 합니다. 여러 곳을 함께 적은 이름은 그대로 둡니다. */
export function placeName(name: string): string {
  const match = name.trim().replace(/\s+내$/, '').match(/^(\d+층)\s+(.+)$/)
  return match && !/(?:및|외)/.test(match[2]) ? `${match[2]} ${match[1]}` : name
}

/** 주소로 지도를 여는 주소. 프로그램 장소만 보내고 보호자 정보는 보내지 않습니다. */
export const mapUrl = (address: string) => `https://map.naver.com/p/search/${encodeURIComponent(address.replace(/\s*\([^)]*\)\s*$/, ''))}`

/** 학년 숫자(초등 1~6, 중학교 7~9, 고등학교 10~12)를 화면 언어로 */
export function gradeLabel(locale: Locale, grade: number): string {
  if (grade <= 6) return translate(locale, 'gradeChip', { grade })
  if (grade <= 9) return translate(locale, 'gradeChipMiddle', { grade: grade - 6 })
  return translate(locale, 'gradeChipHigh', { grade: grade - 9 })
}

/** 장소 칸이 기관이 적은 한국어 장소 이름이면 'ko'. ‘온라인’·‘장소 확인 필요’는 화면 언어라 붙이지 않습니다. */
export const placeLang = (session: ProgramSession | null): 'ko' | undefined =>
  session && !session.online && session.place_name ? 'ko' : undefined

export function formatCost(program: Pick<Program, 'cost_krw'>, locale: Locale): string {
  if (program.cost_krw === null) return translate(locale, 'costUnknown')
  if (program.cost_krw === 0) return translate(locale, 'free')
  return translate(locale, 'won', { amount: program.cost_krw.toLocaleString(NUMBER_LOCALE[locale]) })
}

export function formatStatus(program: Pick<Program, 'application_status' | 'application_start'>, locale: Locale): string {
  switch (program.application_status) {
    case 'open': return translate(locale, 'statusOpen')
    case 'upcoming': return program.application_start
      ? translate(locale, 'statusUpcoming', { date: formatDate(program.application_start, locale) })
      : translate(locale, 'statusUpcomingNoDate')
    case 'closed': return translate(locale, 'statusClosed')
    case 'unknown': return translate(locale, 'statusUnknown')
  }
}

/**
 * 목록의 신청 표시: 신청 중이면 언제까지인지가 가장 궁금하므로 마감일을 적습니다.
 * 신청 기간을 믿기 어려운 공고는 날짜를 단정하지 않습니다.
 */
export function formatListStatus(program: Pick<Program, 'application_status' | 'application_start' | 'application_end' | 'application_issue' | 'as_of'>, locale: Locale): string {
  if (program.application_status !== 'open' || !program.application_end || program.application_issue) return formatStatus(program, locale)
  return program.application_end === program.as_of
    ? translate(locale, 'statusToday')
    : translate(locale, 'statusUntil', { date: formatDate(program.application_end, locale) })
}

export function isSafeUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}
