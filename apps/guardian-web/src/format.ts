import { translate } from './language'
import type { Locale, MessageKey } from './language'
import type { AvailableWindow, Interest, ProgramSession, SearchFilters, Weekday } from './types'

export const weekdays: { value: Weekday; label: string }[] = [
  { value: 'mon', label: '월' }, { value: 'tue', label: '화' }, { value: 'wed', label: '수' },
  { value: 'thu', label: '목' }, { value: 'fri', label: '금' }, { value: 'sat', label: '토' },
  { value: 'sun', label: '일' },
]

const weekdayKeys: Record<Weekday, MessageKey> = { mon: 'weekdayMon', tue: 'weekdayTue', wed: 'weekdayWed', thu: 'weekdayThu', fri: 'weekdayFri', sat: 'weekdaySat', sun: 'weekdaySun' }
const interestKeys: Record<Interest, MessageKey> = { experience_culture: 'interestExperience', korean_study: 'interestKorean', sports_arts: 'interestSports', career: 'interestCareer' }

export function weekdayLabel(locale: Locale, day: Weekday): string { return translate(locale, weekdayKeys[day]) }
export function interestLabel(locale: Locale, interest: Interest): string { return translate(locale, interestKeys[interest]) }

export function formatDate(date: string | null, locale: Locale = 'ko-easy'): string {
  if (!date) return translate(locale, 'scheduleUnknown')
  const [year, month, day] = date.split('-').map(Number)
  const weekday = weekdayLabel(locale, weekdays[(new Date(year, month - 1, day).getDay() + 6) % 7].value)
  if (locale === 'vi') return `${day}/${month} ${weekday}`
  if (locale === 'zh') return `${month}月${day}日 ${weekday}`
  return `${month}월 ${day}일 ${weekday}`
}

export function formatSession(session: ProgramSession | null, locale: Locale = 'ko-easy'): string {
  if (!session?.date) return translate(locale, 'scheduleUnknown')
  const time = session.start_time && session.end_time
    ? ` · ${session.start_time}~${session.end_time}`
    : ` · ${translate(locale, 'timeUnknown')}`
  return `${formatDate(session.date, locale)}${time}`
}

export function formatWindow(window: AvailableWindow, locale: Locale = 'ko-easy'): string {
  const day = 'date' in window ? formatDate(window.date, locale) : translate(locale, 'weekdayFull', { day: weekdayLabel(locale, window.day_of_week) })
  return `${day} ${window.start_time}~${window.end_time}`
}

export function filterChips(filters: SearchFilters, locale: Locale = 'ko-easy'): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = []
  if (filters.child_grade) chips.push({ key: 'child', label: translate(locale, 'gradeOption', { grade: filters.child_grade }) })
  if (filters.child_age) chips.push({ key: 'child', label: translate(locale, 'ageOption', { age: filters.child_age }) })
  filters.available_windows.forEach((window, index) => chips.push({ key: `time-${index}`, label: formatWindow(window, locale) }))
  filters.interests.forEach((interest) => chips.push({ key: `interest-${interest}`, label: translate(locale, 'preferenceChip', { label: interestLabel(locale, interest) }) }))
  if (filters.dong) chips.push({ key: 'dong', label: translate(locale, 'preferenceChip', { label: filters.dong }) })
  if (filters.free_only) chips.push({ key: 'free', label: translate(locale, 'freeChip') })
  return chips
}

export const interestLabels = {
  experience_culture: '체험·문화',
  korean_study: '한국어',
  sports_arts: '예술·체육',
  career: '진로',
} as const

export function serializeFilters(filters: SearchFilters): Record<string, unknown> {
  const request: Record<string, unknown> = {}
  if (filters.child_grade !== undefined) request.child_grade = filters.child_grade
  if (filters.child_age !== undefined) request.child_age = filters.child_age
  if (filters.available_windows.length) request.available_windows = filters.available_windows
  if (filters.interests.length) request.interests = filters.interests
  if (filters.dong) request.dong = filters.dong
  if (filters.free_only) request.free_only = true
  return request
}

export function validateWindow(window: AvailableWindow, locale: Locale = 'ko-easy'): string | null {
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!timePattern.test(window.start_time) || !timePattern.test(window.end_time)) return translate(locale, 'timeRequired')
  if (window.start_time >= window.end_time) return translate(locale, 'timeOrder')
  if ('date' in window) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(window.date)) return translate(locale, 'invalidDate')
    const [year, month, day] = window.date.split('-').map(Number)
    const parsed = new Date(year, month - 1, day)
    if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return translate(locale, 'invalidDate')
  }
  return null
}
