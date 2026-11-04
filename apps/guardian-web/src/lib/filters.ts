/** 검색 조건: 선택지, 입력 검사, 조건 칩 */
import { translate } from '../i18n'
import type { AvailableWindow, Interest, Locale, SearchFilters, Weekday } from '../data/types'
import { formatDate, gradeLabel, interestLabel, weekdayLabel } from './format'

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const INTERESTS: Interest[] = ['experience_culture', 'korean_study', 'sports_arts', 'career']
export const GRADES = [1, 2, 3, 4, 5, 6] as const
/** 학교급과 그 학교급의 학년 숫자(서버 규칙: 초등 1~6, 중학교 7~9, 고등학교 10~12) */
export type School = 'elementary' | 'middle' | 'high'
export const SCHOOLS: { school: School; grades: number[]; offset: number }[] = [
  { school: 'elementary', grades: [1, 2, 3, 4, 5, 6], offset: 0 },
  { school: 'middle', grades: [7, 8, 9], offset: 6 },
  { school: 'high', grades: [10, 11, 12], offset: 9 },
]
export const schoolOf = (grade: number | undefined): School => (grade !== undefined && grade > 9 ? 'high' : grade !== undefined && grade > 6 ? 'middle' : 'elementary')
export const DONGS = ['중앙동', '대원동', '남촌동', '신장동', '세마동', '초평동'] as const

/**
 * 동 이름의 베트남어·중국어 표기. 기관 대시보드(institution-dashboard/src/i18n.tsx의 dongNames)와 같은 표기입니다.
 * 중국어 공고 요약은 동 이름을 한국어로 두므로(읽는 법이 갈리는 한자로 옮기지 않음), 화면에는 한국어 이름을 함께 적습니다(dongOption).
 * 서버에 보내는 값은 늘 한국어 이름 그대로입니다.
 */
const DONG_NAMES: Record<(typeof DONGS)[number], { vi: string; zh: string }> = {
  중앙동: { vi: 'Jungang-dong', zh: '中央洞' }, 대원동: { vi: 'Daewon-dong', zh: '大院洞' }, 남촌동: { vi: 'Namchon-dong', zh: '南村洞' },
  신장동: { vi: 'Sinjang-dong', zh: '新场洞' }, 세마동: { vi: 'Sema-dong', zh: '洗马洞' }, 초평동: { vi: 'Chopyeong-dong', zh: '草坪洞' },
}

/** 화면 언어로 쓴 동 이름. 표에 없는 동(예전에 저장된 값 등)은 한국어 그대로 둡니다. */
export function dongLabel(dong: string, locale: Locale): string {
  if (locale === 'ko-easy' || !(dong in DONG_NAMES)) return dong
  return DONG_NAMES[dong as keyof typeof DONG_NAMES][locale]
}

/** 동 고르기 칸의 선택지와 조건 칩: 베트남어·중국어는 한국어 이름을 괄호에 함께 적어 공고·주소·간판의 글자와 맞춰 볼 수 있게 합니다. */
export const dongOption = (dong: string, locale: Locale) => {
  const label = dongLabel(dong, locale)
  return label === dong ? dong : `${label} (${dong})`
}

/**
 * 시간대. 보호자는 ‘토요일 오전’으로 생각하므로 눌러서 고릅니다.
 * 회차 전체가 구간 안에 들어가야 맞기 때문에(명세 4장) 시간대를 겹치게 잡고, 이어진 시간대는 하나로 합칩니다.
 * 나누어 두면 오전과 오후를 모두 골라도 12:00~14:00 수업이 맞지 않습니다.
 */
export type TimePart = 'morning' | 'afternoon' | 'evening'
export const TIME_PARTS: TimePart[] = ['morning', 'afternoon', 'evening']
const PART_RANGE: Record<TimePart, [string, string]> = { morning: ['09:00', '13:00'], afternoon: ['12:00', '18:00'], evening: ['17:00', '22:00'] }
/** 요일만 고르면 그 요일 종일로 찾습니다 */
const ALL_DAY: [string, string] = ['06:00', '22:00']

function partRanges(parts: TimePart[]): [string, string][] {
  if (!parts.length) return [ALL_DAY]
  const ranges: [string, string][] = []
  for (const part of TIME_PARTS.filter((item) => parts.includes(item))) {
    const [start, end] = PART_RANGE[part]
    const last = ranges.at(-1)
    if (last && start <= last[1]) last[1] = end
    else ranges.push([start, end])
  }
  return ranges
}

/** 고른 요일·시간대를 가능 시간 구간으로. 요일을 고르지 않고 시간대만 고르면 모든 요일입니다. 둘 다 없으면 시간 조건이 없습니다. */
export function windowsFrom(days: Weekday[], parts: TimePart[]): AvailableWindow[] {
  if (!days.length && !parts.length) return []
  const ranges = partRanges(parts)
  return WEEKDAYS.filter((day) => !days.length || days.includes(day))
    .flatMap((day) => ranges.map(([start_time, end_time]) => ({ day_of_week: day, start_time, end_time })))
}

