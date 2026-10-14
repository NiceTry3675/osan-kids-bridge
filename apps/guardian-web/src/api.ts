import { getMockProgram, searchMockPrograms } from './mockPrograms'
import { serializeFilters } from './format'
import type { Program, SearchFilters, SearchResponse } from './types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')
const demoMode = import.meta.env.VITE_DATA_MODE === 'demo'

export const usingDemoData = demoMode

function requireApiBaseUrl(): string {
  if (!apiBaseUrl) throw new Error('프로그램 API 주소가 설정되지 않았습니다.')
  return apiBaseUrl
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`요청에 실패했습니다. (${response.status})`)
  return response.json() as Promise<T>
}

export async function searchPrograms(filters: SearchFilters, signal?: AbortSignal): Promise<SearchResponse> {
  if (demoMode) return searchMockPrograms(filters)
  const response = await fetch(`${requireApiBaseUrl()}/programs/search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serializeFilters(filters)), signal,
  })
  return readJson<SearchResponse>(response)
}

export async function getProgram(id: string, filters: SearchFilters, signal?: AbortSignal): Promise<Program | null> {
  if (demoMode) return getMockProgram(id, filters)
  const hasMatchConditions = filters.child_grade !== undefined || filters.child_age !== undefined || filters.available_windows.length > 0
  const response = await fetch(`${requireApiBaseUrl()}/programs/${encodeURIComponent(id)}${hasMatchConditions ? '/evaluate' : ''}`, hasMatchConditions
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serializeFilters(filters)), signal }
    : { signal })
  if (response.status === 404 || response.status === 410) return null
  return readJson<Program>(response)
}
