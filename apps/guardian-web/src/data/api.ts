/**
 * 공고 데이터 경계. VITE_DATA_MODE=demo면 데모 어댑터, 아니면 VITE_API_BASE_URL의 서버(명세 6장)를 부릅니다.
 * API 주소가 없는 일반 빌드는 가상 공고로 대신하지 않고 오류를 냅니다.
 */
import { getMockProgram, searchMockPrograms } from './mock'
import type { Locale, Program, SearchFilters, SearchResponse } from './types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')
export const usingDemoData = import.meta.env.VITE_DATA_MODE === 'demo'

export class MissingApiError extends Error {
  constructor() { super('프로그램 API 주소가 설정되지 않았습니다.') }
}

function baseUrl(): string {
  if (!apiBaseUrl) throw new MissingApiError()
  return apiBaseUrl
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`요청에 실패했습니다. (${response.status})`)
  return response.json() as Promise<T>
}

/** 입력하지 않은 조건은 요청에서 뺍니다. */
export function serializeFilters(filters: SearchFilters, locale?: Locale): Record<string, unknown> {
  const request: Record<string, unknown> = {}
  if (filters.child_grade !== undefined) request.child_grade = filters.child_grade
  if (filters.child_age !== undefined) request.child_age = filters.child_age
  if (filters.available_windows.length) request.available_windows = filters.available_windows
  if (filters.interests.length) request.interests = filters.interests
  if (filters.dong) request.dong = filters.dong
  if (filters.free_only) request.free_only = true
  if (locale) request.display_language = locale
  return request
}

export const hasMatchConditions = (filters: SearchFilters) =>
  filters.child_grade !== undefined || filters.child_age !== undefined || filters.available_windows.length > 0

const pause = () => new Promise((resolve) => setTimeout(resolve, 120))

/**
 * 마지막 찾기 결과의 공고들(조건·화면 언어별). 찾기 결과는 상세와 같은 판정이라, 목록에서 상세를 열면 이것을 먼저 보여 주고
 * 서버에서 다시 받아 바꿉니다(불러오는 동안 빈 화면이 번쩍이지 않게).
 */
let lastSearch: { key: string; programs: Map<string, Program> } | null = null
const searchKey = (filters: SearchFilters, locale: Locale) => JSON.stringify(serializeFilters(filters, locale))

function remember(filters: SearchFilters, locale: Locale, found: SearchResponse): SearchResponse {
  lastSearch = { key: searchKey(filters, locale), programs: new Map([...found.results, ...found.needs_confirmation].map((program) => [program.program_id, program])) }
  return found
}

/** 같은 조건·화면 언어로 방금 찾은 목록에 있던 공고. 조건 없이 여는 상세(공유 링크 등)는 판정이 달라 쓰지 않습니다 */
export function listedProgram(id: string, filters: SearchFilters | null, locale: Locale): Program | null {
  if (!filters || !hasMatchConditions(filters) || lastSearch?.key !== searchKey(filters, locale)) return null
  return lastSearch.programs.get(id) ?? null
}

export async function searchPrograms(filters: SearchFilters, locale: Locale, signal?: AbortSignal): Promise<SearchResponse> {
  if (usingDemoData) { await pause(); return remember(filters, locale, searchMockPrograms(filters)) }
  const response = await fetch(`${baseUrl()}/programs/search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serializeFilters(filters, locale)), signal,
  })
  return remember(filters, locale, await readJson<SearchResponse>(response))
}

/**
 * 목록에서 들어오면 같은 조건으로 상세를 다시 판정(POST …/evaluate),
 * 공유 링크로 바로 들어오면 조건 없이 조회(GET)합니다. 없거나 내려간 공고는 null.
 */
export async function getProgram(id: string, filters: SearchFilters | null, locale: Locale, signal?: AbortSignal): Promise<Program | null> {
  const conditions = filters && hasMatchConditions(filters) ? filters : null
  if (usingDemoData) { await pause(); return getMockProgram(id, conditions ?? { available_windows: [], interests: [], free_only: false }) }
  const path = `${baseUrl()}/programs/${encodeURIComponent(id)}`
  const response = conditions
    ? await fetch(`${path}/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serializeFilters(conditions, locale)), signal })
    : await fetch(`${path}?display_language=${encodeURIComponent(locale)}`, { signal })
  if (response.status === 404 || response.status === 410) return null
  return readJson<Program>(response)
}