const windowKey = (window: AvailableWindow) => ('date' in window ? window.date : window.day_of_week) + window.start_time + window.end_time

/** 합치면 겹치는 구간을 지웁니다 */
export const uniqueWindows = (windows: AvailableWindow[]) => [...new Map(windows.map((window) => [windowKey(window), window])).values()]

const PART_SETS: TimePart[][] = [[], ['morning'], ['afternoon'], ['evening'], ['morning', 'afternoon'], ['afternoon', 'evening'], ['morning', 'evening'], ['morning', 'afternoon', 'evening']]

/** 저장된 가능 시간을 다시 요일·시간대 선택으로 풉니다. 그렇게 풀리지 않는 구간은 직접 넣은 시간(custom)으로 둡니다. */
export function selectionFrom(windows: AvailableWindow[]): { days: Weekday[]; parts: TimePart[]; custom: AvailableWindow[] } {
  const ranges = new Set(PART_SETS.flatMap((parts) => partRanges(parts).map(([start, end]) => start + end)))
  const known = windows.filter((window) => 'day_of_week' in window && ranges.has(window.start_time + window.end_time))
  const custom = windows.filter((window) => !known.includes(window))
  const keys = known.map(windowKey).sort().join()
  const days = WEEKDAYS.filter((day) => known.some((window) => 'day_of_week' in window && window.day_of_week === day))
  for (const parts of PART_SETS) {
    if (known.length && windowsFrom(days, parts).map(windowKey).sort().join() === keys) {
      return { days: days.length === WEEKDAYS.length && parts.length ? [] : days, parts, custom }
    }
  }
  return { days: [], parts: [], custom: windows }
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** 잘못된 가능 시간이면 화면 언어로 된 이유를, 괜찮으면 null을 돌려줍니다(명세 4장). */
export function validateWindow(window: AvailableWindow, locale: Locale = 'ko-easy'): string | null {
  if (!TIME.test(window.start_time) || !TIME.test(window.end_time)) return translate(locale, 'timeRequired')
  if (window.start_time >= window.end_time) return translate(locale, 'timeOrder')
  if ('date' in window) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(window.date)) return translate(locale, 'invalidDate')
    const [year, month, day] = window.date.split('-').map(Number)
    const parsed = new Date(year, month - 1, day)
    if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return translate(locale, 'invalidDate')
  }
  return null
}

export function formatWindow(window: AvailableWindow, locale: Locale): string {
  const day = 'date' in window ? formatDate(window.date, locale) : translate(locale, 'everyWeekday', { day: weekdayLabel(locale, window.day_of_week) })
  return `${day} ${window.start_time}~${window.end_time}`
}

export interface Chip { key: string; label: string }

/** 넣은 조건을 칩으로. 관심 분야·동은 ‘먼저 보기’로 표시합니다(명세 3장). */
export function filterChips(filters: SearchFilters, locale: Locale): Chip[] {
  const chips: Chip[] = []
  if (filters.child_grade) chips.push({ key: 'child', label: gradeLabel(locale, filters.child_grade) })
  if (filters.child_age) chips.push({ key: 'child', label: translate(locale, 'ageChip', { age: filters.child_age }) })
  filters.available_windows.forEach((window, index) => chips.push({ key: `time-${index}`, label: formatWindow(window, locale) }))
  filters.interests.forEach((interest) => chips.push({ key: `interest-${interest}`, label: translate(locale, 'preferChip', { label: interestLabel(locale, interest) }) }))
  if (filters.dong) chips.push({ key: 'dong', label: translate(locale, 'preferChip', { label: dongOption(filters.dong, locale) }) })
  if (filters.free_only) chips.push({ key: 'free', label: translate(locale, 'freeChip') })
  return chips
}

export function removeChip(filters: SearchFilters, key: string): SearchFilters {
  if (key === 'child') return { ...filters, child_grade: undefined, child_age: undefined }
  if (key.startsWith('time-')) {
    const index = Number(key.slice('time-'.length))
    return { ...filters, available_windows: filters.available_windows.filter((_, at) => at !== index) }
  }
  if (key.startsWith('interest-')) return { ...filters, interests: filters.interests.filter((item) => `interest-${item}` !== key) }
  if (key === 'dong') return { ...filters, dong: undefined }
  if (key === 'free') return { ...filters, free_only: false }
  return filters
}

export const hasAnyCondition = (filters: SearchFilters): boolean =>
  filters.child_grade !== undefined || filters.child_age !== undefined || filters.available_windows.length > 0
  || filters.interests.length > 0 || !!filters.dong || filters.free_only
