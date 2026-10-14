import { emptyFilters } from './types'
import { validateWindow } from './format'
import type { AvailableWindow, Interest, SearchFilters, Weekday } from './types'

const key = 'guardian-search-v1'
const weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const interests: Interest[] = ['experience_culture', 'korean_study', 'sports_arts', 'career']

export interface SearchSession { filters: SearchFilters; hasApplied: boolean }

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isWindow(value: unknown): value is AvailableWindow {
  if (!isRecord(value) || typeof value.start_time !== 'string' || typeof value.end_time !== 'string') return false
  const hasDate = typeof value.date === 'string' && value.day_of_week === undefined
  const hasDay = weekdays.includes(value.day_of_week as Weekday) && value.date === undefined
  return (hasDate || hasDay) && validateWindow(value as AvailableWindow) === null
}

export function parseSearchSession(raw: string | null): SearchSession {
  if (!raw) return { filters: emptyFilters(), hasApplied: false }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.filters)) throw new Error('Invalid session')
    const data = parsed.filters
    const filters = emptyFilters()
    if (Number.isInteger(data.child_grade) && Number(data.child_grade) >= 1 && Number(data.child_grade) <= 6) filters.child_grade = Number(data.child_grade)
    if (!filters.child_grade && Number.isInteger(data.child_age) && Number(data.child_age) >= 1 && Number(data.child_age) <= 18) filters.child_age = Number(data.child_age)
    if (Array.isArray(data.available_windows)) filters.available_windows = data.available_windows.filter(isWindow).slice(0, 20)
    if (Array.isArray(data.interests)) filters.interests = data.interests.filter((value): value is Interest => interests.includes(value as Interest)).slice(0, interests.length)
    if (typeof data.dong === 'string' && data.dong.length <= 40) filters.dong = data.dong
    filters.free_only = data.free_only === true
    return { filters, hasApplied: parsed.hasApplied === true }
  } catch { return { filters: emptyFilters(), hasApplied: false } }
}

export function readSearchSession(): SearchSession {
  try { return parseSearchSession(sessionStorage.getItem(key)) }
  catch { return { filters: emptyFilters(), hasApplied: false } }
}

export function saveSearchSession(session: SearchSession): void {
  try { sessionStorage.setItem(key, JSON.stringify({ version: 1, ...session })) } catch { /* Keep the active search in memory. */ }
}

export function clearSearchSession(): void {
  try { sessionStorage.removeItem(key) } catch { /* Keep the active search in memory. */ }
}
