/** 검색 조건: 선택지, 입력 검사, 조건 칩 */
import { translate } from '../i18n'
import type { AvailableWindow, Interest, Locale, SearchFilters, Weekday } from '../data/types'
import { formatDate, interestLabel, weekdayLabel } from './format'

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const INTERESTS: Interest[] = ['experience_culture', 'korean_study', 'sports_arts', 'career']
export const GRADES = [1, 2, 3, 4, 5, 6] as const
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
  if (filters.child_grade) chips.push({ key: 'child', label: translate(locale, 'gradeChip', { grade: filters.child_grade }) })
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
