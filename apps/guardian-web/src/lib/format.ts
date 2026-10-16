/** 화면 언어에 맞춘 표기: 날짜·회차·장소·비용·신청 상태·언어 이름 */
import { translate } from '../i18n'
import type { MessageKey } from '../i18n'
import type { Interest, Locale, Program, ProgramSession, UncertainItem, Weekday } from '../data/types'

const WEEKDAY_BY_INDEX: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_KEY: Record<Weekday, MessageKey> = { mon: 'dayMon', tue: 'dayTue', wed: 'dayWed', thu: 'dayThu', fri: 'dayFri', sat: 'daySat', sun: 'daySun' }
const INTEREST_KEY: Record<Interest, MessageKey> = { experience_culture: 'interestExperience', korean_study: 'interestKorean', sports_arts: 'interestSports', career: 'interestCareer' }
const TOPIC_KEY: Record<UncertainItem['topic'], MessageKey> = {
  family_eligibility: 'topicFamily', companion: 'topicCompanion', korean_level: 'topicKoreanLevel', schedule: 'topicSchedule',
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

function weekdayOfDate(date: string): Weekday {
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
  return session.place_name ?? translate(locale, 'placeUnknown')
}

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

export function isSafeUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}
