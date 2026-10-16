import { DISPLAY_LANGUAGES, INTERESTS } from '../types'
import type { AvailableWindow, DisplayLanguage, Interest, SearchFilters, Weekday } from '../types'
import { WEEKDAY_CODES, isValidDate, isValidTime, toMinutes } from './dates'

export type ParsedFilters = { ok: true; filters: SearchFilters } | { ok: false; errors: string[] }

const MAX_WINDOWS = 50

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isIntegerIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
// JSON의 null은 보내지 않은 조건과 같게 본다
const given = (value: unknown) => value !== undefined && value !== null

export function emptyFilters(): SearchFilters {
  return { available_windows: [], interests: [], free_only: false }
}

function parseWindow(value: unknown, label: string, errors: string[]): AvailableWindow | null {
  if (!isObject(value)) {
    errors.push(`${label}: 요일 또는 날짜와 시작·종료 시각을 함께 보내 주세요.`)
    return null
  }
  const before = errors.length
  const { day_of_week: day, date, start_time: start, end_time: end } = value
  if (given(day) && given(date)) errors.push(`${label}: 요일(day_of_week)과 날짜(date) 중 하나만 보내 주세요.`)
  else if (!given(day) && !given(date)) errors.push(`${label}: 요일(day_of_week) 또는 날짜(date)가 필요합니다.`)
  else if (given(day) && !WEEKDAY_CODES.includes(day as Weekday)) errors.push(`${label}: 요일은 mon~sun 중 하나여야 합니다.`)
  else if (given(date) && !isValidDate(date)) errors.push(`${label}: 날짜는 실제 있는 날짜를 YYYY-MM-DD 형식으로 보내 주세요.`)
  if (!isValidTime(start) || !isValidTime(end)) errors.push(`${label}: 시작·종료 시각은 HH:MM(00:00~23:59) 형식이어야 합니다.`)
  else if (toMinutes(start) >= toMinutes(end)) errors.push(`${label}: 종료 시각은 시작 시각보다 늦어야 합니다. 자정을 넘는 구간은 받지 않습니다.`)
  if (errors.length > before) return null
  const times = { start_time: start as string, end_time: end as string }
  return given(day) ? { day_of_week: day as Weekday, ...times } : { date: date as string, ...times }
}

/** 검색·조건 적용 상세 요청 본문 검증 (명세 3·4·6장). 빈 본문은 조건 없는 탐색이다 */
export function parseSearchFilters(body: unknown): ParsedFilters {
  const input = given(body) ? body : {}
  if (!isObject(input)) return { ok: false, errors: ['요청 본문은 JSON 객체여야 합니다.'] }
  const errors: string[] = []
  const filters = emptyFilters()

  const { child_grade: grade, child_age: age } = input
  if (given(grade) && given(age)) {
    errors.push('자녀 나이(child_age)와 학년(child_grade) 중 하나만 보내 주세요.')
  } else if (given(grade)) {
    if (isIntegerIn(grade, 1, 12)) filters.child_grade = grade
    else errors.push('학년(child_grade)은 1~12 사이의 정수여야 합니다. (초등 1~6, 중학교 7~9, 고등학교 10~12)')
  } else if (given(age)) {
    if (isIntegerIn(age, 0, 19)) filters.child_age = age
    else errors.push('나이(child_age)는 0~19 사이의 정수여야 합니다.')
  }

  const windows = input.available_windows
  if (given(windows)) {
    if (!Array.isArray(windows)) errors.push('가능 시간(available_windows)은 배열이어야 합니다.')
    else if (windows.length > MAX_WINDOWS) errors.push(`가능 시간은 ${MAX_WINDOWS}개 구간까지 보낼 수 있습니다.`)
    else {
      windows.forEach((item, index) => {
        const window = parseWindow(item, `가능 시간 ${index + 1}번째 구간`, errors)
        if (window) filters.available_windows.push(window)
      })
    }
  }

  const interests = input.interests
  if (given(interests)) {
    if (!Array.isArray(interests) || interests.some((item) => !INTERESTS.includes(item as Interest))) {
      errors.push(`관심 분야(interests)는 ${INTERESTS.join(', ')} 중에서 골라 배열로 보내 주세요.`)
    } else {
      filters.interests = [...new Set(interests as Interest[])]
    }
  }

  const dong = input.dong
  if (given(dong)) {
    if (typeof dong !== 'string') errors.push('사는 동(dong)은 문자열이어야 합니다.')
    else if (dong.trim()) filters.dong = dong.trim()
  }

  const freeOnly = input.free_only
  if (given(freeOnly)) {
    if (typeof freeOnly === 'boolean') filters.free_only = freeOnly
    else errors.push('무료만 보기(free_only)는 true 또는 false여야 합니다.')
  }

  // 표시 언어는 응답 문구에만 쓰고 판정에는 쓰지 않는다
  const language = input.display_language
  if (given(language)) {
    if (DISPLAY_LANGUAGES.includes(language as DisplayLanguage)) filters.display_language = language as DisplayLanguage
    else errors.push(`표시 언어(display_language)는 ${DISPLAY_LANGUAGES.join(', ')} 중 하나여야 합니다.`)
  }

  return errors.length ? { ok: false, errors } : { ok: true, filters }
}
