/**
 * 검색 조건을 이 탭의 세션 저장소에만 보관합니다. 상세에서 돌아오거나 새로고침해도 조건을 되살리고,
 * 공유 링크에는 넣지 않습니다(명세 2장). 저장된 값은 믿지 않고 하나씩 검사해 되살립니다.
 */
import { emptyFilters } from '../data/types'
import type { AvailableWindow, Interest, SearchFilters } from '../data/types'
import { INTERESTS, validateWindow, WEEKDAYS } from './filters'

const KEY = 'guardian-search-v2'
const MAX_WINDOWS = 20

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function isWindow(value: unknown): value is AvailableWindow {
  if (!isRecord(value) || typeof value.start_time !== 'string' || typeof value.end_time !== 'string') return false
  const byDate = typeof value.date === 'string' && value.day_of_week === undefined
  const byDay = (WEEKDAYS as unknown[]).includes(value.day_of_week) && value.date === undefined
  return (byDate || byDay) && validateWindow(value as AvailableWindow) === null
}

const inRange = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max

export function parseFilters(raw: string | null): SearchFilters {
  const filters = emptyFilters()
  if (!raw) return filters
  try {
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data)) return filters
    if (inRange(data.child_grade, 1, 6)) filters.child_grade = data.child_grade
    else if (inRange(data.child_age, 1, 18)) filters.child_age = data.child_age
    if (Array.isArray(data.available_windows)) filters.available_windows = data.available_windows.filter(isWindow).slice(0, MAX_WINDOWS)
    if (Array.isArray(data.interests)) filters.interests = [...new Set(data.interests.filter((value): value is Interest => (INTERESTS as unknown[]).includes(value)))]
    if (typeof data.dong === 'string' && data.dong.length <= 40) filters.dong = data.dong
    filters.free_only = data.free_only === true
    return filters
  } catch {
    return emptyFilters()
  }
}

export function readFilters(): SearchFilters {
  try { return parseFilters(sessionStorage.getItem(KEY)) } catch { return emptyFilters() }
}

export function writeFilters(filters: SearchFilters | null): void {
  try {
    if (filters) sessionStorage.setItem(KEY, JSON.stringify(filters))
    else sessionStorage.removeItem(KEY)
  } catch { /* 저장할 수 없으면 이번 화면에서만 기억합니다. */ }
}
