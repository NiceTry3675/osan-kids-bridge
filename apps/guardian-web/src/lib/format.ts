import { translate } from '../i18n'
import type { MessageKey } from '../i18n'
import type { AvailableWindow, Interest, Locale, Program, ProgramSession, ReviewedSummary, SearchFilters, UncertainItem, Weekday } from '../data/types'

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const INTERESTS: Interest[] = ['experience_culture', 'korean_study', 'sports_arts', 'career']
export const DONGS = ['중앙동', '대원동', '남촌동', '신장동', '세마동', '초평동'] as const

const dayKey: Record<Weekday, MessageKey> = { mon: 'dayMon', tue: 'dayTue', wed: 'dayWed', thu: 'dayThu', fri: 'dayFri', sat: 'daySat', sun: 'daySun' }
const interestKey: Record<Interest, MessageKey> = { experience_culture: 'interestExperience', korean_study: 'interestKorean', sports_arts: 'interestSports', career: 'interestCareer' }
const topicKey: Record<UncertainItem['topic'], MessageKey> = {
  family_eligibility: 'topicFamily', companion: 'topicCompanion', korean_level: 'topicKoreanLevel', schedule: 'topicSchedule', age_grade: 'topicAgeGrade', materials: 'topicMaterials', other: 'topicOther',
}

export const weekdayLabel = (locale: Locale, day: Weekday) => translate(locale, dayKey[day])
export const interestLabel = (locale: Locale, interest: Interest) => translate(locale, interestKey[interest])
export const topicLabel = (locale: Locale, topic: UncertainItem['topic']) => translate(locale, topicKey[topic])

export function weekdayOfDate(date: string): Weekday {
  const [year, month, day] = date.split('-').map(Number)
  return WEEKDAYS[(new Date(year, month - 1, day).getDay() + 6) % 7]
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

export function placesDiffer(program: Program): boolean {
  return new Set(program.sessions.map((item) => (item.online ? 'online' : item.place_name ?? '?'))).size > 1
}

export function formatWindow(window: AvailableWindow, locale: Locale): string {
  const day = 'date' in window ? formatDate(window.date, locale) : translate(locale, 'everyWeekday', { day: weekdayLabel(locale, window.day_of_week) })
  return `${day} ${window.start_time}~${window.end_time}`
}

const numberLocale: Record<Locale, string> = { 'ko-easy': 'ko-KR', vi: 'vi-VN', zh: 'zh-CN' }

export function formatCost(program: Pick<Program, 'cost_krw'>, locale: Locale): string {
  if (program.cost_krw === null) return translate(locale, 'costUnknown')
  if (program.cost_krw === 0) return translate(locale, 'free')
  return translate(locale, 'won', { amount: program.cost_krw.toLocaleString(numberLocale[locale]) })
}

export function formatStatus(program: Pick<Program, 'application_status' | 'application_start'>, locale: Locale): string {
  switch (program.application_status) {
    case 'open': return translate(locale, 'statusOpen')
    case 'upcoming': return program.application_start ? translate(locale, 'statusUpcoming', { date: formatDate(program.application_start, locale) }) : translate(locale, 'statusUpcomingNoDate')
    case 'closed': return translate(locale, 'statusClosed')
    case 'unknown': return translate(locale, 'statusUnknown')
  }
}

export function languageName(locale: Locale, code: string): string {
  const key = `lang_${code}` as MessageKey
  return code === 'ko' || code === 'vi' || code === 'zh' || code === 'en' ? translate(locale, key) : code
}

/** 지금 화면 언어의 이름(예: '베트남어'). 쉬운 한국어는 '쉬운 한국어'로 부릅니다. */
export function screenLanguageName(locale: Locale): string {
  return locale === 'ko-easy' ? '쉬운 한국어' : languageName(locale, locale)
}

export interface Chip { key: string; label: string }

export function filterChips(filters: SearchFilters, locale: Locale): Chip[] {
  const chips: Chip[] = []
  if (filters.child_grade) chips.push({ key: 'child', label: translate(locale, 'gradeChip', { grade: filters.child_grade }) })
  if (filters.child_age) chips.push({ key: 'child', label: translate(locale, 'ageChip', { age: filters.child_age }) })
  filters.available_windows.forEach((window, index) => chips.push({ key: `time-${index}`, label: formatWindow(window, locale) }))
  filters.interests.forEach((interest) => chips.push({ key: `interest-${interest}`, label: translate(locale, 'preferChip', { label: interestLabel(locale, interest) }) }))
  if (filters.dong) chips.push({ key: 'dong', label: translate(locale, 'preferChip', { label: filters.dong }) })
  if (filters.free_only) chips.push({ key: 'free', label: translate(locale, 'freeChip') })
  return chips
}

export function removeChip(filters: SearchFilters, key: string): SearchFilters {
  if (key === 'child') return { ...filters, child_grade: undefined, child_age: undefined }
  if (key.startsWith('time-')) { const index = Number(key.slice(5)); return { ...filters, available_windows: filters.available_windows.filter((_, at) => at !== index) } }
  if (key.startsWith('interest-')) return { ...filters, interests: filters.interests.filter((item) => `interest-${item}` !== key) }
  if (key === 'dong') return { ...filters, dong: undefined }
  if (key === 'free') return { ...filters, free_only: false }
  return filters
}

export function validateWindow(window: AvailableWindow, locale: Locale = 'ko-easy'): string | null {
  const pattern = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!pattern.test(window.start_time) || !pattern.test(window.end_time)) return translate(locale, 'timeRequired')
  if (window.start_time >= window.end_time) return translate(locale, 'timeOrder')
  if ('date' in window) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(window.date)) return translate(locale, 'invalidDate')
    const [year, month, day] = window.date.split('-').map(Number)
    const parsed = new Date(year, month - 1, day)
    if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return translate(locale, 'invalidDate')
  }
  return null
}

export function isSafeUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

/**
 * 화면 언어에 맞는 공고 글. 검수본이 없으면 한국어 원문을 그대로 돌려주고 reviewed=false로 표시합니다.
 * 쉬운 한국어는 검수본이 없으면 원문(한국어)이므로 '없음' 안내를 띄우지 않습니다.
 */
export interface ProgramText {
  title: string
  institution: string
  target: string
  description: string
  /** 선택한 언어의 검수본을 쓰는지 */
  reviewed: boolean
  /** 선택한 언어가 한국어 계열이 아닌데 검수본이 없어 원문을 보여 주는지 */
  missingTranslation: boolean
  summary: ReviewedSummary | null
}

export function programText(program: Program, locale: Locale): ProgramText {
  const summary = program.summaries_by_language[locale] ?? null
  if (summary) return { ...summary, reviewed: true, missingTranslation: false, summary }
  return {
    title: program.title,
    institution: program.institution,
    target: program.target_raw,
    description: program.description,
    reviewed: false,
    missingTranslation: locale !== 'ko-easy',
    summary: null,
  }
}
